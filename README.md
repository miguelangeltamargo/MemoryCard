# MemoryCard

Cross-platform game save synchronization tool. Never lose your progress when switching between devices!

## 🚀 Quick Start (Simple Version)

**NEW**: Try the interactive sync tool - no Google API setup required!

```bash
python3 simple_sync.py
```

This interactive tool lets you:
- Choose any game to sync
- Specify local save folder and cloud backup location
- Works with Google Drive Desktop, Dropbox, OneDrive, or any synced folder
- No API credentials needed!

## 📦 Tools Available

### 1. `simple_sync.py` - Interactive CLI Tool
Simple, user-friendly tool that works with any cloud storage you have installed (Google Drive Desktop, Dropbox, OneDrive, etc.). Just point it to your game saves and cloud folder - no API setup required.

### 2. `game_save_sync.py` - Advanced Auto-Sync (requires Google API setup)
Fully automated background sync service with Google Drive API integration, system tray support, and scheduling.

## Supported Games

Currently configured for:
- **Hollow Knight**
- **Hollow Knight: Silksong**

**Easy to add more games** - just specify the save folder location and file patterns!

## 🔮 Future Plans

This project is evolving into a comprehensive gaming platform:
- Desktop app with GUI (Tauri + React)
- Web platform for tracking game progress
- Social features (share saves, achievements)
- Multi-cloud support (S3, Dropbox, OneDrive)
- Cross-device sync for unlimited games

## Features

- ✅ **Cross-platform**: Works on macOS and Windows
- ✅ **Automatic sync**: Runs continuously with configurable intervals (default: every 5 minutes)
- ✅ **Smart sync**: Only uploads/downloads when needed based on timestamps
- ✅ **Bidirectional**: Syncs both ways - from local to cloud and cloud to local
- ✅ **Safe**: Never overwrites newer saves with older ones
- ✅ **Scheduled**: Can run automatically on system startup
- ✅ **Easy to use**: Simple setup and configuration

## How It Works

1. **Before you play**: The script checks if there are any newer saves in the cloud
   - If cloud saves are newer → downloads them to your local machine
   - If local saves are newer → uploads them to the cloud
   - If they're in sync → does nothing

2. **While you play**: The script checks every 5 minutes
   - Automatically uploads your progress as you play
   - Ensures your cloud backup is always up-to-date

3. **When you switch devices**: The script on your other device will detect the newer cloud saves and download them automatically

## Prerequisites

- Python 3.7 or higher
- A Google account (free)
- Google Drive (comes with every Google account)

## Quick Setup

### Step 1: Install Python (if not already installed)

**macOS:**
```bash
# Check if Python is installed
python3 --version

# If not installed, download from:
# https://www.python.org/downloads/
```

**Windows:**
```powershell
# Check if Python is installed
python --version

# If not installed, download from:
# https://www.python.org/downloads/
# Make sure to check "Add Python to PATH" during installation
```

### Step 2: Clone or Download This Repository

```bash
cd ~/Code/MemoryCard
```

### Step 3: Run the Setup Script

```bash
# macOS
python3 setup.py

# Windows
python setup.py
```

The setup script will:
1. Create a virtual environment (to avoid conflicts with system Python)
2. Install required dependencies
3. Create a default configuration file
4. Guide you through setting up Google Drive credentials
5. Test the connection

**Note**: The script automatically creates a virtual environment to work around Python package management restrictions on macOS and modern Python installations.

### Step 4: Get Google Drive Credentials

When you run the setup script, it will guide you through this process. Here's what you'll need to do:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the Google Drive API
4. Create OAuth 2.0 credentials (Desktop app type)
5. Download the credentials as `credentials.json`
6. Place `credentials.json` in the MemoryCard directory

