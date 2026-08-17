import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface InteractionAreaProps {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpenSettings: () => void;
}

const DRAG_THRESHOLD_PX = 6;
const DRAG_END_QUIET_MS = 700;

/**
 * 点击 / 拖拽二合一区域：
 * - 按住并移动超过阈值 → 交给系统原生窗口拖拽（data-tauri-drag-region）
 * - 按下后未移动就松开 → CLICK
 * - 原生拖拽可能吞掉 mouseup，用 onMoved + 静默计时器兜底发 DRAG_END
 * - 右键 → 打开设置
 */
export function InteractionArea({
  children,
  disabled,
  onClick,
  onDragStart,
  onDragEnd,
  onOpenSettings,
}: InteractionAreaProps) {
  const downRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const draggingRef = useRef(false);
  const lastMovedAtRef = useRef(0);
  const startedByMoveRef = useRef(false);

  const onClickRef = useRef(onClick);
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);
  onClickRef.current = onClick;
  onDragStartRef.current = onDragStart;
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlistenMoved: (() => void) | undefined;
    let disposed = false;

    appWindow.onMoved(() => {
      lastMovedAtRef.current = Date.now();
      if (downRef.current && !draggingRef.current) {
        draggingRef.current = true;
        startedByMoveRef.current = true;
        onDragStartRef.current();
      }
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        unlistenMoved = unlisten;
      }
    });

    // 兜底：原生拖拽开始后 mouseup 可能不再派发到 WebView
    const timer = window.setInterval(() => {
      if (
        draggingRef.current &&
        Date.now() - lastMovedAtRef.current > DRAG_END_QUIET_MS
      ) {
        draggingRef.current = false;
        downRef.current = null;
        onDragEndRef.current();
      }
    }, 250);

    return () => {
      disposed = true;
      unlistenMoved?.();
      window.clearInterval(timer);
    };
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    if (event.button !== 0) return;
    downRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
    draggingRef.current = false;
    startedByMoveRef.current = false;
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const down = downRef.current;
    if (!down || draggingRef.current) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      draggingRef.current = true;
      startedByMoveRef.current = true;
      lastMovedAtRef.current = Date.now();
      onDragStartRef.current();
      // 之后由 data-tauri-drag-region 的原生拖拽接管
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (disabled) return;
    if (draggingRef.current || startedByMoveRef.current) {
      draggingRef.current = false;
      downRef.current = null;
      onDragEndRef.current();
      return;
    }
    downRef.current = null;
    onClickRef.current();
  }

  function handlePointerCancel() {
    if (draggingRef.current) {
      draggingRef.current = false;
      downRef.current = null;
      onDragEndRef.current();
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
      className="pet-drag-area"
      data-tauri-drag-region
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
    >
      {children}
    </div>
  );
}
