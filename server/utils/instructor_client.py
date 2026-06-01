"""
============================================================================
FILE: instructor_client.py
LOCATION: server/utils/instructor_client.py
============================================================================
PURPOSE:
    Wrapper around the Instructor library for structured output
    validation with OpenRouter models.
ROLE IN PROJECT:
    Utility layer providing Pydantic-validated AI responses.
    - Wraps OpenRouter API with role-based model configuration
    - Used by BaseAgent for all structured generation calls
KEY COMPONENTS:
    - InstructorClient: Main class wrapping OpenRouter with Instructor
    - MODEL_CONFIGS: Model, temperature, and token limits per role
    - create_structured(): Async method for Pydantic-validated responses
    - instructor_client: Global singleton instance
DEPENDENCIES:
    - External: instructor, openai, pydantic, tenacity
    - Internal: server.config
USAGE:
    ```python
    from server.utils.instructor_client import instructor_client
    response = await instructor_client.create_structured(
        role='planner', response_model=MyModel, messages=[...]
    )
    ```
============================================================================
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional, Type, TypeVar

import instructor
from openai import AsyncOpenAI
from pydantic import BaseModel
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_not_exception_type,
)

from server.config import settings
from server.schemas.llm import AIProviderEnum

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


# Model configuration for different agent roles using OpenRouter slugs
MODEL_CONFIGS = {
    "planner": {
        "model": "google/gemini-2.5-pro",
        "temperature": 0.3,
        "max_tokens": 10000,
    },
    "generator": {
        "model": "google/gemini-2.5-flash",
        "temperature": 0.7,
        "max_tokens": 60000,
    },
    "quizzer": {
        "model": "google/gemini-2.5-flash",
        "temperature": 0.2,
        "max_tokens": 8000,
    },
}


class InstructorClient:
    """
    Instructor client wrapper for OpenRouter structured output generation.

    Provides role-based model selection and Pydantic validation for AI
    responses. Uses instructor.from_openai with OpenAI-compatible interface.
    """

    def __init__(self) -> None:
        """Initialize the InstructorClient."""
        self._initialized: bool = True

    def init(self) -> bool:
        """
        Legacy initialization method, now a no-op since client is per-request.
        """
        return True

    def is_initialized(self) -> bool:
        """Check if the client has been initialized."""
        return True

    def _raise_for_invalid_state(self, role: str) -> None:
        """Raise ValueError if role is invalid."""
        if role not in MODEL_CONFIGS:
            raise ValueError(
                f"Unknown role: {role}. "
                f"Available: {list(MODEL_CONFIGS.keys())}"
            )

    def _get_provider_config(
        self, provider: AIProviderEnum
    ) -> tuple[str, float]:
        """Return (base_url, timeout) for the given provider."""
        if provider == AIProviderEnum.GENERALCOMPUTE:
            return (
                settings.GENERALCOMPUTE_BASE_URL,
                settings.GENERALCOMPUTE_TIMEOUT_SECONDS,
            )
        return (
            settings.OPENROUTER_BASE_URL,
            settings.OPENROUTER_TIMEOUT_SECONDS,
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_not_exception_type(
            (ValueError, TypeError, asyncio.CancelledError)
        ),
        reraise=True,
    )
    async def create_structured(
        self,
        role: str,
        response_model: Type[T],
        messages: list[dict[str, str]],
        api_key: str,
        model_override: Optional[str] = None,
        attribution_headers: Optional[dict[str, str]] = None,
        system_prompt: Optional[str] = None,
        provider: AIProviderEnum = AIProviderEnum.OPENROUTER,
        reasoning_params: Optional[dict[str, Any]] = None,
        max_completion_tokens: Optional[int] = None,
        **kwargs: Any,
    ) -> T:
        """
        Generate a structured response using the specified role's model.

        Uses Instructor's validation to ensure response conforms to the
        Pydantic model. Implements retry logic with exponential backoff
        for transient failures.

        Args:
            role: Agent role key (planner, generator, quizzer)
            response_model: Pydantic model class for response validation
            messages: List of message dicts with 'role' and 'content' keys
            api_key: API key for the active provider
            model_override: Optional global model slug override
            attribution_headers: Optional HTTP headers for OpenRouter
            system_prompt: Optional system instruction to prepend
            provider: AI provider enum to route requests through
            reasoning_params: Optional reasoning config dict (effort etc.)
            max_completion_tokens: Optional model-specific max output limit
            **kwargs: Additional arguments passed to the model

        Returns:
            Validated instance of response_model
        """
        # Validate role early
        self._raise_for_invalid_state(role)

        # Enforce key validation early
        if not api_key:
            raise ValueError(f"{provider.value.title()} API key is required.")

        config = MODEL_CONFIGS[role]

        # Build message list with optional system prompt
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        # Determine which model slug to use
        model_slug = model_override or config["model"]

        # Build OpenRouter parameters
        temperature = config.get("temperature", 0.5)
        max_tokens = config.get("max_tokens", 2048)

        # Clamp to model-specific limit if provided by the frontend
        if max_completion_tokens and max_completion_tokens > 0:
            if max_tokens > max_completion_tokens:
                logger.info(
                    f"Clamping max_tokens from {max_tokens} to "
                    f"{max_completion_tokens} for model {model_slug}"
                )
                max_tokens = max_completion_tokens

        # Construct OpenAI client wrapped with Instructor
        # max_retries=0: disable SDK retries — tenacity handles retries,
        # and SDK retries would ignore CancelledError from task cancellation
        base_url, timeout = self._get_provider_config(provider)
        base_client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
            default_headers=attribution_headers or {},
            timeout=timeout,
            max_retries=0,
        )

        client = instructor.from_openai(
            base_client,
            mode=instructor.Mode.JSON,
        )

        try:
            # Build extra_body with reasoning params if provided
            extra_body = {}
            if reasoning_params:
                extra_body.update(reasoning_params)

            # Call the instructor client
            response = await client.chat.completions.create(
                model=model_slug,
                response_model=response_model,
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                extra_body=extra_body if extra_body else None,
                **kwargs,
            )

            logger.info(
                f"LLM call completed: role={role}, model={model_slug}, "
                f"thinking={'enabled' if reasoning_params else 'disabled'}"
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
