import { useEffect, useRef, useState } from "react";
import {
  PET_FRAME_HEIGHT,
  PET_FRAME_WIDTH,
  type MotionConfig,
} from "./animationManifest";

interface SpriteAnimationProps {
  config: MotionConfig;
  className?: string;
  /** 非循环动画播放到最后一帧时回调（AnimationController → FSM） */
  onFinished?: () => void;
}

export function SpriteAnimation({
  config,
  className,
  onFinished,
}: SpriteAnimationProps) {
  const [frame, setFrame] = useState(0);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    setFrame(0);
    finishedRef.current = false;

    if (config.frames <= 1 || config.fps <= 0) {
      if (config.frames === 1 && !config.loop) {
        onFinishedRef.current?.();
      }
      return;
    }

    const intervalMs = 1000 / config.fps;
    const timer = window.setInterval(() => {
      setFrame((current) => {
        const next = current + 1;
        if (next >= config.frames) {
          if (!config.loop) {
            window.clearInterval(timer);
            if (!finishedRef.current) {
              finishedRef.current = true;
              // 延迟到渲染后触发，避免在 setState 内同步回调
              window.setTimeout(() => onFinishedRef.current?.(), 0);
            }
            return current;
          }
          return 0;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [config]);

  const style: React.CSSProperties = {
    width: PET_FRAME_WIDTH,
    height: PET_FRAME_HEIGHT,
    backgroundImage: `url("${config.src}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${PET_FRAME_WIDTH * config.frames}px ${PET_FRAME_HEIGHT}px`,
    backgroundPosition: `${-frame * PET_FRAME_WIDTH}px 0px`,
    pointerEvents: "none",
    imageRendering: "auto",
  };

  return <div role="img" aria-label="desktop pet" className={className} style={style} />;
}
