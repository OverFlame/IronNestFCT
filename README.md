# IronNestFCT

面向 Iron Nest: Heavy Turret Simulator 的**内外火控结合**工程：

- **外部炮控终端**（本目录）：战术地图 + 交叉定位 + 简报导入 + 弹道 / TOT / 动目标 / 列车解算 + 总射击计划。可独立启动做离线计算实验，也作为游戏内自动火控的前端。
- **内部火控 Mod**（后续加入）：MelonLoader 游戏内自动化执行（解算、装填、瞄准、击发）。

## 目录结构

```text
src/shared/          纯函数与共享配置（弹道、坐标、定位、TOT、拦截、派生推导）
src/renderer/map.html  主终端 UI（Tauri 桌面版与浏览器版共用）
index.html           独立仰角速算页（手机/浏览器）
overlay.html         只读总射击计划悬浮窗
src-tauri/           Tauri 2 桌面壳（仅 Windows 发布构建）
tests/unit/          公式与纯函数单元测试
```

## 跨平台开发

游戏本体与内部 Mod 仅在 Windows 运行；Linux / macOS 只用于**外部 UI 的开发与测试**。

```bash
# 任意平台：跑纯函数单元测试
npm test

# 任意平台：浏览器版开发服务器（无需 Tauri / Rust）
npm run dev:web
# 打开 http://127.0.0.1:5180/src/renderer/map.html

# 仅 Windows（需 Rust + VS Build Tools + WebView2 + Tauri CLI）：
npm install
npm run dev        # Tauri 桌面开发版
npm run build      # Windows NSIS 安装包
```

`npm run dev:web` 用零依赖的 `scripts/dev-server.js` 静态服务仓库根目录，`map.html` 通过 `tauri-bridge.js` 的无 Tauri 降级在普通浏览器中正常工作，因此 Linux 上无需安装 Tauri 依赖即可开发 UI。

## 新增能力

- **链式推导自动刷新**：目标由某“点位”（观测员或目标）定位得到时，会记录其定位依赖；当该点位被人工精确改坐标后，依赖它的目标自动重解算，并沿依赖链级联刷新。
- **击毁归档**：击毁目标不再直接删除，而是变为半透明保留，并按击毁顺序归档到“已击毁”列，与普通目标一样持久化。

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
