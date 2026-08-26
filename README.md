# KittyPet

一个私人的 Windows 桌面宠物。透明无边框、可拖拽、可点击互动、可缩放（50%–200%），
会按时间/使用时长/纪念日主动说话，带随机小动作、入睡/起床、撸猫爱心、视线跟随、桌面散步
等趣味动画，摸蝴蝶结/头/身体会有不同反应，快速划动鼠标还能逗它扑过来，还会在早上问好
并提醒你喝水/久坐/早睡，完全离线运行，不上传任何数据。

v0.2 起 KittyPet 会记住陪伴关系：本地记录启动日期、互动习惯和最近回忆，可从托盘或设置
打开「我们的小窝」查看相识天数、连续陪伴、今日互动和回忆时间线。关系记录仍只保存在本机，
不读取前台应用内容，也不联网。

v0.3–v0.4 起 KittyPet 拥有本地行为脑：精力、困意、社交期待、无聊和好奇心会驱动连续动作，
并在重启后按离线时间温和演化。内部需求不会变成惩罚型数值条，也不会因为没有打开应用而生病
或掉好感；它们只让作息和性格保持连续。

v0.5 的「我们的小窝」分为今天、秘密和收藏三页：包含当前心情、每日记录、最近七天周记、
10 段可解锁秘密与对应纪念物，并支持把关系、行为状态和设置备份到
`文档/KittyPet Backups/`，或恢复最近一次备份。恢复前会自动再保存一份安全副本。

v0.6–v0.7 保留原来的大头桌宠，并把小窝扩展为今天、记忆、衣柜、收藏四页：6 件头部装扮
随真实陪伴记录解锁并本地保存；用户也可以明确添加、查看和删除最多 20 条本地记忆（单条
最多 120 字）。Kitty 不会从聊天或行为中自行推测需要记住的内容。

v0.8 让关系直接影响动作：初识、熟悉与久别后的摸头反应不同；眼神高光、胡须、蝴蝶结
和配饰使用轻量分层动画。熟悉后 Kitty 还会在靠近屏幕边缘时探头，并为睡帽、铃铛、
发夹等装扮播放专属反应；连续见面、久别重逢和深夜陪伴拥有本地去重的稀有仪式。

v0.9 把大头细分为双耳、额头、双侧脸颊、鼻子、双侧胡须、蝴蝶结、脸部与下方区域；
点击不同位置会出现有方向的动作和专属台词。当前穿戴的配饰拥有独立可见命中区，点击
睡帽、铃铛、发夹等会触发各自的打盹、轻响、闪光或弹跳反馈。

v0.10 把动作观感收成同一套手绘物理语言：落地阴影与尘土会响应高度和拖拽力度，配饰与
蝴蝶结使用独立弹簧延迟跟随，动作切换用短交叉淡化消除硬切；拖动速度和方向还会让 Kitty
轻微反向滞后，松手后只做一次回弹并稳稳落桌，不会让窗口继续惯性滑行。

v0.11 增加可关闭的生命感微动作：心情决定呼吸幅度与节奏，待机时会稀疏出现左右耳轻颤、
鼻尖微动或柔和侧倾；睡着后呼吸更慢、更轻。微动作遵守系统减少动态效果设置，也不会重新
显示独立胡须层。

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

## 固定更新、安装与启动流程（Windows）

每次修改素材或代码后，双击 `start-kittypet.bat`（或 `.cmd`）。它会固定执行：

1. 停止旧桌宠进程
2. 构建最新 Tauri release 安装包
3. 静默安装 NSIS 包；若安装器保留旧 exe，则用本次构建产物覆盖并校验 SHA-256
4. 启动已安装版并确认 `kittypet.exe` 进程运行

可选参数：

```bash
start-kittypet.bat                # 完整：构建 → 安装 → 启动
start-kittypet.bat -Mode Build     # 只停止旧进程并构建
start-kittypet.bat -Mode Install   # 只安装最新已构建版本
start-kittypet.bat -Mode Start     # 只启动已安装版本
start-kittypet.bat -Mode Stop      # 只停止桌宠
```

缩放桌宠：右键猫咪打开设置，拖动「大小」滑杆或点 +/−（50%–200%）；也可以按住 Ctrl 在猫咪身上滚动滚轮。

动画：`PetApp` 用 Canvas 程序化渲染呼吸 / 弹跳 / 挤压 / 旋转（动作参数在
`src/assets/pet/motion-spec.json`），idle / sleepy 状态会随机眨眼；高清底图加载前自动回退到 240px sprite sheet。

