/**
 * 撸猫时的心形粒子层：纯 CSS 循环动画，不挡任何交互。
 */
export function Hearts({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="hearts-layer" aria-hidden="true">
      <span className="heart heart-1">❤</span>
      <span className="heart heart-2">❤</span>
      <span className="heart heart-3">❤</span>
    </div>
  );
}
