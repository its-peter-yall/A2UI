"""
============================================================================
FILE: llm.py
LOCATION: server/schemas/llm.py
============================================================================
PURPOSE:
    Defines Pydantic schemas for LLM request context and model proxying.
ROLE IN PROJECT:
    Provides validation structures for OpenRouter request parameters,
    headers, and model information.
KEY COMPONENTS:
    - LLMContext: Pydantic model for request-scoped LLM context
    - ModelResponse: Pydantic model for trimmed model information
DEPENDENCIES:
    - External: pydantic
    - Internal: None
USAGE:
    ```python
    from server.schemas.llm import LLMContext
    context = LLMContext(api_key="...", http_referer="...")
    ```
============================================================================
"""

from enum import Enum
from typing import Optional

from fastapi import HTTPException, Header, status
from pydantic import BaseModel, Field, ConfigDict


class AIProviderEnum(str, Enum):
    """Supported AI provider identifiers."""
    OPENROUTER = "openrouter"
    GENERALCOMPUTE = "generalcompute"


class LLMContext(BaseModel):
    """
    Pydantic model representing request-scoped LLM context.
    """
    model_config = ConfigDict(from_attributes=True)

    provider: AIProviderEnum = Field(
        default=AIProviderEnum.OPENROUTER,
        description="AI provider to route requests through",
    )
    api_key: str = Field(..., description="Provider API Key")
    model: Optional[str] = Field(
        default=None,
        description="Global model slug override to use for all agents",
    )
    http_referer: Optional[str] = Field(
        default=None,
        description="Referer URL for OpenRouter analytics attribution",
    )
    app_title: Optional[str] = Field(
        default=None,
        description="Application title for OpenRouter analytics attribution",
    )

    def get_attribution_headers(self) -> dict[str, str]:
        """
        Builds the dictionary of attribution headers for OpenRouter.
        """
        headers = {}
        if self.provider == AIProviderEnum.OPENROUTER:
            if self.http_referer:
                headers["HTTP-Referer"] = self.http_referer
            if self.app_title:
                headers["X-OpenRouter-Title"] = self.app_title
        return headers


class ModelResponse(BaseModel):
    """
    Pydantic model representing trimmed model information returned to UI.
    """
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Model identifier slug")
    name: Optional[str] = Field(None, description="Human-readable model name")
    context_length: Optional[int] = Field(
        None,
        description="Context window length in tokens",
    )


async def get_llm_context(
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_generalcompute_key: Optional[str] = Header(None, alias="X-GeneralCompute-Key"),
    x_openrouter_model: Optional[str] = Header(None, alias="X-OpenRouter-Model"),
    x_generalcompute_model: Optional[str] = Header(None, alias="X-GeneralCompute-Model"),
    http_referer: Optional[str] = Header(None, alias="HTTP-Referer"),
    x_openrouter_title: Optional[str] = Header(None, alias="X-OpenRouter-Title"),
) -> LLMContext:
    """
    FastAPI dependency to extract LLM context from request headers.

    Returns 401 when the active provider's API key is missing or blank.
    """
    provider_str = x_ai_provider or "openrouter"
    if provider_str not in [p.value for p in AIProviderEnum]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported AI provider: {provider_str}",
        )
    
    provider = AIProviderEnum(provider_str)

    if provider == AIProviderEnum.OPENROUTER:
        api_key = x_openrouter_key
        model = x_openrouter_model
        key_header_name = "X-OpenRouter-Key"
    else:
        api_key = x_generalcompute_key
        model = x_generalcompute_model
        key_header_name = "X-GeneralCompute-Key"

    if not api_key or not api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"{key_header_name} header is missing.",
        )

    return LLMContext(
        provider=provider,
        api_key=api_key,
        model=model,
        http_referer=http_referer,
        app_title=x_openrouter_title,
    )