趣味动画（右键设置 →「趣味动画」可逐个开关）：空闲随机小动作、入睡/起床过渡、带方向与力度的
拖拽悬挂 + 落地弹跳、长按撸猫 + 爱心、视线跟随鼠标、生命感微动作、桌面散步（**默认关闭**，开启后猫才在屏幕内来回走）、
逗猫棒互动（快速划动鼠标抬头看，连续划动扑击并追光标一小段）。

动作特效（`MotionEffects`，纯 CSS 粒子，不挡交互）：点击冲击星、开心星光 + 音符、害羞汗滴、
打喷嚏水珠、生气 💢、转圈晕眩星、落地尘土、扑击 💥、逗猫棒问号、打哈欠小 Z、起床星光、
摸头小心心、摸蝴蝶结闪光、蹦跳星光 + 尘土、摇摆音符、吓一跳 ❗、晕眩星环；
喝水/久坐/早睡/早安提醒气泡也会带上对应小图标。

陪伴提醒（右键设置 →「陪伴提醒」）：喝水、久坐、早睡三项独立开关与节奏；每天早上
（5:00–11:59）第一次启动会先说“早上好”，勿扰模式下所有提醒静音。

分部位摸摸：点蝴蝶结（害羞护住）、点脸（开心靠过来）、点身体（压扁轻晃）各有独立动作和台词；
650ms 内双击 `happy`，同一手势内 4 连击 `shy`、9 连击 `angry`（生气发抖）；停顿超过 650ms
即为新手势，单点/双击/连击互不吞掉。

## 目录结构

```
src/
  app/          PetApp + usePetController（编排层：随机调度 / 散步 / 撸猫）
  behavior/     持久化需求、行为评分、行为链与调度器
  relationship/关系事件、秘密目录、纪念物、日记与七日周记
  pet/          ProceduralAnimation / SpriteAnimation / InteractionArea / petMachine / animationManifest
  dialogue/     对白类型、引擎、触发调度、profile
  components/   SpeechBubble / SleepZzz / Hearts / SettingsPanel / NestWindow
  storage/      plugin-store 的 preferences / progress 封装
  platform/     窗口位置恢复、多屏钳制、散步步进
scripts/
  gen_placeholder_assets.py    生成占位角色与图标（原创白猫）
  apply_pet_asset.py           抠图 + 用表情/姿势立绘生成 25 组动作 sheet（含 240px 回退）
  export_procedural_kit.py     从立绘导出 1200px 高清帧 + 6 种表情（含 surprised 惊讶）+ 姿势 state-bases + motion-spec.json
  regenerate_icons.py          用同一立绘重新生成应用/托盘图标
  sync-personalization.mjs     把 personalization.example 补缺复制到 personalization
personalization.example/       私人内容模板（profile / dates / dialogue）
personalization/               ← 真实私人内容，已 gitignore
src-tauri/
  src/lib.rs    托盘（显示/隐藏 · 勿扰 · 设置 · 退出）
  tauri.conf.json
  capabilities/ 最小权限：window 子集 + store + autostart
```

## 状态机

- 基础：`idle → sleepy → sleeping`（默认带 `falling` 入睡下沉 / `waking` 起床伸懒腰过渡），
  `falling`（入睡中）头顶先冒一个小 `z`，`sleeping`（已睡着）显示大 Zzz 气泡；
  `sleepy` 困倦阶段不冒泡，看到 ZZZ 即代表已经/正在入睡。
  45 秒困倦倒计时挂在 `idle` 父状态上，随机小动作不会重置它；点击等真正交互才会重置。
- 点击：`clicked` 压扁 → 回 idle；650ms 内双击 `happy`；同一手势内 4 连击 `shy`、
  9 连击 `angry`；单次点击按部位进入 `headpat / bodypat / bowtouch`（摸头 / 戳身体 / 碰蝴蝶结）。
- 趣味：`DRAG_START → dragging → DRAG_END → landing`；长按 `HOLD_START → petted`；
  `WALK_START → walking`（散步默认关闭、开启时不会入睡）；idle 下随机进入
  `stretch / yawn / wash / look / sneeze / shake / spin / jump / nod / sway /
  bow / startle / dizzy / peek` 小动作；鼠标快速划动触发
  `tease`（抬头看）/ `pounce`（扑击 + 短程追光标）。
- 所有非循环动画播完发 `ANIMATION_FINISHED` 回 idle，并有 3.5–4s 兜底超时。
- `SHOW_DIALOGUE` 按对白的 `motion` 把状态切换到对应表情，气泡超时后 `DIALOGUE_FINISHED`。

## 私人内容

