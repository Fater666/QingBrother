#!/usr/bin/env python3
"""
从一张 logo 图生成 Android 应用图标并写入 mipmap 目录。
生成: ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png
密度: mdpi(48), hdpi(72), xhdpi(96), xxhdpi(144), xxxhdpi(192)
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("请先安装 Pillow: pip install Pillow")
    sys.exit(1)

# 项目根目录（脚本在 scripts/ 下）
ROOT = Path(__file__).resolve().parent.parent
SOURCE_LOGO = ROOT / "docs" / "final_image" / "2._游戏图标_-_方案_A_极简符号.png"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

# 各密度对应的边长（像素）
MIPMAP_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def ensure_rgba(img: Image.Image) -> Image.Image:
    """转为 RGBA，便于做圆形遮罩。"""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    return img


def resize_to_square(img: Image.Image, size: int) -> Image.Image:
    """将图片等比缩放并居中裁成 size x size 正方形。"""
    w, h = img.size
    if w == h and w == size:
        return img.copy()
    scale = max(size / w, size / h)
    new_w, new_h = int(w * scale), int(h * scale)
    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (new_w - size) // 2
    top = (new_h - size) // 2
    return img.crop((left, top, left + size, top + size))


def make_round(img: Image.Image) -> Image.Image:
    """将正方形图裁成圆形（透明背景）。"""
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    from PIL import ImageDraw

    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img_rgba = ensure_rgba(img)
    out.paste(img_rgba, (0, 0), mask=mask)
    return out


def main():
    source = SOURCE_LOGO
    if len(sys.argv) > 1:
        source = Path(sys.argv[1])
    if not source.is_absolute():
        source = ROOT / source
    if not source.exists():
        print(f"错误: 找不到源图 {source}")
        sys.exit(1)

    print(f"源图: {source}")
    print(f"输出: {ANDROID_RES}")

    img = Image.open(source).copy()
    img = ensure_rgba(img)

    for mipmap_dir, size in MIPMAP_SIZES.items():
        out_dir = ANDROID_RES / mipmap_dir
        out_dir.mkdir(parents=True, exist_ok=True)

        square = resize_to_square(img, size)
        round_img = make_round(square)

        square.save(out_dir / "ic_launcher.png", "PNG")
        round_img.save(out_dir / "ic_launcher_round.png", "PNG")
        square.save(out_dir / "ic_launcher_foreground.png", "PNG")

        print(f"  {mipmap_dir}: {size}x{size} -> ic_launcher*.png")

    print("完成。已生成并写入各 mipmap 目录。")


if __name__ == "__main__":
    main()
