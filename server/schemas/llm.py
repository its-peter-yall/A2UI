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

from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class LLMContext(BaseModel):
    """
    Pydantic model representing request-scoped OpenRouter LLM context.
    """
    model_config = ConfigDict(from_attributes=True)

    api_key: str = Field(..., description="OpenRouter API Key")
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
