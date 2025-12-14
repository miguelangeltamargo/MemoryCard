use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct SyncResult {
    success: bool,
    message: String,
    files_synced: usize,
    conflicts: Vec<FileConflict>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FileConflict {
    relative_path: String,
    local_path: String,
    cloud_path: String,
    local_modified: String,
    cloud_modified: String,
    local_size: u64,
    cloud_size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct FileInfo {
    path: PathBuf,
    modified: SystemTime,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn sync_game_saves(local_path: String, cloud_path: String, auto_resolve: Option<String>) -> Result<SyncResult, String> {
    let local = Path::new(&local_path);
    let cloud = Path::new(&cloud_path);

    // Verify both paths exist
    if !local.exists() {
        return Err(format!("Local path does not exist: {}", local_path));
    }
    if !cloud.exists() {
        return Err(format!("Cloud path does not exist: {}", cloud_path));
    }

    let mut files_synced = 0;
    let mut conflicts = Vec::new();

    // Get all files from both directories
    let local_files = get_files_recursive(local).map_err(|e| e.to_string())?;
    let cloud_files = get_files_recursive(cloud).map_err(|e| e.to_string())?;

    // Create maps for easier lookup
    let mut local_map = std::collections::HashMap::new();
    let mut cloud_map = std::collections::HashMap::new();

    for file in &local_files {
        if let Ok(relative) = file.path.strip_prefix(local) {
            local_map.insert(relative.to_path_buf(), file);
        }
    }

    for file in &cloud_files {
        if let Ok(relative) = file.path.strip_prefix(cloud) {
            cloud_map.insert(relative.to_path_buf(), file);
        }
    }

    // Sync files
    for (relative_path, local_file) in &local_map {
        if let Some(cloud_file) = cloud_map.get(relative_path) {
            // File exists in both - check for conflicts
            if local_file.modified != cloud_file.modified {
                // Conflict detected
                if let Some(ref resolution) = auto_resolve {
                    // Auto-resolve based on preference
                    match resolution.as_str() {
                        "local" => {
                            copy_file(&local_file.path, &cloud_file.path).map_err(|e| e.to_string())?;
                            files_synced += 1;
                        }
                        "cloud" => {
                            copy_file(&cloud_file.path, &local_file.path).map_err(|e| e.to_string())?;
                            files_synced += 1;
                        }
                        "newer" => {
                            // Original behavior - use timestamp
                            if local_file.modified > cloud_file.modified {
                                copy_file(&local_file.path, &cloud_file.path).map_err(|e| e.to_string())?;
                                files_synced += 1;
                            } else {
                                copy_file(&cloud_file.path, &local_file.path).map_err(|e| e.to_string())?;
                                files_synced += 1;
                            }
                        }
                        _ => {
                            // Unknown resolution, treat as conflict
                            let local_metadata = fs::metadata(&local_file.path).map_err(|e| e.to_string())?;
                            let cloud_metadata = fs::metadata(&cloud_file.path).map_err(|e| e.to_string())?;

                            conflicts.push(FileConflict {
                                relative_path: relative_path.to_string_lossy().to_string(),
                                local_path: local_file.path.to_string_lossy().to_string(),
                                cloud_path: cloud_file.path.to_string_lossy().to_string(),
                                local_modified: format!("{:?}", local_file.modified),
                                cloud_modified: format!("{:?}", cloud_file.modified),
                                local_size: local_metadata.len(),
                                cloud_size: cloud_metadata.len(),
                            });
                        }
                    }
                } else {
                    // No auto-resolve - report conflict
                    let local_metadata = fs::metadata(&local_file.path).map_err(|e| e.to_string())?;
                    let cloud_metadata = fs::metadata(&cloud_file.path).map_err(|e| e.to_string())?;

                    conflicts.push(FileConflict {
                        relative_path: relative_path.to_string_lossy().to_string(),
                        local_path: local_file.path.to_string_lossy().to_string(),
                        cloud_path: cloud_file.path.to_string_lossy().to_string(),
                        local_modified: format!("{:?}", local_file.modified),
                        cloud_modified: format!("{:?}", cloud_file.modified),
                        local_size: local_metadata.len(),
                        cloud_size: cloud_metadata.len(),
                    });
                }
            }
            // If timestamps match, files are identical - do nothing
        } else {
            // File only exists locally, copy to cloud
            let cloud_dest = cloud.join(relative_path);
            if let Some(parent) = cloud_dest.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            copy_file(&local_file.path, &cloud_dest).map_err(|e| e.to_string())?;
            files_synced += 1;
        }
    }

    // Copy files that only exist in cloud to local
    for (relative_path, cloud_file) in &cloud_map {
        if !local_map.contains_key(relative_path) {
            let local_dest = local.join(relative_path);
            if let Some(parent) = local_dest.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            copy_file(&cloud_file.path, &local_dest).map_err(|e| e.to_string())?;
            files_synced += 1;
        }
    }

    Ok(SyncResult {
        success: conflicts.is_empty(),
        message: if conflicts.is_empty() {
            format!("Successfully synced {} file(s)", files_synced)
        } else {
            format!("Found {} conflict(s) - user resolution required", conflicts.len())
        },
        files_synced,
        conflicts,
    })
}

fn get_files_recursive(dir: &Path) -> std::io::Result<Vec<FileInfo>> {
    let mut files = Vec::new();

    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                files.extend(get_files_recursive(&path)?);
            } else {
                let metadata = fs::metadata(&path)?;
                if let Ok(modified) = metadata.modified() {
                    files.push(FileInfo {
                        path,
                        modified,
                    });
                }
            }
        }
    }

    Ok(files)
}

