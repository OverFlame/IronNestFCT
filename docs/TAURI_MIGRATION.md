# 桌面端 Tauri 2 迁移记录

## 迁移结论

桌面端由 Electron 便携版改为 Tauri 2，前端继续复用现有 HTML/CSS/JavaScript 和 `src/shared/*.js`，仅替换桌面壳与 IPC 层。

## 目录与职责

- `src-tauri/`：Tauri 主进程、窗口配置、托盘、全局快捷键和 IPC 命令。
- `src/shared/tauri-bridge.js`：兼容层，向页面提供原 `window.overlay` 和 `window.masterPlan` API。
- `scripts/prepare-tauri-dist.js`：把 `overlay.html`、`src/` 和图标资源复制到 `tauri-dist/`，供 Tauri 嵌入。
- `overlay.html`：总射击计划悬浮窗，继续复用。
- `src/renderer/map.html`：炮控地图主窗口，继续复用。

## Electron 到 Tauri 的映射

| Electron 能力 | Tauri 实现 |
|---|---|
| `BrowserWindow` 双窗口 | `app.windows` 配置 `map`、`plan` 两个窗口 |
| `globalShortcut` | `tauri-plugin-global-shortcut` |
| `Tray` + 菜单 | 核心 `TrayIconBuilder` |
| `ipcMain` / `preload` | `#[tauri::command]` + `invoke` + 事件 |
| 悬浮窗位置保存 | `tauri-plugin-window-state` |
| `showInactive` | 窗口 `focus: false` + `show()` |
| `alwaysOnTop: 'screen-saver'` | `always_on_top(true)`，无 Electron 层级参数 |
| `setVisibleOnAllWorkspaces` | Windows 上不支持，已省略 |

## 运行与发布

```powershell
npm run dev
npm run check
npm run build
```

`npm run build` 会先生成 `tauri-dist/`，再编译 Rust 后端并生成 NSIS 安装包。默认 WebView2 安装模式为 `downloadBootstrapper`。

## 已知限制

- Tauri 在 Windows 上只提供布尔值 `alwaysOnTop`，没有 Electron 的 `screen-saver` z-order 级别；置顶表现仍以真机验证为准。
- 官方 Windows 发行格式为 NSIS 或 MSI，不提供 Electron 那样的单文件 portable exe。
- `visibleOnAllWorkspaces` 在 Windows 上不受支持。
