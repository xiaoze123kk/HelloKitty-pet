import type { PetVisualMotion } from "../pet/animationManifest";

/**
 * 动作特效层：根据当前动作显示纯 CSS 粒子/表情符号特效。
 * 所有子元素都不接收指针事件，不干扰拖拽 / 点击 / 长按撸猫。
 *
 * 特效与状态机动作一一对应：
 *   clicked ✦ 冲击星  | happy/wave ✨♪ | shy 💧      | sneeze 💦
 *   angry 💢          | spin ✴ 晕眩环   | landing 💨  | pounce 💥
 *   tease ❓          | yawn 💤         | wake ✨     | headpat 💕
 *   bowtouch ✨       | jump ✨💨       | sway ♪♫    | startle ❗
 *   dizzy ✴          | sleep/入睡仍由 SleepZzz 负责
 */
export function MotionEffects({ motion }: { motion: PetVisualMotion }) {
  switch (motion) {
    case "clicked":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-click-star fx-click-star-1">✦</span>
          <span className="fx fx-click-star fx-click-star-2">✦</span>
        </div>
      );

    case "happy":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-sparkle fx-sparkle-1">✨</span>
          <span className="fx fx-sparkle fx-sparkle-2">✨</span>
          <span className="fx fx-note fx-note-1">♪</span>
          <span className="fx fx-note fx-note-2">♫</span>
        </div>
      );

    case "shy":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-sweat">💧</span>
        </div>
      );

    case "sneeze":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-sneeze fx-sneeze-left">💦</span>
          <span className="fx fx-sneeze fx-sneeze-right">💦</span>
          <span className="fx fx-sneeze fx-sneeze-up">💦</span>
        </div>
      );

    case "angry":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-anger">💢</span>
          <span className="fx fx-anger fx-anger-2">💢</span>
        </div>
      );

    case "spin":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <div className="fx-spin-orbit">
            <span className="fx fx-orbit-star fx-orbit-star-1">✴</span>
            <span className="fx fx-orbit-star fx-orbit-star-2">✦</span>
            <span className="fx fx-orbit-star fx-orbit-star-3">✴</span>
          </div>
        </div>
      );

    case "landing":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-dust fx-dust-left">💨</span>
          <span className="fx fx-dust fx-dust-right">💨</span>
        </div>
      );

    case "pounce":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-pounce-boom">💥</span>
          <span className="fx fx-pounce-ray fx-pounce-ray-1">✦</span>
          <span className="fx fx-pounce-ray fx-pounce-ray-2">✦</span>
        </div>
      );

    case "tease":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-question">❓</span>
        </div>
      );

    case "yawn":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-yawn-z">💤</span>
        </div>
      );

    case "wake":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-wake-spark fx-wake-spark-1">✨</span>
          <span className="fx fx-wake-spark fx-wake-spark-2">✨</span>
        </div>
      );

    case "headpat":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-headpat-heart fx-headpat-heart-1">💕</span>
          <span className="fx fx-headpat-heart fx-headpat-heart-2">💕</span>
        </div>
      );

    case "bowtouch":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-bow-spark fx-bow-spark-1">✨</span>
          <span className="fx fx-bow-spark fx-bow-spark-2">✦</span>
        </div>
      );

    case "jump":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-sparkle fx-sparkle-1">✨</span>
          <span className="fx fx-dust fx-dust-left fx-jump-dust-left">💨</span>
          <span className="fx fx-dust fx-dust-right fx-jump-dust-right">💨</span>
        </div>
      );

    case "sway":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-note fx-note-1">♪</span>
          <span className="fx fx-note fx-note-2">♫</span>
        </div>
      );

    case "startle":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <span className="fx fx-startle-mark">❗</span>
        </div>
      );

    case "dizzy":
      return (
        <div className="motion-fx-layer" aria-hidden="true">
          <div className="fx-spin-orbit">
            <span className="fx fx-orbit-star fx-orbit-star-1">✴</span>
            <span className="fx fx-orbit-star fx-orbit-star-2">✦</span>
            <span className="fx fx-orbit-star fx-orbit-star-3">✴</span>
          </div>
        </div>
      );

    default:
      return null;
  }
}
