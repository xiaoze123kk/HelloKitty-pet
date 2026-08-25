import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import {
  availableMonitors,
  getCurrentWindow,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { clampScale, DEFAULT_SCALE } from "../pet/zoom";
import type { PetPreferences, PrefStore } from "../storage/preferences";
import {
  computeEdgePeekPlacement,
  type PeekEdge,
} from "./edgePeek";

const EDGE_MARGIN_X = 24;
const EDGE_MARGIN_Y = 56;

/** 散步/追逐每 40ms 移动一步，显示器信息不需要每次都走 IPC */
const MONITOR_CACHE_TTL_MS = 2_000;

interface MonitorCacheEntry {
  at: number;
  monitors: Monitor[];
}

let monitorCache: MonitorCacheEntry | null = null;

async function getMonitorsCached(): Promise<Monitor[]> {
  const now = Date.now();
  if (monitorCache && now - monitorCache.at < MONITOR_CACHE_TTL_MS) {
    return monitorCache.monitors;
  }
  try {
    const monitors = await availableMonitors();
    monitorCache = { at: now, monitors };
    return monitors;
  } catch (error) {
    console.error("query monitors failed:", error);
    return monitorCache?.monitors ?? [];
  }
}

function findMonitorAt(
  monitors: Monitor[],
  x: number,
  y: number,
): Monitor | undefined {
  return monitors.find((monitor) => {
    const left = monitor.position.x;
    const top = monitor.position.y;
    return (
      x >= left &&
      x <= left + monitor.size.width &&
      y >= top &&
      y <= top + monitor.size.height
    );
  });
}

/** 布局按 300x320 CSS 像素设计 */
export const WINDOW_CSS_WIDTH = 300;
export const WINDOW_CSS_HEIGHT = 320;

export const appWindow = getCurrentWindow();

export interface EdgePeekSession {
  edge: PeekEdge;
  origin: { x: number; y: number };
}

async function animateWindowPosition(
  from: { x: number; y: number },
  to: { x: number; y: number },
  durationMs: number,
): Promise<void> {
  const started = performance.now();
  while (true) {
    const elapsed = performance.now() - started;
    const t = Math.min(1, elapsed / durationMs);
    const eased = 0.5 - Math.cos(Math.PI * t) / 2;
    await appWindow.setPosition(
      new PhysicalPosition(
        Math.round(from.x + (to.x - from.x) * eased),
        Math.round(from.y + (to.y - from.y) * eased),
      ),
    );
    if (t >= 1) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 28));
  }
}

/**
 * 从当前最近的显示器边缘藏起大部分窗口。远离边缘时返回 null，调用方应
 * 回退到普通 peek 动作。位置恢复由 finishEdgePeek 负责。
 */
export async function beginEdgePeek(): Promise<EdgePeekSession | null> {
  const monitors = await getMonitorsCached();
  if (monitors.length === 0) return null;
  const [pos, size] = await Promise.all([
    appWindow.outerPosition(),
    appWindow.outerSize(),
  ]);
  const centerX = pos.x + size.width / 2;
  const centerY = pos.y + size.height / 2;
  const monitor =
    findMonitorAt(monitors, centerX, centerY) ??
    (await primaryMonitor().catch(() => null)) ??
    monitors[0];
  const dpr = window.devicePixelRatio || 1;
  const placement = computeEdgePeekPlacement(
    { x: pos.x, y: pos.y, width: size.width, height: size.height },
    {
      x: monitor.position.x,
      y: monitor.position.y,
      width: monitor.size.width,
      height: monitor.size.height,
    },
    96 * dpr,
    142 * dpr,
  );
  if (!placement) return null;
  await animateWindowPosition(
    { x: pos.x, y: pos.y },
    { x: placement.x, y: placement.y },
    360,
  );
  return { edge: placement.edge, origin: { x: pos.x, y: pos.y } };
}

export async function finishEdgePeek(session: EdgePeekSession): Promise<void> {
  const current = await appWindow.outerPosition();
  await animateWindowPosition(
    { x: current.x, y: current.y },
    session.origin,
    420,
  );
}

/**
 * 让 WebView 视口恒为 300x320 CSS 像素 × 桌宠缩放比例。
 *
 * 必须用 window.devicePixelRatio 而不是 Tauri 的 scaleFactor()：
 * Windows 辅助功能"文本大小"(TextScaleFactor) 也会改变 WebView2 的
 * dpr（例如 100% DPI + 128% 文本缩放 → dpr=1.28），但 Tauri 侧
 * scaleFactor() 只反映系统 DPI（返回 1.0），会漏掉文本缩放。
 */
export async function syncWindowSizeToViewport(
  scale: number = DEFAULT_SCALE,
): Promise<void> {
  try {
    const safeScale = clampScale(scale);
    const dpr = window.devicePixelRatio || 1;
    await appWindow.setSize(
      new PhysicalSize(
        Math.max(1, Math.round(WINDOW_CSS_WIDTH * safeScale * dpr)),
        Math.max(1, Math.round(WINDOW_CSS_HEIGHT * safeScale * dpr)),
      ),
    );
  } catch (error) {
    console.error("sync window size to viewport failed:", error);
  }
}

