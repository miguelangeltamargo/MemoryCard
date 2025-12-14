# CLAUDE.md - MemoryCard Project Guide

This file provides guidance for Claude Code when working on the MemoryCard project.

## Project Overview

**MemoryCard** is a cross-platform desktop application for synchronizing game save files across devices using cloud storage providers. Built with Tauri 2.0 (Rust backend + React/TypeScript frontend).

**Current Version:** 0.4.5

## Tech Stack

- **Framework:** Tauri 2.0
- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Rust
- **Plugins:** @tauri-apps/plugin-dialog, plugin-store, plugin-notification, plugin-autostart, plugin-opener

## Project Structure

```
MemoryCard/
├── desktop-app/           # Main Tauri application
│   ├── src/               # React frontend
│   │   ├── App.tsx        # Main React component
│   │   └── App.css        # Styles with theme support
│   ├── src-tauri/         # Rust backend
│   │   ├── src/lib.rs     # Tauri commands and app setup
│   │   ├── Cargo.toml     # Rust dependencies
│   │   └── tauri.conf.json # Tauri configuration
│   └── package.json       # npm dependencies
├── design/
│   └── ARCHITECTURE.md    # Full platform vision and roadmap
└── CLAUDE.md              # This file
```

## Key Development Commands

```bash
# From desktop-app directory:
npm run tauri dev        # Run in development mode
npm run tauri build      # Build for production
npm run build            # Build frontend only
npm run dev              # Run Vite dev server only
```

## Architecture Details

### Frontend (App.tsx)

The main React component handles:
- Game library management (add/remove/view games)
- Sync operations (manual and automatic)
- Settings with tabs: General, Sync, Appearance
- System tray event listeners
- Conflict resolution UI (Local/Cloud choice)
- Theme switching (6 themes)

**Key State:**
- `games: Game[]` - List of games with sync status
- `settings: AppSettings` - User preferences
- `conflicts` - Active sync conflicts to resolve

**Key Tauri Plugin Usage:**
- `@tauri-apps/plugin-store` for persistent settings
- `@tauri-apps/plugin-dialog` for folder browsing
- `@tauri-apps/plugin-notification` for sync notifications
- `@tauri-apps/plugin-autostart` for launch on login

### Backend (lib.rs)

Rust commands exposed to frontend:

| Command | Purpose |
|---------|---------|
| `sync_game_saves` | Bidirectional sync between local/cloud folders |
| `resolve_conflict` | Copy file from local or cloud |
| `set_dock_visibility` | macOS activation policy (dock/menu bar) |
| `open_folder_in_explorer` | Open folder in Finder/Explorer |
| `launch_cloud_app` | Open cloud provider app |
| `restart_app` | Restart the application |
| `sync_config_to_cloud` | Save config to cloud folder |

**macOS-specific:**
- Uses `cocoa` crate for `NSApp.activateIgnoringOtherApps`
- Activation policy for dock/menu bar visibility
- Reads saved settings from store.json at startup

### System Tray

- Left click: Show/focus main window
- Right click menu: Show, Sync Now, Quit
- App menu (macOS): About, Settings (Cmd+,), Quit

### Window Configuration

```json
{
  "titleBarStyle": "Overlay",
  "hiddenTitle": true,
  "minWidth": 400,
  "minHeight": 500
}
```

Uses `data-tauri-drag-region` attribute on header elements for window dragging.

## Common Patterns

### Adding a New Tauri Command

1. Add function in `src-tauri/src/lib.rs`:
```rust
#[tauri::command]
fn my_command(param: String) -> Result<String, String> {
    // Implementation
    Ok("result".to_string())
}
```

2. Register in `invoke_handler`:
```rust
.invoke_handler(tauri::generate_handler![..., my_command])
```

3. Call from frontend:
```typescript
import { invoke } from "@tauri-apps/api/core";
const result = await invoke<string>('my_command', { param: 'value' });
```

### Adding a New Setting

1. Add to `AppSettings` interface in `App.tsx`
2. Add default value in initial state
3. Add UI control in settings modal
4. The `useEffect` for settings auto-saves to store

### Sync Flow

1. User clicks "Sync All" or individual game sync
2. `handleSync()` iterates games, calls `sync_game_saves` command
3. Backend compares files by timestamp, returns conflicts or syncs
4. If conflicts: modal shown with Local/Cloud choice
5. User resolves, `resolve_conflict` command copies winning file

## Known Issues & Considerations

- **App Visibility Changes:** Require app restart to take full effect (restart prompt implemented)
- **Window Dragging:** Only works via `data-tauri-drag-region` attribute, not CSS `-webkit-app-region`
- **DMG Bundling:** May fail with temp file issues; .app bundle still works

## Future Roadmap (from ARCHITECTURE.md)

- AI-powered save location detection
- Multi-cloud OAuth integration
- Web platform with social features
- Mobile apps

## Version Sync

Keep versions aligned in:
- `package.json` (version field)
- `Cargo.toml` (version field)
- `tauri.conf.json` (version field)
- About modal in `App.tsx`
