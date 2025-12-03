#!/usr/bin/env python3
"""
Setup script for Game Save Sync
Helps configure Google Drive credentials and test the setup
"""

import os
import sys
import json
import subprocess
from pathlib import Path

def print_header(text):
    """Print a formatted header."""
    print(f"\n{'='*70}")
    print(f"  {text}")
    print(f"{'='*70}\n")

def print_step(number, text):
    """Print a step number and description."""
    print(f"\n[Step {number}] {text}")
    print("-" * 70)

def check_python_version():
    """Check if Python version is compatible."""
    if sys.version_info < (3, 7):
        print("Error: Python 3.7 or higher is required")
        sys.exit(1)
    print(f"✓ Python version: {sys.version.split()[0]}")

def install_dependencies():
    """Install required Python packages."""
    print("\nInstalling required packages...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✓ Dependencies installed successfully")
        return True
    except subprocess.CalledProcessError:
        print("✗ Error installing dependencies")
        return False

def check_credentials_file():
    """Check if Google Drive credentials file exists."""
    if os.path.exists("credentials.json"):
        print("✓ Found credentials.json")
        return True
    else:
        print("✗ credentials.json not found")
        return False

def create_config_if_needed():
    """Create config.json if it doesn't exist."""
    if os.path.exists("config.json"):
        print("✓ Found existing config.json")
        return True

    print("Creating default config.json...")

    config = {
        "games": {
            "Hollow Knight": {
                "enabled": True,
                "paths": {
                    "Darwin": "~/Library/Application Support/unity.Team Cherry.Hollow Knight",
                    "Windows": "%USERPROFILE%/AppData/LocalLow/Team Cherry/Hollow Knight"
                },
                "save_files": ["user1.dat", "user2.dat", "user3.dat", "user4.dat"],
                "cloud_folder": "GameSaves/HollowKnight"
            },
            "Hollow Knight Silksong": {
                "enabled": True,
                "paths": {
                    "Darwin": "~/Library/Application Support/unity.Team-Cherry.Silksong",
                    "Windows": "%USERPROFILE%/AppData/LocalLow/Team Cherry/Hollow Knight Silksong"
                },
                "save_files": ["user1.dat", "user2.dat", "user3.dat", "user4.dat"],
                "cloud_folder": "GameSaves/HollowKnightSilksong"
            }
        },
        "sync_interval_minutes": 5,
        "verbose": True
    }

    with open("config.json", 'w') as f:
        json.dump(config, f, indent=4)

    print("✓ Created config.json")
    return True

def print_google_drive_instructions():
    """Print instructions for getting Google Drive credentials."""
    print("""
To use this tool, you need to create Google Drive API credentials:

1. Go to the Google Cloud Console:
   https://console.cloud.google.com/

2. Create a new project (or select an existing one)

3. Enable the Google Drive API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

4. Create credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - If prompted, configure the OAuth consent screen:
     * Choose "External" user type
     * Fill in the app name (e.g., "Game Save Sync")
     * Add your email as a test user
   - For application type, choose "Desktop app"
   - Click "Create"

5. Download the credentials:
   - Click the download button (⬇) next to your newly created OAuth client
   - Save the file as "credentials.json" in this directory

6. Run this setup script again after placing credentials.json

For detailed instructions with screenshots, see:
https://developers.google.com/drive/api/v3/quickstart/python
    """)

def test_authentication():
    """Test Google Drive authentication."""
    print("\nTesting Google Drive authentication...")
    print("A browser window will open for you to authorize the app.")
    print("This only needs to be done once.\n")

    try:
        from game_save_sync import GameSaveSync
        syncer = GameSaveSync()
        syncer.authenticate_google_drive()
        print("\n✓ Successfully authenticated with Google Drive!")
        return True
    except Exception as e:
        print(f"\n✗ Authentication failed: {str(e)}")
        return False

def main():
    """Main setup flow."""
    print_header("Game Save Sync - Setup")

    print("This script will help you set up the Game Save Sync tool.\n")

    # Step 1: Check Python version
    print_step(1, "Checking Python version")
    check_python_version()

    # Step 2: Install dependencies
    print_step(2, "Installing dependencies")
    if not install_dependencies():
        print("\nSetup failed. Please fix the errors above and try again.")
        sys.exit(1)

    # Step 3: Create config
    print_step(3, "Setting up configuration")
    create_config_if_needed()

    # Step 4: Check for credentials
    print_step(4, "Checking Google Drive credentials")
    if not check_credentials_file():
        print_google_drive_instructions()
        print("\nSetup paused. Please follow the instructions above, then run this script again.")
        sys.exit(0)

    # Step 5: Test authentication
    print_step(5, "Testing Google Drive connection")
    if not test_authentication():
        print("\nSetup failed. Please check your credentials and try again.")
        sys.exit(1)

    # Success!
    print_header("Setup Complete!")
    print("""
Your Game Save Sync is now ready to use!

Quick Start:
  • Run once:         python game_save_sync.py --once
  • Run continuously: python game_save_sync.py

The script will:
  • Check for newer saves in the cloud and download them
  • Upload any local saves that are newer than the cloud version
  • Sync every 5 minutes when running continuously

Configuration:
  • Edit config.json to customize settings
  • Enable/disable games, change sync interval, etc.

Scheduling (Optional):
  • macOS: See schedule_macos.sh for launchd setup
  • Windows: See schedule_windows.bat for Task Scheduler setup

For more information, see README.md
    """)

if __name__ == "__main__":
    main()
