"""
从 personalization/pet-source.png 导出前端 Canvas 程序化动画素材。

输出（public/ 与 src/ 各一份）:
  cutout-frame@5x.png        1200x1200 睁眼基准帧
  cutout-frame-blink@5x.png  闭眼帧（自动检测眼睛位置）
  cutout-frame-half@5x.png   半闭困倦眼
  cutout-frame-happy@5x.png  下弯笑眼
  cutout-frame-shy@5x.png    半闭眼 + 腮红
  motion-spec.json           动作/表情/缓动定义（src/assets/pet/）

用法:
    python scripts/export_procedural_kit.py [可选: 源图片路径]
默认源图: personalization/pet-source.png
"""
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

import apply_pet_asset as A

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT / "personalization" / "pet-source.png"

HIGH_SCALE = 5
HIGH_SIZE = A.FRAME * HIGH_SCALE  # 1200
SUPERSAMPLE = 2  # 画眼/腮红时先放大 2 倍再缩回，得到平滑边缘

BLINK_SCHEDULE = {
    "minIntervalMs": 2200,
    "maxIntervalMs": 5800,
    "holdMs": 140,
}

OUTPUT_DIRS = [
    ROOT / "public" / "assets" / "pet",
    ROOT / "src" / "assets" / "pet",
]
SPEC_PATH = ROOT / "src" / "assets" / "pet" / "motion-spec.json"

EXPRESSION_FILES = {
    "open": "cutout-frame@5x.png",
    "closed": "cutout-frame-blink@5x.png",
    "half": "cutout-frame-half@5x.png",
    "happy": "cutout-frame-happy@5x.png",
    "shy": "cutout-frame-shy@5x.png",
}


def is_dark(pixel):
    r, g, b, a = pixel
    return a > 200 and r < 130 and g < 130 and b < 130


