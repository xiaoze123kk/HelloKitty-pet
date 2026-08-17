import { useEffect, useState } from "react";
import type { PetVisualMotion } from "../pet/animationManifest";
import {
  buildMotionSpecJson,
  getMotionSpecByKey,
  getSpecKey,
  setMotionSpecOverride,
  type EaseName,
  type MotionKeyframe,
  type ProceduralMotionSpec,
} from "../pet/proceduralMotion";

interface MotionDebugPanelProps {
  motion: PetVisualMotion;
  onClose?: () => void;
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: NumberFieldProps) {
  return (
    <label className="motion-debug-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </label>
  );
}

/**
 * 开发期动作调参面板（Ctrl+Shift+D 开关）：
 * - 实时修改当前动作的 fps / ease / 每帧 scale、scaleY、angle、dy、brightness
 * - 修改立即通过 motion-spec override 生效（不落盘）
 * - 满意后「复制 JSON」粘贴回 src/assets/pet/motion-spec.json
 */
export function MotionDebugPanel({
  motion,
  onClose,
}: MotionDebugPanelProps) {
  const specKey = getSpecKey(motion);
  const [draft, setDraft] = useState<ProceduralMotionSpec>(() =>
    structuredClone(getMotionSpecByKey(specKey)),
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraft(structuredClone(getMotionSpecByKey(specKey)));
    setCopied(false);
  }, [motion, specKey]);

  const commit = (next: ProceduralMotionSpec) => {
    setDraft(next);
    setMotionSpecOverride(specKey, next);
  };

  const updateKeyframe = (
    frameIndex: number,
    field: keyof MotionKeyframe,
    value: number,
  ) => {
    if (!draft) return;
    commit({
      ...draft,
      keyframes: draft.keyframes.map((keyframe, index) =>
        index === frameIndex ? { ...keyframe, [field]: value } : keyframe,
      ),
    });
  };

  const copyJson = () => {
    void navigator.clipboard.writeText(buildMotionSpecJson()).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    });
  };

  const reset = () => {
    setMotionSpecOverride(specKey, null);
    setDraft(structuredClone(getMotionSpecByKey(specKey)));
  };

  if (!draft) return null;

  const hasBrightness = draft.keyframes.some(
    (keyframe) => keyframe.brightness !== undefined,
  );

  return (
    <div className="motion-debug-panel">
      <div className="motion-debug-header">
        <span>
          <strong>动作调参</strong>
          <small>
            当前动作：{specKey}（实时生效，不写文件）
          </small>
        </span>
        <button onClick={onClose} aria-label="关闭调参面板">
          ✕
        </button>
      </div>

      <div className="motion-debug-row">
        <label className="motion-debug-field">
          <span>fps</span>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={draft.fps}
            onChange={(event) =>
              commit({ ...draft, fps: Number(event.target.value) })
            }
          />
          <small>{draft.fps}</small>
        </label>
        <label className="motion-debug-field">
          <span>ease</span>
          <select
            value={draft.ease}
            onChange={(event) =>
              commit({ ...draft, ease: event.target.value as EaseName })
            }
          >
            <option value="linear">linear</option>
            <option value="sineInOut">sineInOut</option>
          </select>
        </label>
      </div>

      <div className="motion-debug-frames">
        {draft.keyframes.map((keyframe, index) => (
          <div className="motion-debug-frame" key={index}>
            <span className="motion-debug-frame-index">#{index + 1}</span>
            {hasBrightness ? (
              <NumberField
                label="brightness"
                value={keyframe.brightness ?? 1}
                min={0.2}
                max={1}
                step={0.01}
                onChange={(value) =>
                  updateKeyframe(index, "brightness", value)
                }
              />
            ) : (
              <>
                <NumberField
                  label="scale"
                  value={keyframe.scale ?? 1}
                  min={0.5}
                  max={1.3}
                  step={0.005}
                  onChange={(value) => updateKeyframe(index, "scale", value)}
                />
                <NumberField
                  label="scaleY"
                  value={keyframe.scaleY ?? keyframe.scale ?? 1}
                  min={0.5}
                  max={1.3}
                  step={0.005}
                  onChange={(value) =>
                    updateKeyframe(index, "scaleY", value)
                  }
                />
                <NumberField
                  label="angle"
                  value={keyframe.angle ?? 0}
                  min={-20}
                  max={20}
                  step={0.5}
                  onChange={(value) => updateKeyframe(index, "angle", value)}
                />
                <NumberField
                  label="dy"
                  value={keyframe.dy ?? 0}
                  min={-40}
                  max={40}
                  step={0.5}
                  onChange={(value) => updateKeyframe(index, "dy", value)}
                />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="motion-debug-actions">
        <button onClick={copyJson}>
          {copied ? "已复制 ✓" : "复制 motion-spec.json"}
        </button>
        <button onClick={reset}>重置当前动作</button>
      </div>
    </div>
  );
}
