#!/bin/bash
# Schedule Game Save Sync to run automatically on macOS using launchd

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Path to the Python script
PYTHON_SCRIPT="$SCRIPT_DIR/game_save_sync.py"

# Get the Python executable path from venv
PYTHON_PATH="$SCRIPT_DIR/venv/bin/python"

# Check if venv exists
if [ ! -f "$PYTHON_PATH" ]; then
    echo "Error: Virtual environment not found at $SCRIPT_DIR/venv"
    echo "Please run 'python3 setup.py' first to create the virtual environment"
    exit 1
fi

# LaunchAgent plist file path
PLIST_NAME="com.gamesavesync.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"

# Create LaunchAgents directory if it doesn't exist
mkdir -p "$HOME/Library/LaunchAgents"

# Create the plist file
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.gamesavesync</string>

    <key>ProgramArguments</key>
    <array>
        <string>$PYTHON_PATH</string>
        <string>$PYTHON_SCRIPT</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$SCRIPT_DIR</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$SCRIPT_DIR/sync.log</string>

    <key>StandardErrorPath</key>
    <string>$SCRIPT_DIR/sync_error.log</string>
</dict>
</plist>
EOF

echo "Created launchd plist at: $PLIST_PATH"

# Load the launch agent
launchctl unload "$PLIST_PATH" 2>/dev/null  # Unload if already loaded
launchctl load "$PLIST_PATH"

echo ""
echo "✓ Game Save Sync is now scheduled to run automatically!"
echo ""
echo "The service will:"
echo "  • Start automatically when you log in"
echo "  • Keep running in the background"
echo "  • Sync your saves every 5 minutes"
echo ""
echo "Logs are saved to:"
echo "  • Output: $SCRIPT_DIR/sync.log"
echo "  • Errors: $SCRIPT_DIR/sync_error.log"
echo ""
echo "To stop the service:"
echo "  launchctl unload $PLIST_PATH"
echo ""
echo "To start it again:"
echo "  launchctl load $PLIST_PATH"
echo ""
echo "To check if it's running:"
echo "  launchctl list | grep gamesavesync"
echo ""
