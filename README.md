# MemoryCard

Cross-platform desktop app for syncing game saves between devices. Never lose your progress!

## Version 0.4.5

### What's New

**Window & UI Improvements**

- Custom overlay title bar with native macOS traffic lights
- Window dragging via header area (using `data-tauri-drag-region`)
- Simplified, cleaner settings with tabbed interface (General, Sync, Appearance)
- About modal accessible from menu bar
- 6 color themes: Default, Cream, Midnight, Violet, Sunset, Ember

**Tray & Dock Integration**

- System tray icon with left-click to toggle window visibility
- Right-click tray menu: Show, Sync Now, Quit
- macOS dock icon visibility toggle (show/hide from dock)
- Instant dock visibility changes without restart

**Game Management**

- Browse for game application to auto-fill game name
- "View" button to open save folder in Finder/Explorer
- Compact remove button (X icon)
- Simplified conflict resolution: Local or Cloud choice

**Sync Features**

- Automatic sync at configurable intervals
- Cloud config sync (save settings to cloud folder)
- Multiple conflict resolution strategies: Manual, Local, Cloud, Newer
- Desktop notifications for sync events

**Other Features**

- Launch on login option
- Open cloud provider app button
- Switched to bun for faster package management

## Download

**Coming Soon**: Download the latest release for your platform:

- **macOS**: [MemoryCard.dmg](https://github.com/miguelangeltamargo/MemoryCard/releases) (Apple Silicon/Intel)
- **Windows**: [MemoryCard-Setup.msi](https://github.com/miguelangeltamargo/MemoryCard/releases)

## Features

- **Simple GUI** - Add games with folder picker dialogs
- **Works with any cloud** - Google Drive, Dropbox, OneDrive, iCloud, etc.
- **Bi-directional sync** - Automatically syncs the newest files
- **Cross-platform** - Same app works on macOS and Windows
- **Privacy-first** - All syncing happens through your own cloud folders
- **Menu bar app** - Runs in the background with system tray

## How It Works

1. **Add a game** - Select your local save folder and cloud backup folder
2. **Click Sync** - The app compares files and syncs the newest version
3. **Switch devices** - Run the app on another device and sync to get your latest saves

The app uses file modification times to determine which version is newest, ensuring you never lose progress.

## Building from Source

### Prerequisites

**macOS:**

- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Node.js 20+ or Bun: `brew install oven-sh/bun/bun`

**Windows:**

- Rust: Download from [rustup.rs](https://rustup.rs/)
- Node.js 20+: Download from [nodejs.org](https://nodejs.org/)

### Build Instructions

```bash
# Clone the repo
git clone https://github.com/miguelangeltamargo/MemoryCard.git
cd MemoryCard/MemoryCard

# Install dependencies
bun install

# Development mode
bun run tauri dev

# Production build
bun run tauri build
```

**Build outputs:**

- **macOS**: `src-tauri/target/release/bundle/macos/MemoryCard.app` and `.dmg`
- **Windows**: `src-tauri/target/release/bundle/msi/MemoryCard_x64_en-US.msi`

## Project Structure

```
MemoryCard/
├── MemoryCard/           # Main Tauri application
│   ├── src/              # React frontend
│   ├── src-tauri/        # Rust backend
│   └── package.json
├── design/
│   └── ARCHITECTURE.md   # Platform vision and roadmap
├── CLAUDE.md             # Development guide
└── README.md
```

## Tech Stack

- **Framework**: Tauri 2.0
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Rust
- **Package Manager**: Bun

## Supported Games

**Any game works** - just point the app to the save folder location!

## License

MIT - Feel free to use and modify!
