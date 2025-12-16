# MemoryCard Roadmap

A cross-platform game save synchronization application built with Tauri 2.0.

## Current Status: v0.4.x (Active Development)

### Completed Features
- [x] Core sync engine (bidirectional local/cloud sync)
- [x] Multi-cloud support (Google Drive, Dropbox, OneDrive, iCloud via folder-based sync)
- [x] Conflict resolution UI with file size and timestamps
- [x] System tray integration with background sync
- [x] Auto-launch on startup
- [x] Desktop notifications
- [x] Filesystem-based save location search
- [x] Auto-update mechanism (Tauri updater plugin)
- [x] Sync confirmation/overwrite protection
- [x] 8 color themes (Default, Cream, Midnight, Violet, Sunset, Ember, Forest, Ocean)
- [x] Game detail view
- [x] Clickable save paths (open in file explorer)

---

## Phase 2: Enhanced Desktop Features (In Progress)

### v0.5.0 - Smart Save Detection
- [ ] **PCGamingWiki API Integration** - Query verified save file locations
- [ ] **AWS Bedrock Integration** - AI-powered save location prediction for unknown games
- [ ] **Automatic Game Scanning** - Detect installed games from Steam, Epic, GOG
- [ ] **Save Location Caching** - Local database of discovered save paths

### v0.6.0 - Progress Tracking
- [ ] **Save File Parsing** - Extract progress data from supported games
- [ ] **Screenshot Capture** - Store game screenshots in library
- [ ] **Playtime Tracking** - Track hours played per game
- [ ] **Modern Card Design** - Show progress, screenshots in game tiles

### v0.7.0 - Sync Improvements
- [ ] **Sync History Log** - Track all sync operations with details
- [ ] **File-level Logging** - Show which files changed each sync
- [ ] **Rollback Support** - Restore previous versions of save files
- [ ] **Selective Sync** - Choose specific files/folders to sync

### v0.8.0 - Platform Integration
- [ ] **Steam Cloud Integration** - Sync with Steam's cloud saves
- [ ] **Epic Games Integration** - Sync with Epic's cloud saves
- [ ] **GOG Galaxy Integration** - Sync with GOG's cloud saves
- [ ] **Xbox Game Pass Integration** - Sync with Xbox PC saves

### v0.9.0 - Polish & UX
- [ ] **Update Preferences** - Choose automatic, manual, or notify-only updates
- [ ] **Improved Onboarding** - First-run setup wizard
- [ ] **Keyboard Shortcuts** - Power user navigation
- [ ] **Drag & Drop** - Add games by dragging folders

---

## Phase 3: Web Platform (Future)

### v1.0.0 - Web Foundation
- [ ] Next.js web application
- [ ] User authentication (OAuth)
- [ ] Game database with save location configs
- [ ] User profiles and game libraries
- [ ] Desktop app API integration

### v1.1.0 - Social Features
- [ ] Activity feed
- [ ] Follow other users
- [ ] Save file sharing
- [ ] Comments and ratings
- [ ] Public profiles

---

## Phase 4: Advanced Features (Future)

### v2.0.0 - Mobile & Beyond
- [ ] Mobile companion app (React Native)
- [ ] Save file editor/viewer
- [ ] Achievement tracking
- [ ] Game recommendations
- [ ] Statistics and analytics
- [ ] Premium tier features

---

## Technical Debt & Improvements

### High Priority
- [ ] Fix macOS icon size (needs ~15% padding)
- [ ] Migrate from deprecated `cocoa` crate to `objc2-app-kit`
- [ ] Add comprehensive error handling
- [ ] Improve logging throughout app

### Medium Priority
- [ ] Add unit tests for Rust backend
- [ ] Add integration tests for sync operations
- [ ] Performance optimization for large save folders
- [ ] Memory usage optimization

### Low Priority
- [ ] Localization (i18n) support
- [ ] Custom themes (user-defined colors)
- [ ] Plugin system for save parsers

---

## How to Contribute

1. Check the [Issues](https://github.com/YOUR_USERNAME/MemoryCard/issues) for open tasks
2. Fork the repository
3. Create a feature branch
4. Submit a pull request

## Feedback & Ideas

Have a feature request or found a bug? Open an issue on GitHub!

---

*Last updated: December 2024*
