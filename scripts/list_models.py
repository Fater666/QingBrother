
import os
from google import genai

def load_api_key():
    key_file = "scripts/api_key.txt"
    if os.path.exists(key_file):
        with open(key_file, "r") as f:
            lines = f.readlines()
            for line in reversed(lines):
                line = line.strip()
                if line and not line.startswith("#"):
                    return line
    return os.environ.get("GEMINI_API_KEY")

def list_models():
    api_key = load_api_key()
    if not api_key:
        print("No API key found")
        return

    client = genai.Client(api_key=api_key)
    try:
        print("Listing models...")
        for m in client.models.list():
            print(f"{m.name}")
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    list_models()
