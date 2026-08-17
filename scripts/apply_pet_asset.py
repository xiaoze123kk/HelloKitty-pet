"""
把用户提供的宠物立绘转换为桌宠动作素材。

用法:
    python scripts/apply_pet_asset.py <图片路径>

输入: 一张主体为白猫、背景为粉色的方形 PNG（无透明通道）。
输出: src/assets/pet/{idle,happy,shy,sleep,sleepy,clicked}.png
      每张都是 240px 高的横向帧序列，帧宽 240px。
"""
import math
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

FRAME = 240
ROOT = Path(__file__).resolve().parent.parent
# public/ 是 Vite 实际打包源（/assets/pet/*.png），src/assets/ 保留同内容副本
SHEET_DIRS = [
    ROOT / "public" / "assets" / "pet",
    ROOT / "src" / "assets" / "pet",
]


def is_pink(p):
    r, g, b = p
    return (r - b) >= 16 and b < 248


def cutout_mask(im):
    """旧版颜色泛洪（仅作回退方案）：适合"白猫 + 粉背景"。"""
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    dq = deque()
    for x in range(w):
        for p in ((x, 0), (x, h - 1)):
            if is_pink(px[p]):
                visited[p[1] * w + p[0]] = 1
                dq.append(p)
    for y in range(h):
        for p in ((0, y), (w - 1, y)):
            if is_pink(px[p]):
                visited[p[1] * w + p[0]] = 1
                dq.append(p)
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx] and is_pink(px[nx, ny]):
                    visited[idx] = 1
                    dq.append((nx, ny))
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            mp[x, y] = 0 if visited[row + x] else 255
    return mask


def largest_component(mask, threshold=128):
    """只保留最大连通块，去掉模型/泛洪产生的背景残留小块。"""
    w, h = mask.size
    data = mask.load()
    visited = bytearray(w * h)
    best = None
    for sy in range(h):
        for sx in range(w):
            idx = sy * w + sx
            if visited[idx] or data[sx, sy] <= threshold:
                continue
            comp = []
            dq = deque([(sx, sy)])
            visited[idx] = 1
            while dq:
                x, y = dq.popleft()
                comp.append((x, y))
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny * w + nx
                        if not visited[nidx] and data[nx, ny] > threshold:
                            visited[nidx] = 1
                            dq.append((nx, ny))
            if best is None or len(comp) > len(best):
                best = comp
    out = Image.new("L", (w, h), 0)
    if best:
        op = out.load()
        for x, y in best:
            op[x, y] = 255
    return out


def polish_mask(mask):
    """收边 1px + 羽化。"""
    mask = mask.filter(ImageFilter.MinFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    return mask


def decontaminate_edges(rgba):
    """半透明边缘向白色靠拢，减少粉边光晕。"""
    w, h = rgba.size
    px = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 255:
                k = (1 - a / 255) * 0.6
                r = round(r + (255 - r) * k)
                g = round(g + (255 - g) * k)
                b = round(b + (255 - b) * k)
                px[x, y] = (r, g, b, a)
    return rgba


def segment_with_rembg(im):
    """优先方案：U2-Net 分割，保留与背景同色系的粉身体/蝴蝶结。"""
    try:
        from rembg import new_session, remove
    except Exception as exc:  # rembg 未安装
        print(f"rembg unavailable ({exc}), fallback to flood fill")
        return None

    session = new_session("u2net")
    out = remove(im, session=session, alpha_matting=False).convert("RGBA")
    a = out.getchannel("A")
    hist = a.histogram()
    opaque = sum(hist[129:])
    if opaque < im.width * im.height * 0.05:
        print("rembg result looks blank, fallback to flood fill")
        return None

    mask = largest_component(a)
    mask = polish_mask(mask)
    clean = Image.new("RGBA", im.size, (0, 0, 0, 0))
    clean.paste(im.convert("RGB"), (0, 0), mask)
    clean = decontaminate_edges(clean)
    print(f"rembg segmentation: opaque={opaque}, largest component={sum(1 for v in mask.getdata() if v > 128)}")
    return clean


def segment_with_flood(im):
    mask = largest_component(cutout_mask(im))
    mask = polish_mask(mask)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im.convert("RGB"), (0, 0), mask)
    return decontaminate_edges(out)