1. 编辑 `personalization/profile.json`（昵称 / 你的称呼）
2. 编辑 `personalization/dates.json`（纪念日、生日）
3. 编辑 `personalization/dialogue.json`（30–50 条对白；字段说明见 `personalization.example/README.md`）
4. 把角色 sprite sheet 放进 `personalization/assets/`，或直接替换 `public/assets/pet/*.png`
   （素材规范：横向 sheet、240 px 帧、透明 PNG、6–12 FPS、状态命名保持一致）
   - 若素材是一张"粉色背景 + 白猫"的方形立绘，可直接执行（先 export 生成表情帧，
     再跑 apply 把对应表情烘进 240px 回退 sprite sheet，两者顺序不要反）：
     `python scripts/export_procedural_kit.py 立绘.png`
     `python scripts/apply_pet_asset.py 立绘.png`
     `python scripts/regenerate_icons.py 立绘.png`
   - 姿势立绘投放区：`assets/happy.png.png、shy.png.png、drag.png.png、sleep.png.png、
     angry.png.png`。脚本会自动抠图，分别作为 happy / shy / dragging / 入睡·睡觉·起床 /
     angry 的 Canvas 高清基帧和 240px 回退帧；要换姿势时直接替换同名文件后重跑上面两步。
   - 重新生成素材后必须重新构建前端，打包 exe 前更是如此；否则安装包仍会带上
     `dist/` 里的旧素材（例如旧的“睁眼 sleep.png”）：
     `npm run build`（开发环境重启 `npm run tauri dev` 即可）
   - 若 `export_procedural_kit.py` 报“未能检测到眼睛”，说明素材本身不适合自动表情
     生成；此时需要换图，脚本会中止而不是静默产出睁眼睡眠帧。

## 行为节奏（内置）

- 每天主动说话 3–6 次：早晨（07:00–10:00）、午后（12:00–14:00）、深夜（23:30–02:00）、
  90 分钟休息提醒、45–90 分钟间隔的随机事件
- 每天早上（5:00–11:59）第一次启动先说“早上好”，当天只问候一次
- 陪伴提醒：喝水（默认每 60 分钟）、久坐（默认每 90 分钟）、早睡（默认 23:00），
  设置面板可调；猫正在说别的话时不会插嘴，勿扰模式下全部静音
- 点击有回应（带冷却）；点头/点身体/点蝴蝶结反应各不相同；双击与 4 连击 / 9 连击有专属反应
- 内容四层解锁：第 1–2 天日常 → 第 3–5 天称呼/习惯 → 第 5–10 天私人回忆 → 稀有彩蛋
- 关系记忆：启动、摸头、戳身体、碰蝴蝶结、撸猫、拖拽和逗猫棒会形成本地回忆；久别重逢、
  互动习惯和连续陪伴会解锁不同对白。最近 100 条事件和最多 32 条秘密会被保留。
- 自主生活：每 5 秒在合适的 idle 时机重新评分，支持观察、找你、洗脸、玩耍、探索、休息和
  “打哈欠 → 入睡”等行为链；交互、提醒、设置和勿扰会正确取消或抑制自主行为。
- 跨会话连续性：行为需求和最近 120 条自主活动保存在 `progress.json`；离线演化有舒适上限，
  不设置饥饿、清洁、死亡或掉好感机制。
- 小窝成长：秘密会保存解锁日期并带回纪念物；今日记录与七日周记同时总结用户互动和 Kitty
  的自主生活。数据备份仍完全离线。

## 交付清单

- [x] 正式素材已替换为用户提供的白猫立绘（2026-08-17，抠图 + 16 组动作 + 图标）
- [x] 趣味动画六件套：随机小动作 / 入睡起床 / 拖拽落地 / 撸猫爱心 / 视线跟随 / 桌面散步（设置面板可逐个开关）
- [x] 私人对白已替换为 50 条日常向原创文案（朋友/同事感，不暧昧；不使用无授权的第三方角色图片）
- [x] `npm run tauri build`，从 `src-tauri/target/release/bundle/nsis/` 取 `KittyPet_*_x64-setup.exe`
- [x] v0.5：跨会话行为状态、10 段秘密、10 件纪念物、七日周记、本地备份与恢复
- [x] v0.6：6 件关系解锁的头部装扮、穿戴与本地持久化
- [x] v0.7：用户明确添加/查看/删除的本地记忆（最多 20 条、单条 120 字）
- [x] v0.8：关系驱动反应、分层动画、边缘探头、配饰专属反应与稀有陪伴仪式
- [x] v0.9：精细部位点击、方向性反馈与六件配饰独立点击反应
- [x] 本人电脑实测：置顶、拖拽、托盘、开机启动、100% DPI + 128% 文本缩放
- [ ] 双屏 / 不同缩放比例屏幕组合待实机复测
- [ ] 只私下发给收礼人（AirDrop / USB / 私密链接），不公开传播
- [x] 附 `docs/recipient-readme-template.md` 的说明（已润色为可直接附送的定稿）
