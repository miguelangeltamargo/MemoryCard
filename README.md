# MemoryCard

Cross-platform desktop app for syncing game saves between devices. Never lose your progress!

## 📥 Download

**Coming Soon**: Download the latest release for your platform:
- **macOS**: [MemoryCard.dmg](https://github.com/miguelangeltamargo/MemoryCard/releases) (Apple Silicon/Intel)
- **Windows**: [MemoryCard-Setup.msi](https://github.com/miguelangeltamargo/MemoryCard/releases)

## ✨ Features

- 🎮 **Simple GUI** - Add games with folder picker dialogs
- ☁️ **Works with any cloud** - Google Drive, Dropbox, OneDrive, etc.
- 🔄 **Bi-directional sync** - Automatically syncs the newest files
- 🖥️ **Cross-platform** - Same app works on macOS and Windows
- 🔒 **Privacy-first** - All syncing happens through your own cloud folders

## 🚀 How It Works

1. **Add a game** - Select your local save folder and cloud backup folder
2. **Click Sync** - The app compares files and syncs the newest version
3. **Switch devices** - Run the app on another device and sync to get your latest saves

The app uses file modification times to determine which version is newest, ensuring you never lose progress.

## 🛠️ Building from Source

### Prerequisites

**macOS:**
- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Node.js 20+: `brew install node` or [nodejs.org](https://nodejs.org/)

**Windows:**
- Rust: Download from [rustup.rs](https://rustup.rs/)
- Node.js 20+: Download from [nodejs.org](https://nodejs.org/)

### Build Instructions

```bash
# Clone the repo
git clone https://github.com/miguelangeltamargo/MemoryCard.git
cd MemoryCard/desktop-app

# Install dependencies
npm install

# Development mode
npm run tauri dev

# Production build
npm run tauri build
```

**Build outputs:**
- **macOS**: `src-tauri/target/release/bundle/macos/MemoryCard.app` and `.dmg`
- **Windows**: `src-tauri/target/release/bundle/msi/MemoryCard_0.1.0_x64_en-US.msi`

## 📦 Creating Releases

To distribute the app, use GitHub Releases:

1. **Create a new release** on GitHub
2. **Upload the installers**:
   - macOS: `MemoryCard_0.1.0_aarch64.dmg`
   - Windows: `MemoryCard_0.1.0_x64_en-US.msi`
3. Users can download directly from the Releases page

## 🐍 Python CLI (Legacy)

A simple Python script is also available for command-line usage:

```bash
python3 simple_sync.py
```

This interactive tool works with any cloud storage folder without requiring API setup.

## 🎮 Supported Games

Currently tested with:
- Hollow Knight
- Hollow Knight: Silksong

**Any game works** - just point the app to the save folder location!

## 📝 License

MIT - Feel free to use and modify!
