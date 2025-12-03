#!/usr/bin/env python3
"""
Game Save Synchronization Script
Syncs game save files between local storage and Google Drive
Supports: Hollow Knight, Hollow Knight Silksong
Platforms: macOS, Windows
"""

import os
import sys
import platform
import shutil
import json
import time
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Tuple

try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
    import pickle
    import io
except ImportError:
    print("Error: Required packages not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

# Google Drive API scope
SCOPES = ['https://www.googleapis.com/auth/drive.file']

class GameSaveSync:
    def __init__(self, config_path: str = "config.json"):
        """Initialize the save sync system."""
        self.config_path = config_path
        self.config = self.load_config()
        self.platform = platform.system()
        self.drive_service = None
        self.credentials_path = "token.pickle"
        self.client_secrets_path = "credentials.json"

    def load_config(self) -> Dict:
        """Load configuration from JSON file."""
        if not os.path.exists(self.config_path):
            print(f"Error: Config file '{self.config_path}' not found.")
            print("Creating default config file...")
            self.create_default_config()

        with open(self.config_path, 'r') as f:
            return json.load(f)

    def create_default_config(self):
        """Create a default configuration file."""
        default_config = {
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

        with open(self.config_path, 'w') as f:
            json.dump(default_config, f, indent=4)

        print(f"Created default config at {self.config_path}")
        return default_config

    def get_local_save_path(self, game_name: str) -> Optional[Path]:
        """Get the local save path for a game based on the current platform."""
        game_config = self.config['games'].get(game_name)
        if not game_config or not game_config['enabled']:
            return None

        path_str = game_config['paths'].get(self.platform)
        if not path_str:
            print(f"Warning: No path configured for {game_name} on {self.platform}")
            return None

        # Expand environment variables and user home
        path_str = os.path.expandvars(path_str)
        path_str = os.path.expanduser(path_str)

        return Path(path_str)

    def authenticate_google_drive(self):
        """Authenticate with Google Drive API."""
        creds = None

        # Load existing credentials
        if os.path.exists(self.credentials_path):
            with open(self.credentials_path, 'rb') as token:
                creds = pickle.load(token)

        # Refresh or get new credentials
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not os.path.exists(self.client_secrets_path):
                    print(f"\nError: Google Drive credentials file '{self.client_secrets_path}' not found!")
                    print("Please follow the setup instructions in README.md")
                    sys.exit(1)

                flow = InstalledAppFlow.from_client_secrets_file(
                    self.client_secrets_path, SCOPES)
                creds = flow.run_local_server(port=0)

            # Save credentials for next run
            with open(self.credentials_path, 'wb') as token:
                pickle.dump(creds, token)

        self.drive_service = build('drive', 'v3', credentials=creds)
        if self.config.get('verbose'):
            print("✓ Successfully authenticated with Google Drive")

    def get_or_create_folder(self, folder_path: str) -> str:
        """Get or create a folder in Google Drive by path."""
        folder_names = folder_path.split('/')
        parent_id = 'root'

        for folder_name in folder_names:
            # Search for existing folder
            query = f"name='{folder_name}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
            results = self.drive_service.files().list(
                q=query,
                spaces='drive',
                fields='files(id, name)'
            ).execute()

            files = results.get('files', [])

            if files:
                parent_id = files[0]['id']
            else:
                # Create folder
                file_metadata = {
                    'name': folder_name,
                    'mimeType': 'application/vnd.google-apps.folder',
                    'parents': [parent_id]
                }
                folder = self.drive_service.files().create(
                    body=file_metadata,
                    fields='id'
                ).execute()
                parent_id = folder['id']

        return parent_id

    def get_file_in_folder(self, filename: str, folder_id: str) -> Optional[Dict]:
        """Get a file from Google Drive folder."""
        query = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
        results = self.drive_service.files().list(
            q=query,
            spaces='drive',
            fields='files(id, name, modifiedTime)'
        ).execute()

        files = results.get('files', [])
        return files[0] if files else None

    def upload_file(self, local_path: Path, filename: str, folder_id: str) -> bool:
        """Upload a file to Google Drive."""
        try:
            # Check if file already exists
            existing_file = self.get_file_in_folder(filename, folder_id)

            file_metadata = {
                'name': filename,
                'parents': [folder_id]
            }
            media = MediaFileUpload(str(local_path), resumable=True)

            if existing_file:
                # Update existing file
                file = self.drive_service.files().update(
                    fileId=existing_file['id'],
                    media_body=media
                ).execute()
            else:
                # Create new file
                file = self.drive_service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                ).execute()

            return True
        except Exception as e:
            print(f"Error uploading {filename}: {str(e)}")
            return False

    def download_file(self, file_id: str, local_path: Path) -> bool:
        """Download a file from Google Drive."""
        try:
            request = self.drive_service.files().get_media(fileId=file_id)

            # Ensure parent directory exists
            local_path.parent.mkdir(parents=True, exist_ok=True)

            with io.FileIO(str(local_path), 'wb') as fh:
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    status, done = downloader.next_chunk()

            return True
        except Exception as e:
            print(f"Error downloading to {local_path}: {str(e)}")
            return False

    def get_file_timestamp(self, file_path: Path) -> Optional[float]:
        """Get modification timestamp of a local file."""
        try:
            return file_path.stat().st_mtime
        except:
            return None

    def parse_drive_timestamp(self, timestamp_str: str) -> float:
        """Parse Google Drive timestamp string to Unix timestamp."""
        dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        return dt.timestamp()

    def sync_game_saves(self, game_name: str) -> Tuple[int, int]:
        """
        Sync save files for a specific game.
        Returns: (uploads_count, downloads_count)
        """
        game_config = self.config['games'].get(game_name)
        if not game_config or not game_config['enabled']:
            return 0, 0

        local_path = self.get_local_save_path(game_name)
        if not local_path:
            return 0, 0

        if not local_path.exists():
            print(f"Warning: Local save directory for {game_name} not found: {local_path}")
            print("This is normal if you haven't played the game yet on this machine.")
            return 0, 0

        # Get or create cloud folder
        cloud_folder = game_config['cloud_folder']
        folder_id = self.get_or_create_folder(cloud_folder)

        uploads = 0
        downloads = 0
        verbose = self.config.get('verbose', False)

        # Check each save file
        for save_file in game_config['save_files']:
            local_file = local_path / save_file

            # Get cloud file info
            cloud_file = self.get_file_in_folder(save_file, folder_id)

            # Determine if we need to sync
            if local_file.exists() and cloud_file:
                # Both exist - compare timestamps
                local_time = self.get_file_timestamp(local_file)
                cloud_time = self.parse_drive_timestamp(cloud_file['modifiedTime'])

                # Add 1 second buffer to account for timestamp precision
                if local_time > cloud_time + 1:
                    # Local is newer - upload
                    if verbose:
                        print(f"  ↑ Uploading {save_file} (local is newer)")
                    if self.upload_file(local_file, save_file, folder_id):
                        uploads += 1
                elif cloud_time > local_time + 1:
                    # Cloud is newer - download
                    if verbose:
                        print(f"  ↓ Downloading {save_file} (cloud is newer)")
                    if self.download_file(cloud_file['id'], local_file):
                        downloads += 1
                else:
                    if verbose:
                        print(f"  ✓ {save_file} is in sync")

            elif local_file.exists() and not cloud_file:
                # Only local exists - upload
                if verbose:
                    print(f"  ↑ Uploading {save_file} (new to cloud)")
                if self.upload_file(local_file, save_file, folder_id):
                    uploads += 1

            elif not local_file.exists() and cloud_file:
                # Only cloud exists - download
                if verbose:
                    print(f"  ↓ Downloading {save_file} (new to local)")
                if self.download_file(cloud_file['id'], local_file):
                    downloads += 1

        return uploads, downloads

    def sync_all_games(self):
        """Sync all enabled games."""
        print(f"\n{'='*60}")
        print(f"Game Save Sync - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Platform: {self.platform}")
        print(f"{'='*60}\n")

        if not self.drive_service:
            self.authenticate_google_drive()

        total_uploads = 0
        total_downloads = 0

        for game_name, game_config in self.config['games'].items():
            if not game_config['enabled']:
                continue

            print(f"\nSyncing: {game_name}")
            print(f"{'-'*60}")

            uploads, downloads = self.sync_game_saves(game_name)
            total_uploads += uploads
            total_downloads += downloads

        print(f"\n{'='*60}")
        print(f"Sync complete: {total_uploads} uploaded, {total_downloads} downloaded")
        print(f"{'='*60}\n")

    def run_continuous(self):
        """Run sync continuously with configured interval."""
        interval_minutes = self.config.get('sync_interval_minutes', 5)
        interval_seconds = interval_minutes * 60

        print(f"Starting continuous sync mode (every {interval_minutes} minutes)")
        print("Press Ctrl+C to stop\n")

        try:
            while True:
                self.sync_all_games()
                print(f"Waiting {interval_minutes} minutes until next sync...")
                time.sleep(interval_seconds)
        except KeyboardInterrupt:
            print("\n\nStopping sync service...")
            sys.exit(0)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Sync game save files between local storage and Google Drive'
    )
    parser.add_argument(
        '--once',
        action='store_true',
        help='Run sync once and exit (default: run continuously)'
    )
    parser.add_argument(
        '--config',
        default='config.json',
        help='Path to config file (default: config.json)'
    )

    args = parser.parse_args()

    # Create sync instance
    syncer = GameSaveSync(config_path=args.config)

    if args.once:
        # Run once and exit
        syncer.sync_all_games()
    else:
        # Run continuously
        syncer.run_continuous()


if __name__ == "__main__":
    main()
