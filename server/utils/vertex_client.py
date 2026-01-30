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


def generate_chat_response(
    messages: list,
    model: str = "gemini-2.0-flash-001",
    temperature: float = 0.7,
    max_output_tokens: int = 2048,
) -> tuple[str, str | None]:
    """
    Generate a chat response using Vertex AI.

    Args:
        messages: List of message dicts with 'role' and 'content' keys
        model: The model name to use
        temperature: Sampling temperature
        max_output_tokens: Maximum tokens to generate

    Returns:
        Tuple of (response_text, thinking_content)
    """
    global _is_initialized

    if not _is_initialized:
        raise RuntimeError("Vertex AI not initialized")

    try:
        from vertexai.generative_models import GenerativeModel
        from vertexai.preview.generative_models import Part

        # Initialize the model
        generative_model = GenerativeModel(model_name=model)

        # Convert messages to the format expected by Vertex AI
        # Format: user and model alternating
        formatted_history = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "user":
                formatted_history.append({"role": "user", "parts": [content]})
            elif role == "model":
                formatted_history.append({"role": "model", "parts": [content]})

        # Start a chat session
        chat = generative_model.start_chat(
            history=formatted_history[:-1] if formatted_history else []
        )

        # Send the last message (or empty if none)
        last_message = (
            formatted_history[-1]["parts"][0] if formatted_history else "Hello"
        )

        # Generate response
        response = chat.send_message(
            last_message,
            generation_config={
                "temperature": temperature,
                "max_output_tokens": max_output_tokens,
            },
        )

        # Extract text and thinking content if available
        response_text = response.text
        thinking_content = None

        # Check if response has thinking content (for supported models)
        if hasattr(response, "candidates") and response.candidates:
            candidate = response.candidates[0]
            if hasattr(candidate, "content") and candidate.content:
                # Some models may have thinking content in parts
                for part in candidate.content.parts:
                    if hasattr(part, "text") and part.text:
                        # First text part is the main response
                        if not response_text:
                            response_text = part.text
                    # Check for thinking/reasoning content if available
                    if hasattr(part, "thought") and part.thought:
                        thinking_content = part.thought

        logger.info(f"Generated response with model {model}")
        return response_text, thinking_content

    except Exception as e:
        logger.error(f"Error generating chat response: {e}")
        raise RuntimeError(f"Failed to generate response: {str(e)}")
