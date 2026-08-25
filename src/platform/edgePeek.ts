export type PeekEdge = "left" | "right" | "top" | "bottom";

export interface RectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgePeekPlacement {
  edge: PeekEdge;
  x: number;
  y: number;
}

/**
 * 只有桌宠本来就靠近屏幕边缘时才探头，避免它为了一个动画横穿桌面。
 */
export function computeEdgePeekPlacement(
  windowRect: RectGeometry,
  monitorRect: RectGeometry,
  maxDistance: number,
  visibleAmount: number,
): EdgePeekPlacement | null {
  const distances: Array<[PeekEdge, number]> = [
    ["left", Math.abs(windowRect.x - monitorRect.x)],
    [
      "right",
      Math.abs(
        monitorRect.x +
          monitorRect.width -
          (windowRect.x + windowRect.width),
      ),
    ],
    ["top", Math.abs(windowRect.y - monitorRect.y)],
    [
      "bottom",
      Math.abs(
        monitorRect.y +
          monitorRect.height -
          (windowRect.y + windowRect.height),
      ),
    ],
  ];
  const [edge, distance] = distances.sort((a, b) => a[1] - b[1])[0];
  if (distance > maxDistance) return null;

  const visibleX = Math.min(windowRect.width, Math.max(1, visibleAmount));
  const visibleY = Math.min(windowRect.height, Math.max(1, visibleAmount));
  switch (edge) {
    case "left":
      return {
        edge,
        x: monitorRect.x - windowRect.width + visibleX,
        y: windowRect.y,
      };
    case "right":
      return {
        edge,
        x: monitorRect.x + monitorRect.width - visibleX,
        y: windowRect.y,
      };
    case "top":
      return {
        edge,
        x: windowRect.x,
        y: monitorRect.y - windowRect.height + visibleY,
      };
    case "bottom":
      return {
        edge,
        x: windowRect.x,
        y: monitorRect.y + monitorRect.height - visibleY,
      };
  }
}
