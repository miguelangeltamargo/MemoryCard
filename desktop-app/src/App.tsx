import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface Game {
  id: string;
  name: string;
  localPath: string;
  cloudPath: string;
  lastSynced?: Date;
  status: 'synced' | 'pending' | 'syncing';
}

function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [showAddGame, setShowAddGame] = useState(false);
  const [newGame, setNewGame] = useState({
    name: '',
    localPath: '',
    cloudPath: ''
  });
  const [syncing, setSyncing] = useState(false);
  const [browsing, setBrowsing] = useState<'localPath' | 'cloudPath' | null>(null);

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
    try {
      const gamesToSync = gameId ? games.filter(g => g.id === gameId) : games;

      for (const game of gamesToSync) {
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
              ? { ...g, status: 'synced' as const, lastSynced: new Date() }
              : g
          ));
        } catch (error) {
          console.error(`Sync failed for ${game.name}:`, error);
          // Update status back to pending on error
          setGames(prev => prev.map(g =>
            g.id === game.id ? { ...g, status: 'pending' as const } : g
          ));
          alert(`Failed to sync ${game.name}: ${error}`);
        }
      }
    } finally {
      setSyncing(false);
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
        </div>

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
                  Last synced: {game.lastSynced.toLocaleString()}
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
