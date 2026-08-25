import {
  normalizeUserMemories,
  type UserMemory,
} from "../memory/userMemory";
import {
  normalizeRitualState,
  type RitualStateData,
} from "../relationship/reactionEngine";

export const PROGRESS_VERSION = 4 as const;

export interface ProgressV4Fields {
  version: typeof PROGRESS_VERSION;
  userMemories: UserMemory[];
  rituals: RitualStateData;
}

/**
 * v0.7–v0.8 新字段的纯迁移边界。旧版 progress 没有用户记忆与仪式记录，
 * 非法或超限数据都在这里收敛，避免把损坏内容带进运行时状态。
 */
export function migrateProgressV4Fields(
  raw: { userMemories?: unknown; rituals?: unknown } | null | undefined,
): ProgressV4Fields {
  return {
    version: PROGRESS_VERSION,
    userMemories: normalizeUserMemories(raw?.userMemories),
    rituals: normalizeRitualState(raw?.rituals),
  };
}
