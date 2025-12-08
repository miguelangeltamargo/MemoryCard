import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Store } from "@tauri-apps/plugin-store";
import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";
import { listen } from "@tauri-apps/api/event";
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
  autoLaunch: boolean;
  showNotifications: boolean;
}

interface SyncProgress {
  current: number;
  total: number;
  fileName?: string;
}

function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [showAddGame, setShowAddGame] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newGame, setNewGame] = useState({
    name: '',
    localPath: '',
    cloudPath: ''
  });
  const [settings, setSettings] = useState<AppSettings>({
    syncInterval: 5,
    autoSync: true,
    autoLaunch: false,
    showNotifications: true
  });
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [browsing, setBrowsing] = useState<'localPath' | 'cloudPath' | 'cloudConfig' | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

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
    } finally {
      setBrowsing(null);
    }
  };

  const handleAddGame = () => {
    if (newGame.name && newGame.localPath && newGame.cloudPath) {
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

  const handleSync = async (gameId?: string) => {
    setSyncing(true);
    setSyncProgress(null);

    try {
      const gamesToSync = gameId ? games.filter(g => g.id === gameId) : games;
      let totalGames = gamesToSync.length;
      let currentGame = 0;

      for (const game of gamesToSync) {
        currentGame++;
        setSyncProgress({
          current: currentGame,
          total: totalGames,
          fileName: game.name
        });

        // Update status to syncing
        setGames(prev => prev.map(g =>
          g.id === game.id ? { ...g, status: 'syncing' as const } : g
        ));

        try {
          const result = await invoke<{ success: boolean; message: string; files_synced: number }>(
            'sync_game_saves',
            {
              localPath: game.localPath,
              cloudPath: game.cloudPath
            }
          );

          console.log(`Sync result for ${game.name}:`, result);

          // Update status to synced
          setGames(prev => prev.map(g =>
            g.id === game.id
              ? { ...g, status: 'synced' as const, lastSynced: new Date().toISOString() }
              : g
          ));

          if (result.files_synced > 0) {
            setNotification({
              message: `${game.name}: Synced ${result.files_synced} file(s)`,
              type: 'success'
            });
          }
        } catch (error) {
          console.error(`Sync failed for ${game.name}:`, error);
          // Update status back to pending on error
          setGames(prev => prev.map(g =>
            g.id === game.id ? { ...g, status: 'pending' as const } : g
          ));
          setNotification({
            message: `Failed to sync ${game.name}`,
            type: 'error'
          });
        }
      }

      if (!gameId && totalGames > 1) {
        setNotification({
          message: `Synced all ${totalGames} games`,
          type: 'success'
        });
      }
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleRemoveGame = (gameId: string) => {
    setGames(games.filter(g => g.id !== gameId));
  };

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAddGame) {
        setShowAddGame(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showAddGame]);

  return (
    <div className="app">
      <header className="header">
        <h1>MemoryCard</h1>
        <p className="subtitle">Cross-platform game save synchronization</p>
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
            onClick={() => handleSync()}
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
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Add New Game</h2>

              <div className="form-group">
                <label>Game Name</label>
                <input
                  type="text"
                  placeholder="Hollow Knight"
                  value={newGame.name}
                  onChange={(e) => setNewGame({...newGame, name: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label>Local Save Folder</label>
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
              </div>

              <div className="form-group">
                <label>Cloud Backup Folder</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    placeholder="~/Google Drive/GameSaves/GameName"
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
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Settings</h2>

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
                <label>Cloud Config Folder (Optional)</label>
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
                  Sync your settings and game list to cloud storage
                </p>
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

        <div className="games-grid">
          {games.map(game => (
            <div key={game.id} className="game-card">
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
                  <span className="path-value">{game.localPath}</span>
                </div>
                <div className="path-info">
                  <span className="path-label">Cloud:</span>
                  <span className="path-value">{game.cloudPath}</span>
                </div>
              </div>

              {game.lastSynced && (
                <div className="last-synced">
                  Last synced: {new Date(game.lastSynced).toLocaleString()}
                </div>
              )}

              <div className="game-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => handleSync(game.id)}
                  disabled={syncing}
                >
                  Sync Now
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleRemoveGame(game.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
