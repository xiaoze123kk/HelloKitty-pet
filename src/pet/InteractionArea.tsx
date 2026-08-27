import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

import {
  clampPetFramePoint,
  classifyTouchTarget,
  type AccessoryHitRegion,
  type PetTouchInteraction,
} from "./touchZones";
import {
  releaseFromDragMotion,
  sampleDragMotion,
  STILL_DRAG_MOTION,
  type DragMotion,
  type DragRelease,
  type DragWindowSample,
} from "./dragDynamics";

interface InteractionAreaProps {
  children: ReactNode;
  disabled?: boolean;
  accessoryHitRegion?: AccessoryHitRegion | null;
  /** 普通点击（未触发长按/拖拽），附带点击部位 */
  onClick: (interaction: PetTouchInteraction) => void;
  onDragStart: () => void;
  onDragMotion?: (motion: DragMotion) => void;
  onDragEnd: (release: DragRelease) => void;
  onOpenSettings: () => void;
  /** Ctrl+滚轮缩放（deltaY < 0 放大，> 0 缩小） */
  onWheelZoom?: (deltaY: number) => void;
  /** 按住超过阈值未移动：开始撸猫 */
  onHoldStart?: () => void;
  /** 撸猫松手 / 被拖拽打断：结束撸猫 */
  onHoldEnd?: () => void;
  /** 光标进入 / 离开宠物热区，用于低频 curious 反馈 */
  onPointerNear?: () => void;
  onPointerLeave?: () => void;
}

const DRAG_THRESHOLD_PX = 6;
const DRAG_BUTTON_POLL_MS = 30;
const DRAG_BUTTON_POLL_GRACE_MS = 80;
const DRAG_RELEASE_CONFIRMATIONS = 2;
const DRAG_END_QUIET_FALLBACK_MS = 700;
const HOLD_THRESHOLD_MS = 650;

/**
 * 点击 / 拖拽二合一区域：
 * - 按住并移动超过阈值 → 显式调用 Tauri startDragging() 开始原生窗口拖拽
 * - 不使用 data-tauri-drag-region：Tauri 注入脚本会在每次 mousedown
 *   直接开始拖拽 / 双击最大化，连点会被系统手势吞掉
 * - 按下后未移动就松开 → CLICK
 * - 原生拖拽可能吞掉 mouseup，轮询 Windows 主鼠标键并双确认松开后发 DRAG_END
 * - 只有主键探测 IPC 失败时才退回 700ms onMoved 静默兜底
 * - 右键 → 打开设置
 */
