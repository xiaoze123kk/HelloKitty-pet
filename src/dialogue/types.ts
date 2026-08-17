export type Emotion =
  | "neutral"
  | "happy"
  | "shy"
  | "sleepy"
  | "concerned";

export type Motion = "idle" | "wave" | "shy" | "sleep" | "happy";

export type TriggerType =
  | "firstLaunch"
  | "timeRange"
  | "click"
  | "rapidClick"
  | "dragEnd"
  | "sessionDuration"
  | "specialDate"
  | "streak"
  | "random";

export interface DialogueTrigger {
  type: TriggerType;
  /** 仅 timeRange：morning / noon / night */
  rangeKey?: "morning" | "noon" | "night";
  /** 仅 rapidClick：达到该连击数后可用 */
  minClicks?: number;
  /** 仅 sessionDuration：运行达到该分钟数后可用 */
  minutes?: number;
  /** 仅 specialDate：绑定的纪念日 id */
  specialDateId?: string;
  /** 仅 streak：连续打开天数达到该值后可用 */
  minStreak?: number;
}

export interface DialogueEntry {
  id: string;
  text: string;
  /** 可选第二句话：第一句展示约 3 秒后接上（用于"稀有彩蛋"的停顿效果） */
  followUpText?: string;
  emotion: Emotion;
  motion: Motion;
  priority: number;
  trigger: DialogueTrigger;
  /** 分钟；同一条对白两次展示的最小间隔 */
  cooldownMinutes?: number;
  /** 同一条对白每天最多展示次数 */
  dailyLimit?: number;
  /** 同优先级内的随机权重，默认 1 */
  weight?: number;
  tags?: string[];
  /** 一生只展示一次 */
  onlyOnce?: boolean;
  /** 从第几天起可解锁（用于四层内容节奏） */
  unlockDay?: number;
}

export interface DialogueDisplay {
  id: string;
  text: string;
  followUpText?: string;
  emotion: Emotion;
  motion: Motion;
}

export type TriggerContext =
  | { type: "firstLaunch" }
  | { type: "timeRange"; rangeKey: "morning" | "noon" | "night"; hour: number }
  | { type: "click" }
  | { type: "rapidClick"; count: number }
  | { type: "dragEnd" }
  | { type: "sessionDuration"; minutes: number }
  | { type: "specialDate"; specialDateId: string; label: string }
  | { type: "streak"; streak: number }
  | { type: "random" };

export interface SpecialDate {
  id: string;
  month: number;
  day: number;
  label: string;
}

export interface ProfileData {
  nickname: string;
  yourNickname: string;
  specialDates: SpecialDate[];
}
