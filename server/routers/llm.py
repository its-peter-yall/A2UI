"""
============================================================================
FILE: llm.py
LOCATION: server/routers/llm.py
============================================================================
PURPOSE:
    Provides LLM utility routes, specifically proxying OpenRouter model queries.
ROLE IN PROJECT:
    Exposes endpoints for querying OpenRouter models and configurations.
    All endpoints require X-OpenRouter-Key authentication.
KEY COMPONENTS:
    - router: APIRouter for LLM routes
    - get_llm_context(): Auth dependency extracting OpenRouter headers
    - list_models(): Endpoint proxying OpenRouter's /api/v1/models
DEPENDENCIES:
    - External: httpx, fastapi
    - Internal: server.schemas.llm
USAGE:
    Endpoint exposed at /llm/models (requires X-OpenRouter-Key header)
============================================================================
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Header, status
import httpx

from server.schemas.llm import LLMContext, ModelResponse

router = APIRouter(prefix="/llm", tags=["llm"])


async def get_llm_context(
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_openrouter_model: Optional[str] = Header(
        None, alias="X-OpenRouter-Model"
    ),
    http_referer: Optional[str] = Header(None, alias="HTTP-Referer"),
    x_openrouter_title: Optional[str] = Header(
        None, alias="X-OpenRouter-Title"
    ),
) -> LLMContext:
    """Dependency injection helper to retrieve OpenRouter context."""
    if not x_openrouter_key or not x_openrouter_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-OpenRouter-Key header is missing.",
        )
    return LLMContext(
        api_key=x_openrouter_key,
        model=x_openrouter_model,
        http_referer=http_referer,
        app_title=x_openrouter_title,
    )


@router.get(
    "/models",
    response_model=List[ModelResponse],
    summary="List available OpenRouter models",
    description=(
        "Fetch available models from OpenRouter API and return trimmed "
        "metadata. Requires X-OpenRouter-Key header."
    ),
)
async def list_models(
    llm_context: LLMContext = Depends(get_llm_context),
) -> List[ModelResponse]:
    """
    Fetch models from OpenRouter and trim to only include ID, Name,
    and Context Length. Requires authentication via X-OpenRouter-Key.
    """
    url = "https://openrouter.ai/api/v1/models"
    try:
        # Build headers with API key and optional attribution
        headers = {"Authorization": f"Bearer {llm_context.api_key}"}
        attribution = llm_context.get_attribution_headers()
        headers.update(attribution)

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url, headers=headers, timeout=10.0
            )
            if response.status_code in (401, 403):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or rejected OpenRouter API key.",
                )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                        f"OpenRouter returned error: {response.text}"
                    ),
                )

            data = response.json()
            models_list = data.get("data", [])

            result = []
            for item in models_list:
                model_id = item.get("id")
                if not model_id:
                    continue
                result.append(
                    ModelResponse(
                        id=model_id,
                        name=item.get("name"),
                        context_length=item.get("context_length"),
                    )
                )
            return result
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to OpenRouter: {str(e)}",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"An unexpected error occurred: {str(e)}",
        )
