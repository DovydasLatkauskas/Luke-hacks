import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_MODEL: str = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
GOOGLE_MAPS_API_KEY: str = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# All keys in priority order — runner tries each on 401
OPENAI_API_KEYS: list[str] = [
    k for k in [
        os.environ.get("OPENAI_API_KEY", ""),
        os.environ.get("OPENAI_API_KEY_2", ""),
        os.environ.get("OPENAI_API_KEY_3", ""),
    ] if k
]

# Keep OPENAI_API_KEY as the primary for anything that needs a single key
OPENAI_API_KEY: str = OPENAI_API_KEYS[0] if OPENAI_API_KEYS else ""
