"""
============================================================================
FILE: instructor_client.py
LOCATION: server/utils/instructor_client.py
============================================================================
PURPOSE:
    Wrapper around the Instructor library for structured output
    validation with Google Vertex AI Gemini models.
ROLE IN PROJECT:
    Utility layer providing Pydantic-validated AI responses.
    - Wraps Vertex AI Gemini with role-based model configuration
    - Used by BaseAgent for all structured generation calls
KEY COMPONENTS:
    - InstructorClient: Main class wrapping Vertex AI with Instructor
    - MODEL_CONFIGS: Model, temperature, and token limits per role
    - create_structured(): Async method for Pydantic-validated responses
    - instructor_client: Global singleton instance
DEPENDENCIES:
    - External: instructor, pydantic, tenacity, vertexai
    - Internal: server.config
USAGE:
    ```python
    from server.utils.instructor_client import instructor_client
    instructor_client.init()
    response = await instructor_client.create_structured(
        role='planner', response_model=MyModel, messages=[...]
    )
    ```
============================================================================
"""

from __future__ import annotations

import logging
from typing import Any, Optional, Type, TypeVar

import instructor
from pydantic import BaseModel
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_not_exception_type,
)

from server.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


# Model configuration for different agent roles
MODEL_CONFIGS = {
    "planner": {
        "model": "gemini-2.5-pro",
        "temperature": 0.3,
        "max_output_tokens": 4096,
    },
    "generator": {
        "model": "gemini-2.5-flash",
        "temperature": 0.7,
        "max_output_tokens": 2048,
    },
    "quizzer": {
        "model": "gemini-2.5-flash",
        "temperature": 0.2,
        "max_output_tokens": 4096,
    },
}


class InstructorClient:
    """
    Instructor client wrapper for Vertex AI structured output generation.

    Provides role-based model selection and Pydantic validation for AI responses.
    Uses instructor.from_provider with vertexai for Gemini model integration.
    """

    def __init__(self) -> None:
        """Initialize the InstructorClient in uninitialized state."""
        self._clients: dict[str, Any] = {}
        self._initialized: bool = False

    def init(self) -> bool:
        """
        Initialize Instructor clients for all configured roles.

        Must be called after vertexai.init() has been executed.

        Returns:
            True if initialization succeeded, False otherwise.
        """
        if self._initialized:
            logger.debug("InstructorClient already initialized")
            return True

        # Check only PROJECT_ID - GOOGLE_APPLICATION_CREDENTIALS is optional in ADC environments
        if not settings.PROJECT_ID:
            logger.warning("InstructorClient init skipped: PROJECT_ID not configured")
            return False

        try:
            # Create a client for each role configuration
            for role, config in MODEL_CONFIGS.items():
                model_name = config["model"]
                # Use from_provider with vertexai prefix and GENAI_TOOLS mode
                client = instructor.from_provider(
                    f"vertexai/{model_name}",
                    project=settings.PROJECT_ID,
                    location=settings.LOCATION,
                    mode=instructor.Mode.GENAI_TOOLS,
                    async_client=True,  # Enable async support
                )
                self._clients[role] = {
                    "client": client,
                    "config": config,
                }
                logger.debug(f"Initialized Instructor client for role: {role}")

            self._initialized = True
            logger.info("Instructor clients initialized successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize Instructor clients: {e}")
            self._initialized = False
            raise

    def is_initialized(self) -> bool:
        """Check if the client has been initialized."""
        return self._initialized

    def _raise_for_invalid_state(self, role: str) -> None:
        """Raise ValueError if client not initialized or role invalid."""
        if not self._initialized:
            raise ValueError("InstructorClient not initialized. Call init() first.")

        if role not in self._clients:
            raise ValueError(
                f"Unknown role: {role}. Available: {list(self._clients.keys())}"
            )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_not_exception_type((ValueError, TypeError)),
        reraise=True,
    )
    async def create_structured(
        self,
        role: str,
        response_model: Type[T],
        messages: list[dict[str, str]],
        system_prompt: Optional[str] = None,
        **kwargs: Any,
    ) -> T:
        """
        Generate a structured response using the specified role's model.

        Uses Instructor's validation to ensure response conforms to the Pydantic model.
        Implements retry logic with exponential backoff for transient failures.

        Args:
            role: Agent role key (planner, generator, quizzer)
            response_model: Pydantic model class for response validation
            messages: List of message dicts with 'role' and 'content' keys
            system_prompt: Optional system instruction to prepend
            **kwargs: Additional arguments passed to the model

        Returns:
            Validated instance of response_model

        Raises:
            ValueError: If role is not configured or client not initialized
            Exception: On API errors after retry attempts exhausted
        """
        # Check state before retry - these should fail fast without retries
        self._raise_for_invalid_state(role)

        client_info = self._clients[role]
        client = client_info["client"]
        config = client_info["config"]

        # Build message list with optional system prompt
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        # Build generation_config for Gemini/Vertex AI
        generation_config = {
            "temperature": config.get("temperature", 0.5),
            "max_output_tokens": config.get("max_output_tokens", 2048),
        }

        try:
            # Call the instructor client with await (async_client=True)
            response = await client.create(
                response_model=response_model,
                messages=full_messages,
                generation_config=generation_config,
                **kwargs,
            )

            logger.debug(f"Generated structured response for role: {role}")
            return response

        except Exception as e:
            logger.error(f"Structured generation failed for role {role}: {e}")
            raise

    def get_model_config(self, role: str) -> dict[str, Any]:
        """
        Get the model configuration for a specific role.

        Args:
            role: Agent role key

        Returns:
            Configuration dict with model, temperature, max_output_tokens
        """
        if role not in MODEL_CONFIGS:
            raise ValueError(f"Unknown role: {role}")
        return MODEL_CONFIGS[role].copy()


# Global singleton instance
instructor_client = InstructorClient()
