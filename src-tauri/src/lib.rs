use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

const BACKUP_FORMAT: &str = "kittypet-local-backup";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupBundle {
    format: String,
    version: u8,
    created_at: u128,
    progress: Value,
    preferences: Value,
}

fn timestamp_ms() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| format!("读取系统时间失败：{error}"))
}

fn read_json_file(path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.display()))?;
    serde_json::from_str(&content).map_err(|error| format!("解析 {} 失败：{error}", path.display()))
}

fn backup_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("无法定位文档目录：{error}"))?;
    Ok(documents.join("KittyPet Backups"))
}

fn write_current_backup(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))?;
    let progress = read_json_file(&app_data.join("progress.json"))?;
    let preferences = read_json_file(&app_data.join("preferences.json"))?;
    let created_at = timestamp_ms()?;
    let bundle = BackupBundle {
        format: BACKUP_FORMAT.to_string(),
        version: 1,
        created_at,
        progress,
        preferences,
    };
    let directory = backup_dir(app)?;
    fs::create_dir_all(&directory).map_err(|error| format!("创建备份目录失败：{error}"))?;
    let path = directory.join(format!("KittyPet-backup-{created_at}.json"));
    let encoded =
        serde_json::to_string_pretty(&bundle).map_err(|error| format!("生成备份失败：{error}"))?;
    fs::write(&path, encoded).map_err(|error| format!("写入备份失败：{error}"))?;
    Ok(path)
}

fn decode_backup(content: &str) -> Result<BackupBundle, String> {
    let bundle: BackupBundle =
        serde_json::from_str(content).map_err(|error| format!("备份格式无效：{error}"))?;
    if bundle.format != BACKUP_FORMAT || bundle.version != 1 {
        return Err("这不是受支持的 KittyPet 备份。".to_string());
    }
    if bundle.progress.get("pet").is_none() || bundle.preferences.get("pet").is_none() {
        return Err("备份缺少关系数据或设置。".to_string());
    }
    Ok(bundle)
}

fn restore_bundle_to_dir(bundle: &BackupBundle, app_data: &Path) -> Result<(), String> {
    let progress = serde_json::to_string_pretty(&bundle.progress)
        .map_err(|error| format!("恢复关系数据失败：{error}"))?;
    let preferences = serde_json::to_string_pretty(&bundle.preferences)
        .map_err(|error| format!("恢复设置失败：{error}"))?;
    fs::write(app_data.join("progress.json"), progress)
        .map_err(|error| format!("写入关系数据失败：{error}"))?;
    fs::write(app_data.join("preferences.json"), preferences)
        .map_err(|error| format!("写入设置失败：{error}"))?;
    Ok(())
}

#[tauri::command]
fn create_backup(app: tauri::AppHandle) -> Result<String, String> {
    write_current_backup(&app).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn restore_latest_backup(app: tauri::AppHandle) -> Result<(), String> {
    let directory = backup_dir(&app)?;
    let mut candidates = fs::read_dir(&directory)
        .map_err(|_| "还没有可恢复的本地备份。".to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("KittyPet-backup-") && name.ends_with(".json"))
        })
        .collect::<Vec<_>>();
    candidates.sort();
    let target = candidates
        .pop()
        .ok_or_else(|| "还没有可恢复的本地备份。".to_string())?;
    let content = fs::read_to_string(&target).map_err(|error| format!("读取备份失败：{error}"))?;
    let bundle = decode_backup(&content)?;

    // 在替换当前数据前自动留一份安全副本；目标已提前选定，不会误恢复刚生成的副本。
    let _safety_backup = write_current_backup(&app)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))?;
    restore_bundle_to_dir(&bundle, &app_data)?;
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_validation_and_restore_round_trip() {
        let unique = timestamp_ms().expect("timestamp");
        let directory = std::env::temp_dir().join(format!("kittypet-backup-test-{unique}"));
        fs::create_dir_all(&directory).expect("create test directory");
        let content = serde_json::json!({
            "format": BACKUP_FORMAT,
            "version": 1,
            "createdAt": unique,
            "progress": { "pet": { "version": 2, "launchCount": 7 } },
            "preferences": { "pet": { "dnd": false } }
        })
        .to_string();
        let bundle = decode_backup(&content).expect("valid bundle");
        restore_bundle_to_dir(&bundle, &directory).expect("restore bundle");
        let restored_progress = read_json_file(&directory.join("progress.json")).expect("progress");
        assert_eq!(restored_progress["pet"]["launchCount"], 7);
        assert!(decode_backup(r#"{"format":"wrong"}"#).is_err());
        fs::remove_dir_all(&directory).expect("remove test directory");
    }
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(true);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn open_nest_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("nest") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 前端错误诊断通道：只打印到本机终端，不发往任何外部服务。
#[tauri::command]
fn log_frontend(message: String) {
    println!("[frontend] {message}");
}

/// 原生窗口拖拽会吞掉 WebView 的 mouseup；直接读取 Windows 主鼠标键，
/// 让前端能在松手后立即切到落地状态，而不是等待窗口移动静默超时。
#[tauri::command]
fn is_primary_mouse_button_pressed() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        // GetAsyncKeyState 的最高位表示调用瞬间按键是否按下。
        return unsafe { GetAsyncKeyState(VK_LBUTTON as i32) < 0 };
    }

    #[cfg(not(target_os = "windows"))]
    false
}

#[tauri::command]
fn open_nest(app: tauri::AppHandle) {
    open_nest_window(&app);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            log_frontend,
            is_primary_mouse_button_pressed,
            open_nest,
            quit_app,
            create_backup,
            restore_latest_backup
        ])
        .setup(|app| {
            let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "勿扰模式", true, None::<&str>)?;
            let nest = MenuItem::with_id(app, "nest", "我们的小窝", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &nest, &pause, &settings, &quit])?;

            TrayIconBuilder::with_id("kitty-tray")
                .icon(
                    app.default_window_icon()
                        .expect("default window icon must exist")
                        .clone(),
                )
                .tooltip("KittyPet · 右键打开菜单")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_main_window(app),
                    "pause" => {
                        let _ = app.emit("tray-command", "toggle-pause");
                    }
                    "nest" => open_nest_window(app),
                    "settings" => {
                        let _ = app.emit("tray-command", "open-settings");
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
