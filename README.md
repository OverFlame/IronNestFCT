# IronNestFCT

面向 Iron Nest: Heavy Turret Simulator 的**内外火控结合**工程：

- **外部炮控终端**（本目录）：战术地图 + 交叉定位 + 简报导入 + 弹道 / TOT / 动目标 / 列车解算 + 总射击计划。可独立启动做离线计算实验，也作为游戏内自动火控的前端。
- **内部火控 Mod**（`internal/`，派生自 IronNestFCS-Smart）：MelonLoader 游戏内自动化执行（解算、装填、瞄准、击发），通过本地 HTTP + SSE 桥接接收外部终端下发的射击计划。

## 目录结构

```text
src/shared/          纯函数与共享配置（弹道、坐标、定位、TOT、拦截、派生推导、桥接客户端）
src/renderer/map.html  主终端 UI（Tauri 桌面版与浏览器版共用）
index.html           独立仰角速算页（手机/浏览器）
overlay.html         只读总射击计划悬浮窗
src-tauri/           Tauri 2 桌面壳（仅 Windows 发布构建）
tests/unit/          公式与纯函数单元测试
internal/            内部火控 Mod（MelonLoader，派生自 IronNestFCS-Smart + 桥接）
```

## 跨平台开发

游戏本体与内部 Mod 仅在 Windows 运行；Linux / macOS 只用于**外部 UI 的开发与测试**。

```bash
# 任意平台：跑纯函数单元测试
npm test

# 任意平台：浏览器版开发服务器（无需 Tauri / Rust）
npm run dev:web
# 打开 http://127.0.0.1:5180/src/renderer/map.html

# 仅 Windows（需 Rust + VS Build Tools + Node.js）：
npm install
npm run dev        # Tauri 桌面开发版
npm run build      # Windows 便携 exe（免安装单文件）
```

`npm run dev:web` 用零依赖的 `scripts/dev-server.js` 静态服务仓库根目录，`map.html` 通过 `tauri-bridge.js` 的无 Tauri 降级在普通浏览器中正常工作，因此 Linux 上无需安装 Tauri 依赖即可开发 UI。

## 新增能力

- **链式推导自动刷新**：目标由某“点位”（观测员或目标）定位得到时，会记录其定位依赖；当该点位被人工精确改坐标后，依赖它的目标自动重解算，并沿依赖链级联刷新。
- **击毁归档**：击毁目标不再直接删除，而是变为半透明保留，并按击毁顺序归档到“已击毁”列，与普通目标一样持久化。
- **内外火控桥接**：外部终端“同步射击计划”经本地 HTTP 下发到游戏内 Mod，由 Mod 自动装填/瞄准/击发；Mod 通过 SSE 回传双炮状态、队列与计划进度。

## 内部火控桥接（HTTP + SSE）

- Mod（`internal/`）启动后监听 `127.0.0.1:37841`（端口被占用则顺延到 37842…）。
- 端点：`GET /ping`（探测）、`GET /events`（SSE 状态流）、`POST /command`（下发命令）。
- 命令：`sync`（下发/替换射击计划）、`clear`（清空计划）、`autofire`（开关自动开火）。
- 事件：`status`（绑定状态、双炮物理状态、炮塔方位、待派发数、计划进度）。
- **AutoFire 定时开火**：列车 / 动目标 / TOT 任务按“接收后 N 秒”的相对倒计时到点开火（`fireAtSec`）；暂未定位游戏任务时钟，后续预留接口切换为绝对时刻对齐。
- **时间敏感优先级抢占队列**：Pending 任务按（开火截止时刻，优先级）升序排列；仅重排**未开始**的任务，已开始装填/瞄准/击发的任务不打断。
- 游戏内原详细火控 UI（IMGUI）**暂留空**，状态显示由外部终端呈现。

### 内部 Mod 部署（Windows 发布）

与参考 Mod 一致，**终端用户无需改 `GameDir`、无需重新编译**：开发者在 Windows 上打包一次，产出含三个文件夹的 release zip，用户解压合并进游戏根目录即可。

