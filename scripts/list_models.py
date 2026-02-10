
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
    client = genai.Client(api_key=api_key)
    try:
        print("Listing models...")
        # The SDK returns an iterator of Model objects
        for m in client.models.list():
            print(f"Name: {m.name}")
            # Try to print other useful attributes if they exist
            if hasattr(m, 'display_name'):
                print(f"  Display Name: {m.display_name}")
            if hasattr(m, 'supported_generation_methods'):
                 print(f"  Supported Methods: {m.supported_generation_methods}")
            print("-" * 20)
            
    except Exception as e:
        print(f"Error listing models: {e}")
        # Print dir(m) if we failed inside loop to see what attributes exist
        # But we can't access 'm' here easily if it failed before loop or we don't know which one.
        # Let's just catch the error.

if __name__ == "__main__":
    list_models()