/**
 * 按比例缩放整个窗口：
 * - 以窗口中心为锚点，放大/缩小时桌宠视觉上保持"原地生长"
 * - 缩放后若超出屏幕边界，平移回最近的显示器内
 */
export async function setWindowScale(scale: number): Promise<void> {
  let center: { x: number; y: number } | null = null;
  try {
    const [pos, size] = await Promise.all([
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]);
    center = { x: pos.x + size.width / 2, y: pos.y + size.height / 2 };
  } catch (error) {
    console.error("read window geometry for scaling failed:", error);
  }

  await syncWindowSizeToViewport(scale);

  if (center) {
    try {
      const size = await appWindow.outerSize();
      await appWindow.setPosition(
        new PhysicalPosition(
          Math.round(center.x - size.width / 2),
          Math.round(center.y - size.height / 2),
        ),
      );
    } catch (error) {
      console.error("re-center window after scaling failed:", error);
    }
  }

  await keepWindowOnScreen();
}

/**
 * 若窗口有任何部分落在屏幕外，把它平移回包含中心点的显示器内。
 * 与 restorePosition 的 clampToVisibleMonitors 不同：这里保证"整窗可见"，
 * 避免放大后桌宠被切掉一半。
 */
export async function keepWindowOnScreen(): Promise<void> {
  try {
    const monitors = await availableMonitors();
    if (monitors.length === 0) return;

    const [pos, size] = await Promise.all([
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]);
    const centerX = pos.x + size.width / 2;
    const centerY = pos.y + size.height / 2;

    const containing =
      monitors.find((monitor) => {
        const left = monitor.position.x;
        const top = monitor.position.y;
        const right = left + monitor.size.width;
        const bottom = top + monitor.size.height;
        return (
          centerX >= left &&
          centerX <= right &&
          centerY >= top &&
          centerY <= bottom
        );
      }) ??
      (await primaryMonitor().catch(() => null)) ??
      monitors[0];

    const minX = containing.position.x;
    const minY = containing.position.y;
    const maxX = containing.position.x + containing.size.width - size.width;
    const maxY = containing.position.y + containing.size.height - size.height;

    // Math.max(..., ...) 防止"窗口比显示器还大"时 min > max
    const x = Math.min(Math.max(pos.x, minX), Math.max(minX, maxX));
    const y = Math.min(Math.max(pos.y, minY), Math.max(minY, maxY));

    if (x !== pos.x || y !== pos.y) {
      await appWindow.setPosition(
        new PhysicalPosition(Math.round(x), Math.round(y)),
      );
    }
  } catch (error) {
    console.error("keep window on screen failed:", error);
  }
}

/** 散步模式每步移动的物理像素（40ms 一步，约 75px/s @100% DPI） */
const WALK_STEP_PX = 3;

/**
 * 散步模式沿水平方向移动一步；碰到所在显示器的左右边界自动折返。
 * 返回新的方向（1 = 向右，-1 = 向左），调用方负责保存。
 */
export async function walkStep(direction: 1 | -1): Promise<1 | -1> {
  try {
    const monitors = await getMonitorsCached();
    if (monitors.length === 0) return direction;

    const [pos, size] = await Promise.all([
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]);
    const centerX = pos.x + size.width / 2;
    const centerY = pos.y + size.height / 2;

    const monitor =
      findMonitorAt(monitors, centerX, centerY) ??
      (await primaryMonitor().catch(() => null)) ??
      monitors[0];

    const minX = monitor.position.x;
    const maxX = Math.max(minX, monitor.position.x + monitor.size.width - size.width);

    let nextDirection = direction;
    let x = pos.x + direction * WALK_STEP_PX;
    if (x <= minX) {
      x = minX;
      nextDirection = 1;
    } else if (x >= maxX) {
      x = maxX;
      nextDirection = -1;
    }

    await appWindow.setPosition(new PhysicalPosition(Math.round(x), pos.y));
    return nextDirection;
  } catch (error) {
    console.error("walk step failed:", error);
    return direction;
  }
}

/** 追逐模式每步最大 / 最小移动量（CSS 像素，40ms 一步：最高约 200px/s） */
const CHASE_MAX_STEP_CSS_PX = 8;
const CHASE_MIN_STEP_CSS_PX = 2;

/**
 * 追逐模式朝目标点移动一步（水平 + 垂直）。
 * 步长随距离衰减：离得远每步走满 8 CSS px，靠近时变小，
 * 到达后不再抖动；移动范围钳制在窗口所在显示器内。
 */
