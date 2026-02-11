import os
import json
import base64
from pathlib import Path
from PIL import Image
from google import genai
from google.genai import types

# 配置路径
BASE_DIR = Path("/Users/fater/project/QingBrother")
DOCS_DIR = BASE_DIR / "docs"
IMAGES_DIR = DOCS_DIR / "final_image"
OUTPUT_DIR = IMAGES_DIR / "composed"
OUTPUT_DIR.mkdir(exist_ok=True)

# Logo 文件路径
LOGO_PATH = IMAGES_DIR / "6._游戏_LOGO_-_方案_A_中文书法标题.png"

# 需要处理的背景图关键词
TARGET_FILES = [
    "3._封面图_-_方案_A_竖版封面.png",
    "3._封面图_-_方案_B_横版宣传封.png",
    "4._宣传图_-_场景_A_艰难行军.png",
    "4._宣传图_-_场景_B_营地整备.png",
    "7._游戏库背景壁纸_-_方案_A_战场对峙.png",
    "7._游戏库背景壁纸_-_方案_B_篝火夜话.png"
]

def load_api_key():
    key_file = BASE_DIR / "scripts/api_key.txt"
    if "GEMINI_API_KEY" in os.environ:
        return os.environ["GEMINI_API_KEY"]
    if key_file.exists():
        content = key_file.read_text(encoding="utf-8").strip()
        lines = content.splitlines()
        for line in reversed(lines):
            line = line.strip()
            if line and not line.startswith("#"):
                return line
    return None

def remove_white_bg(image, threshold=240):
    """
    将图像中的白色背景转换为透明
    """
    print("Processing Logo: Removing white background...")
    image = image.convert("RGBA")
    data = image.getdata()
    
    new_data = []
    for item in data:
        # item is (R, G, B, A)
        # 如果像素足够白，将其 Alpha 设为 0
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
    image.putdata(new_data)
    # 裁剪掉多余的透明边缘，让 Logo 紧凑
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    return image

def get_layout_from_ai(client, image_path):
    # 读取图片数据
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    
    prompt = """
    I have a game logo (text based) that needs to be placed on this marketing image.
    
    Please analyze the image visually and find the ABSOLUTE BEST location and size for the logo.
    
    Goal: Create a professional-looking game poster or cover art.
    
    Guidance:
    - The logo should be prominent and legible.
    - It should utilize negative space if available.
    - It must NOT cover important focal points (like faces of main characters).
    - You decide the position (top, bottom, center, corners, etc.) based purely on what looks best for this specific image.
    - You decide the size (large/epic or subtle) based on the composition.
    
    Return a JSON object with:
    - "position_description": "Why you chose this spot and size"
    - "bounding_box": [ymin, xmin, ymax, xmax] 
      (values from 0 to 1000. This box defines EXACTLY where the logo image will be placed and scaled to fit)
    """

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                types.Content(
                    parts=[
                        types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                        types.Part.from_text(text=prompt)
                    ]
                )
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        text = response.text.strip()
        # Clean markdown code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
            
        print(f"   AI Response: {text[:100]}...") # Debug print
        
        data = json.loads(text)
        
        # Handle list response
        if isinstance(data, list):
            if len(data) > 0:
                return data[0]
            else:
                return None
                
        return data
    except Exception as e:
        print(f"Error getting AI layout for {image_path.name}: {e}")
        return None

def compose_image(bg_path, logo_image, layout):
    bg = Image.open(bg_path).convert("RGBA")
    # logo_image 已经是处理过的 Image 对象
    
    bg_w, bg_h = bg.size
    
    # 解析 AI 返回的坐标 (0-1000 scale)
    bbox = layout["bounding_box"]
    ymin, xmin, ymax, xmax = bbox
    
    # 转换为像素坐标
    target_x = int((xmin / 1000) * bg_w)
    target_y = int((ymin / 1000) * bg_h)
    target_w = int(((xmax - xmin) / 1000) * bg_w)
    target_h = int(((ymax - ymin) / 1000) * bg_h)
    
    # 计算 Logo 缩放
    logo_w, logo_h = logo_image.size
    logo_aspect = logo_w / logo_h
    target_aspect = target_w / target_h
    
    if logo_aspect > target_aspect:
        # Logo 更宽，以宽度为准
        new_w = target_w
        new_h = int(new_w / logo_aspect)
    else:
        # Logo 更高，以高度为准
        new_h = target_h
        new_w = int(new_h * logo_aspect)
        
    # 调整 Logo 大小 (使用 LANCZOS 保持高质量)
    logo_resized = logo_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # 计算居中位置 (在目标框内居中)
    paste_x = target_x + (target_w - new_w) // 2
    paste_y = target_y + (target_h - new_h) // 2
    
    # 合成 (使用 logo 本身作为 mask)
    bg.paste(logo_resized, (paste_x, paste_y), logo_resized)
    
    # 保存
    output_filename = f"Logo版_{bg_path.name}"
    output_path = OUTPUT_DIR / output_filename
    bg.save(output_path)
    print(f"✅ Generated: {output_path.name}")
    print(f"   Reason: {layout['position_description']}")

def main():
    api_key = load_api_key()
    if not api_key:
        print("API Key not found.")
        return
        
    client = genai.Client(api_key=api_key)
    
    if not LOGO_PATH.exists():
        print(f"Logo not found at {LOGO_PATH}")
        return

    print(f"Starting AI-powered composition using Logo: {LOGO_PATH.name}...")
    
    # 预处理 Logo：加载并去底
    raw_logo = Image.open(LOGO_PATH)
    processed_logo = remove_white_bg(raw_logo)
    
    processed_count = 0
    for filename in TARGET_FILES:
        bg_path = IMAGES_DIR / filename
        if not bg_path.exists():
            continue
            
        print(f"\nAnalyzing {filename}...")
        layout = get_layout_from_ai(client, bg_path)
        
        if layout:
            compose_image(bg_path, processed_logo, layout)
            processed_count += 1
            
    print(f"\nDone! Processed {processed_count} images. Check {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
