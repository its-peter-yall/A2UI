# instructor_client.py
# Instructor library wrapper for structured output validation with Vertex AI

# Provides InstructorClient class that wraps Vertex AI Gemini models with Instructor
# for Pydantic-validated structured outputs. Supports role-based model selection
# (planner, generator, quizzer) with configurable temperatures and retry logic.

# @see: server/utils/vertex_client.py - Base Vertex AI initialization
# @see: server/agents/base.py - BaseAgent uses this client for generation
# @note: Requires vertexai to be initialized first via init_vertex()

from __future__ import annotations

import logging
from typing import Any, Optional, Type, TypeVar

import instructor
from pydantic import BaseModel
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from server.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


# Model configuration for different agent roles
MODEL_CONFIGS = {
    "planner": {
        "model": "gemini-1.5-pro",
        "temperature": 0.3,
        "max_tokens": 4096,
    },
    "generator": {
        "model": "gemini-1.5-flash",
        "temperature": 0.7,
        "max_tokens": 2048,
    },
    "quizzer": {
        "model": "gemini-1.5-flash",
        "temperature": 0.2,
        "max_tokens": 1024,
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

        if not settings.validate():
            logger.warning("InstructorClient init skipped: missing config")
            return False

        try:
            # Create a client for each role configuration
            for role, config in MODEL_CONFIGS.items():
                model_name = config["model"]
                # Use from_provider with vertexai prefix as per docs
                client = instructor.from_provider(
                    f"vertexai/{model_name}",
                    project=settings.PROJECT_ID,
                    location=settings.LOCATION,
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

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((Exception,)),
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
        if not self._initialized:
            raise ValueError("InstructorClient not initialized. Call init() first.")

        if role not in self._clients:
            raise ValueError(
                f"Unknown role: {role}. Available: {list(self._clients.keys())}"
            )

        client_info = self._clients[role]
        client = client_info["client"]
        config = client_info["config"]

        # Build message list with optional system prompt
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        try:
            # Call the instructor client
            response = client.create(
                response_model=response_model,
                messages=full_messages,
                temperature=config.get("temperature", 0.5),
                max_tokens=config.get("max_tokens", 2048),
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
            Configuration dict with model, temperature, max_tokens
        """
        if role not in MODEL_CONFIGS:
            raise ValueError(f"Unknown role: {role}")
        return MODEL_CONFIGS[role].copy()


# Global singleton instance
instructor_client = InstructorClient()
