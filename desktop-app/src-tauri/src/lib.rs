use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct SyncResult {
    success: bool,
    message: String,
    files_synced: usize,
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
fn sync_game_saves(local_path: String, cloud_path: String) -> Result<SyncResult, String> {
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
            // File exists in both - sync the newer one
            if local_file.modified > cloud_file.modified {
                // Local is newer, copy to cloud
                copy_file(&local_file.path, &cloud_file.path).map_err(|e| e.to_string())?;
                files_synced += 1;
            } else if cloud_file.modified > local_file.modified {
                // Cloud is newer, copy to local
                copy_file(&cloud_file.path, &local_file.path).map_err(|e| e.to_string())?;
                files_synced += 1;
            }
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
        success: true,
        message: format!("Successfully synced {} file(s)", files_synced),
        files_synced,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet, sync_game_saves])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
