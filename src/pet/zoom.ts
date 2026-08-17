/** 桌宠整体缩放范围与工具函数 */

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2;
export const DEFAULT_SCALE = 1;

/** 设置面板 / 加减按钮使用的步长 */
export const SCALE_STEP = 0.1;

/** 滑杆使用的步长（比按钮更细腻） */
export const SCALE_SLIDER_STEP = 0.05;

/** 把任意输入收敛到合法的缩放比例（去浮点尾差） */
export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SCALE;
  const rounded = Number(value.toFixed(2));
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, rounded));
}

/** 显示用：1 → "100%"，1.25 → "125%" */
export function formatScale(scale: number): string {
  return `${Math.round(clampScale(scale) * 100)}%`;
}
