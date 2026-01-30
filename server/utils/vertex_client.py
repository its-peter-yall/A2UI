# vertex_client.py
# Google Vertex AI SDK initialization and client management

# Handles the authentication and initialization of the Vertex AI SDK
# using configuration from the global settings.

# @see: config.py
# @note: Requires GOOGLE_APPLICATION_CREDENTIALS to be set

from google.cloud import aiplatform
from server.config import settings
import logging

logger = logging.getLogger(__name__)


def init_vertex():
    """
    Initializes the Vertex AI SDK with project and location settings.
    Returns True if successful, raises exception otherwise.
    """
    if not settings.validate():
        logger.warning("Vertex AI initialization skipped due to missing config.")
        return False

    try:
        aiplatform.init(
            project=settings.PROJECT_ID,
            location=settings.LOCATION,
        )
        logger.info(
            f"Vertex AI initialized for project {settings.PROJECT_ID} in {settings.LOCATION}"
        )
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Vertex AI: {str(e)}")
        raise e