**Detailed instructions with screenshots**: [Google Drive API Quickstart](https://developers.google.com/drive/api/v3/quickstart/python)

### Step 5: First Run

After setup is complete, activate the virtual environment and run the script:

```bash
# macOS
source venv/bin/activate
python game_save_sync.py --once

# Windows
venv\Scripts\activate
python game_save_sync.py --once
```

On first run, a browser window will open asking you to authorize the app. This only happens once.

## Usage

**Important**: Always activate the virtual environment first before running the sync tool:

```bash
# macOS
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### Run Once (Manual Sync)

```bash
# After activating venv
python game_save_sync.py --once
```

### Run Continuously (Recommended)

```bash
# After activating venv
python game_save_sync.py
```

This will sync every 5 minutes. Press Ctrl+C to stop.

### Run on Startup (Automatic)

#### macOS

Use the provided launchd script:

```bash
chmod +x schedule_macos.sh
./schedule_macos.sh
```

This will create a launchd service that runs on login and keeps the sync running.

#### Windows

Use the provided batch script (run as Administrator):

```batch
schedule_windows.bat
```

This will create a scheduled task that runs on login.

## Configuration

Edit `config.json` to customize the behavior:

```json
{
  "games": {
    "Hollow Knight": {
      "enabled": true,
      "paths": {
        "Darwin": "~/Library/Application Support/unity.Team Cherry.Hollow Knight",
        "Windows": "%USERPROFILE%/AppData/LocalLow/Team Cherry/Hollow Knight"
      },
      "save_files": ["user1.dat", "user2.dat", "user3.dat", "user4.dat"],
      "cloud_folder": "GameSaves/HollowKnight"
    },
    "Hollow Knight Silksong": {
      "enabled": true,
      "paths": {
        "Darwin": "~/Library/Application Support/unity.Team-Cherry.Silksong",
        "Windows": "%USERPROFILE%/AppData/LocalLow/Team Cherry/Hollow Knight Silksong"
      },
      "save_files": ["user1.dat", "user2.dat", "user3.dat", "user4.dat"],
      "cloud_folder": "GameSaves/HollowKnightSilksong"
    }
  },
  "sync_interval_minutes": 5,
  "verbose": true
}
```

### Configuration Options

- `enabled`: Set to `false` to disable syncing for a specific game
- `paths`: Save file locations for each platform
- `save_files`: List of save files to sync
- `cloud_folder`: Where to store saves in Google Drive
- `sync_interval_minutes`: How often to check for changes (default: 5)
- `verbose`: Show detailed output (default: true)

## Typical Workflow

### Scenario 1: Starting on Mac, Switching to PC

1. **On Mac**: Play Hollow Knight, reach level 2
2. **Script syncs**: Automatically uploads your progress to Google Drive
3. **On PC**: Start the sync script
4. **Script downloads**: Gets your level 2 save from Google Drive
5. **On PC**: Continue playing from level 2
6. **Script syncs**: Uploads your new progress as you play

### Scenario 2: Back to Mac

1. **On Mac**: Start the sync script
2. **Script downloads**: Gets your latest saves from PC via Google Drive
3. **On Mac**: Continue playing with your latest progress

## Troubleshooting

### "credentials.json not found"

You need to set up Google Drive API credentials. Run `python3 setup.py` and follow the instructions.

### "Local save directory not found"

This is normal if you haven't played the game on this machine yet. The script will create the directory when it downloads saves from the cloud.

### Sync not working

1. Check that the script is running: you should see output every 5 minutes
2. Verify the save file paths in `config.json` are correct
3. Make sure you're logged into the correct Google account
4. Check that the game is closed when syncing (some games lock save files while running)

### Different save file locations

If your games are installed in non-standard locations, edit the `paths` in `config.json` to match your setup.

### Adding more games

To add support for more games, edit `config.json` and add a new entry under `games` with:
- The correct save file paths for both macOS and Windows
- A list of save file names
- A cloud folder path

## File Structure

```
MemoryCard/
├── game_save_sync.py      # Main sync script
├── setup.py               # Setup helper script
├── config.json            # Configuration file
├── requirements.txt       # Python dependencies
├── credentials.json       # Google Drive API credentials (you create this)
├── token.pickle          # Stored authentication (created automatically)
├── schedule_macos.sh     # macOS scheduling script
├── schedule_windows.bat  # Windows scheduling script
└── README.md             # This file
```

## Security & Privacy

- Your save files are stored in **your own Google Drive** - not on any third-party servers
- The authentication token is stored locally in `token.pickle`
- Only you have access to your saves
- The script only requests access to files it creates (not your entire Google Drive)

## Uninstallation

1. Stop the sync script (Ctrl+C if running)
2. Remove the scheduled task:
   - **macOS**: `launchctl unload ~/Library/LaunchAgents/com.gamesavesync.plist`
   - **Windows**: Open Task Scheduler and delete "Game Save Sync"
3. Delete the MemoryCard directory
4. (Optional) Delete the sync folder from your Google Drive

## FAQ

**Q: Will this work with Steam Cloud?**
A: Yes! This script is independent of Steam Cloud. You can use both for extra redundancy.

**Q: Can I use this with more than 2 computers?**
A: Yes! Just set up the script on each computer and they'll all sync to the same Google Drive folder.

**Q: What happens if I play on both devices at the same time?**
A: The script uses timestamps, so the most recent save will always win. However, it's best to avoid playing simultaneously to prevent confusion.

**Q: Does this work with game mods?**
A: Yes, it syncs whatever save files the game uses, regardless of mods.

**Q: How much Google Drive space does this use?**
A: Very little! Save files are typically only a few KB to a few MB each.

## Support

If you encounter any issues:

1. Check the troubleshooting section above
2. Make sure you're using the latest version of the script
3. Check that your `config.json` is properly formatted
4. Verify your Google Drive credentials are valid

## License

This project is provided as-is for personal use. Feel free to modify and share!
