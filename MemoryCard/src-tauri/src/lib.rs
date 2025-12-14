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
                                        unsafe {
                                            let ns_app = NSApp();
                                            ns_app.activateIgnoringOtherApps_(true);
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
