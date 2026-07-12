"""
============================================================================
FILE: prompt_cache.py
LOCATION: server/utils/prompt_cache.py
============================================================================
PURPOSE:
    Enables OpenRouter prompt caching for OpenAI-compatible chat requests.
ROLE IN PROJECT:
    Utility layer translating a stable system prefix into an explicit
    Anthropic-style cache_control breakpoint so OpenRouter caches it.
    - Used by the concept chatbot and structured-generation clients
    - No-ops for providers/models that cache automatically (OpenAI,
      DeepSeek) or do not expose an explicit caching API (General Compute)
KEY COMPONENTS:
    - OPENROUTER_CACHEABLE_PREFIXES: Model families needing explicit breakpoints
    - model_needs_explicit_cache(): Whether a slug requires a breakpoint
    - apply_openrouter_cache_control(): Wraps system content with a breakpoint
DEPENDENCIES:
    - External: None
    - Internal: None
USAGE:
    ```python
    from server.utils.prompt_cache import apply_openrouter_cache_control
    messages = apply_openrouter_cache_control(messages, "openrouter", model)
    ```
============================================================================
"""

from typing import Any, List

# Model id families that require an explicit cache_control breakpoint on
# OpenRouter. Most providers (OpenAI, DeepSeek, Gemini 2.5 implicit) cache
# automatically; Anthropic/Google/Qwen need a marker or cache nothing.
OPENROUTER_CACHEABLE_PREFIXES: tuple[str, ...] = (
    "anthropic/",
    "google/",
    "qwen/",
)


def model_needs_explicit_cache(model_slug: str) -> bool:
    """Return True if the model requires an explicit cache breakpoint.

    Args:
        model_slug: Full model identifier (e.g. 'anthropic/claude-sonnet-4').

    Returns:
        True when the slug starts with a family that requires explicit
        cache_control markers on OpenRouter.
    """
    slug = (model_slug or "").lower()
    return any(slug.startswith(prefix) for prefix in OPENROUTER_CACHEABLE_PREFIXES)


def apply_openrouter_cache_control(
    messages: List[dict[str, Any]],
    provider: str,
    model_slug: str,
) -> List[dict[str, Any]]:
    """Attach an explicit cache_control breakpoint to the system message.

    Only applies when the provider is OpenRouter and the model requires an
    explicit breakpoint. The system content (a stable, large prefix such as
    the full concept markdown) is wrapped in a content-part array with a
    trailing ``cache_control`` marker. Other providers/models are returned
    unchanged.

    Args:
        messages: List of chat message dicts (OpenAI chat format).
        provider: Provider identifier ('openrouter' or 'generalcompute').
        model_slug: Model identifier slug for the chat model.

    Returns:
        The (possibly mutated) message list ready for the API call.
    """
    if (provider or "").lower() != "openrouter":
        return messages
    if not model_needs_explicit_cache(model_slug):
        return messages

    for message in messages:
        if message.get("role") != "system":
            continue
        content = message.get("content")
        if isinstance(content, str):
            message["content"] = [
                {
                    "type": "text",
                    "text": content,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        elif isinstance(content, list):
            # Ensure the final stable part carries the breakpoint.
            parts = list(content)
            if parts:
                last = dict(parts[-1])
                last["cache_control"] = {"type": "ephemeral"}
                parts[-1] = last
                message["content"] = parts
        break

    return messages