fn copy_file(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::copy(src, dst)?;
    Ok(())
}

#[tauri::command]
fn sync_config_to_cloud(config_path: String, config: String) -> Result<(), String> {
    let path = Path::new(&config_path);

    // Create parent directory if it doesn't exist
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Write config file
    fs::write(path, config).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn resolve_conflict(local_path: String, cloud_path: String, use_local: bool) -> Result<(), String> {
    let local = Path::new(&local_path);
    let cloud = Path::new(&cloud_path);

    if use_local {
        // Copy local to cloud
        copy_file(local, cloud).map_err(|e| e.to_string())?;
    } else {
        // Copy cloud to local
        copy_file(cloud, local).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn open_folder_in_explorer(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn launch_cloud_app(cloud_provider: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let app_name = match cloud_provider.to_lowercase().as_str() {
            "google drive" | "googledrive" | "google" => "Google Drive",
            "dropbox" => "Dropbox",
            "onedrive" | "one drive" => "OneDrive",
            "icloud" | "icloud drive" => "Finder", // iCloud is in Finder
            _ => return Err(format!("Unknown cloud provider: {}", cloud_provider)),
        };

        std::process::Command::new("open")
            .arg("-a")
            .arg(app_name)
            .spawn()
            .map_err(|e| format!("Failed to launch {}: {}", app_name, e))?;
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, we try to open the cloud folder directly
        let folder = match cloud_provider.to_lowercase().as_str() {
            "google drive" | "googledrive" | "google" => {
                dirs::home_dir().map(|h| h.join("Google Drive"))
            }
            "dropbox" => dirs::home_dir().map(|h| h.join("Dropbox")),
            "onedrive" | "one drive" => dirs::home_dir().map(|h| h.join("OneDrive")),
            _ => return Err(format!("Unknown cloud provider: {}", cloud_provider)),
        };

        if let Some(path) = folder {
            if path.exists() {
                std::process::Command::new("explorer")
                    .arg(&path)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            } else {
                return Err(format!("Cloud folder not found: {}", path.display()));
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, open the cloud folder
        let folder = match cloud_provider.to_lowercase().as_str() {
            "google drive" | "googledrive" | "google" => {
                dirs::home_dir().map(|h| h.join("Google Drive"))
            }
            "dropbox" => dirs::home_dir().map(|h| h.join("Dropbox")),
            _ => return Err(format!("Unknown cloud provider: {}", cloud_provider)),
        };

        if let Some(path) = folder {
            if path.exists() {
                std::process::Command::new("xdg-open")
                    .arg(&path)
                    .spawn()
                    .map_err(|e| e.to_string())?;
            } else {
                return Err(format!("Cloud folder not found: {}", path.display()));
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn set_dock_visibility(app: tauri::AppHandle, visibility: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::ActivationPolicy;
        use cocoa::appkit::{NSApp, NSApplication, NSApplicationActivationPolicy};

        // Regular = shows in dock and can appear in app switcher
        // Accessory = hides from dock (menu bar app style)
        let policy = match visibility.as_str() {
            "menu-bar-only" | "neither" => ActivationPolicy::Accessory,
            _ => ActivationPolicy::Regular,
        };

        // Use both Tauri API and native cocoa API for immediate effect
        app.set_activation_policy(policy);

        // Also set via native API for immediate effect
        unsafe {
            let ns_app = NSApp();
            let ns_policy = match visibility.as_str() {
                "menu-bar-only" | "neither" => NSApplicationActivationPolicy::NSApplicationActivationPolicyAccessory,
                _ => NSApplicationActivationPolicy::NSApplicationActivationPolicyRegular,
            };
            ns_app.setActivationPolicy_(ns_policy);
        }

        Ok(format!("Visibility set to: {}", visibility))
    }

    #[cfg(not(target_os = "macos"))]
    Ok("Dock visibility settings only apply to macOS".to_string())
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    // Get the current executable path
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;

    // Spawn a new instance of the app
    std::process::Command::new(&current_exe)
        .spawn()
        .map_err(|e| e.to_string())?;

    // Exit the current instance
    app.exit(0);

    Ok(())
}

use tauri::{Manager, Emitter, menu::{Menu, MenuItem, Submenu}, tray::{TrayIconBuilder, TrayIconEvent}};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--flag", "minimized"])))
        .setup(|app| {
            // Create app menu with Preferences
            #[cfg(target_os = "macos")]
            {
                let about_i = MenuItem::with_id(app, "about", "About MemoryCard", true, None::<&str>)?;
                let preferences_i = MenuItem::with_id(app, "preferences", "Settings...", true, Some("CmdOrCtrl+,"))?;
                let quit_app_i = MenuItem::with_id(app, "quit_app", "Quit MemoryCard", true, Some("CmdOrCtrl+Q"))?;

                let app_submenu = Submenu::with_items(
                    app,
                    "MemoryCard",
                    true,
                    &[&about_i, &preferences_i, &quit_app_i]
                )?;

                let app_menu = Menu::with_items(app, &[&app_submenu])?;
                app.set_menu(app_menu)?;
            }

            // Create system tray menu
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let sync_i = MenuItem::with_id(app, "sync", "Sync Now", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_i, &sync_i, &quit_i])?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } => {
                            println!("Tray icon clicked (button up)");
                            let app = tray.app_handle();

                            if let Some(window) = app.get_webview_window("main") {
                                // Toggle window visibility
                                if window.is_visible().unwrap_or(false) {
                                    println!("Window visible - hiding");
                                    let _ = window.hide();
                                } else {
                                    println!("Window hidden - showing");

                                    // On macOS, activate the app first
                                    #[cfg(target_os = "macos")]
                                    {
                                        use cocoa::appkit::{NSApp, NSApplication};
                                        use cocoa::base::YES;
                                        unsafe {
                                            let ns_app = NSApp();
                                            ns_app.activateIgnoringOtherApps_(YES);
                                        }
                                    }

                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "sync" => {
                            // Emit sync event to frontend
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-sync", ());
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Handle app menu events (macOS)
            app.on_menu_event(|app, event| {
                match event.id().as_ref() {
                    "preferences" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                            let _ = window.emit("open-settings", ());
                        }
                    }
                    "about" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.emit("open-about", ());
                        }
                    }
                    "quit_app" => {
                        app.exit(0);
                    }
                    _ => {}
                }
            });

            // Handle window close event - hide instead of close
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.app_handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        println!("Close requested - hiding window");
                        // Prevent window from closing
                        api.prevent_close();
                        // Hide window instead
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                });
            }

            // Apply activation policy based on saved settings
            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;

                // Try to read the saved dock visibility setting from store
                let mut dock_visibility = "both".to_string();

                // Get the app data directory and read the store file
                if let Some(app_data_dir) = app.path().app_data_dir().ok() {
                    let store_path = app_data_dir.join("store.json");
                    if store_path.exists() {
                        if let Ok(contents) = std::fs::read_to_string(&store_path) {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                                if let Some(settings) = json.get("settings") {
                                    if let Some(visibility) = settings.get("dockVisibility") {
                                        if let Some(v) = visibility.as_str() {
                                            dock_visibility = v.to_string();
                                            println!("Loaded dock visibility setting: {}", dock_visibility);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let policy = match dock_visibility.as_str() {
                    "menu-bar-only" | "neither" => ActivationPolicy::Accessory,
                    _ => ActivationPolicy::Regular,
                };

                println!("Setting activation policy based on: {}", dock_visibility);
                // Use app.set_activation_policy directly (Tauri v2 API)
                app.set_activation_policy(policy);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, sync_game_saves, sync_config_to_cloud, resolve_conflict, set_dock_visibility, open_folder_in_explorer, launch_cloud_app, restart_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;
    use std::thread;
    use std::time::Duration;
    use tempfile::TempDir;

    /// Helper to create a test file with content
    fn create_test_file(dir: &Path, name: &str, content: &str) -> PathBuf {
        let file_path = dir.join(name);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut file = File::create(&file_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();
        file_path
    }

    /// Helper to read file content
    fn read_file_content(path: &Path) -> String {
        fs::read_to_string(path).unwrap()
    }

    #[test]
    fn test_greet() {
        let result = greet("World");
        assert_eq!(result, "Hello, World! You've been greeted from Rust!");
    }

    #[test]
    fn test_greet_with_empty_name() {
        let result = greet("");
        assert_eq!(result, "Hello, ! You've been greeted from Rust!");
    }

    #[test]
    fn test_sync_game_saves_nonexistent_local_path() {
        let result = sync_game_saves(
            "/nonexistent/local/path".to_string(),
            "/nonexistent/cloud/path".to_string(),
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Local path does not exist"));
    }

    #[test]
    fn test_sync_game_saves_nonexistent_cloud_path() {
        let local_dir = TempDir::new().unwrap();
        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            "/nonexistent/cloud/path".to_string(),
            None,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cloud path does not exist"));
    }

    #[test]
    fn test_sync_game_saves_empty_directories() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            cloud_dir.path().to_string_lossy().to_string(),
            None,
        );

        assert!(result.is_ok());
        let sync_result = result.unwrap();
        assert!(sync_result.success);
        assert_eq!(sync_result.files_synced, 0);
        assert!(sync_result.conflicts.is_empty());
    }

    #[test]
    fn test_sync_game_saves_local_to_cloud() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        // Create a file only in local
        create_test_file(local_dir.path(), "save.dat", "local save data");

        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            cloud_dir.path().to_string_lossy().to_string(),
            None,
        );

        assert!(result.is_ok());
        let sync_result = result.unwrap();
        assert!(sync_result.success);
        assert_eq!(sync_result.files_synced, 1);

        // Verify file was copied to cloud
        let cloud_file = cloud_dir.path().join("save.dat");
        assert!(cloud_file.exists());
        assert_eq!(read_file_content(&cloud_file), "local save data");
    }

    #[test]
    fn test_sync_game_saves_cloud_to_local() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        // Create a file only in cloud
        create_test_file(cloud_dir.path(), "cloud_save.dat", "cloud save data");

        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            cloud_dir.path().to_string_lossy().to_string(),
            None,
        );

        assert!(result.is_ok());
        let sync_result = result.unwrap();
        assert!(sync_result.success);
        assert_eq!(sync_result.files_synced, 1);

        // Verify file was copied to local
        let local_file = local_dir.path().join("cloud_save.dat");
        assert!(local_file.exists());
        assert_eq!(read_file_content(&local_file), "cloud save data");
    }

    #[test]
    fn test_sync_game_saves_bidirectional() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        // Create different files in each directory
        create_test_file(local_dir.path(), "local_only.dat", "local data");
        create_test_file(cloud_dir.path(), "cloud_only.dat", "cloud data");

        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            cloud_dir.path().to_string_lossy().to_string(),
            None,
        );

        assert!(result.is_ok());
        let sync_result = result.unwrap();
        assert!(sync_result.success);
        assert_eq!(sync_result.files_synced, 2);

        // Verify both files exist in both locations
        assert!(local_dir.path().join("local_only.dat").exists());
        assert!(local_dir.path().join("cloud_only.dat").exists());
        assert!(cloud_dir.path().join("local_only.dat").exists());
        assert!(cloud_dir.path().join("cloud_only.dat").exists());
    }

    #[test]
    fn test_sync_game_saves_nested_directories() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        // Create nested file structure in local
        create_test_file(local_dir.path(), "saves/slot1/game.sav", "save slot 1");
        create_test_file(local_dir.path(), "saves/slot2/game.sav", "save slot 2");
        create_test_file(local_dir.path(), "config.ini", "config data");

        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            cloud_dir.path().to_string_lossy().to_string(),
            None,
        );

        assert!(result.is_ok());
        let sync_result = result.unwrap();
        assert!(sync_result.success);
        assert_eq!(sync_result.files_synced, 3);

        // Verify nested structure was preserved
        assert!(cloud_dir.path().join("saves/slot1/game.sav").exists());
        assert!(cloud_dir.path().join("saves/slot2/game.sav").exists());
        assert!(cloud_dir.path().join("config.ini").exists());
    }

    #[test]
    fn test_sync_game_saves_conflict_detection() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        // Create same file in both with different content
        create_test_file(local_dir.path(), "save.dat", "local version");

        // Wait a bit to ensure different timestamps
        thread::sleep(Duration::from_millis(100));

        create_test_file(cloud_dir.path(), "save.dat", "cloud version");

        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            cloud_dir.path().to_string_lossy().to_string(),
            None, // No auto-resolve
        );

        assert!(result.is_ok());
        let sync_result = result.unwrap();
        assert!(!sync_result.success); // Conflict means not fully successful
        assert_eq!(sync_result.conflicts.len(), 1);
        assert_eq!(sync_result.conflicts[0].relative_path, "save.dat");
    }

    #[test]
    fn test_sync_game_saves_auto_resolve_local() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        create_test_file(local_dir.path(), "save.dat", "local version");
        thread::sleep(Duration::from_millis(100));
        create_test_file(cloud_dir.path(), "save.dat", "cloud version");

        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            cloud_dir.path().to_string_lossy().to_string(),
            Some("local".to_string()),
        );

        assert!(result.is_ok());
        let sync_result = result.unwrap();
        assert!(sync_result.success);
        assert!(sync_result.conflicts.is_empty());
        assert_eq!(sync_result.files_synced, 1);

        // Verify cloud now has local content
        assert_eq!(
            read_file_content(&cloud_dir.path().join("save.dat")),
            "local version"
        );
    }

    #[test]
    fn test_sync_game_saves_auto_resolve_cloud() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        create_test_file(local_dir.path(), "save.dat", "local version");
        thread::sleep(Duration::from_millis(100));
        create_test_file(cloud_dir.path(), "save.dat", "cloud version");

        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            cloud_dir.path().to_string_lossy().to_string(),
            Some("cloud".to_string()),
        );

        assert!(result.is_ok());
        let sync_result = result.unwrap();
        assert!(sync_result.success);

        // Verify local now has cloud content
        assert_eq!(
            read_file_content(&local_dir.path().join("save.dat")),
            "cloud version"
        );
    }

    #[test]
    fn test_sync_game_saves_auto_resolve_newer() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        // Create local file first (older)
        create_test_file(local_dir.path(), "save.dat", "older local version");

        // Wait and create cloud file (newer)
        thread::sleep(Duration::from_millis(100));
        create_test_file(cloud_dir.path(), "save.dat", "newer cloud version");

        let result = sync_game_saves(
            local_dir.path().to_string_lossy().to_string(),
            cloud_dir.path().to_string_lossy().to_string(),
            Some("newer".to_string()),
        );

        assert!(result.is_ok());
        let sync_result = result.unwrap();
        assert!(sync_result.success);

        // Cloud is newer, so local should be updated
        assert_eq!(
            read_file_content(&local_dir.path().join("save.dat")),
            "newer cloud version"
        );
    }

    #[test]
    fn test_resolve_conflict_use_local() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        let local_file = create_test_file(local_dir.path(), "save.dat", "local content");
        let cloud_file = create_test_file(cloud_dir.path(), "save.dat", "cloud content");

        let result = resolve_conflict(
            local_file.to_string_lossy().to_string(),
            cloud_file.to_string_lossy().to_string(),
            true,
        );

        assert!(result.is_ok());
        assert_eq!(read_file_content(&cloud_file), "local content");
    }

    #[test]
    fn test_resolve_conflict_use_cloud() {
        let local_dir = TempDir::new().unwrap();
        let cloud_dir = TempDir::new().unwrap();

        let local_file = create_test_file(local_dir.path(), "save.dat", "local content");
        let cloud_file = create_test_file(cloud_dir.path(), "save.dat", "cloud content");

        let result = resolve_conflict(
            local_file.to_string_lossy().to_string(),
            cloud_file.to_string_lossy().to_string(),
            false,
        );

        assert!(result.is_ok());
        assert_eq!(read_file_content(&local_file), "cloud content");
    }

    #[test]
    fn test_sync_config_to_cloud() {
        let cloud_dir = TempDir::new().unwrap();
        let config_path = cloud_dir.path().join("memorycard/config.json");

        let config = r#"{"games": [], "settings": {}}"#;

        let result = sync_config_to_cloud(
            config_path.to_string_lossy().to_string(),
            config.to_string(),
        );

        assert!(result.is_ok());
        assert!(config_path.exists());
        assert_eq!(read_file_content(&config_path), config);
    }

    #[test]
    fn test_sync_config_to_cloud_creates_parent_dirs() {
        let cloud_dir = TempDir::new().unwrap();
        let config_path = cloud_dir.path().join("deeply/nested/dir/config.json");

        let config = r#"{"test": true}"#;

        let result = sync_config_to_cloud(
            config_path.to_string_lossy().to_string(),
            config.to_string(),
        );

        assert!(result.is_ok());
        assert!(config_path.exists());
    }

    #[test]
    fn test_get_files_recursive() {
        let dir = TempDir::new().unwrap();

        create_test_file(dir.path(), "file1.txt", "content1");
        create_test_file(dir.path(), "subdir/file2.txt", "content2");
        create_test_file(dir.path(), "subdir/nested/file3.txt", "content3");

        let files = get_files_recursive(dir.path()).unwrap();

        assert_eq!(files.len(), 3);

        let paths: Vec<String> = files
            .iter()
            .map(|f| f.path.file_name().unwrap().to_string_lossy().to_string())
            .collect();

        assert!(paths.contains(&"file1.txt".to_string()));
        assert!(paths.contains(&"file2.txt".to_string()));
        assert!(paths.contains(&"file3.txt".to_string()));
    }

    #[test]
    fn test_get_files_recursive_empty_dir() {
        let dir = TempDir::new().unwrap();
        let files = get_files_recursive(dir.path()).unwrap();
        assert!(files.is_empty());
    }

    #[test]
    fn test_copy_file() {
        let dir = TempDir::new().unwrap();
        let src = create_test_file(dir.path(), "source.txt", "source content");
        let dst = dir.path().join("destination.txt");

        let result = copy_file(&src, &dst);

        assert!(result.is_ok());
        assert!(dst.exists());
        assert_eq!(read_file_content(&dst), "source content");
    }

    #[test]
    fn test_open_folder_in_explorer_nonexistent() {
        let result = open_folder_in_explorer("/nonexistent/path".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }
}