```powershell
# 在 Windows 上执行（内部 Mod 打包）：
cd internal
.\打包.bat                  # 自动探测游戏目录
# 或显式指定游戏目录：
powershell -File tools\Build-ReleasePackages.ps1 -GameDir "D:\SteamLibrary\steamapps\common\Iron Nest Heavy Turret Simulator"
```

产物 `artifacts/release-v<版本>/IronNestFCT_internal_v<版本>.zip` 内含三个文件夹：

- `Mods/IronNestFCS.dll`（宿主 Mod）
- `UserLibs/IronNestFCS.Abstractions.dll`（契约程序集）
- `UserData/IronNestFCS/IronNestFCS.Logic.dll`（火控逻辑）

用户只需解压 zip，把 `Mods` / `UserData` / `UserLibs` 三个文件夹合并进游戏根目录。

### 外部 UI 部署（便携 exe）

外部终端打包为**免安装便携单文件 exe**（Tauri 2，`bundle.active: false`，前端资源已内嵌进二进制）：

```bat
# 在 Windows 上执行（根目录）：
打包exe.bat
```

- 产物：`artifacts/IronNestFCT.exe`（单一文件，双击即用，无需安装）。
- 打包机需先装 Rust（[rustup.rs](https://rustup.rs)，选 MSVC 工具链）+ VS Build Tools（“使用 C++ 的桌面开发”负载）+ Node.js；缺 Rust 时 `打包exe.bat` 会给出提示。
- 目标机器需 WebView2 运行时（Windows 10/11 已随 Edge 预装）。
- 前端资源在编译期内嵌，运行时无需 `tauri-dist/` 目录。

## 来源与鸣谢

本工程是**外部火控 + 内部火控**的结合项目，分别引用并鸣谢以下资源：

| 来源                | 角色           | 链接                                                                                                                                                                                                                                                              |
| ----------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 铁巢炮控终端            | **外部火控**     | 演示视频及源码获取方法 [BV13RgG6nEYp](https://www.bilibili.com/video/BV13RgG6nEYp) · 作者主页 [space.bilibili.com/484713314](https://space.bilibili.com/484713314)                                                                                                                    |
| IronNestFCS-Smart | **内部火控**     | [GitHub HisenWeb/IronNestFCS-Smart](https://github.com/HisenWeb/IronNestFCS-Smart) · [svr2kos2/IronNestFCS: A Fire Control System for Iron Nest](https://github.com/svr2kos2/IronNestFCS) · 作者主页 [space.bilibili.com/568944](https://space.bilibili.com/568944) |
| IronNestFCS       | **内外火控结合实例** | [GitHub Walkersifolia/IronNestFCS](https://github.com/Walkersifolia/IronNestFCS) · 作者 [Walkersifolia](https://github.com/Walkersifolia) · 演示视频 [BV13oub6cE9K](https://www.bilibili.com/video/BV13oub6cE9K)                                                      |


- **外部火控**：本目录的外部炮控终端 UI 直接派生自“铁巢炮控终端”。外部火控暂无公开 GitHub 仓库，若有请补充。
- **内部火控**：IronNestFCS-Smart（上游 [svr2kos2/IronNestFCS](https://github.com/svr2kos2/IronNestFCS)）提供游戏内自动火控的实现参考。
- **结合实例**：IronNestFCS（项目1）由 [Walkersifolia](https://github.com/Walkersifolia) 维护，是内外火控结合使用的先行实例。

**致歉**：未能找到HisenWeb 的 B 站主页，若您知晓请告知以便补充。

上游代码版权与贡献归原作者及贡献者所有。

## 免责声明

本工程为非官方、社区自制的第三方项目，与《Iron Nest: Heavy Turret Simulator》的开发者或发行方**无任何关联、未获其背书或赞助**。游戏相关名称仅用于标识说明。本项目仅供学习与单人娱乐使用，使用风险自负。

## License

[GPL-3.0](LICENSE)