def connected_dark_components(base):
    """在 240 基准帧上找深色连通块（用于定位眼睛）。"""
    w, h = base.size
    px = base.load()
    dark = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            dark[y][x] = is_dark(px[x, y])

    seen = [[False] * w for _ in range(h)]
    comps = []
    for sy in range(h):
        for sx in range(w):
            if not dark[sy][sx] or seen[sy][sx]:
                continue
            dq = deque([(sx, sy)])
            seen[sy][sx] = True
            pts = []
            while dq:
                x, y = dq.popleft()
                pts.append((x, y))
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and dark[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        dq.append((nx, ny))
            comps.append(pts)
    return comps


def detect_eyes(base):
    """返回 [(cx, cy, w, h), ...]，定位失败返回 None。"""
    w, h = base.size
    candidates = []
    for pts in connected_dark_components(base):
        if not 20 <= len(pts) <= 2500:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        bx0, by0, bx1, by1 = min(xs), min(ys), max(xs), max(ys)
        cw, ch = bx1 - bx0 + 1, by1 - by0 + 1
        cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
        if cw > 60 or ch > 60:
            continue
        if not (h * 0.40 <= cy <= h * 0.80):
            continue
        candidates.append((len(pts), cx, cy, cw, ch, bx0, by0, bx1, by1))

    candidates.sort(reverse=True)
    best = None
    for i in range(min(len(candidates), 8)):
        for j in range(i + 1, min(len(candidates), 8)):
            a = candidates[i]
            b = candidates[j]
            if abs(a[2] - b[2]) > 12:
                continue
            dist = abs(a[1] - b[1])
            pair_center = (a[1] + b[1]) / 2
            if not (50 <= dist <= 180):
                continue
            if abs(pair_center - w / 2) > 25:
                continue
            best = (a, b)
            break
        if best:
            break
    if not best:
        return None
    return [(c[1], c[2], c[3], c[4]) for c in best]


def sample_color(base, bbox, dark_only=False, exclude_dark=True):
    x0, y0, x1, y1 = bbox
    w, h = base.size
    px = base.load()
    values = []
    for y in range(max(0, y0), min(h, y1 + 1)):
        for x in range(max(0, x0), min(w, x1 + 1)):
            r, g, b, a = px[x, y]
            if a <= 200:
                continue
            if dark_only:
                if is_dark((r, g, b, a)):
                    values.append((r, g, b))
            elif not (exclude_dark and is_dark((r, g, b, a))):
                values.append((r, g, b))
    if not values:
        return (252, 250, 252)
    values.sort()
    return values[len(values) // 2]


def eye_colors(base, cx, cy, cw, ch):
    bbox240 = (
        round(cx - cw / 2 - 6),
        round(cy - ch / 2 - 8),
        round(cx + cw / 2 + 6),
        round(cy + ch / 2 + 8),
    )
    fur = sample_color(base, bbox240, exclude_dark=True)
    dark = sample_color(base, bbox240, dark_only=True)
    line = tuple(round(f + (d - f) * 0.5) for f, d in zip(fur, dark))
    return fur, line


def make_expression(base, base_hi, eyes, mode):
    """在 1200 高清帧上程序化绘制表情；open 直接返回原图。"""
    if mode == "open":
        return base_hi.copy()
    if not eyes:
        print(f"  skip expression {mode}: no eyes detected")
        return None

    big = (base_hi.width * SUPERSAMPLE, base_hi.height * SUPERSAMPLE)
    work = base_hi.resize(big, Image.LANCZOS)
    draw = ImageDraw.Draw(work)
    s = work.width / base.width  # 包含 2 倍超采样

    for cx, cy, cw, ch in eyes:
        rx = (cw / 2 + 4.5) * s
        ry = (ch / 2 + 6.0) * s
        fur, line = eye_colors(base, cx, cy, cw, ch)
        px_cx, px_cy = cx * s, cy * s

        if mode in ("half", "shy"):
            # 上眼皮盖住上半部分，留出下半条眼睛
            draw.ellipse(
                [px_cx - rx, px_cy - ry * 1.15, px_cx + rx, px_cy + ry * 0.35],
                fill=fur + (255,),
            )
            draw.line(
                [px_cx - rx * 0.98, px_cy + ry * 0.02, px_cx + rx * 0.98, px_cy + ry * 0.02],
                fill=line + (255,),
                width=max(2, round(3.4 * s)),
            )
        else:
            # closed / happy：先完全盖住眼睛，再画下弯眼线
            draw.ellipse(
                [px_cx - rx, px_cy - ry, px_cx + rx, px_cy + ry],
                fill=fur + (255,),
            )
            arc_box = [
                px_cx - rx * 0.98,
                px_cy - ry * 0.62,
                px_cx + rx * 0.98,
                px_cy + ry * 0.62,
            ]
            if mode == "closed":
                draw.arc(arc_box, start=0, end=180, fill=line + (255,), width=max(2, round(3.2 * s)))
            else:  # happy：更粗、更上扬的笑眼弧线
                draw.arc(arc_box, start=15, end=165, fill=line + (255,), width=max(2, round(5.4 * s)))

    if mode == "shy":
        blush = Image.new("RGBA", work.size, (0, 0, 0, 0))
        bd = ImageDraw.Draw(blush)
        for cx, cy, cw, ch in eyes:
            toward_face = 1 if cx < base.width / 2 else -1
            cheek_x = (cx + toward_face * 13) * s
            cheek_y = (cy + 34) * s
            bd.ellipse(
                [
                    cheek_x - 18 * s,
                    cheek_y - 12 * s,
                    cheek_x + 18 * s,
                    cheek_y + 12 * s,
                ],
                fill=(255, 150, 180, 85),
            )
        blush = blush.filter(ImageFilter.GaussianBlur(3.5 * s))
        work = Image.alpha_composite(work, blush)

    return work.resize((base_hi.width, base_hi.height), Image.LANCZOS)


def keyframe_to_dict(item):
    if item[0] == "dim":
        return {"brightness": item[1]}
    scale, sy, angle, dy = item
    return {"scale": scale, "scaleY": sy, "angle": angle, "dy": dy}


def build_motion_spec():
    motions = {}
    for name, spec in A.MOTION_SPECS.items():
        motions[name] = {
            "fps": spec["fps"],
            "loop": spec["loop"],
            "blink": spec["blink"],
            "base": spec["base"],
            "ease": spec["ease"],
            "keyframes": [keyframe_to_dict(item) for item in spec["keyframes"]],
        }
    return {
        "frame": A.FRAME,
        "highScale": HIGH_SCALE,
        "blink": BLINK_SCHEDULE,
        "motions": motions,
    }


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not src.exists():
        raise SystemExit(f"找不到图片: {src}")

    im = Image.open(src).convert("RGB")
    print(f"input: {im.size}")
    cut = A.segment_with_rembg(im) or A.segment_with_flood(im)
    base = A.fit_canvas(cut)
    base_hi = A.fit_canvas(cut, size=HIGH_SIZE)
    print(f"subject bbox: {cut.getbbox()}, base: {base.size}, hi: {base_hi.size}")

    eyes = detect_eyes(base)
    print(f"eyes detected: {eyes}")

    expressions = {}
    for mode in EXPRESSION_FILES:
        frame = make_expression(base, base_hi, eyes, mode)
        if frame:
            expressions[mode] = frame

    for out_dir in OUTPUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        for mode, frame in expressions.items():
            path = out_dir / EXPRESSION_FILES[mode]
            frame.save(path)
            print(f"written: {path}")

    SPEC_PATH.parent.mkdir(parents=True, exist_ok=True)
    spec = build_motion_spec()
    with open(SPEC_PATH, "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
    print(f"written: {SPEC_PATH}")


if __name__ == "__main__":
    main()
