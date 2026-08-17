import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import {
  availableMonitors,
  getCurrentWindow,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { clampScale, DEFAULT_SCALE } from "../pet/zoom";
import type { PetPreferences, PrefStore } from "../storage/preferences";

const EDGE_MARGIN_X = 24;
const EDGE_MARGIN_Y = 56;

/** 布局按 300x320 CSS 像素设计 */
export const WINDOW_CSS_WIDTH = 300;
export const WINDOW_CSS_HEIGHT = 320;

export const appWindow = getCurrentWindow();

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
async function keepWindowOnScreen(): Promise<void> {
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
