#!/usr/bin/env python3
"""
Simple Game Save Sync - Interactive Version
User specifies game folder and cloud storage location
"""

import os
import shutil
import platform
from pathlib import Path
from datetime import datetime
import json

class InteractiveGameSync:
    def __init__(self):
        self.platform = platform.system()
        self.config_file = Path("sync_config.json")
        self.config = self.load_config()

    def load_config(self):
        """Load saved configuration."""
        if self.config_file.exists():
            with open(self.config_file, 'r') as f:
                return json.load(f)
        return {"games": []}

    def save_config(self):
        """Save configuration to file."""
        with open(self.config_file, 'w') as f:
            json.dump(self.config, f, indent=2)

    def get_user_input(self, prompt, default=None):
        """Get input from user with optional default."""
        if default:
            full_prompt = f"{prompt} [{default}]: "
        else:
            full_prompt = f"{prompt}: "

        user_input = input(full_prompt).strip()
        return user_input if user_input else default

    def get_path_input(self, prompt, must_exist=False):
        """Get a file path from user and validate it."""
        while True:
            path_str = input(f"{prompt}\n  Path: ").strip()

            # Remove quotes if user copied path with quotes
            path_str = path_str.strip('"').strip("'")

            # Expand home directory
            path = Path(path_str).expanduser()

            if must_exist and not path.exists():
                print(f"  ❌ Path doesn't exist: {path}")
                retry = input("  Try again? (y/n): ").lower()
                if retry != 'y':
                    return None
                continue

            return path

    def get_file_timestamp(self, file_path: Path) -> float:
        """Get the modification timestamp of a file."""
        try:
            return file_path.stat().st_mtime
        except:
            return 0

    def format_timestamp(self, timestamp: float) -> str:
        """Format timestamp for display."""
        if timestamp == 0:
            return "Never"
        return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")

    def setup_new_game(self):
        """Interactive setup for a new game."""
        print("\n" + "="*70)
        print("ADD NEW GAME")
        print("="*70)

        # Get game name
        game_name = input("\nGame name: ").strip()
        if not game_name:
            print("❌ Game name cannot be empty")
            return

        # Get local save folder
        print(f"\n📁 Where are {game_name}'s save files stored on this computer?")
        print("   (This is usually in AppData, Library, or Documents)")
        print("   Examples:")
        print("     macOS: ~/Library/Application Support/GameName")
        print("     Windows: C:\\Users\\YourName\\AppData\\LocalLow\\Developer\\GameName")

        local_path = self.get_path_input("\nLocal save folder", must_exist=False)
        if not local_path:
            return

        # Get save file patterns
        print(f"\n📄 What are the save file names?")
        print("   Examples: save.dat, player.sav, slot1.json")
        print("   You can use wildcards: *.dat, save*.sav")
        print("   Separate multiple patterns with commas: save1.dat,save2.dat,save3.dat")

        save_files_input = input("\nSave file pattern(s): ").strip()
        save_files = [f.strip() for f in save_files_input.split(',')]

        # Get cloud storage location
        print(f"\n☁️  Where should these saves be backed up in your cloud storage?")
        print("   Examples:")
        print("     Google Drive: ~/Google Drive/GameSaves/GameName")
        print("     Dropbox: ~/Dropbox/GameSaves/GameName")
        print("     OneDrive: ~/OneDrive/GameSaves/GameName")
        print("     Custom: /path/to/any/synced/folder")

        cloud_path = self.get_path_input("\nCloud backup folder", must_exist=False)
        if not cloud_path:
            return

        # Create cloud folder if it doesn't exist
        cloud_path.mkdir(parents=True, exist_ok=True)

        # Save configuration
        game_config = {
            "name": game_name,
            "local_path": str(local_path),
            "cloud_path": str(cloud_path),
            "save_files": save_files
        }

        self.config["games"].append(game_config)
        self.save_config()

        print("\n✅ Game added successfully!")
        print(f"   Name: {game_name}")
        print(f"   Local: {local_path}")
        print(f"   Cloud: {cloud_path}")
        print(f"   Files: {', '.join(save_files)}")

    def list_games(self):
        """List all configured games."""
        if not self.config["games"]:
            print("\n📝 No games configured yet.")
            print("   Use option 1 to add a game.")
            return

        print("\n" + "="*70)
        print("CONFIGURED GAMES")
        print("="*70)

        for i, game in enumerate(self.config["games"], 1):
            print(f"\n{i}. {game['name']}")
            print(f"   Local:  {game['local_path']}")
            print(f"   Cloud:  {game['cloud_path']}")
            print(f"   Files:  {', '.join(game['save_files'])}")

    def sync_game(self, game_config):
        """Sync a specific game."""
        game_name = game_config["name"]
        local_path = Path(game_config["local_path"]).expanduser()
        cloud_path = Path(game_config["cloud_path"]).expanduser()
        save_patterns = game_config["save_files"]

        print(f"\n{'='*70}")
        print(f"SYNCING: {game_name}")
        print(f"{'='*70}")
        print(f"📁 Local:  {local_path}")
        print(f"☁️  Cloud:  {cloud_path}")
        print()

        # Create paths if they don't exist
        cloud_path.mkdir(parents=True, exist_ok=True)

        if not local_path.exists():
            print(f"⚠️  Local save folder doesn't exist: {local_path}")
            print(f"   This is normal if you haven't played {game_name} on this machine.")
            print(f"   Checking for cloud saves to download...\n")

        # Collect all save files matching patterns
        save_files = []
        if local_path.exists():
            for pattern in save_patterns:
                if '*' in pattern:
                    save_files.extend(local_path.glob(pattern))
                else:
                    save_files.append(local_path / pattern)
        else:
            # If local doesn't exist, check cloud for files
            for pattern in save_patterns:
                if '*' in pattern:
                    save_files.extend(cloud_path.glob(pattern))
                else:
                    save_files.append(Path(pattern))

        # Get unique file names
        file_names = set()
        for f in save_files:
            if f.exists():
                file_names.add(f.name)

        # Also check cloud for any files we might have missed
        if cloud_path.exists():
            for pattern in save_patterns:
                if '*' in pattern:
                    for f in cloud_path.glob(pattern):
                        file_names.add(f.name)
                else:
                    file_names.add(pattern)

        if not file_names:
            print(f"  ℹ️  No save files found (neither local nor cloud)")
            print(f"     Looking for: {', '.join(save_patterns)}")
            return

        # Track statistics
        uploaded = 0
        downloaded = 0
        synced = 0

        # Sync each file
        for file_name in sorted(file_names):
            local_file = local_path / file_name
            cloud_file = cloud_path / file_name

            local_exists = local_file.exists()
            cloud_exists = cloud_file.exists()

            print(f"  {file_name}")

            if local_exists and cloud_exists:
                # Both exist - compare timestamps
                local_time = self.get_file_timestamp(local_file)
                cloud_time = self.get_file_timestamp(cloud_file)

                # 1 second buffer for file system differences
                if local_time > cloud_time + 1:
                    # Local is newer - upload
                    print(f"    📤 Local is newer ({self.format_timestamp(local_time)})")
                    print(f"       Cloud: {self.format_timestamp(cloud_time)}")
                    print(f"       Uploading to cloud...")
                    shutil.copy2(local_file, cloud_file)
                    uploaded += 1
                    print(f"       ✅ Uploaded")

                elif cloud_time > local_time + 1:
                    # Cloud is newer - download
                    print(f"    📥 Cloud is newer ({self.format_timestamp(cloud_time)})")
                    print(f"       Local: {self.format_timestamp(local_time)}")
                    print(f"       Downloading to local...")
                    local_file.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(cloud_file, local_file)
                    downloaded += 1
                    print(f"       ✅ Downloaded")

                else:
                    # In sync
                    print(f"    ✓ In sync ({self.format_timestamp(local_time)})")
                    synced += 1

            elif local_exists and not cloud_exists:
                # Only local exists - upload
                print(f"    📤 Only exists locally ({self.format_timestamp(self.get_file_timestamp(local_file))})")
                print(f"       Uploading to cloud...")
                shutil.copy2(local_file, cloud_file)
                uploaded += 1
                print(f"       ✅ Uploaded")

            elif not local_exists and cloud_exists:
                # Only cloud exists - download
                print(f"    📥 Only exists in cloud ({self.format_timestamp(self.get_file_timestamp(cloud_file))})")
                print(f"       Downloading to local...")
                local_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(cloud_file, local_file)
                downloaded += 1
                print(f"       ✅ Downloaded")

            print()

        # Summary
        print(f"{'='*70}")
        print(f"SUMMARY: ↑ {uploaded} uploaded  |  ↓ {downloaded} downloaded  |  ✓ {synced} in sync")
        print(f"{'='*70}")

    def sync_all_games(self):
        """Sync all configured games."""
        if not self.config["games"]:
            print("\n❌ No games configured yet.")
            return

        print("\n" + "="*70)
        print(f"STARTING SYNC - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*70)

        for game_config in self.config["games"]:
            self.sync_game(game_config)

        print("\n✅ All games synced!\n")

    def remove_game(self):
        """Remove a game from configuration."""
        if not self.config["games"]:
            print("\n❌ No games configured yet.")
            return

        self.list_games()

        try:
            choice = int(input("\nEnter game number to remove (0 to cancel): "))
            if choice == 0:
                return
            if 1 <= choice <= len(self.config["games"]):
                removed_game = self.config["games"].pop(choice - 1)
                self.save_config()
                print(f"\n✅ Removed: {removed_game['name']}")
            else:
                print("\n❌ Invalid choice")
        except ValueError:
            print("\n❌ Invalid input")

    def main_menu(self):
        """Display main menu and handle user choices."""
        while True:
            print("\n" + "="*70)
            print("MEMORYCARD - GAME SAVE SYNC")
            print("="*70)
            print("\n1. Add new game")
            print("2. List configured games")
            print("3. Sync all games")
            print("4. Sync specific game")
            print("5. Remove game")
            print("6. Exit")

            choice = input("\nChoose an option: ").strip()

            if choice == "1":
                self.setup_new_game()
            elif choice == "2":
                self.list_games()
            elif choice == "3":
                self.sync_all_games()
            elif choice == "4":
                if not self.config["games"]:
                    print("\n❌ No games configured yet.")
                    continue
                self.list_games()
                try:
                    game_num = int(input("\nEnter game number to sync: "))
                    if 1 <= game_num <= len(self.config["games"]):
                        self.sync_game(self.config["games"][game_num - 1])
                    else:
                        print("\n❌ Invalid choice")
                except ValueError:
                    print("\n❌ Invalid input")
            elif choice == "5":
                self.remove_game()
            elif choice == "6":
                print("\n👋 Goodbye!\n")
                break
            else:
                print("\n❌ Invalid choice")


def main():
    """Main entry point."""
    syncer = InteractiveGameSync()
    syncer.main_menu()


if __name__ == "__main__":
    main()
