import type { DialogueDisplay } from "../dialogue/types";

interface SpeechBubbleProps {
  dialogue: DialogueDisplay | null;
  /** followUp 阶段为 true，用于让气泡"换一句话"的停顿效果 */
  followUp: boolean;
}

export function SpeechBubble({ dialogue, followUp }: SpeechBubbleProps) {
  if (!dialogue) return null;
  return (
    <div className={`bubble bubble-${dialogue.emotion}`} key={`${dialogue.id}-${followUp ? 2 : 1}`}>
      <div className="bubble-text">{followUp ? dialogue.followUpText : dialogue.text}</div>
      <div className="bubble-tail" />
    </div>
  );
}
