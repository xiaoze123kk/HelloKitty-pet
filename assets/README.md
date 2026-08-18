# 素材投放区

把要给桌宠用的图片直接放进这个文件夹（`kittypet/assets/`），放好后告诉我一声即可。

## 可以放什么

| 类型 | 命名建议 | 说明 |
|---|---|---|
| 完整立绘 | `pet-xxx.png` | 一只猫的完整造型，背景可以不透明，我来抠图 |
| 分帧动作图 | `idle.png` / `happy.png` / `shy.png` / `sleep.png` / `sleepy.png` / `clicked.png` | 横向连续帧、透明背景最佳；每帧建议 240×240，不是也没关系 |
| 图标 | `icon.png` | 方形、主体居中，我来生成 ico |
| 其他参考图 | 任意命名 | 姿势/表情/配色参考都行 |

## 规则

1. **只放你自己有使用权的图**（自己画的、自己生成的都可以）。
2. 这个文件夹里的图片默认**不进 git**（私人素材），只有这份 README 会进仓库。
3. 旧图不会自动删除；我会按你指定的新图替换桌宠当前素材。

## 当前会自动识别的姿势立绘

放同名文件（覆盖即可），然后重跑 `export_procedural_kit.py` 和 `apply_pet_asset.py`：

| 文件 | 用在哪里 |
|---|---|
| `idle.png.png` | 默认立绘、所有表情帧 |
| `happy.png.png` | happy / wave 的高清基帧 |
| `shy.png.png` | shy（4 连击害羞） |
| `sleep.png.png` | fallAsleep / sleeping / wake（入睡、睡觉、起床） |
| `drag.png.png` | dragging（拖拽悬挂） |
| `angry.png.png` | angry（9 连击生气） |

当前桌宠素材位置（自动生成，勿手动改）：
`public/assets/pet/` 与 `src/assets/pet/`