export async function chaseStep(
  targetX: number,
  targetY: number,
): Promise<{ dx: number; dy: number; distance: number; arrived: boolean }> {
  const zero = { dx: 0, dy: 0, distance: 0, arrived: false };
  try {
    const monitors = await getMonitorsCached();
    if (monitors.length === 0) return zero;

    const [pos, size] = await Promise.all([
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]);
    const centerX = pos.x + size.width / 2;
    const centerY = pos.y + size.height / 2;
    const distance = Math.hypot(targetX - centerX, targetY - centerY);

    // 用视口 DPI 归一化：不同缩放 / DPI 屏幕上追逐手感一致
    const dpr = window.devicePixelRatio || 1;
    const dxCss = (targetX - centerX) / dpr;
    const dyCss = (targetY - centerY) / dpr;
    const distanceCss = Math.hypot(dxCss, dyCss);
    if (distanceCss < 0.5) return { ...zero, distance, arrived: true };

    const arrived = distanceCss <= CHASE_MAX_STEP_CSS_PX;
    const stepCss = Math.min(
      CHASE_MAX_STEP_CSS_PX,
      Math.max(CHASE_MIN_STEP_CSS_PX, distanceCss * 0.22),
    );
    const travelCss = arrived ? distanceCss : stepCss;
    const nextCenterX = centerX + (dxCss / distanceCss) * travelCss * dpr;
    const nextCenterY = centerY + (dyCss / distanceCss) * travelCss * dpr;

    const monitor =
      findMonitorAt(monitors, centerX, centerY) ??
      (await primaryMonitor().catch(() => null)) ??
      monitors[0];
    const minX = monitor.position.x;
    const maxX = Math.max(
      minX,
      monitor.position.x + monitor.size.width - size.width,
    );
    const minY = monitor.position.y;
    const maxY = Math.max(
      minY,
      monitor.position.y + monitor.size.height - size.height,
    );

    const x = Math.min(Math.max(nextCenterX - size.width / 2, minX), maxX);
    const y = Math.min(Math.max(nextCenterY - size.height / 2, minY), maxY);
    if (x !== pos.x || y !== pos.y) {
      await appWindow.setPosition(
        new PhysicalPosition(Math.round(x), Math.round(y)),
      );
    }
    return { dx: x - pos.x, dy: y - pos.y, distance, arrived };
  } catch (error) {
    console.error("chase step failed:", error);
    return zero;
  }
}

export async function applyAlwaysOnTop(value: boolean): Promise<void> {
  await appWindow.setAlwaysOnTop(value);
}

export async function restorePosition(
  prefs: PetPreferences,
): Promise<void> {
  if (prefs.position) {
    try {
      await appWindow.setPosition(
        new PhysicalPosition(prefs.position.x, prefs.position.y),
      );
    } catch (error) {
      console.error("restore position failed:", error);
    }
  } else {
    // 第一次运行：放在主显示器右下角（靠近托盘，更像桌宠）
    try {
      const monitors = await availableMonitors();
      const primary = (await primaryMonitor().catch(() => null)) ?? monitors[0];
      if (primary) {
        const size = await appWindow.outerSize();
        const x =
          primary.position.x + primary.size.width - size.width - EDGE_MARGIN_X;
        const y =
          primary.position.y +
          primary.size.height -
          size.height -
          EDGE_MARGIN_Y;
        await appWindow.setPosition(
          new PhysicalPosition(Math.round(x), Math.round(y)),
        );
      }
    } catch (error) {
      console.error("place default position failed:", error);
    }
  }
  await clampToVisibleMonitors();
}

/**
 * 窗口中心点不在任何显示器内时，把它放回主显示器右下角。
 * 覆盖：显示器拔插、分辨率变化、主屏切换、负坐标多屏布局。
 */
export async function clampToVisibleMonitors(): Promise<void> {
  try {
    const monitors = await availableMonitors();
    if (monitors.length === 0) return;

    const [pos, size] = await Promise.all([
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]);
    const centerX = pos.x + size.width / 2;
    const centerY = pos.y + size.height / 2;

    const visible = monitors.some((monitor) => {
      const left = monitor.position.x;
      const top = monitor.position.y;
      const right = left + monitor.size.width;
      const bottom = top + monitor.size.height;
      return (
        centerX >= left && centerX <= right && centerY >= top && centerY <= bottom
      );
    });

    if (!visible) {
      const primary = await primaryMonitor().catch(() => monitors[0]);
      const target = primary ?? monitors[0];
      const x = target.position.x + target.size.width - size.width - EDGE_MARGIN_X;
      const y =
        target.position.y + target.size.height - size.height - EDGE_MARGIN_Y;
      await appWindow.setPosition(
        new PhysicalPosition(Math.round(x), Math.round(y)),
      );
    }
  } catch (error) {
    console.error("clamp window position failed:", error);
  }
}

export async function savePositionToPrefs(
  store: PrefStore,
  prefs: PetPreferences,
): Promise<void> {
  try {
    const pos = await appWindow.outerPosition();
    prefs.position = { x: pos.x, y: pos.y };
    await store.set("pet", prefs);
    await store.save();
  } catch (error) {
    console.error("save position failed:", error);
  }
}
