# 铁巢炮控 SVG 素材库

素材根据用户提供的游戏内图例截图重新绘制为干净的几何矢量，不包含原始位图纹理。

## 目录

- `assets/icons/svg/*.svg`：可直接用于 `<img>`、CSS 或地图标记的独立图标。
- `assets/icons/svg/iron-nest-symbols.svg`：包含全部图标的 SVG symbol sprite。
- `assets/icons/svg/manifest.json`：图标 ID、名称、分类、文件名和 viewBox。
- `assets/icons/catalog.html`：完整素材总览页。
- `scripts/generate-svg-library.js`：素材生成源脚本。

## 分类

- 单位图例：友军、敌军、步兵、侦察、炮兵和机械化部队。
- 地图符号：参考点。
- 单位上方修饰符：地下、高优先级和建筑物；三者均不得作为独立目标出现，必须叠加在对应单位符号上方。
- 特种单位：炮兵指挥官（FDC）和补给仓库。
- 自定义标记：红色数字 1–10、绿色字母 A–E、蓝色数字 1–10。
- 铁巢本体：双炮管俯视图标。

## 重新生成

```powershell
node scripts/generate-svg-library.js
```

独立图标使用 `64 × 64` 标准 viewBox；铁巢本体使用 `128 × 128`，以保留炮管和侧向结构细节。
