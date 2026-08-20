"""
把用户提供的宠物立绘转换为桌宠动作素材。

用法:
    python scripts/apply_pet_asset.py <图片路径>

输入: 一张主体为白猫、背景为粉色的方形 PNG（无透明通道）。
输出: src/assets/pet/{idle,happy,shy,sleep,sleepy,clicked}.png
      每张都是 240px 高的横向帧序列，帧宽 240px。

若 scripts/export_procedural_kit.py 已生成表情帧（cutout-frame-*.png），
本脚本会用对应表情作为各动作的基帧；否则回退到原始睁眼立绘。
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


def binary_components(mask, threshold=128):
    """返回 mask 中 >threshold 的所有连通块（按面积降序）。"""
    w, h = mask.size
    data = mask.load()
    visited = bytearray(w * h)
    comps = []
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
            comps.append(comp)
    comps.sort(key=len, reverse=True)
    return comps


def largest_component(mask, threshold=128):
    """只保留最大连通块，去掉模型/泛洪产生的背景残留小块。"""
    comps = binary_components(mask, threshold)
    out = Image.new("L", mask.size, 0)
    if comps:
        op = out.load()
        for x, y in comps[0]:
            op[x, y] = 255
    return out


def keep_subject_components(alpha, source_rgb, low=128, margin=40, min_size=20):
    """
    把“可能属于主体的连通块”都保留下来：
    - 最大块一定是主体；
    - 其余块只要在主块 bbox 外扩 margin 的范围内、且面积 >= min_size，
      就保留。睡觉图里右脸、胡须会被 rembg 切成独立块，必须留下；
      低置信度的背景晕边不在这里（它们 alpha 低于 low，交给边缘去黑处理）。
    """
    del source_rgb  # 颜色不再作为过滤条件：深色胡须/右脸是主体的一部分
    binary = alpha.point(lambda v: 255 if v > low else 0)
    comps = binary_components(binary)
    out = Image.new("L", alpha.size, 0)
    if not comps:
        return out
    main = comps[0]
    xs = [p[0] for p in main]
    ys = [p[1] for p in main]
    bx0, by0, bx1, by1 = min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin

    op = out.load()
    for x, y in main:
        op[x, y] = 255
    for comp in comps[1:]:
        if len(comp) < min_size:
            continue
        near = any(
            bx0 <= x <= bx1 and by0 <= y <= by1
            for x, y in comp[: min(len(comp), 5000)]
        )
        if not near:
            continue
        for x, y in comp:
            op[x, y] = 255
    return out


def polish_mask(mask):
    """
    闭运算收边：先膨胀补上耳朵内缺口/细缝，再腐蚀回原边界；
    避免旧版 MinFilter 整体腐蚀造成撕裂。
    """
    mask = mask.filter(ImageFilter.MaxFilter(5))
    mask = mask.filter(ImageFilter.MinFilter(5))
    mask = mask.filter(ImageFilter.GaussianBlur(1.4))
    return mask


def decontaminate_edges(rgba):
    """
    边缘去背景色：
    1. 对半透明像素，取周围“最亮”的不透明邻居颜色（白猫主体取到白毛，
       而不是深色背景/描边），迭代 4 轮向外扩散；
    2. 仍未填充且偏黑的边缘像素直接向白色收敛，杜绝黑色晕圈。
    """
    px = rgba.load()
    w, h = rgba.size
    solid = bytearray(w * h)
    semi = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            idx = y * w + x
            if a >= 250:
                solid[idx] = 1
            elif a > 0:
                semi.append((x, y))

    for _ in range(4):
        if not semi:
            break
        remaining = []
        for x, y in semi:
            idx = y * w + x
            best = None
            best_light = -1
            for dx, dy in ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and solid[ny * w + nx]:
                    r, g, b, _ = px[nx, ny]
                    light = r + g + b
                    if light > best_light:
                        best_light = light
                        best = (r, g, b)
            if best is not None:
                px[x, y] = (best[0], best[1], best[2], px[x, y][3])
                solid[idx] = 1
            else:
                remaining.append((x, y))
        semi = remaining

    # 半透明但颜色仍很深的点：向白色收敛（边缘最多 1–2px，视觉上是白描边而非黑撕裂）
    for x, y in semi:
        r, g, b, a = px[x, y]
        if r < 150 and g < 150 and b < 150:
            px[x, y] = (236 + r // 20, 236 + g // 20, 236 + b // 20, a)
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

    strong = keep_subject_components(a, im, low=128, margin=40, min_size=20)
    body_low = keep_subject_components(a, im, low=64, margin=40, min_size=20)
    # 睡觉等图里，右脸等浅色区域 rembg 只给了 64–128 的弱置信度；
    # 把它们补回 mask，但只补浅色像素——深色弱置信像素是垫子/背景晕边，继续丢弃。
    mask = strong.copy()
    spx = im.load()
    sop = strong.load()
    bop = body_low.load()
    mp = mask.load()
    for y in range(mask.height):
        for x in range(mask.width):
            if bop[x, y] > 0 and sop[x, y] == 0:
                r, g, b = spx[x, y]
                if r + g + b >= 360:
                    mp[x, y] = 255
    # 泛洪补白：rembg 会把“白脸”这类浅色主体整块判成背景（alpha≈0）。
    # 用粉色背景颜色泛洪找回：只补“主体 bbox 内、非粉色背景、颜色浅”的像素，
    # 深色垫子/被子残片仍不会回来。注意不能用 largest_component：
    # 蝴蝶结与胡子之间的白脸会和主体被粉背景隔成独立小块，必须保留。
    flood = cutout_mask(im).filter(ImageFilter.MinFilter(3))
    fpx = flood.load()
    fb = mask.getbbox()
    if fb:
        fb0 = (max(0, fb[0] - 20), max(0, fb[1] - 20), min(mask.width, fb[2] + 20), min(mask.height, fb[3] + 20))
        for y in range(fb0[1], fb0[3]):
            for x in range(fb0[0], fb0[2]):
                if mp[x, y] == 0 and fpx[x, y] > 0:
                    r, g, b = spx[x, y]
                    if r + g + b >= 360:
                        mp[x, y] = 255
    # 闭运算补缺口（如耳朵内的小洞、腿间细缝）；不要用 MinFilter 整体腐蚀
    mask = mask.filter(ImageFilter.MaxFilter(19))
    mask = mask.filter(ImageFilter.MinFilter(19))
    mask = mask.filter(ImageFilter.GaussianBlur(1.4))
    clean = Image.new("RGBA", im.size, (0, 0, 0, 0))
    clean.paste(im.convert("RGB"), (0, 0), mask)
    clean = decontaminate_edges(clean)
    kept = sum(1 for v in mask.get_flattened_data() if v > 128)
    print(f"rembg segmentation: opaque={opaque}, subject mask={kept}")
    return clean


def segment_with_flood(im):
    mask = largest_component(cutout_mask(im))
    mask = polish_mask(mask)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im.convert("RGB"), (0, 0), mask)
    return decontaminate_edges(out)


def white_fill_transparent(img):
    """把 alpha==0 的像素 RGB 填成白色，避免 RGBA 缩放时深色背景渗进边缘。"""
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (255, 255, 255, 0)
    return img


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
    subject = white_fill_transparent(cutout.crop((left, top, right, bottom)))
    scale = min((size - 2) / subject.width, (size - 2) / subject.height)
    target = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(target, Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(subject, ((size - target[0]) // 2, (size - target[1]) // 2), subject)
    # 缩放会在高透明度的深色描边处再制造一圈半透明暗边，这里再收一次
    return decontaminate_edges(canvas)


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


# 表情帧文件名（与 scripts/export_procedural_kit.py 的输出保持一致）。
# 回退 sprite sheet 也用对应表情做基帧，避免高清帧加载期间出现
# “sleepy/sleep 却睁着眼”的表情错位。
EXPRESSION_FILES = {
    "open": "cutout-frame@5x.png",
    "closed": "cutout-frame-blink@5x.png",
    "half": "cutout-frame-half@5x.png",
    "happy": "cutout-frame-happy@5x.png",
    "shy": "cutout-frame-shy@5x.png",
    "surprised": "cutout-frame-surprised@5x.png",
}

# 使用用户提供的整身立绘作为基帧的动作（而不是从 idle 表情推导）。
# 文件放在 assets/ 投放区；同一文件可复用于多个动作（如 sleep 立绘用于入睡/睡觉/起床）。
POSE_SOURCES = {
    "happy": "happy.png.png",
    "shy": "shy.png.png",
    "dragging": "drag.png.png",
    "fallAsleep": "sleep.png.png",
    "wake": "sleep.png.png",
    "sleep": "sleep.png.png",
    "angry": "angry.png.png",
}

_pose_base_cache = {}


def load_pose_base(motion_name):
    """从 assets/ 投放区加载指定立绘并抠图、归一化成 240px 基帧。"""
    filename = POSE_SOURCES.get(motion_name)
    if not filename:
        return None
    if filename in _pose_base_cache:
        return _pose_base_cache[filename]
    path = ROOT / "assets" / filename
    if not path.exists():
        raise SystemExit(
            f"动作 {motion_name} 需要立绘 {filename}，但 assets/ 里找不到。\n"
            "请把对应姿势的整身立绘放进 assets/ 后再运行本脚本。"
        )
    im = Image.open(path).convert("RGB")
    cut = segment_with_rembg(im) or segment_with_flood(im)
    base = fit_canvas(cut)
    _pose_base_cache[filename] = base
    print(f"pose base: {motion_name} <- {filename}")
    return base


def load_expression_base(spec_base, fallback):
    """优先加载已生成的表情帧作为该动作的基帧。

    open 缺少时回退到本次抠图立绘；其余表情（closed/half/happy/shy）缺失
    说明 export_procedural_kit.py 的眼睛检测/表情生成失败或尚未运行。
    此时绝不静默退回睁眼立绘——否则会生成“睁着眼睡觉”的素材。
    """
    filename = EXPRESSION_FILES.get(spec_base)
    if filename:
        for sheet_dir in SHEET_DIRS:
            path = sheet_dir / filename
            if path.exists():
                return Image.open(path).convert("RGBA").resize(
                    (FRAME, FRAME), Image.LANCZOS,
                )
        if spec_base != "open":
            raise SystemExit(
                f"缺少表情帧 {filename}（base={spec_base}）。\n"
                "请先运行 `python scripts/export_procedural_kit.py <立绘.png>`，"
                "确认它能检测到眼睛并成功生成全部表情帧后再重试。"
            )
    return fallback


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
    # 6 帧：伸懒腰（下蹲蓄力 → 拉长上顶 → 回落）
    "stretch": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (0.96, 0.94, 0, 3),
            (1.00, 1.06, 0, -10),
            (1.02, 1.08, 1, -14),
            (1.00, 1.04, 0, -8),
            (0.98, 0.99, 0, 0),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：打哈欠（闭眼 + 后仰拉伸）
    "yawn": {
        "fps": 7,
        "loop": False,
        "blink": False,
        "base": "closed",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (0.98, 1.02, -2, -6),
            (0.99, 1.04, -4, -10),
            (1.00, 1.05, -3, -12),
            (1.00, 1.02, 0, -4),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：洗脸（半闭眼 + 左右蹭头）
    "wash": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "half",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.00, 0.99, 4, 1),
            (1.01, 0.99, 6, 2),
            (1.00, 1.00, 4, 1),
            (0.99, 1.00, -4, 1),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 7 帧：左右张望（睁眼 + 转头）
    "look": {
        "fps": 6,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.00, 1.00, -3, 0),
            (1.01, 1.00, -5, 1),
            (1.00, 1.00, 0, 0),
            (1.00, 1.00, 4, 1),
            (1.01, 1.00, 6, 0),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：入睡下沉（眼已闭上 → 身体沉下去，随后切 sleeping）
    "fallAsleep": {
        "fps": 6,
        "loop": False,
        "blink": False,
        "base": "closed",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.00, 0.99, 1, 2),
            (0.99, 0.98, 2, 4),
            (0.98, 0.97, 1, 5),
            (0.98, 0.96, 0, 6),
            (0.98, 0.96, 0, 7),
        ],
    },
    # 6 帧：起床伸懒腰（闭眼保持到睁眼前一刻，随后切 idle）
    "wake": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "closed",
        "ease": "sineInOut",
        "keyframes": [
            (0.98, 0.96, 0, 6),
            (0.99, 0.98, -1, 3),
            (1.00, 1.03, 0, -6),
            (1.01, 1.05, 1, -10),
            (1.00, 1.02, 0, -4),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 4 帧循环：被拎起来的悬挂摇晃
    "dragging": {
        "fps": 6,
        "loop": True,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.04, -2, -4),
            (1.00, 1.05, -3, -6),
            (1.00, 1.04, -2, -4),
            (1.00, 1.05, -3, -5),
        ],
    },
    # 5 帧：落地压扁 → 回弹站稳
    "landing": {
        "fps": 10,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (1.02, 0.92, 0, 6),
            (1.06, 0.88, 0, 8),
            (1.00, 0.97, 0, 2),
            (0.99, 1.02, 0, -2),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 4 帧循环：被撸时的开心摇摆（爱心由前端粒子负责）
    "petted": {
        "fps": 8,
        "loop": True,
        "blink": False,
        "base": "happy",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.02, 1.01, 2, -1),
            (1.01, 1.02, -2, 0),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 5 帧：摸头（开心眼 + 往手边轻靠）
    "headpat": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "happy",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (0.98, 1.02, -3, -4),
            (0.99, 1.04, -4, -6),
            (1.00, 1.02, -2, -3),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 4 帧：戳身体（压扁 + 左右轻晃）
    "bodypat": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (1.04, 0.93, 0, 3),
            (1.00, 1.02, 2, -2),
            (1.02, 0.98, -2, 1),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 5 帧：碰蝴蝶结（害羞闭眼 + 往蝴蝶结一侧轻歪）
    "bowtouch": {
        "fps": 7,
        "loop": False,
        "blink": False,
        "base": "shy",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (0.99, 1.01, -2, -1),
            (1.00, 1.02, -4, -3),
            (1.00, 1.01, -2, -1),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：逗猫棒第一次划动——抬头看（睁眼 + 拉长上探）
    "tease": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.02, 1.03, 0, -5),
            (1.03, 1.05, 0, -9),
            (1.01, 1.04, 0, -7),
            (1.00, 1.01, 0, -2),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：连续划动——下蹲蓄力 → 腾空扑击 → 落地回弹
    "pounce": {
        "fps": 10,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (0.96, 0.94, 0, 4),
            (0.98, 1.00, 0, -6),
            (1.06, 0.92, 0, -16),
            (1.03, 0.90, 0, 6),
            (1.00, 1.02, 0, -3),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 4 帧循环：散步摇摆步态
    "walk": {
        "fps": 8,
        "loop": True,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, -3, 1),
            (1.00, 1.02, 2, -1),
            (1.00, 1.00, 3, 1),
            (1.00, 1.02, -2, -1),
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
    # 4 帧：变暗 + 缓慢呼吸（睡觉）
    "sleep": {
        "fps": 3,
        "loop": True,
        "blink": False,
        "base": "closed",
        "ease": "sineInOut",
        "keyframes": [
            ("dim", 0.82, 1.000, 1.000, 0, 0),
            ("dim", 0.76, 1.010, 0.992, 0, 2),
            ("dim", 0.78, 1.006, 1.006, 0, 0),
            ("dim", 0.75, 1.000, 1.000, 0, 2),
        ],
    },
    # 7 帧：打喷嚏（闭眼蓄力 → 甩头 → 抖动回落）
    "sneeze": {
        "fps": 10,
        "loop": False,
        "blink": False,
        "base": "closed",
        "ease": "sineInOut",
        "keyframes": [
            (0.99, 0.97, 0, 2),
            (0.96, 0.94, 0, 3),
            (0.94, 1.07, -5, -5),
            (1.05, 0.88, 6, -3),
            (0.98, 1.03, -4, 1),
            (1.00, 1.00, 2, 0),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：甩水抖毛（左右快速小角度抖动）
    "shake": {
        "fps": 10,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "linear",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.00, 1.00, 4, 0),
            (1.00, 1.00, -4, 0),
            (1.00, 1.00, 5, 0),
            (1.00, 1.00, -5, 0),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 9 帧：原地转圈（0°→360°，轻微起伏）
    "spin": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "linear",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.00, 1.00, 45, -2),
            (1.00, 1.00, 90, -4),
            (1.00, 1.00, 135, -2),
            (1.00, 1.00, 180, 0),
            (1.00, 1.00, 225, -2),
            (1.00, 1.00, 270, -4),
            (1.00, 1.00, 315, -2),
            (1.00, 1.00, 360, 0),
        ],
    },
    # 4 帧循环：生气发抖（疯狂连击时使用，基帧来自 assets/angry.png.png）
    "angry": {
        "fps": 9,
        "loop": True,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, -2, 0),
            (1.02, 0.99, 2, -1),
            (1.01, 1.01, -2, 0),
            (1.00, 1.00, 2, 0),
        ],
    },
    # 7 帧：开心蹦跳（笑眼 + 下蹲蓄力 → 腾空 → 落地压扁 → 回弹）
    "jump": {
        "fps": 9,
        "loop": False,
        "blink": False,
        "base": "happy",
        "ease": "sineInOut",
        "keyframes": [
            (1.02, 0.92, 0, 6),
            (1.04, 1.03, 0, -8),
            (1.06, 1.00, 0, -20),
            (1.02, 0.98, 0, -24),
            (1.04, 0.95, 0, -8),
            (1.08, 0.88, 0, 8),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：点头两下（半闭眼 + 身体轻轻下压）
    "nod": {
        "fps": 7,
        "loop": False,
        "blink": False,
        "base": "half",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.01, 0.97, 0, 2),
            (1.00, 0.96, 0, 4),
            (1.00, 0.99, 0, 1),
            (1.01, 0.97, 0, 3),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 8 帧：左右摇摆哼歌（笑眼）
    "sway": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "happy",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, -6, 0),
            (1.00, 1.01, -4, -1),
            (1.00, 1.00, 0, 0),
            (1.00, 1.00, 6, 0),
            (1.00, 1.01, 4, -1),
            (1.00, 1.00, 0, 0),
            (1.00, 1.00, -4, 0),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：鞠躬（闭眼 + 身体前倾下压）
    "bow": {
        "fps": 7,
        "loop": False,
        "blink": False,
        "base": "closed",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.01, 0.97, -2, 2),
            (1.02, 0.93, -4, 5),
            (1.01, 0.92, -4, 7),
            (1.00, 0.97, -2, 3),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 5 帧：吓一跳（惊讶眼 + 突然后仰弹起）
    "startle": {
        "fps": 10,
        "loop": False,
        "blink": False,
        "base": "surprised",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.06, 1.03, -3, -14),
            (1.09, 1.06, -5, -16),
            (1.02, 0.98, 3, -4),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：晕眩摇晃（半闭眼 + 左右歪倒）
    "dizzy": {
        "fps": 7,
        "loop": False,
        "blink": False,
        "base": "half",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.00, 1.00, -7, 0),
            (1.00, 1.01, 6, 0),
            (1.00, 1.00, -5, 0),
            (1.00, 1.01, 4, 0),
            (1.00, 1.00, 0, 0),
        ],
    },
    # 6 帧：蹲下探头（睁眼 + 压低身体再弹起来）
    "peek": {
        "fps": 8,
        "loop": False,
        "blink": False,
        "base": "open",
        "ease": "sineInOut",
        "keyframes": [
            (1.00, 1.00, 0, 0),
            (1.04, 0.94, 0, 4),
            (1.05, 0.92, 0, 6),
            (1.04, 0.94, 0, 5),
            (1.02, 1.02, 0, -4),
            (1.00, 1.00, 0, 0),
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
        motion_base = load_pose_base(name) or load_expression_base(spec["base"], base)
        frames = []
        for item in spec["keyframes"]:
            if item[0] == "dim":
                # ("dim", brightness, scale, scaleY, angle, dy)：先做形体变换再调亮度
                _, brightness, scale, sy, angle, dy = item
                transformed = transform_frame(
                    motion_base, scale=scale, sy=sy, angle=angle, dy=dy,
                )
                frames.append(brightness_frame(transformed, brightness))
            else:
                scale, sy, angle, dy = item
                frames.append(
                    transform_frame(motion_base, scale=scale, sy=sy, angle=angle, dy=dy),
                )
        sheet = make_sheet(base, frames)
        for sheet_dir in SHEET_DIRS:
            out_path = sheet_dir / f"{name}.png"
            sheet.save(out_path)
            print(f"written: {out_path} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
