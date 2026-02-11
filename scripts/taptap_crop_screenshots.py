#!/usr/bin/env python3
"""
TapTap 游戏截图裁剪脚本
按 TapTap 平台要求处理 docs/taptap 下的截图：
- 横图 宽高比 8:3 ~ 8:5，分辨率不低于 1280x720
- 竖图 宽高比 3:8 ~ 5:8，分辨率不低于 720x1280
- 所有图片与第一张比例一致，单张 < 4MB
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("请先安装 Pillow: pip install Pillow")
    sys.exit(1)

# 路径
PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = PROJECT_ROOT / "docs" / "taptap"
OUTPUT_DIR = PROJECT_ROOT / "docs" / "taptap" / "cropped"

# TapTap 规范
H_RATIO_MIN = 8 / 5   # 1.6
H_RATIO_MAX = 8 / 3   # ~2.667
V_RATIO_MIN = 3 / 8   # 0.375
V_RATIO_MAX = 5 / 8   # 0.625
MIN_WIDTH_H = 1280
MIN_HEIGHT_H = 720
MIN_WIDTH_V = 720
MIN_HEIGHT_V = 1280
MAX_FILE_BYTES = 4 * 1024 * 1024  # 4MB


def get_aspect_ratio(w: int, h: int) -> float:
    return w / h if h else 0


def clamp_ratio_to_taptap(w: int, h: int) -> tuple[str, float]:
    """根据第一张图确定横/竖及合规宽高比。返回 ('horizontal'|'vertical', target_ratio)。"""
    r = get_aspect_ratio(w, h)
    if w >= h:
        # 横图：宽高比 8:5 ~ 8:3
        r = max(H_RATIO_MIN, min(H_RATIO_MAX, r))
        return "horizontal", r
    else:
        # 竖图：宽高比 3:8 ~ 5:8
        r = max(V_RATIO_MIN, min(V_RATIO_MAX, r))
        return "vertical", r


def crop_to_ratio(img: Image.Image, target_ratio: float, mode: str) -> Image.Image:
    """中心裁剪到目标宽高比。"""
    w, h = img.size
    current_ratio = get_aspect_ratio(w, h)
    if abs(current_ratio - target_ratio) < 1e-6:
        return img.copy()
    if mode == "horizontal":
        # 需要更宽：裁上下
        if current_ratio < target_ratio:
            new_h = int(w / target_ratio)
            top = (h - new_h) // 2
            return img.crop((0, top, w, top + new_h))
        else:
            new_w = int(h * target_ratio)
            left = (w - new_w) // 2
            return img.crop((left, 0, left + new_w, h))
    else:
        # 竖图：需要更高：裁左右
        if current_ratio > target_ratio:
            new_w = int(h * target_ratio)
            left = (w - new_w) // 2
            return img.crop((left, 0, left + new_w, h))
        else:
            new_h = int(w / target_ratio)
            top = (h - new_h) // 2
            return img.crop((0, top, w, top + new_h))


def resize_to_min(img: Image.Image, mode: str) -> Image.Image:
    """缩放到不低于最低分辨率（保持比例）。"""
    w, h = img.size
    if mode == "horizontal":
        if w >= MIN_WIDTH_H and h >= MIN_HEIGHT_H:
            return img
        scale = max(MIN_WIDTH_H / w, MIN_HEIGHT_H / h)
    else:
        if w >= MIN_WIDTH_V and h >= MIN_HEIGHT_V:
            return img
        scale = max(MIN_WIDTH_V / w, MIN_HEIGHT_V / h)
    new_w = max(int(w * scale), MIN_WIDTH_H if mode == "horizontal" else MIN_WIDTH_V)
    new_h = max(int(h * scale), MIN_HEIGHT_H if mode == "horizontal" else MIN_HEIGHT_V)
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS)


def save_under_size(img: Image.Image, out_path: Path, ext: str) -> None:
    """保存为 JPG/PNG，若超过 4MB 则降低 JPG 质量重试。"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if ext.lower() == ".png":
        img.save(out_path, "PNG", optimize=True)
        if out_path.stat().st_size > MAX_FILE_BYTES:
            # PNG 过大时转为 JPG
            out_path = out_path.with_suffix(".jpg")
            save_under_size(img, out_path, ".jpg")
        return
    # JPG
    for quality in [92, 85, 78, 70, 60]:
        img.save(out_path, "JPEG", quality=quality, optimize=True)
        if out_path.stat().st_size <= MAX_FILE_BYTES:
            return
    # 最后缩小尺寸
    w, h = img.size
    while out_path.exists() and out_path.stat().st_size > MAX_FILE_BYTES and w > 640:
        w, h = w * 9 // 10, h * 9 // 10
        img_small = img.resize((w, h), Image.Resampling.LANCZOS)
        img_small.save(out_path, "JPEG", quality=75, optimize=True)
    if out_path.stat().st_size > MAX_FILE_BYTES:
        print(f"  警告: {out_path.name} 仍超过 4MB，请手动压缩或换图")


def process_image(
    path: Path,
    target_ratio: float,
    mode: str,
    index: int,
) -> None:
    """处理单张图片：裁剪、缩放、保存。"""
    with Image.open(path) as img:
        img = img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        cropped = crop_to_ratio(img, target_ratio, mode)
        resized = resize_to_min(cropped, mode)
        ext = path.suffix.lower()
        if ext not in (".jpg", ".jpeg", ".png"):
            ext = ".jpg"
        out_name = f"screen{index + 1}{ext}"
        out_path = OUTPUT_DIR / out_name
        save_under_size(resized, out_path, ext)
        size_mb = out_path.stat().st_size / (1024 * 1024)
        print(f"  {path.name} -> {out_name} ({resized.size[0]}x{resized.size[1]}, {size_mb:.2f} MB)")


def main():
    if not INPUT_DIR.is_dir():
        print(f"输入目录不存在: {INPUT_DIR}")
        sys.exit(1)
    allowed = {".jpg", ".jpeg", ".png"}
    files = sorted(
        [f for f in INPUT_DIR.iterdir() if f.is_file() and f.suffix.lower() in allowed],
        key=lambda p: p.name,
    )
    if not files:
        print(f"在 {INPUT_DIR} 下未找到 JPG/PNG 图片")
        sys.exit(1)
    if len(files) < 3:
        print("TapTap 要求不少于 3 张截图，当前不足 3 张，请补充后再运行")
        sys.exit(1)
    # 第一张定比例
    with Image.open(files[0]) as first:
        w, h = first.size
    mode, target_ratio = clamp_ratio_to_taptap(w, h)
    print(f"以第一张为准: {'横图' if mode == 'horizontal' else '竖图'}, 宽高比 ≈ {target_ratio:.3f}")
    print(f"输出目录: {OUTPUT_DIR}\n")
    for i, path in enumerate(files):
        process_image(path, target_ratio, mode, i)
    print("\n完成。请将 cropped 目录下的图片按顺序上传，并确保实机截图在前、概念/宣传图最多 2 张。")


if __name__ == "__main__":
    main()
