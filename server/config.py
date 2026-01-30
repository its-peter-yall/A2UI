# config.py
# Environment configuration for AgUI Backend

# Loads environment variables from .env file and provides a centralized
# Settings object. Uses 'python-dotenv' for loading.

# @see: .env.example
# @note: Ensure .env is added to .gitignore

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Settings:
    PROJECT_ID = os.getenv("PROJECT_ID", "")
    GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    LOCATION = os.getenv("LOCATION", "us-central1")

    # Validation helper
    @classmethod
    def validate(cls):
        missing = []
        if not cls.PROJECT_ID:
            missing.append("PROJECT_ID")
        if not cls.GOOGLE_APPLICATION_CREDENTIALS:
            missing.append("GOOGLE_APPLICATION_CREDENTIALS")

        if missing:
            print(f"WARNING: Missing environment variables: {', '.join(missing)}")
            return False
        return True


settings = Settings()