export function InteractionArea({
  children,
  disabled,
  accessoryHitRegion,
  onClick,
  onDragStart,
  onDragMotion,
  onDragEnd,
  onOpenSettings,
  onWheelZoom,
  onHoldStart,
  onHoldEnd,
  onPointerNear,
  onPointerLeave,
}: InteractionAreaProps) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const downRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const draggingRef = useRef(false);
  const holdingRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const lastMovedAtRef = useRef(0);
  const startedByMoveRef = useRef(false);
  const lastWindowSampleRef = useRef<DragWindowSample | null>(null);
  const lastDragMotionRef = useRef<DragMotion>(STILL_DRAG_MOTION);
  const dragStartedAtRef = useRef(0);
  const releaseConfirmationRef = useRef(0);
  const buttonProbeInFlightRef = useRef(false);
  const buttonProbeFailedRef = useRef(false);
  const dragSessionRef = useRef(0);

  const onClickRef = useRef(onClick);
  const onDragStartRef = useRef(onDragStart);
  const onDragMotionRef = useRef(onDragMotion);
  const onDragEndRef = useRef(onDragEnd);
  const onWheelZoomRef = useRef(onWheelZoom);
  const onHoldStartRef = useRef(onHoldStart);
  const onHoldEndRef = useRef(onHoldEnd);
  const onPointerNearRef = useRef(onPointerNear);
  const onPointerLeaveRef = useRef(onPointerLeave);
  const disabledRef = useRef(disabled);
  onClickRef.current = onClick;
  onDragStartRef.current = onDragStart;
  onDragMotionRef.current = onDragMotion;
  onDragEndRef.current = onDragEnd;
  onWheelZoomRef.current = onWheelZoom;
  onHoldStartRef.current = onHoldStart;
  onHoldEndRef.current = onHoldEnd;
  onPointerNearRef.current = onPointerNear;
  onPointerLeaveRef.current = onPointerLeave;
  disabledRef.current = disabled;

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    // React 的 onWheel 默认挂 passive 监听，无法 preventDefault，
    // 因此用原生监听拦截 WebView 的 Ctrl+滚轮页面缩放。
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey || disabledRef.current) return;
      event.preventDefault();
      onWheelZoomRef.current?.(event.deltaY);
    }

    area.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      area.removeEventListener("wheel", handleWheel);
    };
  }, []);

  useEffect(() => {
    let unlistenMoved: (() => void) | undefined;
    let disposed = false;
    appWindow.onMoved(({ payload: position }) => {
      lastMovedAtRef.current = Date.now();
      if (downRef.current && !draggingRef.current) {
        // 原生拖拽开始：打断可能已触发的长按撸猫
        if (holdingRef.current) {
          holdingRef.current = false;
          onHoldEndRef.current?.();
        }
        draggingRef.current = true;
        startedByMoveRef.current = true;
        dragStartedAtRef.current = Date.now();
        releaseConfirmationRef.current = 0;
        onDragStartRef.current();
      }
      if (!draggingRef.current) return;

      const current: DragWindowSample = {
        x: position.x,
        y: position.y,
        at: performance.now(),
      };
      const previous = lastWindowSampleRef.current;
      lastWindowSampleRef.current = current;
      if (!previous) return;

      const motion = sampleDragMotion(
        previous,
        current,
        lastDragMotionRef.current,
        window.devicePixelRatio || 1,
      );
      lastDragMotionRef.current = motion;
      onDragMotionRef.current?.(motion);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlistenMoved = unlisten;
      }
    });

    // 原生拖拽期间 WebView 可能收不到 mouseup。直接读取 Windows 主鼠标键，
    // 连续两次确认松开后落地；这样按住不动不会被短静默阈值误判。
    const timer = window.setInterval(() => {
      if (!draggingRef.current) return;
      const now = Date.now();
      if (buttonProbeFailedRef.current) {
        if (now - lastMovedAtRef.current > DRAG_END_QUIET_FALLBACK_MS) {
          finishDrag();
        }
        return;
      }
      if (
        now - dragStartedAtRef.current < DRAG_BUTTON_POLL_GRACE_MS ||
        buttonProbeInFlightRef.current
      ) {
        return;
      }

      buttonProbeInFlightRef.current = true;
      const probeSession = dragSessionRef.current;
      void invoke<boolean>("is_primary_mouse_button_pressed")
        .then((pressed) => {
          if (
            probeSession !== dragSessionRef.current ||
            !draggingRef.current
          ) {
            return;
          }
          if (pressed) {
            releaseConfirmationRef.current = 0;
            return;
          }
          releaseConfirmationRef.current += 1;
          if (releaseConfirmationRef.current >= DRAG_RELEASE_CONFIRMATIONS) {
            finishDrag();
          }
        })
        .catch((error) => {
          if (probeSession !== dragSessionRef.current) return;
          buttonProbeFailedRef.current = true;
          console.error("primary mouse button probe failed:", error);
        })
        .finally(() => {
          if (probeSession === dragSessionRef.current) {
            buttonProbeInFlightRef.current = false;
          }
        });
    }, DRAG_BUTTON_POLL_MS);

    return () => {
      disposed = true;
      unlistenMoved?.();
      window.clearInterval(timer);
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, []);

  function resetDragMotion() {
    dragSessionRef.current += 1;
    lastWindowSampleRef.current = null;
    lastDragMotionRef.current = STILL_DRAG_MOTION;
    dragStartedAtRef.current = 0;
    releaseConfirmationRef.current = 0;
    buttonProbeInFlightRef.current = false;
    buttonProbeFailedRef.current = false;
    onDragMotionRef.current?.(STILL_DRAG_MOTION);
  }

  function finishDrag() {
    if (!draggingRef.current && !startedByMoveRef.current) return;
    const release = releaseFromDragMotion(lastDragMotionRef.current);
    draggingRef.current = false;
    startedByMoveRef.current = false;
    downRef.current = null;
    lastWindowSampleRef.current = null;
    lastDragMotionRef.current = STILL_DRAG_MOTION;
    onDragEndRef.current(release);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    if (event.button !== 0) return;
    downRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
    draggingRef.current = false;
    startedByMoveRef.current = false;
    resetDragMotion();
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
    }
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (downRef.current && !draggingRef.current) {
        holdingRef.current = true;
        onHoldStartRef.current?.();
      }
    }, HOLD_THRESHOLD_MS);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const down = downRef.current;
    if (!down || draggingRef.current) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (holdingRef.current) {
        holdingRef.current = false;
        onHoldEndRef.current?.();
      }
      draggingRef.current = true;
      startedByMoveRef.current = true;
      lastMovedAtRef.current = Date.now();
      dragStartedAtRef.current = lastMovedAtRef.current;
      releaseConfirmationRef.current = 0;
      onDragStartRef.current();
      // 只在真实发生移动时才交给系统拖拽，连点不会被 mousedown 手势干扰
      void appWindow.startDragging().catch((error) => {
        console.error("start dragging failed:", error);
      });
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (disabled) return;
    if (
      !downRef.current &&
      !draggingRef.current &&
      !startedByMoveRef.current
    ) {
      return;
    }
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdingRef.current) {
      // 长按结束：只结束撸猫，不触发普通点击
      holdingRef.current = false;
      downRef.current = null;
      onHoldEndRef.current?.();
      return;
    }
    if (draggingRef.current || startedByMoveRef.current) {
      finishDrag();
      return;
    }
    downRef.current = null;
    const rect = areaRef.current?.getBoundingClientRect();
    const point = clampPetFramePoint(
      rect && rect.width > 0 && rect.height > 0
        ? {
            x: ((event.clientX - rect.left) / rect.width) * 240,
            y: ((event.clientY - rect.top) / rect.height) * 240,
          }
        : { x: 120, y: 150 },
    );
    const target = classifyTouchTarget(
      point.x,
      point.y,
      accessoryHitRegion,
    );
    onClickRef.current({ target, point });
  }

  function handlePointerCancel() {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdingRef.current) {
      holdingRef.current = false;
      downRef.current = null;
      onHoldEndRef.current?.();
      return;
    }
    if (draggingRef.current) {
      finishDrag();
    } else {
      downRef.current = null;
    }
  }

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    onOpenSettings();
  }

  return (
    <div
      ref={areaRef}
      className="pet-drag-area"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={() => {
        if (!disabledRef.current) onPointerNearRef.current?.();
      }}
      onPointerLeave={() => {
        if (!disabledRef.current) onPointerLeaveRef.current?.();
      }}
      onContextMenu={handleContextMenu}
    >
      {children}
    </div>
  );
}
