import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Store } from "@tauri-apps/plugin-store";
import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import "./App.css";

interface Game {
  id: string;
  name: string;
  localPath: string;
  cloudPath: string;
  lastSynced?: string;
  status: 'synced' | 'pending' | 'syncing';
}

interface AppSettings {
  syncInterval: number; // in minutes
  autoSync: boolean;
  cloudConfigPath?: string; // Path to store config in cloud
  configStorageMode: 'local' | 'cloud'; // Where to store/read config
  autoLaunch: boolean;
  showNotifications: boolean;
  confirmBeforeSync: boolean; // Show warning before syncing
  conflictResolution: 'manual' | 'local' | 'cloud' | 'newer';
  dockVisibility: 'menu-bar-only' | 'dock-only' | 'both' | 'neither';
  theme: 'default' | 'cream' | 'midnight' | 'violet' | 'sunset' | 'ember' | 'forest' | 'ocean';
  cloudProvider: 'google-drive' | 'dropbox' | 'onedrive' | 'icloud' | 'other';
  updatePreference: 'automatic' | 'download-only' | 'notify-only' | 'manual';
}

interface SyncLogEntry {
  id: number;
  game_id: string;
  game_name: string;
  timestamp: string;
  operation: string;
  files_synced: number;
  files_changed: string[];
  direction: string;
  success: boolean;
  error_message?: string;
}

interface SyncProgress {
  current: number;
  total: number;
  fileName?: string;
}

interface FileConflict {
  relative_path: string;
  local_path: string;
  cloud_path: string;
  local_modified: string;
  cloud_modified: string;
  local_size: number;
  cloud_size: number;
}

interface SyncResult {
  success: boolean;
  message: string;
  files_synced: number;
  conflicts: FileConflict[];
}

