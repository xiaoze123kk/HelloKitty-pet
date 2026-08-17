# KittyPet

一个私人的 Windows 桌面宠物。透明无边框、可拖拽、可点击互动、可缩放（50%–200%），
会按时间/使用时长/纪念日主动说话，完全离线运行，不上传任何数据。

**技术栈**：Tauri 2 · React 19 · TypeScript · Vite 7 · XState 5 · Tauri Store / Autostart 插件

> ⚠️ 合规约定：本仓库只包含桌宠引擎和"示例私人内容"。昵称、纪念日、私人对白和角色素材
> 一律放在 `personalization/`（已在 `.gitignore` 中），只留在本机，不进入版本库。

## 快速开始（Windows）

环境：Node ≥ 20、Rust（MSVC toolchain）、Visual Studio Build Tools（C++ 生成工具）。

```bash
npm install
npm run tauri dev    # 开发运行
npm run tauri build  # 生成 NSIS 安装包（target/release/bundle/nsis）
```

缩放桌宠：右键猫咪打开设置，拖动「大小」滑杆或点 +/−（50%–200%）；也可以按住 Ctrl 在猫咪身上滚动滚轮。

动画：`PetApp` 用 Canvas 程序化渲染呼吸 / 弹跳 / 挤压 / 旋转（动作参数在
`src/assets/pet/motion-spec.json`），idle / sleepy 状态会随机眨眼；高清底图加载前自动回退到 240px sprite sheet。

## 目录结构

```
src/
  app/          PetApp + usePetController（编排层）
  pet/          ProceduralAnimation / SpriteAnimation / InteractionArea / petMachine / animationManifest
  dialogue/     对白类型、引擎、触发调度、profile
  components/   SpeechBubble / SettingsPanel
  storage/      plugin-store 的 preferences / progress 封装
  platform/     窗口位置恢复与多屏钳制
scripts/
  gen_placeholder_assets.py    生成占位角色与图标（原创白猫）
  apply_pet_asset.py           把单张粉色背景立绘抠图并生成 6 组动作 sheet
  export_procedural_kit.py     从同一立绘导出 1200px 高清帧 + 自动闭眼帧 + motion-spec.json
  regenerate_icons.py          用同一立绘重新生成应用/托盘图标
  sync-personalization.mjs     把 personalization.example 补缺复制到 personalization
personalization.example/       私人内容模板（profile / dates / dialogue）
personalization/               ← 真实私人内容，已 gitignore
src-tauri/
  src/lib.rs    托盘（显示/隐藏 · 暂停 · 设置 · 退出）
  tauri.conf.json
  capabilities/ 最小权限：window 子集 + store + autostart
```

## 状态机

`idle → sleepy → sleeping`，点击进入 `clicked`，双击 `happy`，5 连击 / 12 连击 `shy`，拖拽 `dragging`。
`SHOW_DIALOGUE` 按对白的 `motion` 把状态切换到对应表情，气泡超时后 `DIALOGUE_FINISHED`。

## 私人内容

1. 编辑 `personalization/profile.json`（昵称 / 你的称呼）
2. 编辑 `personalization/dates.json`（纪念日、生日）
3. 编辑 `personalization/dialogue.json`（30–50 条对白；字段说明见 `personalization.example/README.md`）
4. 把角色 sprite sheet 放进 `personalization/assets/`，或直接替换 `public/assets/pet/*.png`
   （素材规范：横向 sheet、240 px 帧、透明 PNG、6–12 FPS、状态命名保持一致）
   - 若素材是一张"粉色背景 + 白猫"的方形立绘，可直接执行：
     `python scripts/apply_pet_asset.py 立绘.png`
     `python scripts/export_procedural_kit.py 立绘.png`
     `python scripts/regenerate_icons.py 立绘.png`

## 行为节奏（内置）

- 每天主动说话 3–6 次：早晨（07:00–10:00）、午后（12:00–14:00）、深夜（23:30–02:00）、
  90 分钟休息提醒、45–90 分钟间隔的随机事件
- 点击有回应（带冷却）；5 连击 / 12 连击有专属反应
- 内容四层解锁：第 1–2 天日常 → 第 3–5 天称呼/习惯 → 第 5–10 天私人回忆 → 稀有彩蛋

## 交付清单

- [x] 正式素材已替换为用户提供的白猫立绘（2026-08-17，抠图 + 6 组动作 + 图标）
- [ ] 替换私人对白（当前仍为示例数据，不使用无授权的第三方角色图片）
- [x] `npm run tauri build`，从 `src-tauri/target/release/bundle/nsis/` 取 `KittyPet_*_x64-setup.exe`
- [x] 本人电脑实测：置顶、拖拽、托盘、开机启动、100% DPI + 128% 文本缩放
- [ ] 双屏 / 不同缩放比例屏幕组合待实机复测
- [ ] 只私下发给收礼人（AirDrop / USB / 私密链接），不公开传播
- [ ] 附 `docs/recipient-readme-template.md` 的说明
