# Backend Implementation Plan: OpenRouter Thinking Mode

**Feature**: User-configurable thinking/reasoning mode for OpenRouter models
**Scope**: Server-side changes only (Python/FastAPI)
**Estimated Effort**: 2-3 hours
**Prerequisites**: Read `research/openrouter-thinking-research.md` for API details

---

## Overview

This plan enables users to control OpenRouter's thinking/reasoning mode from the frontend. The backend must:
1. Accept thinking configuration via HTTP headers
2. Pass thinking parameters to OpenRouter's API via `extra_body`
3. Handle the response (thinking is transparent to us - OpenRouter handles it)

**Key Insight**: OpenRouter uses a `reasoning` object in the request body with `effort` (string) or `max_tokens` (int) sub-parameters. The Python `openai` SDK supports this via `extra_body`.

---

## Step 1: Update LLM Context Schema

**File**: `server/schemas/llm.py`

**What to change**: Add thinking configuration fields to `LLMContext` model.

**Current code** (around line 30-50):
```python
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
```

**Add these fields** after `app_title`:
```python
    thinking_enabled: bool = Field(
        default=False,
        description="Whether thinking/reasoning mode is enabled",
    )
    thinking_effort: Optional[str] = Field(
        default=None,
        description="Thinking effort level: minimal, low, medium, high, xhigh",
        pattern="^(minimal|low|medium|high|xhigh)$",
    )
```

**Add this method** to `LLMContext` class (after `get_attribution_headers`):
```python
    def get_reasoning_params(self) -> Optional[dict[str, Any]]:
        """
        Build OpenRouter reasoning parameters dict.
        
        Returns:
            Dict with 'reasoning' key if thinking is enabled, else None.
        """
        if not self.thinking_enabled:
            return None
        
        if not self.thinking_effort:
            # Default to 'high' if enabled but no effort specified
            return {"reasoning": {"effort": "high"}}
        
        return {"reasoning": {"effort": self.thinking_effort}}
```

**Don't forget**: Add `Any` to the typing imports at the top of the file:
```python
from typing import Any, Optional
```

---

## Step 2: Update Header Extraction

**File**: `server/schemas/llm.py`

**What to change**: Extract thinking headers from incoming requests in `get_llm_context()`.

**Current function signature** (around line 80):
```python
async def get_llm_context(
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_generalcompute_key: Optional[str] = Header(None, alias="X-GeneralCompute-Key"),
    x_openrouter_model: Optional[str] = Header(None, alias="X-OpenRouter-Model"),
    x_generalcompute_model: Optional[str] = Header(None, alias="X-GeneralCompute-Model"),
    http_referer: Optional[str] = Header(None, alias="HTTP-Referer"),
    x_openrouter_title: Optional[str] = Header(None, alias="X-OpenRouter-Title"),
) -> LLMContext:
```

**Add these parameters** to the function signature:
```python
    x_thinking_enabled: Optional[str] = Header(None, alias="X-Thinking-Enabled"),
    x_thinking_effort: Optional[str] = Header(None, alias="X-Thinking-Effort"),
```

**Update the return statement** (around line 110) to include thinking fields:
```python
    # Parse thinking enabled (string 'true'/'false' -> bool)
    thinking_enabled = x_thinking_enabled and x_thinking_enabled.lower() == 'true'
    
    # Validate effort level if provided
    thinking_effort = None
    if x_thinking_effort and x_thinking_effort in ['minimal', 'low', 'medium', 'high', 'xhigh']:
        thinking_effort = x_thinking_effort
    elif thinking_enabled:
        # Default to 'high' if enabled but no valid effort provided
        thinking_effort = 'high'

    return LLMContext(
        provider=provider,
        api_key=api_key,
        model=model,
        http_referer=http_referer,
        app_title=x_openrouter_title,
        thinking_enabled=thinking_enabled,
        thinking_effort=thinking_effort,
    )
```

---

## Step 3: Update Instructor Client

**File**: `server/utils/instructor_client.py`

**What to change**: Pass thinking parameters to OpenRouter API calls.

**Current method signature** (around line 100):
```python
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
        **kwargs: Any,
    ) -> T:
```

**Add this parameter** after `provider`:
```python
        reasoning_params: Optional[dict[str, Any]] = None,
```

**Update the method body** - find this line (around line 170):
```python
            response = await client.chat.completions.create(
                model=model_slug,
                response_model=response_model,
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs,
            )
```

