"""
============================================================================
FILE: llm.py
LOCATION: server/routers/llm.py
============================================================================
PURPOSE:
    Provides LLM utility routes, specifically proxying OpenRouter model queries.
ROLE IN PROJECT:
    Exposes endpoints for querying OpenRouter models and configurations.
KEY COMPONENTS:
    - router: APIRouter for LLM routes
    - list_models(): Endpoint proxying OpenRouter's /api/v1/models
DEPENDENCIES:
    - External: httpx, fastapi
    - Internal: server.schemas.llm
USAGE:
    Endpoint exposed at /llm/models
============================================================================
"""

from typing import List

from fastapi import APIRouter, HTTPException, status
import httpx

from server.schemas.llm import ModelResponse

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get(
    "/models",
    response_model=List[ModelResponse],
    summary="List available OpenRouter models",
    description=(
        "Fetch available models from OpenRouter API and return trimmed "
        "metadata."
    ),
)
async def list_models() -> List[ModelResponse]:
    """
    Fetch models from OpenRouter and trim to only include ID, Name,
    and Context Length.
    """
    url = "https://openrouter.ai/api/v1/models"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenRouter returned error: {response.text}",
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
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to OpenRouter: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )
