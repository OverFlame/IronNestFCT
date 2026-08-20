#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct MasterPlanState(Mutex<Vec<Value>>);
struct ShortcutBindingsState(Mutex<ShortcutBindings>);

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutBindings {
    map_shortcut: String,
    plan_shortcut: String,
    toggle_shortcut: String,
}

impl Default for ShortcutBindings {
    fn default() -> Self {
        Self {
            map_shortcut: "Alt+C".into(),
            plan_shortcut: "Alt+P".into(),
            toggle_shortcut: "Alt+Q".into(),
        }
    }
}

fn normalized_shortcut(value: &str) -> String {
    value.trim().to_string()
}

fn validate_shortcut_bindings(bindings: &ShortcutBindings) -> Result<(), String> {
    let shortcuts = [
        normalized_shortcut(&bindings.map_shortcut),
        normalized_shortcut(&bindings.plan_shortcut),
        normalized_shortcut(&bindings.toggle_shortcut),
    ];
    let assigned = shortcuts.iter().filter(|shortcut| !shortcut.is_empty()).collect::<Vec<_>>();
    if assigned.len() != assigned.iter().map(|shortcut| shortcut.to_ascii_lowercase()).collect::<std::collections::HashSet<_>>().len() {
        return Err("同一快捷键不能分配给多个动作".into());
    }
    Ok(())
}

fn register_shortcut(app: &AppHandle, shortcut: &str, handler: fn(&AppHandle)) -> Result<(), String> {
    if shortcut.is_empty() {
        return Ok(());
    }
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _, event| {
            if event.state == ShortcutState::Pressed {
                handler(app);
            }
        })
        .map_err(|error| error.to_string())
}

fn register_available_shortcuts(app: &AppHandle, bindings: &ShortcutBindings) -> Vec<String> {
    [
        ("打开地图", normalized_shortcut(&bindings.map_shortcut), show_map as fn(&AppHandle)),
        ("显示总计划", normalized_shortcut(&bindings.plan_shortcut), show_plan as fn(&AppHandle)),
        ("切换总计划", normalized_shortcut(&bindings.toggle_shortcut), toggle_plan as fn(&AppHandle)),
    ]
    .into_iter()
    .filter_map(|(label, shortcut, handler)| {
        register_shortcut(app, &shortcut, handler)
            .err()
            .map(|error| format!("{label}（{shortcut}）不可用：{error}"))
    })
    .collect()
}

fn show_map(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("map") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_plan(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("plan") {
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.unminimize();
    }
}

fn hide_plan(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("plan") {
        let _ = window.hide();
    }
}

fn toggle_plan(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("plan") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.set_always_on_top(true);
            let _ = window.show();
            let _ = window.unminimize();
        }
    }
}

#[tauri::command]
fn get_master_plan(state: tauri::State<'_, MasterPlanState>) -> Vec<Value> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn update_master_plan(
    window: WebviewWindow,
    app: AppHandle,
    state: tauri::State<'_, MasterPlanState>,
    plan: Vec<Value>,
) -> Result<(), String> {
    if window.label() != "map" {
        return Err("master plan can only be published by the map window".into());
    }

    let clamped = plan.into_iter().take(12).collect::<Vec<_>>();
    *state.0.lock().unwrap() = clamped.clone();

    if let Some(plan_window) = app.get_webview_window("plan") {
        plan_window
            .emit("master-plan:update", &clamped)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn destroy_target(window: WebviewWindow, app: AppHandle, target_id: String) -> Result<(), String> {
    if window.label() != "plan" {
        return Err("target destruction can only be requested by the plan overlay".into());
    }

    if let Some(map) = app.get_webview_window("map") {
        map.emit("master-plan:destroy-target", &target_id)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn hide_overlay(window: WebviewWindow) -> Result<(), String> {
    if window.label() != "plan" {
        return Err("only the plan overlay can hide itself".into());
    }
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn reassert_overlay(app: AppHandle) {
    if let Some(window) = app.get_webview_window("plan") {
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.unminimize();
    }
}

#[tauri::command]
fn get_shortcuts(state: tauri::State<'_, ShortcutBindingsState>) -> ShortcutBindings {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn set_shortcuts(
    app: AppHandle,
    state: tauri::State<'_, ShortcutBindingsState>,
    bindings: ShortcutBindings,
) -> Result<ShortcutBindings, String> {
    validate_shortcut_bindings(&bindings)?;
    let bindings = ShortcutBindings {
        map_shortcut: normalized_shortcut(&bindings.map_shortcut),
        plan_shortcut: normalized_shortcut(&bindings.plan_shortcut),
        toggle_shortcut: normalized_shortcut(&bindings.toggle_shortcut),
    };
    let previous = state.0.lock().unwrap().clone();
    let _ = app.global_shortcut().unregister_all();

    let failures = register_available_shortcuts(&app, &bindings);
    if failures.is_empty() {
        *state.0.lock().unwrap() = bindings.clone();
        return Ok(bindings);
    }

    let _ = app.global_shortcut().unregister_all();
    let _ = register_available_shortcuts(&app, &previous);
    Err(format!("快捷键未保存：{}；已恢复原配置", failures.join("；")))
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn desktop_ready(window: WebviewWindow) -> Result<(), String> {
    if window.label() == "map" {
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(MasterPlanState(Mutex::new(Vec::new())))
        .manage(ShortcutBindingsState(Mutex::new(ShortcutBindings::default())))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let shortcuts = app.state::<ShortcutBindingsState>().0.lock().unwrap().clone();
            for warning in register_available_shortcuts(app.handle(), &shortcuts) {
                eprintln!("{warning}");
            }
            let open_map = MenuItem::with_id(app, "open_map", "打开炮控地图", true, None::<&str>)?;
            let show_plan_item =
                MenuItem::with_id(app, "show_plan", "显示总射击计划", true, None::<&str>)?;
            let hide_plan_item =
                MenuItem::with_id(app, "hide_plan", "隐藏总射击计划", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;

            let separator_one = PredefinedMenuItem::separator(app)?;
            let separator_two = PredefinedMenuItem::separator(app)?;

            let menu = Menu::with_items(
                app,
                &[
                    &open_map,
                    &separator_one,
                    &show_plan_item,
                    &hide_plan_item,
                    &separator_two,
                    &quit_item,
                ],
            )?;

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("铁巢炮控终端")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open_map" => show_map(app),
                    "show_plan" => show_plan(app),
                    "hide_plan" => hide_plan(app),
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
                        toggle_plan(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            let _tray = tray_builder.build(app)?;

            show_map(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_master_plan,
            update_master_plan,
            destroy_target,
            hide_overlay,
            reassert_overlay,
            get_shortcuts,
            set_shortcuts,
            desktop_ready,
            quit
        ])
        .run(tauri::generate_context!())
        .expect("error while running fire control terminal");
}
