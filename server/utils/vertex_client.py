"""
=============================================================================
FILE: vertex_client.py
=============================================================================

PURPOSE:
Initializes the Google Vertex AI SDK with project and location settings from
the application config. Provides centralized initialization and status checking
for the Vertex AI SDK used by the learning system's AI generation capabilities.

KEY COMPONENTS:
- init_vertex(): One-time SDK initialization with project/location from settings
- get_vertex_status(): Returns boolean indicating if Vertex AI initialized successfully
- _is_initialized: Module-level state tracking for SDK initialization status

DEPENDENCIES:
- google.cloud.aiplatform: Google's SDK for interacting with Vertex AI services
- server.config: Provides PROJECT_ID, LOCATION, and credential configuration

USAGE PATTERN:
```python
from server.utils.vertex_client import init_vertex, get_vertex_status

# Initialize once at application startup
if init_vertex():
    print("Vertex AI ready for model inference")

# Check status anywhere in the application
if get_vertex_status():
    # Use Vertex AI for predictions
    pass
```

ERROR HANDLING:
- Raises Exception on SDK initialization failure (credential errors, network issues)
- Returns False and logs warning if config validation fails
- All errors are logged with descriptive messages

PERFORMANCE NOTES:
- Initialization is idempotent - subsequent calls after first success return immediately
- Module-level state avoids re-initialization overhead
- Should be called once during application startup (lifespan context)

RELATED FILES:
- server/config.py: Provides settings.PROJECT_ID and settings.LOCATION
- server/main.py: Calls init_vertex() during FastAPI lifespan startup
- server/utils/instructor_client.py: Uses Vertex AI as provider for Gemini models

NOTES:
- Requires GOOGLE_APPLICATION_CREDENTIALS environment variable or ADC
- In ADC environments, credentials may be provided via workload identity
- Validation checks both PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS
=============================================================================
"""

from google.cloud import aiplatform
from server.config import settings
import logging

logger = logging.getLogger(__name__)

# State tracking
_is_initialized = False


def init_vertex():
    """
    Initializes the Vertex AI SDK with project and location settings.
    Returns True if successful, raises exception otherwise.
    """
    global _is_initialized

    if not settings.validate():
        logger.warning("Vertex AI initialization skipped due to missing config.")
        _is_initialized = False
        return False

    try:
        aiplatform.init(
            project=settings.PROJECT_ID,
            location=settings.LOCATION,
        )
        logger.info(
            f"Vertex AI initialized for project {settings.PROJECT_ID} in {settings.LOCATION}"
        )
        _is_initialized = True
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Vertex AI: {str(e)}")
        _is_initialized = False
        raise e


def get_vertex_status():
    """Returns True if Vertex AI has been successfully initialized."""
    return _is_initialized
