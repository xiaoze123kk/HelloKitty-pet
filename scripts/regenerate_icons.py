"""
用用户素材重新生成应用/托盘图标（Windows 需要 ico + 各尺寸 png）。
用法: python scripts/apply_pet_asset.py 之后执行
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "src-tauri" / "icons"

PNG_SIZES = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 256,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}


def make_icon_base(subject: Image.Image) -> Image.Image:
    """取主体上方约 55% 的正方形区域（耳朵 + 脸），保证小图标可辨识。"""
    bbox = subject.getbbox()
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    side = min(w, round(h * 0.55))
    left = bbox[0] + (w - side) // 2
    top = bbox[1]
    crop = subject.crop((left, top, left + side, top + side))
    return crop.resize((512, 512), Image.LANCZOS)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("用法: python scripts/regenerate_icons.py <图片路径>")
    src = Path(sys.argv[1])
    from apply_pet_asset import clean_cutout, cutout_mask

    im = Image.open(src).convert("RGB")
    subject = clean_cutout(im, cutout_mask(im))
    base = make_icon_base(subject)

    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for name, size in PNG_SIZES.items():
        out = ICON_DIR / name
        base.resize((size, size), Image.LANCZOS).save(out)
        print("written:", out)

    ico = ICON_DIR / "icon.ico"
    base.save(ico, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("written:", ico)


if __name__ == "__main__":
    main()
