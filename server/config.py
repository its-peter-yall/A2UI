"""
============================================================================
FILE: config.py
LOCATION: server/config.py
============================================================================
PURPOSE:
    Centralized environment configuration management for the AgUI backend.
    Loads settings from .env and provides a Settings class with validated
    Google Cloud and application configuration values.
ROLE IN PROJECT:
    Single source of truth for all environment-based configuration.
    - Loads .env at import time via load_dotenv()
    - Exposes a singleton settings instance used across the server
KEY COMPONENTS:
    - Settings: Class containing PROJECT_ID, LOCATION, GOOGLE_APPLICATION_CREDENTIALS
    - validate(): Class method checking for required environment variables
    - settings: Singleton instance for application-wide configuration access
DEPENDENCIES:
    - External: python-dotenv
    - Internal: None
USAGE:
    ```python
    from server.config import settings
    print(settings.PROJECT_ID)
    ```
============================================================================
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Export credentials path to environment for Google Cloud SDK
# The Google Cloud libraries expect GOOGLE_APPLICATION_CREDENTIALS in os.environ
_vertex_config = os.getenv("VERTEX_CONFIG", "")
if _vertex_config:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _vertex_config


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