def fit_canvas(cutout, size=FRAME):
    """裁到主体 bbox 并缩放到 (size-2)x(size-2) 居中（四周留 1px 呼吸空间）。"""
    bbox = cutout.getbbox()
    if bbox is None:
        raise SystemExit("抠图结果为空，请检查输入图片")
    margin = max(2, int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 0.004))
    left = max(0, bbox[0] - margin)
    top = max(0, bbox[1] - margin)
    right = min(cutout.width, bbox[2] + margin)
    bottom = min(cutout.height, bbox[3] + margin)
    subject = cutout.crop((left, top, right, bottom))
    scale = min((size - 2) / subject.width, (size - 2) / subject.height)
    target = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(target, Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(subject, ((size - target[0]) // 2, (size - target[1]) // 2), subject)
    return canvas


def transform_frame(base, scale=1.0, sy=None, angle=0.0, dy=0.0):
    """对基准帧做仿射变换，输出新的 240x240 帧。"""
    sy = scale if sy is None else sy
    sw = FRAME * scale
    sh = FRAME * sy
    tmp = base.resize((max(1, round(sw)), max(1, round(sh))), Image.BICUBIC)
    if angle:
        tmp = tmp.rotate(angle, resample=Image.BICUBIC, expand=False)
    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    frame.paste(tmp, ((FRAME - tmp.width) // 2, (FRAME - tmp.height) // 2 + round(dy)), tmp)
    return frame


def brightness_frame(base, factor):
    rgb = base.convert("RGB")
    dim = ImageEnhance.Brightness(rgb).enhance(factor)
    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    frame.paste(dim, (0, 0), base.getchannel("A"))
    return frame


def make_sheet(base, frames):
    sheet = Image.new("RGBA", (FRAME * len(frames), FRAME), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * FRAME, 0), f)
    return sheet


# 动作定义（唯一真源）：
# - 本脚本读它生成 240px sprite sheet
# - scripts/export_procedural_kit.py 读它生成 motion-spec.json，供前端 Canvas 程序化动画使用
# keyframe 字段顺序: (scale, scaleY, angle, dy) 或 ("dim", brightness)
# base: 表情基帧（open / closed / half / happy / shy）
# ease: 前端关键帧插值缓动（linear / sineInOut）
MOTION_SPECS = {
    # 6 帧：呼吸起伏
    "idle": {
        "fps": 6,
        "loop": True,
        "blink": True,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (1.000, 1.000, 0, 0),
            (1.012, 1.000, 0, -2),
            (1.010, 1.010, 0, 0),
            (1.000, 1.000, 0, 2),
            (0.990, 1.000, 0, 0),
            (1.000, 1.000, 0, -1),
        ],
    },
    # 6 帧：小跳 + 落地压扁
    "happy": {
        "fps": 9,
        "loop": False,
        "blink": False,
        "base": "happy",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.04, 1.04, -3, -14),
            (1.02, 1.02, 2, -18),
            (1.00, 0.96, -2, 2),
            (1.04, 1.02, 3, -8),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：害羞缩身 + 轻微左右晃
    "shy": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "shy",
        "ease": "sineInOut",
        "keyframes": [
            (0.96, 0.96, 0, 0),
            (0.92, 0.92, -3, 2),
            (0.93, 0.94, 0, 1),
            (0.90, 0.91, 2, 2),
            (0.94, 0.94, 0, 0),
            (0.97, 0.97, 1, 0),
        ],
    },
    # 4 帧：压扁回弹（被点击）
    "clicked": {
        "fps": 10,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "linear",
        "keyframes": [
            (1.08, 0.90, 0, 4),
            (1.00, 1.00, 0, 0),
            (1.05, 0.94, 0, 2),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 4 帧：困倦慢晃 + 下沉
    "sleepy": {
        "fps": 3,
        "loop": True,
        "blink": True,
        "base": "half",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, -2, 1),
            (0.99, 1.00, -4, 3),
            (1.00, 0.99, -2, 4),
            (0.99, 1.00, 0, 2),
        ],
    },
    # 4 帧：变暗 + 呼吸（睡觉）
    "sleep": {
        "fps": 3,
        "loop": True,
        "blink": False,
        "base": "closed",
        "ease": "linear",
        "keyframes": [
            ("dim", 0.82, 1.00, 0),
            ("dim", 0.75, 0.985, 0),
            ("dim", 0.78, 0.97, 0),
            ("dim", 0.75, 0.985, 0),
        ],
    },
}


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1])
    if not src.exists():
        raise SystemExit(f"找不到图片: {src}")

    im = Image.open(src).convert("RGB")
    print(f"input: {im.size}")
    cut = segment_with_rembg(im) or segment_with_flood(im)
    base = fit_canvas(cut)
    print(f"subject bbox: {cut.getbbox()}, frame: {FRAME}x{FRAME}")

    for sheet_dir in SHEET_DIRS:
        sheet_dir.mkdir(parents=True, exist_ok=True)
    for name, spec in MOTION_SPECS.items():
        frames = []
        for item in spec["keyframes"]:
            if item[0] == "dim":
                frames.append(brightness_frame(base, item[1]))
            else:
                scale, sy, angle, dy = item
                frames.append(transform_frame(base, scale=scale, sy=sy, angle=angle, dy=dy))
        sheet = make_sheet(base, frames)
        for sheet_dir in SHEET_DIRS:
            out_path = sheet_dir / f"{name}.png"
            sheet.save(out_path)
            print(f"written: {out_path} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
