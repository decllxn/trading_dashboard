import os
from pathlib import Path
from dotenv import load_dotenv

# Search for .env in current folder, then parent folder
env_path = Path(__file__).resolve().parent / ".env"
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path)

CTRADER_CLIENT_ID = os.getenv("CTRADER_CLIENT_ID", "42909_c7TzSI1pmpR2pGNX15ZO2ZFPsuLAT6vKyhF9nxQxOPROUkBUaG")
CTRADER_CLIENT_SECRET = os.getenv("CTRADER_CLIENT_SECRET", "2yuX8c6eczSSjj3HpeqLwCou6zpQdUvZwkRFZrBMSSUVteAxeg")
CTRADER_ENVIRONMENT = os.getenv("CTRADER_ENVIRONMENT", "live").lower()

DATABASE_URL = os.getenv("DATABASE_URL", "")

PORT = int(os.getenv("CTRADER_SERVICE_PORT", "8001"))
NEXT_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
