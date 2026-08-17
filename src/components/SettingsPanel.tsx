import {
  formatScale,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_SLIDER_STEP,
  SCALE_STEP,
} from "../pet/zoom";

interface SettingsPanelProps {
  open: boolean;
  alwaysOnTop: boolean;
  dnd: boolean;
  autostart: boolean;
  autostartSupported: boolean;
  scale: number;
  onClose: () => void;
  onToggleAlwaysOnTop: (value: boolean) => void;
  onToggleDnd: (value: boolean) => void;
  onToggleAutostart: (value: boolean) => void;
  onScaleChange: (value: number) => void;
  onClearData: () => void;
}

export function SettingsPanel({
  open,
  alwaysOnTop,
  dnd,
  autostart,
  autostartSupported,
  scale,
  onClose,
  onToggleAlwaysOnTop,
  onToggleDnd,
  onToggleAutostart,
  onScaleChange,
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
          <small>让 Kitty 一直浮在其它窗口上方</small>
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

      <div className="settings-row settings-scale">
        <div className="settings-scale-top">
          <span>
            <strong>大小</strong>
            <small>整体缩放，也可按住 Ctrl 在猫咪身上滚轮</small>
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
          <small>右键托盘图标：显示/隐藏 · 暂停 · 设置 · 退出</small>
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
