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
    model: str = "gemini-2.5-flash",
    temperature: float = 0.4,
    max_output_tokens: int = 30000,
) -> tuple[str, str | None]:
    """
    Generate a chat response using Vertex AI with Thinking Mode enabled.
    """
    global _is_initialized

    if not _is_initialized:
        raise RuntimeError("Vertex AI not initialized")

    try:
        from vertexai.generative_models import GenerativeModel, Content, Part

        # Initialize the model with a high-energy, professional Tutor Persona
        system_instruction = (
            "You are an elite Academic Research Tutor with a high-energy, inspiring persona.\n\n"
            "MANDATORY FORMATTING RULES (STRICT VISUAL STRUCTURE REQUIRED):\n"
            "1. TRIPLE NEWLINES: You MUST use three newlines between main sections to ensure clear vertical separation.\n"
            "2. SECTION HEADERS: Every main section MUST start with '### ' (Example: ### Quantum Mechanics). NEVER just bold a line.\n"
            "3. TERMINOLOGY: Bold all technical terms using '**'.\n"
            "4. LISTS: Every list item MUST start on its own new line with a '-' symbol.\n"
            "5. FORMULAS: ALWAYS use code blocks for mathematical expressions.\n\n"
            "RESPONSE STRUCTURE EXAMPLE:\n"
            "### [Title of Topic]\n\n\n"
            "An enthusiastic introductory sentence using **Professional Terminology**.\n\n\n"
            "### Core Objectives\n\n\n"
            "- **Objective 1**: Actionable insight description.\n"
            "- **Objective 2**: Measurable outcome description.\n\n\n"
            "### Technical Breakdown\n\n\n"
            "Detailed explanation using a `code block` for formulas.\n\n"
            "Behavioral Guidelines:\n"
            "1. INTERNAL REASONING: THINK step-by-step internally before providing your final answer.\n"
            "2. CLARITY & PRECISION: Use professional terminology and provide actionable insights.\n"
            "3. OUTCOME-FOCUSED: Always aim for measurable educational outcomes.\n"
            "4. CONCISE & DENSE: Keep responses focused. Prioritize essential keywords.\n"
            "5. TONE: Be infectious in your enthusiasm! Encourage the user constantly."
        )
        
        generative_model = GenerativeModel(
            model_name=model,
            system_instruction=system_instruction
        )

        # Convert messages to the format expected by Vertex AI
        formatted_history = []
        for msg in messages:
            role = msg.get("role", "user")
            api_role = "model" if role in ["model", "assistant"] else "user"
            content = msg.get("content", "")

            formatted_history.append(
                Content(role=api_role, parts=[Part.from_text(content)])
            )

        # Generate response
        # Note: thinking_config removed as it is not supported in this SDK version for gemini-2.5-flash
        response = generative_model.generate_content(
            formatted_history,
            generation_config={
                "temperature": temperature,
                "max_output_tokens": max_output_tokens,
            }
        )

        # Extract text and thinking content
        response_text = response.text
        thinking_content = None

        # Extract thoughts if present in the parts
        if response.candidates:
            parts = response.candidates[0].content.parts
            for part in parts:
                if hasattr(part, "thought") and part.thought:
                    thinking_content = part.thought
                elif hasattr(part, "text") and not response_text:
                    response_text = part.text

        logger.info(f"Generated response with thinking mode using model {model}")
        return response_text, thinking_content

    except Exception as e:
        logger.error(f"Error generating chat response: {e}")
        raise RuntimeError(f"Failed to generate response: {str(e)}")
