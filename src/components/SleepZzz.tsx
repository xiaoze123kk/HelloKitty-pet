import type { PetVisualMotion } from "../pet/animationManifest";

/**
 * 睡觉时的 Zzz 气泡：纯装饰，pointer-events 由 CSS 关闭，不挡拖拽/点击。
 * 只在“正在入睡”（fallAsleep，小 z）和“已经睡着”（sleep，大 ZZZ）出现；
 * sleepy（困倦）阶段不显示，避免“有 ZZZ 却没睡着”的误解。
 */
export function SleepZzz({ motion }: { motion: PetVisualMotion }) {
  if (motion === "fallAsleep") {
    return (
      <div className="sleep-zzz sleep-zzz-small" aria-hidden="true">
        <span className="sleep-z">z</span>
      </div>
    );
  }

  if (motion !== "sleep") return null;

  return (
    <div className="sleep-zzz" aria-hidden="true">
      <span className="sleep-z sleep-z-1">z</span>
      <span className="sleep-z sleep-z-2">z</span>
      <span className="sleep-z sleep-z-3">z</span>
    </div>
  );
}
