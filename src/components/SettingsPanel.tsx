interface SettingsPanelProps {
  open: boolean;
  alwaysOnTop: boolean;
  dnd: boolean;
  autostart: boolean;
  autostartSupported: boolean;
  onClose: () => void;
  onToggleAlwaysOnTop: (value: boolean) => void;
  onToggleDnd: (value: boolean) => void;
  onToggleAutostart: (value: boolean) => void;
  onClearData: () => void;
}

export function SettingsPanel({
  open,
  alwaysOnTop,
  dnd,
  autostart,
  autostartSupported,
  onClose,
  onToggleAlwaysOnTop,
  onToggleDnd,
  onToggleAutostart,
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