**Change it to**:
```python
            # Build extra_body with reasoning params if provided
            extra_body = {}
            if reasoning_params:
                extra_body.update(reasoning_params)
            
            response = await client.chat.completions.create(
                model=model_slug,
                response_model=response_model,
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                extra_body=extra_body if extra_body else None,
                **kwargs,
            )
```

**Important**: The `extra_body` parameter is how the OpenAI SDK passes non-standard parameters to the API. OpenRouter's `reasoning` object goes here.

---

## Step 4: Update Base Agent

**File**: `server/agents/base.py`

**What to change**: Pass thinking parameters from LLM context to instructor client.

**Current code** in `generate()` method (around line 130-145):
```python
                # Extract options from llm_context
                api_key = llm_context.api_key
                model_override = llm_context.model
                attribution_headers = llm_context.get_attribution_headers()

                response = await instructor_client.create_structured(
                    role=self._role,
                    response_model=response_model,
                    messages=messages,
                    api_key=api_key,
                    model_override=model_override,
                    attribution_headers=attribution_headers,
                    system_prompt=full_system_prompt,
                    provider=llm_context.provider,
                    **kwargs,
                )
```

**Change it to**:
```python
                # Extract options from llm_context
                api_key = llm_context.api_key
                model_override = llm_context.model
                attribution_headers = llm_context.get_attribution_headers()
                reasoning_params = llm_context.get_reasoning_params()

                response = await instructor_client.create_structured(
                    role=self._role,
                    response_model=response_model,
                    messages=messages,
                    api_key=api_key,
                    model_override=model_override,
                    attribution_headers=attribution_headers,
                    system_prompt=full_system_prompt,
                    provider=llm_context.provider,
                    reasoning_params=reasoning_params,
                    **kwargs,
                )
```

---

## Step 5: Update Model Response Schema (Optional Enhancement)

**File**: `server/schemas/llm.py`

**What to change**: Add `supported_parameters` to model response so frontend can detect thinking support.

**Current `ModelResponse`**:
```python
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
```

**Add this field**:
```python
    supports_thinking: bool = Field(
        default=False,
        description="Whether the model supports thinking/reasoning mode",
    )
```

---

## Step 6: Update Model Fetching Logic

**File**: `server/routers/llm.py`

**What to change**: Detect thinking support from OpenRouter's `supported_parameters` field.

**In `_fetch_openrouter_models()`**, find this code (around line 50-60):
```python
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
```

**Change it to**:
```python
            result = []
            for item in models_list:
                model_id = item.get("id")
                if not model_id:
                    continue
                
                # Check if model supports thinking
                supported_params = item.get("supported_parameters", [])
                supports_thinking = "reasoning" in supported_params
                
                result.append(
                    ModelResponse(
                        id=model_id,
                        name=item.get("name"),
                        context_length=item.get("context_length"),
                        supports_thinking=supports_thinking,
                    )
                )
            return result
```

---

## Step 7: Write Tests

**File**: `server/tests/test_thinking.py` (new file)

**Test cases to implement**:

```python
"""
Tests for thinking/reasoning mode configuration.
"""
import unittest
from server.schemas.llm import LLMContext, AIProviderEnum


class TestThinkingConfiguration(unittest.TestCase):
    """Test LLMContext thinking parameter handling."""
    
    def test_thinking_disabled_by_default(self):
        """Thinking should be disabled when not specified."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
        )
        self.assertFalse(ctx.thinking_enabled)
        self.assertIsNone(ctx.thinking_effort)
        self.assertIsNone(ctx.get_reasoning_params())
    
    def test_thinking_enabled_with_effort(self):
        """Should return reasoning params when enabled with effort."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
            thinking_enabled=True,
            thinking_effort="high",
        )
        params = ctx.get_reasoning_params()
        self.assertEqual(params, {"reasoning": {"effort": "high"}})
    
    def test_thinking_enabled_without_effort_defaults_high(self):
        """Should default to 'high' effort when enabled but no effort specified."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
            thinking_enabled=True,
        )
        params = ctx.get_reasoning_params()
        self.assertEqual(params, {"reasoning": {"effort": "high"}})
    
    def test_thinking_disabled_ignores_effort(self):
        """Should return None when disabled even if effort is set."""
        ctx = LLMContext(
            provider=AIProviderEnum.OPENROUTER,
            api_key="test-key",
            thinking_enabled=False,
            thinking_effort="high",
        )
        self.assertIsNone(ctx.get_reasoning_params())
    
    def test_all_effort_levels(self):
        """Should accept all valid effort levels."""
        for effort in ["minimal", "low", "medium", "high", "xhigh"]:
            ctx = LLMContext(
                provider=AIProviderEnum.OPENROUTER,
                api_key="test-key",
                thinking_enabled=True,
                thinking_effort=effort,
            )
            params = ctx.get_reasoning_params()
            self.assertEqual(params, {"reasoning": {"effort": effort}})


class TestThinkingHeaders(unittest.TestCase):
    """Test header extraction for thinking configuration."""
    
    def test_thinking_headers_parsed_correctly(self):
        """Should parse thinking headers into LLMContext."""
        from server.schemas.llm import get_llm_context
        import asyncio
        
        # This would need FastAPI test client - placeholder for structure
        # Test that X-Thinking-Enabled: true and X-Thinking-Effort: high
        # result in correct LLMContext fields
        pass


if __name__ == "__main__":
    unittest.main()
```

