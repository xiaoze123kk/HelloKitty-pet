import type { DialogueDisplay } from "../dialogue/types";

interface SpeechBubbleProps {
  dialogue: DialogueDisplay | null;
  /** followUp 阶段为 true，用于让气泡"换一句话"的停顿效果 */
  followUp: boolean;
}

/** 系统提醒气泡的图标装饰：跟台词一起出现，让提醒更有"表情" */
const BUBBLE_ACCENTS: Record<string, string> = {
  system_water: "💧",
  system_sedentary: "🚶",
  system_sleep: "🌙",
  system_morning_greet: "🌞",
};

export function SpeechBubble({ dialogue, followUp }: SpeechBubbleProps) {
  if (!dialogue) return null;
  const accent = BUBBLE_ACCENTS[dialogue.id];
  return (
    <div className={`bubble bubble-${dialogue.emotion}`} key={`${dialogue.id}-${followUp ? 2 : 1}`}>
      {accent && (
        <span className="bubble-accent" aria-hidden="true">
          {accent}
        </span>
      )}
      <div className="bubble-text">{followUp ? dialogue.followUpText : dialogue.text}</div>
      <div className="bubble-tail" />
    </div>
  );
}
