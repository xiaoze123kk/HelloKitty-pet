import { useEffect, useRef, useState } from "react";
import {
  petMotions,
  type PetVisualMotion,
} from "./animationManifest";
import {
  BLINK_SCHEDULE,
  CANVAS_BASE_SIZE,
  easeValue,
  EXPRESSION_URLS,
  getMotionSpec,
  getSpecKey,
  interpolateKeyframes,
  MOTION_SPEC_OVERRIDE_EVENT,
  stateBaseOverrideUrl,
  stateBlinkOverrideUrl,
  type MotionKeyframe,
  type ProceduralMotionSpec,
} from "./proceduralMotion";
import {
  beginMotionRun,
  completeMotionRun,
  MOTION_TRANSITION_BLEND_MODE,
  motionTransitionFrame,
  type MotionCompletionGate,
} from "./motionTransition";
import { SpriteAnimation } from "./SpriteAnimation";

interface ProceduralAnimationProps {
  /** 由 XState 状态机推导出的动作 */
  motion: PetVisualMotion;
  /** 当前桌宠缩放比例，决定 Canvas 背板分辨率 */
  zoom: number;
  /** 非循环动画播完最后一帧时回调（保持状态机契约） */
  onFinished?: () => void;
  /** 视线跟随：整个身体朝鼠标方向轻微转头/倾斜 */
  gazeFollow?: boolean;
  /** 将主体关键帧同步给配饰和面部独立层。 */
  onPose?: (pose: MotionKeyframe) => void;
}

type BlinkFrame = "open" | "half" | "closed";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
let coreExpressionPreload: Promise<void> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`load image failed: ${src}`));
        image.src = src;
      }),
    );
  }
  return imageCache.get(src)!;
}

function preloadCoreExpressionAssets(): Promise<void> {
  if (!coreExpressionPreload) {
    coreExpressionPreload = Promise.all(
      Object.values(EXPRESSION_URLS).map((src) =>
        loadImage(src).catch(() => null),
      ),
    ).then(() => undefined);
  }
  return coreExpressionPreload;
}

const existsCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImageIfExists(src: string): Promise<HTMLImageElement | null> {
  if (!existsCache.has(src)) {
    existsCache.set(
      src,
      (async () => {
        try {
          const head = await fetch(src, { method: "HEAD" });
          if (!head.ok) return null;
          return await loadImage(src);
        } catch {
          return null;
        }
      })(),
    );
  }
  return existsCache.get(src)!;
}

/**
 * 解析当前动作的基帧：
 * 1) public/assets/pet/state-bases/{state}.png 手工替换位（优先）
 * 2) motion-spec 指定的表情基帧（自动生成）
 * 眨眼帧同理：{state}-blink.png → 自动闭眼帧
 */
async function resolveMotionAssets(
  specKey: string,
  spec: ProceduralMotionSpec,
): Promise<{
  base: HTMLImageElement | null;
  half: HTMLImageElement | null;
  blink: HTMLImageElement | null;
}> {
  const overrideBase = await loadImageIfExists(stateBaseOverrideUrl(specKey));
  const base =
    overrideBase ??
    (await loadImage(EXPRESSION_URLS[spec.base]).catch(() => null));

  let half: HTMLImageElement | null = null;
  let blink: HTMLImageElement | null = null;
  if (spec.blink) {
    half = await loadImage(EXPRESSION_URLS.half).catch(() => null);
    const overrideBlink = await loadImageIfExists(
      stateBlinkOverrideUrl(specKey),
    );
    blink =
      overrideBlink ??
      (await loadImage(EXPRESSION_URLS.closed).catch(() => null));
  }
  return { base, half, blink };
}

/**
 * Canvas 程序化动画渲染器：
 * - 呼吸（scale/scaleY 微变）、弹跳（scale+dy）、挤压（scaleY）、旋转（angle）
 *   全部由 motion-spec.json 的 keyframes 驱动，关键帧之间按 ease 插值
 * - 每个状态使用自己的表情基帧（open/half/happy/shy/closed）
 * - idle / sleepy 随机眨眼：短暂切换到闭眼帧
 * - 背板分辨率 = 240 × zoom × devicePixelRatio，从 1200px 高清底图绘制
 */