**Run tests**:
```bash
cd server
.venv\Scripts\activate
python -m unittest server.tests.test_thinking
```

---

## Step 8: Verify Integration

**Manual testing checklist**:

1. **Start server**: `python -m uvicorn server.main:app --reload --port 8000`

2. **Test without thinking** (should work as before):
   ```bash
   curl http://localhost:8000/learning/generate \
     -H "Content-Type: application/json" \
     -H "X-AI-Provider: openrouter" \
     -H "X-OpenRouter-Key: sk-or-..." \
     -H "X-OpenRouter-Model: anthropic/claude-sonnet-4" \
     -d '{"query": "What is 2+2?", "user_id": "test"}'
   ```

3. **Test with thinking enabled**:
   ```bash
   curl http://localhost:8000/learning/generate \
     -H "Content-Type: application/json" \
     -H "X-AI-Provider: openrouter" \
     -H "X-OpenRouter-Key: sk-or-..." \
     -H "X-OpenRouter-Model: anthropic/claude-sonnet-4" \
     -H "X-Thinking-Enabled: true" \
     -H "X-Thinking-Effort: high" \
     -d '{"query": "Explain quantum entanglement", "user_id": "test"}'
   ```

4. **Verify models endpoint** returns `supports_thinking`:
   ```bash
   curl http://localhost:8000/llm/models \
     -H "X-AI-Provider: openrouter" \
     -H "X-OpenRouter-Key: sk-or-..."
   ```
   - Check that models like `anthropic/claude-sonnet-4` have `supports_thinking: true`
   - Check that models like `gpt-3.5-turbo` have `supports_thinking: false`

---

## Edge Cases & Error Handling

1. **Invalid effort level**: The Pydantic `pattern` validator will reject invalid effort levels with a 422 error. This is expected behavior.

2. **Thinking on non-thinking model**: OpenRouter will likely ignore the `reasoning` parameter for unsupported models. No special handling needed.

3. **General Compute provider**: Thinking parameters should only be sent for OpenRouter. The `get_reasoning_params()` method is on `LLMContext` and works for any provider, but OpenRouter is the only one that uses it. General Compute will ignore `extra_body` parameters it doesn't understand.

4. **Missing headers**: When headers are absent, `thinking_enabled` defaults to `False` and `thinking_effort` defaults to `None`. This maintains backward compatibility.

---

## Files Modified Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `server/schemas/llm.py` | Modify | Add thinking fields to LLMContext, update header extraction |
| `server/utils/instructor_client.py` | Modify | Accept and pass reasoning_params to API |
| `server/agents/base.py` | Modify | Extract and pass reasoning_params from LLMContext |
| `server/routers/llm.py` | Modify | Add supports_thinking to model response |
| `server/tests/test_thinking.py` | New | Unit tests for thinking configuration |

---

## Acceptance Criteria

- [ ] `LLMContext` has `thinking_enabled` and `thinking_effort` fields
- [ ] `get_llm_context()` extracts `X-Thinking-Enabled` and `X-Thinking-Effort` headers
- [ ] `get_reasoning_params()` returns correct OpenRouter format
- [ ] `instructor_client.create_structured()` passes `extra_body` with reasoning params
- [ ] `base.py` extracts reasoning params from LLMContext and passes to instructor
- [ ] `/llm/models` returns `supports_thinking` boolean for each model
- [ ] All existing tests still pass
- [ ] New tests pass for thinking configuration
- [ ] Manual testing confirms thinking works with OpenRouter
