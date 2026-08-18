import {
  formatScale,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_SLIDER_STEP,
  SCALE_STEP,
} from "../pet/zoom";
import type {
  AnimationPreferences,
  ReminderKind,
  ReminderPreferences,
} from "../storage/preferences";

interface SettingsPanelProps {
  open: boolean;
  alwaysOnTop: boolean;
  dnd: boolean;
  autostart: boolean;
  autostartSupported: boolean;
  scale: number;
  animations: AnimationPreferences;
  reminders: ReminderPreferences;
  onClose: () => void;
  onToggleAlwaysOnTop: (value: boolean) => void;
  onToggleDnd: (value: boolean) => void;
  onToggleAutostart: (value: boolean) => void;
  onScaleChange: (value: number) => void;
  onToggleAnimation: (key: keyof AnimationPreferences, value: boolean) => void;
  onUpdateReminder: (
    kind: ReminderKind,
    patch: {
      enabled?: boolean;
      intervalMinutes?: number;
      time?: string;
    },
  ) => void;
  onClearData: () => void;
}

export function SettingsPanel({
  open,
  alwaysOnTop,
  dnd,
  autostart,
  autostartSupported,
  scale,
  animations,
  reminders,
  onClose,
  onToggleAlwaysOnTop,
  onToggleDnd,
  onToggleAutostart,
  onScaleChange,
  onToggleAnimation,
  onUpdateReminder,
  onClearData,
}: SettingsPanelProps) {
  if (!open) return null;

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span>设置</span>
        <button className="settings-close" onClick={onClose} aria-label="关闭设置">
          ✕
        </button>
      </div>

      <label className="settings-row">
        <span>
          <strong>始终置顶</strong>
          <small>让 Kitty 一直显示在其它窗口上方</small>
        </span>
        <input
          type="checkbox"
          checked={alwaysOnTop}
          onChange={(event) => onToggleAlwaysOnTop(event.target.checked)}
        />
      </label>

      <label className="settings-row">
        <span>
          <strong>勿扰模式</strong>
          <small>暂时不弹气泡，角色保留</small>
        </span>
        <input
          type="checkbox"
          checked={dnd}
          onChange={(event) => onToggleDnd(event.target.checked)}
        />
      </label>

      <label className="settings-row">
        <span>
          <strong>开机启动</strong>
          <small>{autostartSupported ? "开机时自动出现" : "开发模式下不可用，安装后生效"}</small>
        </span>
        <input
          type="checkbox"
          disabled={!autostartSupported}
          checked={autostart}
          onChange={(event) => onToggleAutostart(event.target.checked)}
        />
      </label>

      <div className="settings-section-title">趣味动画</div>

      <label className="settings-row">
        <span>
          <strong>空闲小动作</strong>
          <small>伸懒腰 · 打哈欠 · 洗脸 · 张望</small>
        </span>
        <input
          type="checkbox"
          checked={animations.idleActions}
          onChange={(event) =>
            onToggleAnimation("idleActions", event.target.checked)
          }
        />
      </label>

      <label className="settings-row">
        <span>
          <strong>入睡 / 起床过渡</strong>
          <small>入睡下沉、醒来伸懒腰</small>
        </span>
        <input
          type="checkbox"
          checked={animations.sleepTransitions}
          onChange={(event) =>
            onToggleAnimation("sleepTransitions", event.target.checked)
          }
        />
      </label>

      <label className="settings-row">
        <span>
          <strong>拖拽效果</strong>
          <small>被拎起来的悬挂姿态 + 落地弹跳</small>
        </span>
        <input
          type="checkbox"
          checked={animations.dragEffects}
          onChange={(event) =>
            onToggleAnimation("dragEffects", event.target.checked)
          }
        />
      </label>

      <label className="settings-row">
        <span>
          <strong>撸猫爱心</strong>
          <small>长按撸猫，冒小心心</small>
        </span>
        <input
          type="checkbox"
          checked={animations.petting}
          onChange={(event) =>
            onToggleAnimation("petting", event.target.checked)
          }
        />
      </label>

      <label className="settings-row">
        <span>
          <strong>视线跟随</strong>
          <small>身体朝鼠标方向轻微转头</small>
        </span>
        <input
          type="checkbox"
          checked={animations.gazeFollow}
          onChange={(event) =>
            onToggleAnimation("gazeFollow", event.target.checked)
          }
        />
      </label>

      <label className="settings-row">
        <span>
          <strong>逗猫棒互动</strong>
          <small>快速划动鼠标它会看过来；连续划动会扑着追</small>
        </span>
        <input
          type="checkbox"
          checked={animations.teasing}
          onChange={(event) =>
            onToggleAnimation("teasing", event.target.checked)
          }
        />
      </label>

      <label className="settings-row">
        <span>
          <strong>桌面散步</strong>
          <small>在屏幕内来回走；关闭后才会小憩入睡</small>
        </span>
        <input
          type="checkbox"
          checked={animations.walking}
          onChange={(event) =>
            onToggleAnimation("walking", event.target.checked)
          }
        />
      </label>

      <div className="settings-section-title">陪伴提醒</div>

      <label className="settings-row">
        <span>
          <strong>喝水提醒</strong>
          <small>每 {reminders.water.intervalMinutes} 分钟提醒一次</small>
        </span>
        <span className="settings-controls">
          <select
            className="settings-select"
            value={reminders.water.intervalMinutes}
            disabled={!reminders.water.enabled}
            aria-label="喝水提醒间隔"
            onChange={(event) =>
              onUpdateReminder("water", {
                intervalMinutes: Number(event.target.value),
              })
            }
          >
            <option value={30}>30 分钟</option>
            <option value={45}>45 分钟</option>
            <option value={60}>60 分钟</option>
            <option value={90}>90 分钟</option>
            <option value={120}>120 分钟</option>
          </select>
          <input
            type="checkbox"
            checked={reminders.water.enabled}
            aria-label="开启喝水提醒"
            onChange={(event) =>
              onUpdateReminder("water", { enabled: event.target.checked })
            }
          />
        </span>
      </label>

      <label className="settings-row">
        <span>
          <strong>久坐提醒</strong>
          <small>每 {reminders.sedentary.intervalMinutes} 分钟提醒活动一下</small>
        </span>
        <span className="settings-controls">
          <select
            className="settings-select"
            value={reminders.sedentary.intervalMinutes}
            disabled={!reminders.sedentary.enabled}
            aria-label="久坐提醒间隔"
            onChange={(event) =>
              onUpdateReminder("sedentary", {
                intervalMinutes: Number(event.target.value),
              })
            }
          >
            <option value={45}>45 分钟</option>
            <option value={60}>60 分钟</option>
            <option value={90}>90 分钟</option>
            <option value={120}>120 分钟</option>
            <option value={150}>150 分钟</option>
          </select>
          <input
            type="checkbox"
            checked={reminders.sedentary.enabled}
            aria-label="开启久坐提醒"
            onChange={(event) =>
              onUpdateReminder("sedentary", { enabled: event.target.checked })
            }
          />
        </span>
      </label>

      <label className="settings-row">
        <span>
          <strong>早睡提醒</strong>
          <small>每天 {reminders.sleep.time} 提醒你休息</small>
        </span>
        <span className="settings-controls">
          <select
            className="settings-select"
            value={reminders.sleep.time}
            disabled={!reminders.sleep.enabled}
            aria-label="早睡提醒时间"
            onChange={(event) =>
              onUpdateReminder("sleep", { time: event.target.value })
            }
          >
            <option value="22:00">22:00</option>
            <option value="22:30">22:30</option>
            <option value="23:00">23:00</option>
            <option value="23:30">23:30</option>
          </select>
          <input
            type="checkbox"
            checked={reminders.sleep.enabled}
            aria-label="开启早睡提醒"
            onChange={(event) =>
              onUpdateReminder("sleep", { enabled: event.target.checked })
            }
          />
        </span>
      </label>

      <div className="settings-row settings-scale">
        <div className="settings-scale-top">
          <span>
            <strong>大小</strong>
            <small>整体缩放（50%–200%），也可按住 Ctrl 在猫咪身上滚动滚轮</small>
          </span>
          <div className="settings-scale-stepper">
            <button
              className="settings-scale-btn"
              aria-label="缩小"
              disabled={scale <= MIN_SCALE}
              onClick={() => onScaleChange(scale - SCALE_STEP)}
            >
              −
            </button>
            <span className="settings-scale-value">{formatScale(scale)}</span>
            <button
              className="settings-scale-btn"
              aria-label="放大"
              disabled={scale >= MAX_SCALE}
              onClick={() => onScaleChange(scale + SCALE_STEP)}
            >
              +
            </button>
          </div>
        </div>
        <input
          className="settings-slider"
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={SCALE_SLIDER_STEP}
          value={scale}
          aria-label="桌宠大小"
          onChange={(event) => onScaleChange(Number(event.target.value))}
        />
      </div>

      <div className="settings-row settings-static">
        <span>
          <strong>操作</strong>
          <small>右键托盘图标：显示/隐藏 · 勿扰 · 设置 · 退出</small>
        </span>
      </div>

      <button className="settings-danger" onClick={onClearData}>
        清除所有数据
      </button>

      <div className="settings-footer">
        KittyPet v0.1.0 · 完全离线运行，不上传任何数据
      </div>
    </div>
  );
}
