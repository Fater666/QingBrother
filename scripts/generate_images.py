import os
import re
import argparse
from pathlib import Path
from google import genai
from google.genai import types
from PIL import Image
import io

# Setup
BASE_DIR = Path(__file__).parent.parent
DOCS_DIR = BASE_DIR / "docs"
IMAGES_DIR = DOCS_DIR / "images"
IMAGES_DIR.mkdir(exist_ok=True, parents=True)

API_KEY_FILE = BASE_DIR / "scripts/api_key.txt"

def load_api_key():
    if "GEMINI_API_KEY" in os.environ:
        return os.environ["GEMINI_API_KEY"]
    if API_KEY_FILE.exists():
        content = API_KEY_FILE.read_text(encoding="utf-8").strip()
        lines = content.splitlines()
        for line in reversed(lines):
            line = line.strip()
            if line and not line.startswith("#"):
                return line
    return None

def parse_prompts(md_file):
    content = md_file.read_text(encoding="utf-8")
    prompts = []
    
    current_major_section = ""
    current_sub_section = ""
    
    lines = content.splitlines()
    
    for i, line in enumerate(lines):
        line = line.strip()
        if line.startswith("## "):
            current_major_section = line.strip("#").strip()
        elif line.startswith("### "):
            current_sub_section = line.strip("#").strip()
        elif line.startswith(">"):
            prompt_text = line.lstrip(">").strip()
            if prompt_text:
                # Construct a meaningful name
                # E.g. "2. 游戏图标 - 方案 A"
                name_parts = []
                if current_major_section:
                    # Extract just the name part if possible, e.g. "2. 游戏图标"
                    name_parts.append(current_major_section.split("(")[0].strip())
                if current_sub_section:
                    name_parts.append(current_sub_section.split("(")[0].strip())
                
                full_name = " - ".join(name_parts) if name_parts else "Unknown"
                
                prompts.append({
                    "name": full_name,
                    "prompt": prompt_text
                })
    return prompts

def generate_image(client, prompt_data, dry_run=False):
    name = prompt_data["name"]
    prompt = prompt_data["prompt"]
    
    # Sanitize filename
    # Remove chars that are bad for filenames
    safe_name = re.sub(r'[\\/*?:"<>|]', "", name).replace(" ", "_")
    # Truncate if too long
    safe_name = safe_name[:100]
    output_path = IMAGES_DIR / f"{safe_name}.png"
    
    if output_path.exists():
        print(f"Skipping {name}: already exists at {output_path}")
        return

    print(f"Generating image for: {name}")
    
    # Extract aspect ratio from prompt if present
    ar_match = re.search(r'--ar\s+(\d+:\d+)', prompt)
    aspect_ratio = "1:1"
    if ar_match:
        ar_str = ar_match.group(1)
        # Map to supported aspect ratios if needed, but Imagen usually supports standard ones
        aspect_ratio = ar_str
    
    # Clean prompt of parameters like --ar, --no text, etc for the API call if needed
    # But usually models are fine with it or ignore it. 
    # Let's keep it as is, or maybe strip the flags if they are Midjourney specific.
    # Imagen 3 supports natural language. 
    # Midjourney parameters like --ar might confuse it slightly but often ignored.
    # Let's clean it up slightly to be safe.
    clean_prompt = re.sub(r'--\w+\s+[\w:.]+', '', prompt).replace("--no text", "").strip()
    
    print(f"  Prompt: {clean_prompt[:60]}...")
    print(f"  Aspect Ratio: {aspect_ratio}")

    if dry_run:
        print("  [Dry Run] Would call API now.")
        return

    try:
        # Using Imagen 3 model
        # Note: The model name might vary. 'imagen-3.0-generate-001' is a common endpoint.
        # Ensure your API key has access.
        response = client.models.generate_images(
            model='imagen-3.0-generate-001',
            prompt=clean_prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio=aspect_ratio
            )
        )
        
        if response.generated_images:
            image_bytes = response.generated_images[0].image.image_bytes
            image = Image.open(io.BytesIO(image_bytes))
            image.save(output_path)
            print(f"  Saved to {output_path}")
        else:
            print(f"  No image generated for {name}")
            
    except Exception as e:
        print(f"  Error generating {name}: {e}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Don't call API")
    args = parser.parse_args()

    api_key = load_api_key()
    if not api_key:
        print("Error: API Key not found in scripts/api_key.txt or GEMINI_API_KEY env var.")
        return

    try:
        client = genai.Client(api_key=api_key)
    except Exception as e:
        print(f"Error initializing client: {e}")
        return
    
    prompts_file = DOCS_DIR / "art_design_prompts.md"
    if not prompts_file.exists():
        print(f"Error: {prompts_file} not found.")
        return

    prompts = parse_prompts(prompts_file)
    print(f"Found {len(prompts)} prompts.")
    
    for p in prompts:
        generate_image(client, p, dry_run=args.dry_run)

if __name__ == "__main__":
    main()
