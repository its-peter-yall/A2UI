"""
=============================================================================
FILE: config.py
=============================================================================

PURPOSE:
Centralized environment configuration management for the AgUI backend.
Loads settings from .env file and provides a Settings class with validated
Google Cloud and application configuration values used throughout the server.

KEY COMPONENTS:
- Settings: Class containing PROJECT_ID, LOCATION, and GOOGLE_APPLICATION_CREDENTIALS
- validate(): Class method checking for required environment variables
- settings: Singleton instance for application-wide configuration access

DEPENDENCIES:
- dotenv: Loads environment variables from .env file at runtime
- os: Standard library for environment variable access

USAGE PATTERN:
```python
from server.config import settings

# Access configuration values
print(f"Project: {settings.PROJECT_ID}")
print(f"Location: {settings.LOCATION}")

# Validate configuration before use
if settings.validate():
    # Proceed with Vertex AI initialization
    pass
```

ERROR HANDLING:
- validate() returns False and logs warning if required vars missing
- Missing PROJECT_ID or GOOGLE_APPLICATION_CREDENTIALS triggers warning
- No exceptions raised - validation is advisory

PERFORMANCE NOTES:
- load_dotenv() called once at module import time
- Settings class uses class variables (not instances) for simplicity
- validate() result can be cached if called multiple times

RELATED FILES:
- server/utils/vertex_client.py: Uses settings for SDK initialization
- server/utils/instructor_client.py: Uses settings for AI client config
- .env.example: Template showing required environment variables

NOTES:
- .env file should be added to .gitignore to avoid committing secrets
- VERTEX_CONFIG env var can optionally set GOOGLE_APPLICATION_CREDENTIALS
- Default LOCATION is "us-central1" if not specified
- PROJECT_ID is the Google Cloud project for Vertex AI resources
- GOOGLE_APPLICATION_CREDENTIALS path to service account JSON keyfile
=============================================================================
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
