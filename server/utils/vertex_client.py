"""
============================================================================
FILE: vertex_client.py
LOCATION: server/utils/vertex_client.py
============================================================================
PURPOSE:
    Initializes the Google Vertex AI SDK with project and location
    settings. Provides centralized initialization and status checking.
ROLE IN PROJECT:
    Utility layer managing Vertex AI SDK lifecycle.
    - Called once at application startup via FastAPI lifespan
    - Status checked by health endpoint and instructor_client
KEY COMPONENTS:
    - init_vertex(): One-time SDK initialization from settings
    - get_vertex_status(): Returns bool for initialization status
    - _is_initialized: Module-level state tracking
DEPENDENCIES:
    - External: google-cloud-aiplatform
    - Internal: server.config
USAGE:
    ```python
    from server.utils.vertex_client import init_vertex, get_vertex_status
    init_vertex()
    if get_vertex_status():
        pass  # safe to use Vertex AI
    ```
============================================================================
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