function App() {
  // All state declarations first
  const [games, setGames] = useState<Game[]>([]);
  const [showAddGame, setShowAddGame] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [newGame, setNewGame] = useState({
    name: '',
    localPath: '',
    cloudPath: ''
  });
  const [syncingGameId, setSyncingGameId] = useState<string | null>(null);
  const [saveLocationSuggestions, setSaveLocationSuggestions] = useState<Array<{path: string, exists: boolean, source: string}>>([]);
  const [searchingSaveLocations, setSearchingSaveLocations] = useState(false);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{version: string, notes?: string} | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    syncInterval: 5,
    autoSync: true,
    autoLaunch: false,
    showNotifications: true,
    confirmBeforeSync: true, // Enabled by default for safety
    conflictResolution: 'manual',
    dockVisibility: 'both',
    theme: 'default',
    cloudProvider: 'google-drive',
    configStorageMode: 'local',
    updatePreference: 'notify-only'
  });
  const [syncHistory, setSyncHistory] = useState<SyncLogEntry[]>([]);
  const [showSyncHistory, setShowSyncHistory] = useState(false);
  const [pendingSyncGameId, setPendingSyncGameId] = useState<string | null>(null); // For sync confirmation
  const [pendingDeleteGameId, setPendingDeleteGameId] = useState<string | null>(null); // For delete confirmation
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [browsing, setBrowsing] = useState<'localPath' | 'cloudPath' | 'cloudConfig' | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [conflicts, setConflicts] = useState<{gameId: string, gameName: string, conflicts: FileConflict[]} | null>(null);
  const [settingsTab, setSettingsTab] = useState<'general' | 'sync' | 'appearance'>('general');

  // Auto-search for save locations when game name changes (debounced)
  useEffect(() => {
    if (!newGame.name || newGame.name.length < 2) {
      setSaveLocationSuggestions([]);
      return;
    }

    const searchTimer = setTimeout(async () => {
      setSearchingSaveLocations(true);
      try {
        const suggestions = await invoke<Array<{path: string, exists: boolean, source: string}>>(
          'find_save_locations',
          { gameName: newGame.name }
        );
        setSaveLocationSuggestions(suggestions);

        // Auto-fill local path if we found exactly one match
        if (suggestions.length === 1 && !newGame.localPath) {
          setNewGame(prev => ({ ...prev, localPath: suggestions[0].path }));
        }
      } catch (error) {
        console.error('Save location search failed:', error);
      } finally {
        setSearchingSaveLocations(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(searchTimer);
  }, [newGame.name]);

  // Auto-fill cloud path when game name changes (if we have a cloud config path)
  useEffect(() => {
    if (!newGame.name || newGame.name.length < 2 || newGame.cloudPath) {
      return;
    }

    // Use existing cloud config path, or find from existing games
    let basePath = settings.cloudConfigPath;
    if (!basePath && games.length > 0) {
      // Try to extract base path from existing game cloud paths
      const existingPath = games[0].cloudPath;
      const lastSlash = existingPath.lastIndexOf('/');
      if (lastSlash > 0) {
        basePath = existingPath.substring(0, lastSlash);
      }
    }

    if (basePath) {
      const safeName = newGame.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      setNewGame(prev => ({ ...prev, cloudPath: `${basePath}/${safeName}` }));
    }
  }, [newGame.name, settings.cloudConfigPath, games]);

  // Initialize store and load data
  useEffect(() => {
    const initStore = async () => {
      const s = await Store.load('store.json');
      setStore(s);

      // Load games
      const savedGames = await s.get<Game[]>('games');
      if (savedGames) {
        setGames(savedGames);
      }

      // Load settings
      const savedSettings = await s.get<AppSettings>('settings');
      if (savedSettings) {
        setSettings(savedSettings);
      }
    };

    initStore();
  }, []);

  // Save games when they change
  useEffect(() => {
    if (store && games.length > 0) {
      store.set('games', games);
      store.save();
    }
  }, [games, store]);

  // Save settings when they change
  useEffect(() => {
    if (store) {
      store.set('settings', settings);
      store.save();
    }
  }, [settings, store]);

  // Automatic sync interval
  useEffect(() => {
    if (!settings.autoSync || games.length === 0) return;

    const intervalMs = settings.syncInterval * 60 * 1000;
    const intervalId = setInterval(() => {
      handleSync();
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [settings.autoSync, settings.syncInterval, games]);

  // Listen for tray sync events
  useEffect(() => {
    const unlisten = listen('tray-sync', () => {
      handleSync();
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Listen for menu bar events
  useEffect(() => {
    const unlistenSettings = listen('open-settings', () => {
      setShowSettings(true);
    });

    const unlistenAbout = listen('open-about', () => {
      setShowAbout(true);
    });

    return () => {
      unlistenSettings.then(fn => fn());
      unlistenAbout.then(fn => fn());
    };
  }, []);

  // Request notification permissions
  useEffect(() => {
    const checkPermissions = async () => {
      const granted = await isPermissionGranted();
      if (!granted) {
        await requestPermission();
      }
    };
    checkPermissions();
  }, []);

  // Manage auto-launch
  useEffect(() => {
    const manageAutoLaunch = async () => {
      const enabled = await isEnabled();
      if (settings.autoLaunch && !enabled) {
        await enable();
      } else if (!settings.autoLaunch && enabled) {
        await disable();
      }
    };
    manageAutoLaunch();
  }, [settings.autoLaunch]);

  // Manage dock visibility
  useEffect(() => {
    const manageDockVisibility = async () => {
      try {
        // Ensure we have a valid value, default to 'both' if invalid
        const visibility = ['menu-bar-only', 'dock-only', 'both', 'neither'].includes(settings.dockVisibility)
          ? settings.dockVisibility
          : 'both';

        await invoke('set_dock_visibility', {
          visibility
        });
      } catch (error) {
        console.error('Failed to set dock visibility:', error);
      }
    };
    manageDockVisibility();
  }, [settings.dockVisibility]);

  // Apply theme
  useEffect(() => {
    if (settings.theme === 'default') {
      document.body.removeAttribute('data-theme');
    } else {
      document.body.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme]);

  // Check for updates on startup
  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateAvailable({
            version: update.version,
            notes: update.body || undefined
          });
        }
      } catch (error) {
        console.log('Update check failed (this is normal in development):', error);
      }
    };

    // Check for updates after a short delay to not block startup
    const timer = setTimeout(checkForUpdates, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Function to manually check for updates
  const handleCheckForUpdates = async () => {
    setCheckingForUpdates(true);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable({
          version: update.version,
          notes: update.body || undefined
        });
      } else {
        setNotification({ message: 'You are running the latest version', type: 'success' });
      }
    } catch (error) {
      console.error('Update check failed:', error);
      setNotification({ message: 'Failed to check for updates', type: 'error' });
    } finally {
      setCheckingForUpdates(false);
    }
  };

  // Function to download and install update
  const handleInstallUpdate = async () => {
    try {
      const update = await check();
      if (update) {
        setNotification({ message: 'Downloading update...', type: 'success' });
        await update.downloadAndInstall();
        setNotification({ message: 'Update installed! Restarting...', type: 'success' });
        await relaunch();
      }
    } catch (error) {
      console.error('Update install failed:', error);
      setNotification({ message: `Update failed: ${error}`, type: 'error' });
    }
  };

  // Load sync history
  const loadSyncHistory = async (gameId?: string) => {
    try {
      const history = await invoke<SyncLogEntry[]>('get_sync_history', {
        gameId: gameId || null,
        limit: 50
      });
      setSyncHistory(history);
    } catch (error) {
      console.error('Failed to load sync history:', error);
    }
  };

  // Log a sync operation
  const logSyncOperation = async (
    gameId: string,
    gameName: string,
    operation: string,
    filesSynced: number,
    filesChanged: string[],
    direction: string,
    success: boolean,
    errorMessage?: string
  ) => {
    try {
      await invoke('log_sync_operation', {
        gameId,
        gameName,
        operation,
        filesSynced,
        filesChanged,
        direction,
        success,
        errorMessage: errorMessage || null
      });
    } catch (error) {
      console.error('Failed to log sync operation:', error);
    }
  };

  // Clear sync history
  const handleClearHistory = async (gameId?: string) => {
    try {
      await invoke('clear_sync_history', { gameId: gameId || null });
      setSyncHistory([]);
      setNotification({ message: 'Sync history cleared', type: 'success' });
    } catch (error) {
      console.error('Failed to clear history:', error);
      setNotification({ message: 'Failed to clear history', type: 'error' });
    }
  };

  // Sync config to cloud
  useEffect(() => {
    const syncConfigToCloud = async () => {
      if (!settings.cloudConfigPath || !store) return;

      try {
        const config = {
          games,
          settings
        };

        const configPath = `${settings.cloudConfigPath}/memorycard-config.json`;
        await invoke('sync_config_to_cloud', {
          configPath,
          config: JSON.stringify(config, null, 2)
        });
      } catch (error) {
        console.error('Failed to sync config to cloud:', error);
      }
    };

    if (games.length > 0 || settings.cloudConfigPath) {
      syncConfigToCloud();
    }
  }, [games, settings, store]);

  // Show notifications
  useEffect(() => {
    if (notification && settings.showNotifications) {
      sendNotification({
        title: 'MemoryCard',
        body: notification.message
      });

      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, settings.showNotifications]);

  const handleBrowseFolder = async (field: 'localPath' | 'cloudPath') => {
    setBrowsing(field);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: field === 'localPath' ? 'Select Local Save Folder' : 'Select Cloud Backup Folder'
      });

      if (selected && typeof selected === 'string') {
        setNewGame({ ...newGame, [field]: selected });
      }
      // If selected is null/undefined, user cancelled - that's fine
    } catch (error) {
      // User cancelled or dialog failed - reset state
      console.log('Browse dialog cancelled or failed:', error);
    } finally {
      setBrowsing(null);
    }
  };

  const handleAddGame = async () => {
    if (newGame.name && newGame.localPath && newGame.cloudPath) {
      // Create cloud directory if it doesn't exist
      try {
        await invoke('create_directory', { path: newGame.cloudPath });
      } catch (error) {
        console.error('Failed to create cloud directory:', error);
        setNotification({ message: `Failed to create cloud directory: ${error}`, type: 'error' });
        return;
      }

      const game: Game = {
        id: Date.now().toString(),
        name: newGame.name,
        localPath: newGame.localPath,
        cloudPath: newGame.cloudPath,
        status: 'pending'
      };
      setGames([...games, game]);
      setNewGame({ name: '', localPath: '', cloudPath: '' });
      setShowAddGame(false);
    }
  };

  // Request sync - checks if confirmation is needed
  const requestSync = (gameId?: string) => {
    if (settings.confirmBeforeSync) {
      setPendingSyncGameId(gameId || 'all');
    } else {
      handleSync(gameId);
    }
  };

  // Confirmed sync execution
  const handleSync = async (gameId?: string) => {
    // For single game sync, use syncingGameId to prevent flicker
    if (gameId) {
      setSyncingGameId(gameId);
    } else {
      setSyncing(true);
    }
    setSyncProgress(null);

    try {
      const gamesToSync = gameId ? games.filter(g => g.id === gameId) : games;
      let totalGames = gamesToSync.length;
      let currentGame = 0;
      let syncedCount = 0;
      let filesChanged = 0;

      for (const game of gamesToSync) {
        currentGame++;
        if (!gameId) {
          setSyncProgress({
            current: currentGame,
            total: totalGames,
            fileName: game.name
          });
        }

        // Update status to syncing
        setGames(prev => prev.map(g =>
          g.id === game.id ? { ...g, status: 'syncing' as const } : g
        ));

        try {
          const result = await invoke<SyncResult>(
            'sync_game_saves',
            {
              localPath: game.localPath,
              cloudPath: game.cloudPath,
              autoResolve: settings.conflictResolution === 'manual' ? null : settings.conflictResolution
            }
          );

          console.log(`Sync result for ${game.name}:`, result);

          // Check for conflicts
          if (result.conflicts && result.conflicts.length > 0) {
            // Stop syncing other games and show conflict modal
            setSyncing(false);
            setSyncingGameId(null);
            setSyncProgress(null);
            setConflicts({
              gameId: game.id,
              gameName: game.name,
              conflicts: result.conflicts
            });
            // Update status back to pending
            setGames(prev => prev.map(g =>
              g.id === game.id ? { ...g, status: 'pending' as const } : g
            ));
            return;
          }

          // Update status to synced
          setGames(prev => prev.map(g =>
            g.id === game.id
              ? { ...g, status: 'synced' as const, lastSynced: new Date().toISOString() }
              : g
          ));

          syncedCount++;
          filesChanged += result.files_synced;

          // Log the sync operation
          await logSyncOperation(
            game.id,
            game.name,
            'sync',
            result.files_synced,
            [], // TODO: Get actual file names from result
            'bidirectional',
            true
          );

          // For single game sync, show notification immediately
          if (gameId) {
            setNotification({
              message: result.files_synced > 0
                ? `${game.name}: Synced ${result.files_synced} file(s)`
                : `${game.name}: Already up to date`,
              type: 'success'
            });
          }
        } catch (error) {
          console.error(`Sync failed for ${game.name}:`, error);

          // Log the failed sync
          await logSyncOperation(
            game.id,
            game.name,
            'sync',
            0,
            [],
            'bidirectional',
            false,
            String(error)
          );

          // Update status back to pending on error
          setGames(prev => prev.map(g =>
            g.id === game.id ? { ...g, status: 'pending' as const } : g
          ));
          setNotification({
            message: `Failed to sync ${game.name}: ${error}`,
            type: 'error'
          });
        }
      }

      // For bulk sync, show summary notification
      if (!gameId && totalGames > 0) {
        setNotification({
          message: filesChanged > 0
            ? `Synced ${syncedCount} game(s), ${filesChanged} file(s) updated`
            : `All ${syncedCount} game(s) up to date`,
          type: 'success'
        });
      }
    } finally {
      setSyncing(false);
      setSyncingGameId(null);
      setSyncProgress(null);
    }
  };

  // Request delete - shows confirmation
  const requestDeleteGame = (gameId: string) => {
    setPendingDeleteGameId(gameId);
  };

  // Confirmed delete execution
  const handleRemoveGame = (gameId: string) => {
    setGames(games.filter(g => g.id !== gameId));
    setPendingDeleteGameId(null);
    // Close detail modal if we deleted the selected game
    if (selectedGame?.id === gameId) {
      setSelectedGame(null);
    }
  };

  const handleResolveAllConflicts = async (useLocal: boolean) => {
    if (!conflicts) return;

    try {
      for (const conflict of conflicts.conflicts) {
        await invoke('resolve_conflict', {
          localPath: conflict.local_path,
          cloudPath: conflict.cloud_path,
          useLocal
        });
      }

      setConflicts(null);
      setNotification({
        message: `All conflicts resolved for ${conflicts.gameName}`,
        type: 'success'
      });

      // Update game status to synced
      setGames(prev => prev.map(g =>
        g.id === conflicts.gameId
          ? { ...g, status: 'synced' as const, lastSynced: new Date().toISOString() }
          : g
      ));
    } catch (error) {
      console.error('Failed to resolve conflicts:', error);
      setNotification({
        message: `Failed to resolve conflicts: ${error}`,
        type: 'error'
      });
    }
  };

  // Handle Escape key to close modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingDeleteGameId) {
          setPendingDeleteGameId(null);
        } else if (pendingSyncGameId) {
          setPendingSyncGameId(null);
        } else if (showSyncHistory) {
          setShowSyncHistory(false);
        } else if (conflicts) {
          setConflicts(null);
        } else if (selectedGame) {
          setSelectedGame(null);
        } else if (showSettings) {
          setShowSettings(false);
        } else if (showAddGame) {
          setShowAddGame(false);
        } else if (showAbout) {
          setShowAbout(false);
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showAddGame, showSettings, conflicts, selectedGame, showAbout, pendingDeleteGameId, pendingSyncGameId, showSyncHistory]);

  // Helper function to open folder in explorer
  const openInExplorer = async (path: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    try {
      await invoke('open_folder_in_explorer', { path });
    } catch (error) {
      setNotification({ message: `Failed to open folder: ${error}`, type: 'error' });
    }
  };

  return (
    <div className="app">
      <header className="header" data-tauri-drag-region>
        <h1 data-tauri-drag-region>MemoryCard</h1>
        <p className="subtitle" data-tauri-drag-region>Cross-platform game save synchronization</p>
      </header>

      <main className="main">
        <div className="toolbar">
          <button
            className="btn btn-primary"
            onClick={() => setShowAddGame(true)}
          >
            + Add Game
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => requestSync()}
            disabled={syncing || games.length === 0}
          >
            {syncing ? 'Syncing...' : 'Sync All'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowSettings(true)}
          >
            ⚙️ Settings
          </button>
        </div>

        {settings.autoSync && games.length > 0 && (
          <div className="auto-sync-indicator">
            🔄 Auto-sync enabled (every {settings.syncInterval} min)
          </div>
        )}

        {syncProgress && (
          <div className="progress-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{width: `${(syncProgress.current / syncProgress.total) * 100}%`}}
              />
            </div>
            <div className="progress-text">
              Syncing {syncProgress.fileName} ({syncProgress.current} of {syncProgress.total})
            </div>
          </div>
        )}

        {notification && (
          <div className={`notification-toast ${notification.type}`}>
            {notification.message}
          </div>
        )}

        {games.length === 0 && !showAddGame && (
          <div className="empty-state">
            <h2>No games added yet</h2>
            <p>Click "Add Game" to start syncing your save files</p>
          </div>
        )}

        {showAddGame && (
          <div className="modal-overlay" onClick={() => setShowAddGame(false)}>
            <div className="modal add-game-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Add New Game</h2>

              <div className="modal-content">

              <div className="form-group">
                <label>Game Name</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    placeholder="Hollow Knight"
                    value={newGame.name}
                    onChange={(e) => setNewGame({...newGame, name: e.target.value})}
                  />
                  <button
                    type="button"
                    className="btn btn-browse"
                    onClick={async () => {
                      try {
                        const selected = await open({
                          multiple: false,
                          title: 'Select Game Application',
                          filters: [{
                            name: 'Applications',
                            extensions: ['app', 'exe', '']
                          }]
                        });
                        if (selected && typeof selected === 'string') {
                          // Extract app name from path
                          const pathParts = selected.split('/');
                          let appName = pathParts[pathParts.length - 1];
                          // Remove .app extension if present
                          appName = appName.replace(/\.app$/i, '').replace(/\.exe$/i, '');
                          setNewGame({...newGame, name: appName});
                        }
                      } catch (error) {
                        console.error('Failed to browse for app:', error);
                      }
                    }}
                  >
                    Browse
                  </button>
                </div>
                <p className="setting-description">
                  Type a name or browse to select the game application
                </p>
              </div>

              <div className="form-group">
                <label>
                  Local Save Folder
                  {searchingSaveLocations && <span className="search-indicator"> (searching...)</span>}
                </label>
                <div className="input-with-button">
                  <input
                    type="text"
                    placeholder="~/Library/Application Support/GameName"
                    value={newGame.localPath}
                    onChange={(e) => setNewGame({...newGame, localPath: e.target.value})}
                  />
                  <button
                    type="button"
                    className="btn btn-browse"
                    onClick={() => handleBrowseFolder('localPath')}
                    disabled={browsing !== null}
                  >
                    {browsing === 'localPath' ? '...' : 'Browse'}
                  </button>
                </div>
                {saveLocationSuggestions.length > 0 && !newGame.localPath && (
                  <div className="save-suggestions">
                    <p className="suggestion-header">Found {saveLocationSuggestions.length} possible location(s):</p>
                    {saveLocationSuggestions.slice(0, 5).map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="suggestion-item exists"
                        onClick={() => {
                          setNewGame({...newGame, localPath: suggestion.path});
                        }}
                        title={`Click to use this path`}
                      >
                        <span className="suggestion-path">{suggestion.path}</span>
                        <span className="suggestion-badge">Select</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Cloud Backup Folder</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    placeholder={settings.cloudConfigPath
                      ? `${settings.cloudConfigPath}/GameName`
                      : "~/Google Drive/GameSaves/GameName"}
                    value={newGame.cloudPath}
                    onChange={(e) => setNewGame({...newGame, cloudPath: e.target.value})}
                  />
                  <button
                    type="button"
                    className="btn btn-browse"
                    onClick={() => handleBrowseFolder('cloudPath')}
                    disabled={browsing !== null}
                  >
                    {browsing === 'cloudPath' ? '...' : 'Browse'}
                  </button>
                </div>
                {settings.cloudConfigPath && !newGame.cloudPath && newGame.name && (
                  <button
                    type="button"
                    className="btn-link auto-fill-link"
                    onClick={() => {
                      const safeName = newGame.name.replace(/[^a-zA-Z0-9]/g, '_');
                      setNewGame({...newGame, cloudPath: `${settings.cloudConfigPath}/${safeName}`});
                    }}
                  >
                    Auto-fill: {settings.cloudConfigPath}/{newGame.name.replace(/[^a-zA-Z0-9]/g, '_')}
                  </button>
                )}
              </div>
              </div>

              <div className="modal-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowAddGame(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleAddGame}
                  disabled={!newGame.name || !newGame.localPath || !newGame.cloudPath}
                >
                  Add Game
                </button>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Settings</h2>

              <div className="tabs">
                <button
                  className={`tab ${settingsTab === 'general' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('general')}
                >
                  General
                </button>
                <button
                  className={`tab ${settingsTab === 'sync' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('sync')}
                >
                  Sync
                </button>
                <button
                  className={`tab ${settingsTab === 'appearance' ? 'active' : ''}`}
                  onClick={() => setSettingsTab('appearance')}
                >
                  Appearance
                </button>
              </div>

              <div className="settings-content">
                {settingsTab === 'general' && (
                  <>
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.autoSync}
                          onChange={(e) => setSettings({...settings, autoSync: e.target.checked})}
                        />
                        {' '}Enable Auto-Sync
                      </label>
                      <p className="setting-description">
                        Automatically sync all games at regular intervals
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Sync Interval (minutes)</label>
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={settings.syncInterval}
                        onChange={(e) => setSettings({...settings, syncInterval: parseInt(e.target.value) || 5})}
                        disabled={!settings.autoSync}
                      />
                      <p className="setting-description">
                        How often to automatically sync (1-1440 minutes)
                      </p>
                    </div>

                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.autoLaunch}
                          onChange={(e) => setSettings({...settings, autoLaunch: e.target.checked})}
                        />
                        {' '}Launch on Startup
                      </label>
                      <p className="setting-description">
                        Automatically start MemoryCard when you log in
                      </p>
                    </div>

                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.showNotifications}
                          onChange={(e) => setSettings({...settings, showNotifications: e.target.checked})}
                        />
                        {' '}Show Notifications
                      </label>
                      <p className="setting-description">
                        Get notified when syncs complete
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Cloud Storage Provider</label>
                      <div className="input-with-button">
                        <select
                          value={settings.cloudProvider}
                          onChange={(e) => setSettings({...settings, cloudProvider: e.target.value as typeof settings.cloudProvider})}
                        >
                          <option value="google-drive">Google Drive</option>
                          <option value="dropbox">Dropbox</option>
                          <option value="onedrive">OneDrive</option>
                          <option value="icloud">iCloud Drive</option>
                          <option value="other">Other</option>
                        </select>
                        <button
                          type="button"
                          className="btn btn-browse"
                          onClick={async () => {
                            try {
                              await invoke('launch_cloud_app', { cloudProvider: settings.cloudProvider.replace('-', ' ') });
                            } catch (error) {
                              setNotification({ message: `Failed to open cloud app: ${error}`, type: 'error' });
                            }
                          }}
                          disabled={settings.cloudProvider === 'other'}
                        >
                          Open App
                        </button>
                      </div>
                      <p className="setting-description">
                        Select your cloud storage provider to quickly launch it
                      </p>
                    </div>

                    <div className="form-group update-section">
                      <label>Software Updates</label>
                      <div className="input-with-button">
                        <span className="version-info">Current version: 0.5.0</span>
                        <button
                          type="button"
                          className="btn btn-browse"
                          onClick={handleCheckForUpdates}
                          disabled={checkingForUpdates}
                        >
                          {checkingForUpdates ? 'Checking...' : 'Check for Updates'}
                        </button>
                      </div>
                      {updateAvailable && (
                        <div className="update-available">
                          <p className="update-message">
                            Version {updateAvailable.version} is available!
                          </p>
                          {updateAvailable.notes && (
                            <p className="update-notes">{updateAvailable.notes}</p>
                          )}
                          <button
                            className="btn btn-primary"
                            onClick={handleInstallUpdate}
                          >
                            Download and Install
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Update Behavior</label>
                      <select
                        value={settings.updatePreference}
                        onChange={(e) => setSettings({...settings, updatePreference: e.target.value as AppSettings['updatePreference']})}
                      >
                        <option value="automatic">Automatic - Download and install automatically</option>
                        <option value="download-only">Download Only - Download but ask before installing</option>
                        <option value="notify-only">Notify Only - Just notify when updates are available</option>
                        <option value="manual">Manual - Never check automatically</option>
                      </select>
                      <p className="setting-description">
                        Choose how MemoryCard handles software updates
                      </p>
                    </div>
                  </>
                )}

                {settingsTab === 'sync' && (
                  <>
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.confirmBeforeSync}
                          onChange={(e) => setSettings({...settings, confirmBeforeSync: e.target.checked})}
                        />
                        {' '}Confirm Before Sync
                      </label>
                      <p className="setting-description">
                        Show a warning before syncing to prevent accidental overwrites
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Conflict Resolution Strategy</label>
                      <select
                        value={settings.conflictResolution}
                        onChange={(e) => setSettings({...settings, conflictResolution: e.target.value as 'manual' | 'local' | 'cloud' | 'newer'})}
                      >
                        <option value="manual">Manual - Ask me each time</option>
                        <option value="local">Always use local save</option>
                        <option value="cloud">Always use cloud save</option>
                        <option value="newer">Use newer file (by timestamp)</option>
                      </select>
                      <p className="setting-description">
                        How to handle conflicts when saves differ between local and cloud
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Config Storage</label>
                      <select
                        value={settings.configStorageMode}
                        onChange={(e) => setSettings({...settings, configStorageMode: e.target.value as 'local' | 'cloud'})}
                      >
                        <option value="local">Local only</option>
                        <option value="cloud">Sync to cloud</option>
                      </select>
                      <p className="setting-description">
                        Store your game library and settings locally or sync them to the cloud
                      </p>
                    </div>

                    {settings.configStorageMode === 'cloud' && (
                      <div className="form-group">
                        <label>Cloud Config Folder</label>
                        <div className="input-with-button">
                          <input
                            type="text"
                            placeholder="~/Google Drive/MemoryCard"
                            value={settings.cloudConfigPath || ''}
                            onChange={(e) => setSettings({...settings, cloudConfigPath: e.target.value})}
                          />
                          <button
                            type="button"
                            className="btn btn-browse"
                            onClick={async () => {
                              setBrowsing('cloudConfig');
                              try {
                                const selected = await open({
                                  directory: true,
                                  multiple: false,
                                  title: 'Select Cloud Config Folder'
                                });
                                if (selected && typeof selected === 'string') {
                                  setSettings({...settings, cloudConfigPath: selected});
                                }
                              } finally {
                                setBrowsing(null);
                              }
                            }}
                            disabled={browsing !== null}
                          >
                            {browsing === 'cloudConfig' ? '...' : 'Browse'}
                          </button>
                        </div>
                        <p className="setting-description">
                          Your settings and game list will be saved here and synced across devices
                        </p>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Sync History</label>
                      <div className="input-with-button">
                        <span className="version-info">{syncHistory.length} entries logged</span>
                        <button
                          type="button"
                          className="btn btn-browse"
                          onClick={() => {
                            loadSyncHistory();
                            setShowSyncHistory(true);
                          }}
                        >
                          View History
                        </button>
                      </div>
                      <p className="setting-description">
                        View detailed logs of all sync operations
                      </p>
                    </div>
                  </>
                )}

                {settingsTab === 'appearance' && (
                  <>
                    <div className="form-group">
                      <label>Color Theme</label>
                      <select
                        value={settings.theme}
                        onChange={(e) => setSettings({...settings, theme: e.target.value as AppSettings['theme']})}
                      >
                        <option value="default">Default (Balanced)</option>
                        <option value="cream">Cream (Light & Warm)</option>
                        <option value="midnight">Midnight (Very Dark)</option>
                        <option value="violet">Violet (Purple-Blue)</option>
                        <option value="sunset">Sunset (Orange Warmth)</option>
                        <option value="ember">Ember (Deep Rust)</option>
                        <option value="forest">Forest (Deep Greens)</option>
                        <option value="ocean">Ocean (Deep Blues)</option>
                      </select>
                      <p className="setting-description">
                        Choose your preferred color scheme based on the MemoryCard palette
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Dock Icon (macOS)</label>
                      <select
                        value={settings.dockVisibility}
                        onChange={async (e) => {
                          const newValue = e.target.value as 'menu-bar-only' | 'dock-only' | 'both' | 'neither';
                          setSettings({...settings, dockVisibility: newValue});

                          // Apply immediately via native API
                          try {
                            await invoke('set_dock_visibility', { visibility: newValue });
                          } catch (error) {
                            console.error('Failed to set dock visibility:', error);
                          }
                        }}
                      >
                        <option value="both">Show in Dock</option>
                        <option value="menu-bar-only">Hide from Dock (Menu Bar App)</option>
                      </select>
                      <p className="setting-description">
                        Hide the dock icon to run as a menu bar app. The tray icon is always available.
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => setShowSettings(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {showAbout && (
          <div className="modal-overlay" onClick={() => setShowAbout(false)}>
            <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
              <div className="about-content">
                <h1 className="about-title">MemoryCard</h1>
                <p className="about-version">Version 0.5.0</p>
                <p className="about-description">
                  Cross-platform game save synchronization
                </p>
                <div className="about-details">
                  <p>Sync your game saves across devices using your preferred cloud storage provider.</p>
                </div>

                <div className="about-update-section">
                  <h3>Updates</h3>
                  {updateAvailable ? (
                    <div className="update-available-inline">
                      <p>Version {updateAvailable.version} is available!</p>
                      {updateAvailable.notes && (
                        <p className="update-notes-small">{updateAvailable.notes}</p>
                      )}
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleInstallUpdate}
                      >
                        Install Update
                      </button>
                    </div>
                  ) : (
                    <div className="update-status">
                      <p>You're running the latest version</p>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleCheckForUpdates}
                        disabled={checkingForUpdates}
                      >
                        {checkingForUpdates ? 'Checking...' : 'Check for Updates'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="about-footer">
                  <p className="about-copyright">Made with care for gamers</p>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => setShowAbout(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {showSyncHistory && (
          <div className="modal-overlay" onClick={() => setShowSyncHistory(false)}>
            <div className="modal sync-history-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Sync History</h2>
              <div className="sync-history-content">
                {syncHistory.length === 0 ? (
                  <p className="empty-history">No sync operations logged yet</p>
                ) : (
                  <div className="history-list">
                    {syncHistory.map((entry) => (
                      <div key={entry.id} className={`history-entry ${entry.success ? 'success' : 'error'}`}>
                        <div className="history-header">
                          <span className="history-game">{entry.game_name}</span>
                          <span className="history-time">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="history-details">
                          <span className={`history-status ${entry.success ? 'success' : 'error'}`}>
                            {entry.success ? '✓' : '✕'} {entry.operation}
                          </span>
                          <span className="history-files">
                            {entry.files_synced} file(s) synced
                          </span>
                          {entry.direction && (
                            <span className="history-direction">{entry.direction}</span>
                          )}
                        </div>
                        {entry.error_message && (
                          <p className="history-error">{entry.error_message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button
                  className="btn btn-danger"
                  onClick={() => handleClearHistory()}
                  disabled={syncHistory.length === 0}
                >
                  Clear History
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowSyncHistory(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {conflicts && (
          <div className="modal-overlay">
            <div className="modal conflict-modal">
              <h2>Sync Conflict</h2>
              <p className="conflict-description">
                <strong>{conflicts.gameName}</strong> has {conflicts.conflicts.length} file{conflicts.conflicts.length > 1 ? 's' : ''} that differ between local and cloud.
              </p>

              <div className="conflicts-summary">
                {conflicts.conflicts.map((conflict, idx) => (
                  <div key={idx} className="conflict-file">
                    <span className="conflict-file-name">{conflict.relative_path}</span>
                    <div className="conflict-file-details">
                      <span className="conflict-detail">
                        <strong>Local:</strong> {(conflict.local_size / 1024).toFixed(1)} KB
                        {conflict.local_modified && ` • ${new Date(conflict.local_modified).toLocaleString()}`}
                      </span>
                      <span className="conflict-detail">
                        <strong>Cloud:</strong> {(conflict.cloud_size / 1024).toFixed(1)} KB
                        {conflict.cloud_modified && ` • ${new Date(conflict.cloud_modified).toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="conflict-choice">
                <p>Which version do you want to keep?</p>
                <div className="conflict-buttons">
                  <button
                    className="btn btn-primary btn-large"
                    onClick={() => handleResolveAllConflicts(true)}
                  >
                    Use Local
                  </button>
                  <button
                    className="btn btn-primary btn-large"
                    onClick={() => handleResolveAllConflicts(false)}
                  >
                    Use Cloud
                  </button>
                </div>
                <button
                  className="btn-link"
                  onClick={() => {
                    setConflicts(null);
                    setShowSettings(true);
                    setSettingsTab('sync');
                  }}
                >
                  Configure auto-resolution in Settings
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="games-grid">
          {games.map(game => (
            <div
              key={game.id}
              className="game-card"
              onClick={() => setSelectedGame(game)}
            >
              <div className="game-header">
                <h3>{game.name}</h3>
                <span className={`status status-${game.status}`}>
                  {game.status === 'synced' && '✓ Synced'}
                  {game.status === 'pending' && '⏱ Pending'}
                  {game.status === 'syncing' && '↻ Syncing'}
                </span>
              </div>

              <div className="game-paths">
                <div className="path-info">
                  <span className="path-label">Local:</span>
                  <span
                    className="path-value path-clickable"
                    onClick={(e) => openInExplorer(game.localPath, e)}
                    title="Click to open in file explorer"
                  >
                    {game.localPath}
                  </span>
                </div>
                <div className="path-info">
                  <span className="path-label">Cloud:</span>
                  <span
                    className="path-value path-clickable"
                    onClick={(e) => openInExplorer(game.cloudPath, e)}
                    title="Click to open in file explorer"
                  >
                    {game.cloudPath}
                  </span>
                </div>
              </div>

              {game.lastSynced && (
                <div className="last-synced">
                  Last synced: {new Date(game.lastSynced).toLocaleString()}
                </div>
              )}

              <div className="game-actions">
                <button
                  className={`btn btn-sm ${syncingGameId === game.id ? 'btn-syncing' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestSync(game.id);
                  }}
                  disabled={syncing || syncingGameId !== null}
                >
                  {syncingGameId === game.id ? 'Syncing...' : 'Sync Now'}
                </button>
                <button
                  className="btn btn-sm btn-icon btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDeleteGame(game.id);
                  }}
                  title="Remove game"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {selectedGame && (
          <div className="modal-overlay" onClick={() => setSelectedGame(null)}>
            <div className="modal game-detail-modal" onClick={(e) => e.stopPropagation()}>
              <h2>{selectedGame.name}</h2>

              <div className="game-detail-content">
                <div className="detail-section">
                  <h4>Sync Status</h4>
                  <div className="detail-row">
                    <span className={`status status-${selectedGame.status}`}>
                      {selectedGame.status === 'synced' && '✓ Synced'}
                      {selectedGame.status === 'pending' && '⏱ Pending'}
                      {selectedGame.status === 'syncing' && '↻ Syncing'}
                    </span>
                  </div>
                  {selectedGame.lastSynced && (
                    <div className="detail-row">
                      <span className="detail-label">Last synced:</span>
                      <span className="detail-value">{new Date(selectedGame.lastSynced).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <h4>Save Locations</h4>
                  <div className="detail-row">
                    <span className="detail-label">Local:</span>
                    <span
                      className="detail-value detail-path"
                      onClick={() => openInExplorer(selectedGame.localPath)}
                      title="Click to open in file explorer"
                    >
                      {selectedGame.localPath}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Cloud:</span>
                    <span
                      className="detail-value detail-path"
                      onClick={() => openInExplorer(selectedGame.cloudPath)}
                      title="Click to open in file explorer"
                    >
                      {selectedGame.cloudPath}
                    </span>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>Game ID</h4>
                  <div className="detail-row">
                    <span className="detail-value detail-id">{selectedGame.id}</span>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    requestDeleteGame(selectedGame.id);
                  }}
                >
                  Remove Game
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    requestSync(selectedGame.id);
                    setSelectedGame(null);
                  }}
                  disabled={syncing || syncingGameId !== null}
                >
                  Sync Now
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelectedGame(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingSyncGameId && (
          <div className="modal-overlay" onClick={() => setPendingSyncGameId(null)}>
            <div className="modal conflict-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Confirm Sync</h2>
              <p className="conflict-description">
                {pendingSyncGameId === 'all'
                  ? `You are about to sync all ${games.length} game(s). This may overwrite save files.`
                  : `You are about to sync "${games.find(g => g.id === pendingSyncGameId)?.name}". This may overwrite save files.`
                }
              </p>
              <p className="setting-description" style={{ marginBottom: '1rem' }}>
                Based on your conflict resolution strategy ({settings.conflictResolution}),
                files may be overwritten automatically.
              </p>
              <div className="conflict-buttons">
                <button
                  className="btn btn-secondary"
                  onClick={() => setPendingSyncGameId(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const gameId = pendingSyncGameId === 'all' ? undefined : pendingSyncGameId;
                    setPendingSyncGameId(null);
                    handleSync(gameId);
                  }}
                >
                  Sync Now
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingDeleteGameId && (
          <div className="modal-overlay" onClick={() => setPendingDeleteGameId(null)}>
            <div className="modal conflict-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Confirm Delete</h2>
              <p className="conflict-description">
                Are you sure you want to remove <strong>"{games.find(g => g.id === pendingDeleteGameId)?.name}"</strong> from your library?
              </p>
              <p className="setting-description" style={{ marginBottom: '1rem' }}>
                This will only remove the game from MemoryCard. Your save files will not be deleted.
              </p>
              <div className="conflict-buttons">
                <button
                  className="btn btn-secondary"
                  onClick={() => setPendingDeleteGameId(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleRemoveGame(pendingDeleteGameId)}
                >
                  Remove Game
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
