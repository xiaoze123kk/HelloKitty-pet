#!/usr/bin/env python3
"""生成 KittyPet 开发用占位素材（原创白猫，不涉及任何第三方角色）。

输出:
  public/assets/pet/{idle,sleepy,sleep,clicked,happy,shy}.png  横向 sprite sheet
  src-tauri/icons/*.png / icon.ico                             应用图标
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
W = H = 240

WHITE = (252, 250, 252, 255)
WHITE_SOFT = (246, 244, 247, 255)
OUTLINE = (196, 188, 200, 255)
PINK = (232, 135, 168, 255)
PINK_DARK = (214, 108, 146, 255)
INNER_EAR = (250, 198, 214, 255)
BLUSH = (255, 182, 198, 180)
EYE = (58, 48, 56, 255)
MOUTH = (160, 110, 128, 255)
GRAY_Z = (188, 194, 208, 255)

FRAMES = {
    "idle": 6,
    "sleepy": 4,
    "sleep": 4,
    "clicked": 4,
    "happy": 6,
    "shy": 6,
}


def new_canvas() -> Image.Image:
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def draw_cat(
    draw: ImageDraw.ImageDraw,
    *,
    eye: str = "open",
    mouth: str = "smile",
    blush: bool = False,
    paws: bool = False,
    tail_angle: float = 0.0,
    dx: int = 0,
    dy: int = 0,
    squash: float = 1.0,
    z_index: int = -1,
) -> None:
    """eye: open|blink|half|closed|happy|wide"""
    cx = 120 + dx
    cy = 105 + dy

    # ---- 尾巴（身体后方）----
    tail_end = (
        62 + int(34 * math.sin(tail_angle)),
        188 - int(22 * math.cos(tail_angle)),
    )
    draw.line(
        [(96, 206), tail_end], fill=OUTLINE, width=22, joint="curve"
    )
    draw.line(
        [(96, 206), tail_end], fill=WHITE, width=16, joint="curve"
    )

    # ---- 身体 ----
    draw.ellipse((72 + dx, 148 + dy, 168 + dx, 238 + dy), fill=OUTLINE)
    draw.ellipse((76 + dx, 150 + dy, 164 + dx, 234 + dy), fill=WHITE)
    # 前脚
    draw.ellipse((92 + dx, 212 + dy, 116 + dx, 238 + dy), fill=WHITE)
    draw.ellipse((124 + dx, 212 + dy, 148 + dx, 238 + dy), fill=WHITE)

    # ---- 耳朵 ----
    left_ear = [(80, 72), (94, 40), (112, 62)]
    right_ear = [(160, 72), (146, 40), (128, 62)]
    for ear in (left_ear, right_ear):
        draw.polygon([(x + dx, y + dy) for x, y in ear], fill=OUTLINE)
    left_inner = [(88, 66), (95, 49), (106, 62)]
    right_inner = [(152, 66), (145, 49), (134, 62)]
    for inner in (left_inner, right_inner):
        draw.polygon([(x + dx, y + dy) for x, y in inner], fill=INNER_EAR)

    # ---- 头 ----
    draw.ellipse((64 + dx, 52 + dy, 176 + dx, 158 + dy), fill=OUTLINE)
    draw.ellipse((68 + dx, 56 + dy, 172 + dx, 154 + dy), fill=WHITE)

    # ---- 眼睛 ----
    eye_y = 106 + dy
    left_eye = (94 + dx, eye_y)
    right_eye = (146 + dx, eye_y)
    if eye == "open":
        for ex, _ in (left_eye, right_eye):
            draw.ellipse((ex - 7, eye_y - 11, ex + 7, eye_y + 11), fill=EYE)
            draw.ellipse((ex - 2, eye_y - 6, ex + 3, eye_y - 1), fill=(255, 255, 255, 255))
    elif eye == "wide":
        for ex, _ in (left_eye, right_eye):
            draw.ellipse((ex - 9, eye_y - 13, ex + 9, eye_y + 13), fill=EYE)
            draw.ellipse((ex - 3, eye_y - 7, ex + 4, eye_y - 1), fill=(255, 255, 255, 255))
    elif eye == "blink":
        for ex, _ in (left_eye, right_eye):
            draw.line((ex - 7, eye_y, ex + 7, eye_y), fill=EYE, width=3)
    elif eye == "half":
        for ex, _ in (left_eye, right_eye):
            draw.ellipse((ex - 6, eye_y - 4, ex + 6, eye_y + 7), fill=EYE)
            draw.rectangle((ex - 9, eye_y - 9, ex + 9, eye_y - 1), fill=WHITE)
            draw.line((ex - 7, eye_y - 3, ex + 7, eye_y - 3), fill=OUTLINE, width=2)
    elif eye == "closed":
        for ex, _ in (left_eye, right_eye):
            draw.arc((ex - 8, eye_y - 4, ex + 8, eye_y + 8), 20, 160, fill=EYE, width=3)
    elif eye == "happy":
        for ex, _ in (left_eye, right_eye):
            draw.arc((ex - 8, eye_y - 2, ex + 8, eye_y + 10), 200, 340, fill=EYE, width=3)

    # ---- 鼻子 ----
    draw.polygon(
        [(cx - 5, 119 + dy), (cx + 5, 119 + dy), (cx, 125 + dy)],
        fill=PINK_DARK,
    )

    # ---- 嘴 ----
    my = 126 + dy
    if mouth == "smile":
        draw.arc((cx - 12, my - 6, cx + 12, my + 8), 20, 160, fill=MOUTH, width=3)
        draw.line((cx, my + 2, cx, my + 9), fill=MOUTH, width=3)
    elif mouth == "open":
        draw.ellipse((cx - 8, my + 1, cx + 8, my + 15), fill=MOUTH)
    elif mouth == "small":
        draw.arc((cx - 7, my - 2, cx + 7, my + 7), 20, 160, fill=MOUTH, width=2)

    # ---- 胡须 ----
    for side in (-1, 1):
        base_x = cx + side * 32
        for k in range(2):
            yy = 116 + dy + k * 10
            draw.line(
                (base_x, yy, base_x + side * 20, yy + 4 - k * 6),
                fill=OUTLINE,
                width=2,
            )

    # ---- 腮红 ----
    if blush:
        draw.ellipse((76 + dx, 120 + dy, 102 + dx, 132 + dy), fill=BLUSH)
        draw.ellipse((138 + dx, 120 + dy, 164 + dx, 132 + dy), fill=BLUSH)

    # ---- 害羞遮脸爪 ----
    if paws:
        for px, py in ((98, 142), (142, 142)):
            draw.ellipse((px - 15 + dx, py - 12 + dy, px + 15 + dx, py + 12 + dy), fill=OUTLINE)
            draw.ellipse((px - 13 + dx, py - 10 + dy, px + 13 + dx, py + 10 + dy), fill=WHITE)
            for k in range(3):
                dot_x = px + dx + (k - 1) * 7
                dot_y = py + dy + 3 + (abs(k - 1) * 2)
                draw.ellipse((dot_x - 2, dot_y - 2, dot_x + 2, dot_y + 2), fill=PINK)

    # ---- 蝴蝶结（右耳）----
    bx, by = 168 + dx, 48 + dy
    draw.polygon([(bx - 8, by - 6), (bx - 28, by - 18), (bx - 26, by + 8)], fill=PINK)
    draw.polygon([(bx - 8, by - 6), (bx + 14, by - 16), (bx + 10, by + 6)], fill=PINK_DARK)
    draw.ellipse((bx - 13, by - 11, bx - 3, by - 1), fill=PINK_DARK)

    # ---- 睡觉 Zzz ----
    if z_index >= 0:
        z_positions = [(148, 54), (162, 40), (176, 26)]
        for i, (zx, zy) in enumerate(z_positions):
            if z_index >= len(z_positions) - i - 1:
                color = GRAY_Z
                draw.line([(zx, zy), (zx + 8, zy), (zx, zy + 9), (zx + 8, zy + 9)], fill=color, width=2)


def squash_image(img: Image.Image, factor: float) -> Image.Image:
    if abs(factor - 1.0) < 1e-3:
        return img
    new_h = max(1, int(img.height * factor))
    return img.resize((img.width, new_h), Image.LANCZOS)


def render_frame(state: str, frame: int) -> Image.Image:
    canvas = new_canvas()
    temp = new_canvas()
    draw = ImageDraw.Draw(temp)

    if state == "idle":
        blink = frame in (1, 4)
        bob = [0, 0, 1, 2, 1, 0][frame]
        tail = math.radians([0, 0, 0, 18, 0, -12][frame])
        draw_cat(draw, eye="blink" if blink else "open", mouth="smile",
                 tail_angle=tail, dy=bob)
    elif state == "sleepy":
        tail = math.radians([0, 6, 0, -6][frame])
        draw_cat(draw, eye="half", mouth="small", tail_angle=tail, dy=1)
    elif state == "sleep":
        factor = [1.0, 0.985, 0.985, 1.0][frame]
        draw_cat(draw, eye="closed", mouth="none", tail_angle=0.2,
                 squash=0.985, z_index=frame)
        img = temp
        if factor != 1.0:
            new_h = int(img.height * factor)
            resized = img.resize((img.width, new_h), Image.LANCZOS)
            img = new_canvas()
            img.paste(resized, (0, H - new_h), resized)
        return img
    elif state == "clicked":
        squash = [0.96, 0.92, 0.98, 1.0][frame]
        draw_cat(draw, eye="wide", mouth="open", blush=True, squash=squash)
        img = temp
        new_h = max(1, int(img.height * squash))
        resized = img.resize((img.width, new_h), Image.LANCZOS)
        img = new_canvas()
        img.paste(resized, (0, H - new_h), resized)
        return img
    elif state == "happy":
        bounce = [0, -5, 2, 0, -3, 0][frame]
        tail = math.radians([0, 16, -8, 16, -8, 0][frame])
        draw_cat(draw, eye="happy", mouth="open", blush=True,
                 tail_angle=tail, dy=bounce)
    elif state == "shy":
        sway = [-5, -2, 0, 2, 0, -2][frame]
        draw_cat(draw, eye="half", mouth="small", blush=True, paws=True, dx=sway)

    canvas.paste(temp, (0, 0), temp)
    return canvas


def make_sheet(state: str) -> Image.Image:
    count = FRAMES[state]
    sheet = Image.new("RGBA", (W * count, H), (0, 0, 0, 0))
    for i in range(count):
        sheet.paste(render_frame(state, i), (W * i, 0))
    return sheet


def make_icon() -> Image.Image:
    size = 512
    img = new_canvas()
    draw = ImageDraw.Draw(img)
    s = size / 240
    # 圆底
    draw.ellipse((40, 40, size - 40, size - 40), fill=PINK)
    draw.ellipse((64, 64, size - 64, size - 64), fill=WHITE)
    # 耳朵
    draw.polygon([(150, 92), (178, 30), (226, 78)], fill=OUTLINE)
    draw.polygon([(162, 88), (182, 52), (216, 82)], fill=INNER_EAR)
    draw.polygon([(286, 92), (258, 30), (210, 78)], fill=OUTLINE)
    draw.polygon([(274, 88), (254, 52), (220, 82)], fill=INNER_EAR)
    # 头
    draw.ellipse((120, 96, 392, 388), fill=OUTLINE)
    draw.ellipse((132, 108, 380, 376), fill=WHITE)
    # 眼睛
    for ex in (196, 316):
        draw.ellipse((ex - 18, 224, ex + 18, 268), fill=EYE)
        draw.ellipse((ex - 6, 236, ex + 8, 252), fill=(255, 255, 255, 255))
    # 鼻子嘴巴
    draw.polygon([(242, 282), (270, 282), (256, 296)], fill=PINK_DARK)
    draw.arc((226, 294, 286, 330), 20, 160, fill=MOUTH, width=7)
    # 蝴蝶结
    bx, by = 330, 120
    draw.polygon([(bx, by), (bx - 72, by - 34), (bx - 66, by + 26)], fill=PINK)
    draw.polygon([(bx, by), (bx + 66, by - 34), (bx + 58, by + 28)], fill=PINK_DARK)
    draw.ellipse((bx - 26, by - 22, bx + 2, by + 2), fill=PINK_DARK)
    del draw
    return img


def main() -> None:
    out_pet = ROOT / "public" / "assets" / "pet"
    out_pet.mkdir(parents=True, exist_ok=True)
    for state in FRAMES:
        path = out_pet / f"{state}.png"
        make_sheet(state).save(path)
        print(f"generated {path.relative_to(ROOT)}")

    icon = make_icon()
    icons_dir = ROOT / "src-tauri" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    icon.save(icons_dir / "icon.png")
    icon.resize((32, 32), Image.LANCZOS).save(icons_dir / "32x32.png")
    icon.resize((128, 128), Image.LANCZOS).save(icons_dir / "128x128.png")
    icon.resize((256, 256), Image.LANCZOS).save(icons_dir / "128x128@2x.png")
    icon.save(
        icons_dir / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"generated {icons_dir.relative_to(ROOT)} icons")


if __name__ == "__main__":
    main()