export function ProceduralAnimation({
  motion,
  zoom,
  onFinished,
  gazeFollow = false,
  onPose,
}: ProceduralAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const halfImageRef = useRef<HTMLImageElement | null>(null);
  const blinkImageRef = useRef<HTMLImageElement | null>(null);
  const lastPoseRef = useRef<MotionKeyframe | null>(null);
  const lastDrawnImageRef = useRef<HTMLImageElement | null>(null);
  const pendingTransitionRef = useRef<{
    fromImage: HTMLImageElement;
    fromPose: MotionKeyframe;
    toSpecKey: string;
  } | null>(null);
  const completionGateRef = useRef<MotionCompletionGate>({
    runId: 0,
    finished: true,
  });
  /**
   * 已加载完成的动作名（不是布尔值）：
   * 动作切换时先置 null，再置为新 specKey。即使 React 把两次 setState
   * 合并为同一次渲染，null→specKey 也必然产生状态变化，避免
   * “ZZZ 已显示但 canvas 仍停留在上一个动作画面”的陈旧帧问题。
   */
  const [loadedSpecKey, setLoadedSpecKey] = useState<string | null>(null);
  const [fallbackSpecKey, setFallbackSpecKey] = useState<string | null>(null);
  const [hasCanvasFrame, setHasCanvasFrame] = useState(false);
  const [blinkReady, setBlinkReady] = useState(false);
  const [specRevision, setSpecRevision] = useState(0);

  const usingFallback = fallbackSpecKey === getSpecKey(motion);
  const canvasVisible = hasCanvasFrame && !usingFallback;
  const reducedMotion = usePrefersReducedMotion();

  const motionRef = useRef(motion);
  const zoomRef = useRef(zoom);
  const blinkFrameRef = useRef<BlinkFrame>("open");
  const onFinishedRef = useRef(onFinished);
  const onPoseRef = useRef(onPose);
  const reducedMotionRef = useRef(reducedMotion);
  motionRef.current = motion;
  zoomRef.current = zoom;
  onFinishedRef.current = onFinished;
  onPoseRef.current = onPose;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    void preloadCoreExpressionAssets();
  }, []);

  // 视线跟随：用 CSS transform 微调画布，不触发重绘
  useEffect(() => {
    if (!gazeFollow || !canvasVisible || reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reset = () => {
      canvas.style.transform = "";
    };
    const apply = (clientX: number, clientY: number) => {
      const nx = clientX / window.innerWidth - 0.5;
      const ny = clientY / window.innerHeight - 0.5;
      canvas.style.transition = "transform 0.18s ease-out";
      canvas.style.transformOrigin = "center 72%";
      canvas.style.transform = `rotate(${(nx * 6).toFixed(2)}deg) translate(${(nx * 5).toFixed(1)}px, ${(ny * 2.5).toFixed(1)}px)`;
    };
    const onMove = (event: globalThis.PointerEvent) => {
      apply(event.clientX, event.clientY);
    };
    const onOut = (event: globalThis.PointerEvent) => {
      if (!event.relatedTarget) reset();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerout", onOut);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      reset();
    };
  }, [canvasVisible, gazeFollow, reducedMotion]);

  const drawImageAtPose = (
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    keyframe: MotionKeyframe,
    alpha: number,
    compositeOperation: GlobalCompositeOperation = "source-over",
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = canvas.width;
    const scaleToCanvas = size / CANVAS_BASE_SIZE;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = compositeOperation;
    ctx.translate(size / 2, size / 2 + (keyframe.dy ?? 0) * scaleToCanvas);
    ctx.rotate(((keyframe.angle ?? 0) * Math.PI) / 180);
    const sx = keyframe.scale ?? 1;
    ctx.scale(sx, keyframe.scaleY ?? sx);
    if (keyframe.brightness !== undefined) {
      ctx.filter = `brightness(${keyframe.brightness})`;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const half = (CANVAS_BASE_SIZE / 2) * scaleToCanvas;
    ctx.drawImage(image, -half, -half, half * 2, half * 2);
    ctx.restore();
  };

  const drawPose = (keyframe: MotionKeyframe) => {
    onPoseRef.current?.(keyframe);
    const canvas = canvasRef.current;
    const base = baseImageRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image =
      blinkFrameRef.current === "closed"
        ? (blinkImageRef.current ?? base)
        : blinkFrameRef.current === "half"
          ? (halfImageRef.current ?? blinkImageRef.current ?? base)
          : base;
    if (!image) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawImageAtPose(ctx, image, keyframe, 1);
    lastPoseRef.current = keyframe;
    lastDrawnImageRef.current = image;
  };

  const drawTransitionPose = (
    fromImage: HTMLImageElement,
    fromPose: MotionKeyframe,
    toImage: HTMLImageElement,
    toPose: MotionKeyframe,
    previousAlpha: number,
    nextAlpha: number,
  ) => {
    onPoseRef.current?.(toPose);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawImageAtPose(ctx, fromImage, fromPose, previousAlpha);
    drawImageAtPose(
      ctx,
      toImage,
      toPose,
      nextAlpha,
      MOTION_TRANSITION_BLEND_MODE,
    );
    lastPoseRef.current = toPose;
    lastDrawnImageRef.current = toImage;
  };

  // ---------- 按动作加载基帧；失败时退回 sprite sheet ----------
  useEffect(() => {
    let disposed = false;
    setLoadedSpecKey(null);
    setFallbackSpecKey(null);
    setBlinkReady(false);
    blinkFrameRef.current = "open";

    const specKey = getSpecKey(motion);
    const spec = getMotionSpec(motion);
    const fromImage = lastDrawnImageRef.current ?? baseImageRef.current;
    const fromPose = lastPoseRef.current;
    resolveMotionAssets(specKey, spec).then(({ base, half, blink }) => {
      if (disposed) return;
      if (!base) {
        pendingTransitionRef.current = null;
        baseImageRef.current = null;
        halfImageRef.current = null;
        blinkImageRef.current = null;
        lastDrawnImageRef.current = null;
        lastPoseRef.current = null;
        setHasCanvasFrame(false);
        setFallbackSpecKey(specKey);
        return;
      }
      pendingTransitionRef.current =
        fromImage && fromPose && !reducedMotionRef.current
          ? { fromImage, fromPose, toSpecKey: specKey }
          : null;
      baseImageRef.current = base;
      halfImageRef.current = half;
      blinkImageRef.current = blink;
      setBlinkReady(blink !== null);
      setHasCanvasFrame(true);
      setLoadedSpecKey(specKey);
    });

    return () => {
      disposed = true;
    };
  }, [motion]);

  // ---------- 调试面板覆盖事件 ----------
  useEffect(() => {
    const handler = () => setSpecRevision((value) => value + 1);
    window.addEventListener(MOTION_SPEC_OVERRIDE_EVENT, handler);
    return () => {
      window.removeEventListener(MOTION_SPEC_OVERRIDE_EVENT, handler);
    };
  }, []);

  // ---------- 时间轴 + 缓动插值推进 ----------
  useEffect(() => {
    if (loadedSpecKey !== getSpecKey(motion)) return;

    const spec = getMotionSpec(motion);
    if (!Array.isArray(spec.keyframes) || spec.keyframes.length === 0) return;
    let raf = 0;
    let finishTimer: number | null = null;
    const runGate = beginMotionRun(completionGateRef.current);
    completionGateRef.current = runGate;
    const runId = runGate.runId;
    const fps = Number.isFinite(spec.fps) && spec.fps > 0 ? spec.fps : 6;
    const frameMs = Math.max(16, 1000 / fps);
    const totalMs = spec.keyframes.length * frameMs;
    const lastIndex = Math.max(spec.keyframes.length - 1, 0);
    const pendingTransition =
      pendingTransitionRef.current?.toSpecKey === loadedSpecKey
        ? pendingTransitionRef.current
        : null;
    pendingTransitionRef.current = null;

    const finishRun = () => {
      const result = completeMotionRun(completionGateRef.current, runId);
      completionGateRef.current = result.gate;
      if (result.shouldNotify) {
        finishTimer = window.setTimeout(() => onFinishedRef.current?.(), 0);
      }
    };

    if (reducedMotion) {
      drawPose(spec.keyframes[0]);
      if (!spec.loop) {
        finishRun();
      }
      return () => {
        if (finishTimer !== null) window.clearTimeout(finishTimer);
      };
    }

    let timelineStart: number | null = pendingTransition
      ? null
      : performance.now();
    const transitionStart = performance.now();
    const tick = (now: number) => {
      if (pendingTransition && timelineStart === null) {
        const transition = motionTransitionFrame(
          pendingTransition.fromPose,
          spec.keyframes[0],
          now - transitionStart,
        );
        drawTransitionPose(
          pendingTransition.fromImage,
          pendingTransition.fromPose,
          baseImageRef.current!,
          transition.pose,
          transition.previousAlpha,
          transition.nextAlpha,
        );
        if (!transition.done) {
          raf = requestAnimationFrame(tick);
          return;
        }
        drawPose(spec.keyframes[0]);
        timelineStart = now;
      }

      const elapsed = now - (timelineStart ?? now);

      if (!spec.loop && elapsed >= totalMs) {
        drawPose(spec.keyframes[lastIndex]);
        finishRun();
        return;
      }

      const pos = elapsed / frameMs;
      const index = Math.floor(pos);
      let from = spec.keyframes[0];
      let to = spec.keyframes[0];
      let frac = pos - index;

      if (spec.loop) {
        const wrapped = index % spec.keyframes.length;
        from = spec.keyframes[wrapped];
        to = spec.keyframes[(wrapped + 1) % spec.keyframes.length];
      } else if (index >= lastIndex) {
        from = spec.keyframes[lastIndex];
        to = from;
        frac = 0;
      } else {
        from = spec.keyframes[index];
        to = spec.keyframes[index + 1];
      }

      // Vite 冷启动依赖重优化阶段可能出现一次关键帧未就绪的竞态：
      // 回退到首帧并继续下一帧动画，而不是让 rAF 循环直接抛错停摆。
      if (!from || !to) {
        console.warn(
          `procedural keyframe missing: motion=${motion} fps=${spec.fps} index=${index}`,
        );
        from = spec.keyframes[0];
        to = from;
      }

      drawPose(
        interpolateKeyframes(from, to, easeValue(spec.ease, frac)),
      );
      raf = requestAnimationFrame(tick);
    };

    if (pendingTransition) {
      drawTransitionPose(
        pendingTransition.fromImage,
        pendingTransition.fromPose,
        baseImageRef.current!,
        pendingTransition.fromPose,
        1,
        0,
      );
    } else {
      drawPose(spec.keyframes[0]);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (finishTimer !== null) window.clearTimeout(finishTimer);
      blinkFrameRef.current = "open";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion, loadedSpecKey, specRevision, reducedMotion]);

  // ---------- 随机眨眼调度 ----------
  useEffect(() => {
    if (loadedSpecKey !== getSpecKey(motion) || !blinkReady || reducedMotion) return;
    const spec = getMotionSpec(motion);
    blinkFrameRef.current = "open";
    if (!spec.blink || !blinkImageRef.current) return;

    const timers = new Set<number>();
    const randomDelay = () =>
      BLINK_SCHEDULE.minIntervalMs +
      Math.random() *
        (BLINK_SCHEDULE.maxIntervalMs - BLINK_SCHEDULE.minIntervalMs);

    const setFrameLater = (delayMs: number, frame: BlinkFrame, next?: () => void) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        blinkFrameRef.current = frame;
        drawPose(spec.keyframes[0]);
        next?.();
      }, delayMs);
      timers.add(timer);
    };
    const blinkOnce = (delayMs: number, done: () => void) => {
      setFrameLater(delayMs, "half", () => {
        setFrameLater(45, "closed", () => {
          setFrameLater(Math.max(60, BLINK_SCHEDULE.holdMs / 2), "half", () => {
            setFrameLater(55, "open", done);
          });
        });
      });
    };
    const schedule = (delayMs: number) => {
      blinkOnce(delayMs, () => {
        if (Math.random() < 0.2) {
          blinkOnce(115, () => schedule(randomDelay()));
        } else {
          schedule(randomDelay());
        }
      });
    };

    schedule(randomDelay());
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      blinkFrameRef.current = "open";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion, loadedSpecKey, blinkReady, specRevision, reducedMotion]);

  // ---------- 缩放 / DPI 变化时重建背板 ----------
  useEffect(() => {
    if (!canvasVisible || loadedSpecKey !== getSpecKey(motion)) return;

    const resizeAndDraw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const target = Math.max(
        1,
        Math.min(2048, Math.round(CANVAS_BASE_SIZE * zoomRef.current * dpr)),
      );
      const resized = canvas.width !== target || canvas.height !== target;
      if (resized) {
        canvas.width = target;
        canvas.height = target;
      }
      if (resized) {
        const spec = getMotionSpec(motionRef.current);
        drawPose(lastPoseRef.current ?? spec.keyframes[0]);
      }
    };

    resizeAndDraw();
    window.addEventListener("resize", resizeAndDraw);
    return () => {
      window.removeEventListener("resize", resizeAndDraw);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasVisible, loadedSpecKey, zoom]);

  if (usingFallback || !hasCanvasFrame) {
    return (
      <SpriteAnimation
        config={petMotions[motion]}
        reducedMotion={reducedMotion}
        onFinished={usingFallback ? onFinished : undefined}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="procedural-pet"
      width={CANVAS_BASE_SIZE}
      height={CANVAS_BASE_SIZE}
      role="img"
      aria-label="desktop pet"
    />
  );
}
