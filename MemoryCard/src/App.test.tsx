import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock the invoke function
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock the store
const mockStoreGet = vi.fn();
const mockStoreSet = vi.fn();
const mockStoreSave = vi.fn();
vi.mock('@tauri-apps/plugin-store', () => ({
  Store: {
    load: vi.fn(() => Promise.resolve({
      get: mockStoreGet,
      set: mockStoreSet,
      save: mockStoreSave,
    })),
  },
}));

// Mock dialog
const mockOpen = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreGet.mockResolvedValue(null);
    // Mock various invoke calls that happen on mount and during operations
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'set_dock_visibility') return Promise.resolve('ok');
      if (cmd === 'sync_game_saves') return Promise.resolve({ success: true, files_synced: 0, conflicts: [] });
      if (cmd === 'create_directory') return Promise.resolve(undefined);
      if (cmd === 'log_sync_operation') return Promise.resolve(1);
      if (cmd === 'get_sync_history') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
  });

  describe('Initial Render', () => {
    it('renders the app header', async () => {
      render(<App />);

      expect(screen.getByRole('heading', { name: 'MemoryCard' })).toBeInTheDocument();
      expect(screen.getByText('Cross-platform game save synchronization')).toBeInTheDocument();
    });

    it('renders the toolbar with buttons', async () => {
      render(<App />);

      expect(screen.getByRole('button', { name: /add game/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sync all/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    });

    it('shows empty state when no games are added', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('No games added yet')).toBeInTheDocument();
        expect(screen.getByText('Click "Add Game" to start syncing your save files')).toBeInTheDocument();
      });
    });

    it('disables Sync All button when no games exist', async () => {
      render(<App />);

      const syncButton = screen.getByRole('button', { name: /sync all/i });
      expect(syncButton).toBeDisabled();
    });
  });

  describe('Add Game Modal', () => {
    it('opens add game modal when clicking Add Game button', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /add game/i }));

      expect(screen.getByRole('heading', { name: 'Add New Game' })).toBeInTheDocument();
    });

    it('shows form fields in add game modal', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /add game/i }));

      expect(screen.getByText('Game Name')).toBeInTheDocument();
      expect(screen.getByText('Local Save Folder')).toBeInTheDocument();
      expect(screen.getByText('Cloud Backup Folder')).toBeInTheDocument();
    });

    it('closes modal when clicking Cancel', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /add game/i }));
      expect(screen.getByRole('heading', { name: 'Add New Game' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('heading', { name: 'Add New Game' })).not.toBeInTheDocument();
    });

    it('closes modal when pressing Escape', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /add game/i }));
      expect(screen.getByRole('heading', { name: 'Add New Game' })).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('heading', { name: 'Add New Game' })).not.toBeInTheDocument();
    });

    it('disables Add Game button when form is incomplete', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /add game/i }));

      const addButton = screen.getByRole('button', { name: 'Add Game' });
      expect(addButton).toBeDisabled();
    });

    it('enables Add Game button when form is complete', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /add game/i }));

      const inputs = screen.getAllByRole('textbox');
      await user.type(inputs[0], 'Hollow Knight');
      await user.type(inputs[1], '/local/path');
      await user.type(inputs[2], '/cloud/path');

      const addButton = screen.getByRole('button', { name: 'Add Game' });
      expect(addButton).not.toBeDisabled();
    });

    it('adds a game when form is submitted', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /add game/i }));

      const inputs = screen.getAllByRole('textbox');
      await user.type(inputs[0], 'Test Game');
      await user.type(inputs[1], '/local/saves');
      await user.type(inputs[2], '/cloud/saves');

      await user.click(screen.getByRole('button', { name: 'Add Game' }));

      // Modal should close
      expect(screen.queryByRole('heading', { name: 'Add New Game' })).not.toBeInTheDocument();

      // Game should appear in the list
      expect(screen.getByText('Test Game')).toBeInTheDocument();
    });
  });

  describe('Settings Modal', () => {
    it('opens settings modal when clicking Settings button', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /settings/i }));

      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    });

    it('shows three tabs in settings modal', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /settings/i }));

      expect(screen.getByRole('button', { name: 'General' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Appearance' })).toBeInTheDocument();
    });

    it('switches between tabs', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /settings/i }));

      // General tab is active by default
      expect(screen.getByText('Enable Auto-Sync')).toBeInTheDocument();

      // Switch to Sync tab
      await user.click(screen.getByRole('button', { name: 'Sync' }));
      expect(screen.getByText('Conflict Resolution Strategy')).toBeInTheDocument();

      // Switch to Appearance tab
      await user.click(screen.getByRole('button', { name: 'Appearance' }));
      expect(screen.getByText('Color Theme')).toBeInTheDocument();
    });

    it('closes settings modal when clicking Done', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /settings/i }));
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
    });

    it('updates auto-sync setting', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /settings/i }));

      const checkbox = screen.getByRole('checkbox', { name: /enable auto-sync/i });
      expect(checkbox).toBeChecked(); // Default is true

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('Game List', () => {
    beforeEach(() => {
      const savedGames = [
        {
          id: '1',
          name: 'Hollow Knight',
          localPath: '/local/hollow-knight',
          cloudPath: '/cloud/hollow-knight',
          status: 'synced',
          lastSynced: new Date().toISOString()
        }
      ];
      mockStoreGet.mockImplementation((key: string) => {
        if (key === 'games') return Promise.resolve(savedGames);
        if (key === 'settings') return Promise.resolve(null);
        return Promise.resolve(null);
      });
    });

    it('displays saved games from store', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Hollow Knight')).toBeInTheDocument();
      });
    });

    it('shows game status', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('✓ Synced')).toBeInTheDocument();
      });
    });

    it('shows game paths', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('/local/hollow-knight')).toBeInTheDocument();
        expect(screen.getByText('/cloud/hollow-knight')).toBeInTheDocument();
      });
    });

    it('enables Sync All button when games exist', async () => {
      render(<App />);

      await waitFor(() => {
        const syncButton = screen.getByRole('button', { name: /sync all/i });
        expect(syncButton).not.toBeDisabled();
      });
    });

    it('removes game when clicking remove button and confirming', async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Hollow Knight')).toBeInTheDocument();
      });

      // The remove button has title="Remove game" and contains ✕
      const removeButton = screen.getByTitle('Remove game');
      await user.click(removeButton);

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
      });

      // Click the confirm button
      await user.click(screen.getByRole('button', { name: 'Remove Game' }));

      // Game should now be removed
      await waitFor(() => {
        expect(screen.queryByText('Hollow Knight')).not.toBeInTheDocument();
      });
    });
  });

  describe('Sync Operations', () => {
    beforeEach(() => {
      const savedGames = [
        {
          id: '1',
          name: 'Test Game',
          localPath: '/local/test',
          cloudPath: '/cloud/test',
          status: 'pending'
        }
      ];
      // Return settings with confirmBeforeSync: false to simplify tests
      mockStoreGet.mockImplementation((key: string) => {
        if (key === 'games') return Promise.resolve(savedGames);
        if (key === 'settings') return Promise.resolve({ confirmBeforeSync: false });
        return Promise.resolve(null);
      });
    });

    it('calls invoke with sync_game_saves when syncing', async () => {
      const user = userEvent.setup();
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'set_dock_visibility') return Promise.resolve('ok');
        if (cmd === 'sync_game_saves') return Promise.resolve({ success: true, files_synced: 2, conflicts: [] });
        if (cmd === 'log_sync_operation') return Promise.resolve(1);
        return Promise.resolve(undefined);
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Test Game')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /sync all/i }));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('sync_game_saves', expect.objectContaining({
          localPath: '/local/test',
          cloudPath: '/cloud/test'
        }));
      });
    });

    it('updates game status after sync completes', async () => {
      const user = userEvent.setup();
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'set_dock_visibility') return Promise.resolve('ok');
        if (cmd === 'sync_game_saves') return Promise.resolve({ success: true, files_synced: 1, conflicts: [] });
        if (cmd === 'log_sync_operation') return Promise.resolve(1);
        return Promise.resolve(undefined);
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Test Game')).toBeInTheDocument();
      });

      // Game should initially show pending status
      expect(screen.getByText('⏱ Pending')).toBeInTheDocument();

      // Click Sync All
      await user.click(screen.getByRole('button', { name: /sync all/i }));

      // After sync completes, status should be synced
      await waitFor(() => {
        expect(screen.getByText('✓ Synced')).toBeInTheDocument();
      });
    });

    it('syncs individual game when clicking Sync Now on game card', async () => {
      const user = userEvent.setup();
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'set_dock_visibility') return Promise.resolve('ok');
        if (cmd === 'sync_game_saves') return Promise.resolve({ success: true, files_synced: 1, conflicts: [] });
        if (cmd === 'log_sync_operation') return Promise.resolve(1);
        return Promise.resolve(undefined);
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Test Game')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Sync Now' }));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('sync_game_saves', expect.objectContaining({
          localPath: '/local/test',
          cloudPath: '/cloud/test'
        }));
      });
    });
  });

  describe('Conflict Resolution', () => {
    beforeEach(() => {
      const savedGames = [
        {
          id: '1',
          name: 'Conflict Game',
          localPath: '/local/conflict',
          cloudPath: '/cloud/conflict',
          status: 'pending'
        }
      ];
      mockStoreGet.mockImplementation((key: string) => {
        if (key === 'games') return Promise.resolve(savedGames);
        if (key === 'settings') return Promise.resolve({ confirmBeforeSync: false });
        return Promise.resolve(null);
      });
    });

    it('shows conflict modal when sync returns conflicts', async () => {
      const user = userEvent.setup();
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'set_dock_visibility') return Promise.resolve('ok');
        if (cmd === 'sync_game_saves') return Promise.resolve({
          success: true,
          files_synced: 0,
          conflicts: [{
            relative_path: 'save.dat',
            local_path: '/local/conflict/save.dat',
            cloud_path: '/cloud/conflict/save.dat',
            local_modified: '2024-01-01',
            cloud_modified: '2024-01-02',
            local_size: 1024,
            cloud_size: 2048
          }]
        });
        return Promise.resolve(undefined);
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Conflict Game')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /sync all/i }));

      await waitFor(() => {
        expect(screen.getByText('Sync Conflict')).toBeInTheDocument();
        expect(screen.getByText('save.dat')).toBeInTheDocument();
      });
    });

    it('resolves conflict with local when clicking Use Local', async () => {
      const user = userEvent.setup();
      const conflictData = {
        success: true,
        files_synced: 0,
        conflicts: [{
          relative_path: 'save.dat',
          local_path: '/local/conflict/save.dat',
          cloud_path: '/cloud/conflict/save.dat',
          local_modified: '2024-01-01',
          cloud_modified: '2024-01-02',
          local_size: 1024,
          cloud_size: 2048
        }]
      };

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'set_dock_visibility') return Promise.resolve('ok');
        if (cmd === 'sync_game_saves') return Promise.resolve(conflictData);
        if (cmd === 'resolve_conflict') return Promise.resolve(undefined);
        if (cmd === 'log_sync_operation') return Promise.resolve(1);
        return Promise.resolve(undefined);
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Conflict Game')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /sync all/i }));

      await waitFor(() => {
        expect(screen.getByText('Sync Conflict')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Use Local' }));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('resolve_conflict', {
          localPath: '/local/conflict/save.dat',
          cloudPath: '/cloud/conflict/save.dat',
          useLocal: true
        });
      });
    });

    it('resolves conflict with cloud when clicking Use Cloud', async () => {
      const user = userEvent.setup();
      const conflictData = {
        success: true,
        files_synced: 0,
        conflicts: [{
          relative_path: 'save.dat',
          local_path: '/local/conflict/save.dat',
          cloud_path: '/cloud/conflict/save.dat',
          local_modified: '2024-01-01',
          cloud_modified: '2024-01-02',
          local_size: 1024,
          cloud_size: 2048
        }]
      };

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'set_dock_visibility') return Promise.resolve('ok');
        if (cmd === 'sync_game_saves') return Promise.resolve(conflictData);
        if (cmd === 'resolve_conflict') return Promise.resolve(undefined);
        if (cmd === 'log_sync_operation') return Promise.resolve(1);
        return Promise.resolve(undefined);
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Conflict Game')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /sync all/i }));

      await waitFor(() => {
        expect(screen.getByText('Sync Conflict')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Use Cloud' }));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('resolve_conflict', {
          localPath: '/local/conflict/save.dat',
          cloudPath: '/cloud/conflict/save.dat',
          useLocal: false
        });
      });
    });
  });

  describe('Theme Handling', () => {
    it('applies default theme initially', async () => {
      render(<App />);

      await waitFor(() => {
        expect(document.body.getAttribute('data-theme')).toBeNull();
      });
    });

    it('applies selected theme', async () => {
      mockStoreGet.mockImplementation((key: string) => {
        if (key === 'settings') return Promise.resolve({ theme: 'midnight' });
        return Promise.resolve(null);
      });

      render(<App />);

      await waitFor(() => {
        expect(document.body.getAttribute('data-theme')).toBe('midnight');
      });
    });
  });

  describe('Auto-sync Indicator', () => {
    beforeEach(() => {
      const savedGames = [{ id: '1', name: 'Game', localPath: '/l', cloudPath: '/c', status: 'pending' }];
      mockStoreGet.mockImplementation((key: string) => {
        if (key === 'games') return Promise.resolve(savedGames);
        if (key === 'settings') return Promise.resolve({ autoSync: true, syncInterval: 10 });
        return Promise.resolve(null);
      });
    });

    it('shows auto-sync indicator when enabled and games exist', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/auto-sync enabled/i)).toBeInTheDocument();
        expect(screen.getByText(/every 10 min/i)).toBeInTheDocument();
      });
    });
  });

  describe('Folder Browsing', () => {
    it('calls dialog.open when browsing for local folder', async () => {
      const user = userEvent.setup();
      mockOpen.mockResolvedValue('/selected/path');

      render(<App />);

      await user.click(screen.getByRole('button', { name: /add game/i }));

      const browseButtons = screen.getAllByRole('button', { name: 'Browse' });
      await user.click(browseButtons[1]); // Second Browse button is for local path

      await waitFor(() => {
        expect(mockOpen).toHaveBeenCalledWith({
          directory: true,
          multiple: false,
          title: 'Select Local Save Folder'
        });
      });
    });

    it('calls dialog.open when browsing for cloud folder', async () => {
      const user = userEvent.setup();
      mockOpen.mockResolvedValue('/selected/cloud/path');

      render(<App />);

      await user.click(screen.getByRole('button', { name: /add game/i }));

      const browseButtons = screen.getAllByRole('button', { name: 'Browse' });
      await user.click(browseButtons[2]); // Third Browse button is for cloud path

      await waitFor(() => {
        expect(mockOpen).toHaveBeenCalledWith({
          directory: true,
          multiple: false,
          title: 'Select Cloud Backup Folder'
        });
      });
    });
  });
});
