"""
============================================================================
FILE: config.py
LOCATION: server/config.py
============================================================================
PURPOSE:
    Centralized environment configuration management for the A2UI backend.
    Loads settings from .env and provides a Settings class with OpenRouter
    and application configuration values.
ROLE IN PROJECT:
    Single source of truth for all environment-based configuration.
    - Loads .env at import time via load_dotenv()
    - Exposes a singleton settings instance used across the server
KEY COMPONENTS:
    - Settings: Class containing OPENROUTER_BASE_URL and application config
    - settings: Singleton instance for application-wide configuration access
DEPENDENCIES:
    - External: python-dotenv
    - Internal: None
USAGE:
    ```python
    from server.config import settings
    print(settings.OPENROUTER_BASE_URL)
    ```
============================================================================
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Settings:
    OPENROUTER_BASE_URL = os.getenv(
        "OPENROUTER_BASE_URL",
        "https://openrouter.ai/api/v1",
    )
    OPENROUTER_TIMEOUT_SECONDS = float(
        os.getenv("OPENROUTER_TIMEOUT_SECONDS", "60.0")
    )


settings = Settings()
