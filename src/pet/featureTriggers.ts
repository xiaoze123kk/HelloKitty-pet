/** 连续戳鼻子的时间窗口；中间触碰其他部位会由状态机清空记录。 */
export const NOSE_CHAIN_WINDOW_MS = 1_800;

export type NoseResponseStage = "surprised" | "annoyed" | "sneeze";

function recentNoseTouches(previous: readonly number[], at: number): number[] {
  return previous.filter(
    (touchAt) =>
      Number.isFinite(touchAt) &&
      touchAt <= at &&
      at - touchAt <= NOSE_CHAIN_WINDOW_MS,
  );
}

/** 在下一次触碰发生前判断它应进入哪一段反馈。 */
export function noseResponseFor(
  previous: readonly number[],
  at: number,
): NoseResponseStage {
  const count = recentNoseTouches(previous, at).length + 1;
  if (count >= 3) return "sneeze";
  if (count === 2) return "annoyed";
  return "surprised";
}

/** 只保留可继续形成链路的最近鼻子触碰，避免持久化无界增长。 */
export function recordNoseTouch(previous: readonly number[], at: number): number[] {
  return [...recentNoseTouches(previous, at), at].slice(-3);
}
