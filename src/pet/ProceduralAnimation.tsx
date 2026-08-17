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
import { SpriteAnimation } from "./SpriteAnimation";

interface ProceduralAnimationProps {
  /** 由 XState 状态机推导出的动作 */
  motion: PetVisualMotion;
  /** 当前桌宠缩放比例，决定 Canvas 背板分辨率 */
  zoom: number;
  /** 非循环动画播完最后一帧时回调（保持状态机契约） */
  onFinished?: () => void;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

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
): Promise<{ base: HTMLImageElement | null; blink: HTMLImageElement | null }> {
  const overrideBase = await loadImageIfExists(stateBaseOverrideUrl(specKey));
  const base =
    overrideBase ??
    (await loadImage(EXPRESSION_URLS[spec.base]).catch(() => null));

  let blink: HTMLImageElement | null = null;
  if (spec.blink) {
    const overrideBlink = await loadImageIfExists(
      stateBlinkOverrideUrl(specKey),
    );
    blink =
      overrideBlink ??
      (await loadImage(EXPRESSION_URLS.closed).catch(() => null));
  }
  return { base, blink };
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
}: ProceduralAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const blinkImageRef = useRef<HTMLImageElement | null>(null);
  const loadedSpecKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [blinkReady, setBlinkReady] = useState(false);
  const [specRevision, setSpecRevision] = useState(0);

  const motionRef = useRef(motion);
  const zoomRef = useRef(zoom);
  const blinkUntilRef = useRef(0);
  const onFinishedRef = useRef(onFinished);
  motionRef.current = motion;
  zoomRef.current = zoom;
  onFinishedRef.current = onFinished;

  const drawPose = (keyframe: MotionKeyframe) => {
    const canvas = canvasRef.current;
    const base = baseImageRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const scaleToCanvas = size / CANVAS_BASE_SIZE;
    const useBlink =
      blinkUntilRef.current > performance.now() &&
      blinkImageRef.current !== null;
    const image = useBlink ? blinkImageRef.current : base;
    if (!image) return;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
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

  // ---------- 按动作加载基帧；失败时退回 sprite sheet ----------
  useEffect(() => {
    let disposed = false;
    setReady(false);
    setBlinkReady(false);
    baseImageRef.current = null;
    blinkImageRef.current = null;
    blinkUntilRef.current = 0;

    const specKey = getSpecKey(motion);
    const spec = getMotionSpec(motion);
    resolveMotionAssets(specKey, spec).then(({ base, blink }) => {
      if (disposed) return;
      baseImageRef.current = base;
      blinkImageRef.current = blink;
      setBlinkReady(blink !== null);
      if (!base) return;
      loadedSpecKeyRef.current = specKey;
      setReady(true);
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
    if (!ready || loadedSpecKeyRef.current !== getSpecKey(motion)) return;

    const spec = getMotionSpec(motion);
    let raf = 0;
    let finishedFired = false;
    const start = performance.now();
    const frameMs = Math.max(16, 1000 / spec.fps);
    const totalMs = spec.keyframes.length * frameMs;
    const lastIndex = Math.max(spec.keyframes.length - 1, 0);

    const tick = (now: number) => {
      const elapsed = now - start;

      if (!spec.loop && elapsed >= totalMs) {
        drawPose(spec.keyframes[lastIndex]);
        if (!finishedFired) {
          finishedFired = true;
          window.setTimeout(() => onFinishedRef.current?.(), 0);
        }
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

      drawPose(
        interpolateKeyframes(from, to, easeValue(spec.ease, frac)),
      );
      raf = requestAnimationFrame(tick);
    };

    // 首帧立即绘制
    drawPose(spec.keyframes[0]);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      blinkUntilRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion, ready, specRevision]);

  // ---------- 随机眨眼调度 ----------
  useEffect(() => {
    if (!ready || !blinkReady) return;
    const spec = getMotionSpec(motion);
    blinkUntilRef.current = 0;
    if (!spec.blink || !blinkImageRef.current) return;

    const timers: number[] = [];
    const randomDelay = () =>
      BLINK_SCHEDULE.minIntervalMs +
      Math.random() *
        (BLINK_SCHEDULE.maxIntervalMs - BLINK_SCHEDULE.minIntervalMs);

    const schedule = (delayMs: number) => {
      const openTimer = window.setTimeout(() => {
        blinkUntilRef.current = performance.now() + BLINK_SCHEDULE.holdMs;
        drawPose(spec.keyframes[0]);
        timers.push(
          window.setTimeout(() => {
            blinkUntilRef.current = 0;
            drawPose(spec.keyframes[0]);
            schedule(randomDelay());
          }, BLINK_SCHEDULE.holdMs),
        );
      }, delayMs);
      timers.push(openTimer);
    };

    schedule(randomDelay());
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      blinkUntilRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion, ready, blinkReady, specRevision]);

  // ---------- 缩放 / DPI 变化时重建背板 ----------
  useEffect(() => {
    if (!ready) return;

    const resizeAndDraw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const target = Math.max(
        1,
        Math.min(2048, Math.round(CANVAS_BASE_SIZE * zoomRef.current * dpr)),
      );
      if (canvas.width !== target || canvas.height !== target) {
        canvas.width = target;
        canvas.height = target;
      }
      const spec = getMotionSpec(motionRef.current);
      drawPose(spec.keyframes[0]);
    };

    resizeAndDraw();
    window.addEventListener("resize", resizeAndDraw);
    return () => {
      window.removeEventListener("resize", resizeAndDraw);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, ready]);

  if (!ready) {
    return (
      <SpriteAnimation
        config={petMotions[motion]}
        onFinished={onFinished}
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
