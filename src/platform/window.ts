import { PhysicalPosition } from "@tauri-apps/api/dpi";
import {
  availableMonitors,
  getCurrentWindow,
  primaryMonitor,
} from "@tauri-apps/api/window";
import type { PetPreferences, PrefStore } from "../storage/preferences";

const EDGE_MARGIN_X = 24;
const EDGE_MARGIN_Y = 56;

export const appWindow = getCurrentWindow();

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
