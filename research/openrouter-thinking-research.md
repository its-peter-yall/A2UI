# Research: OpenRouter Thinking/Reasoning Mode Enablement

## Summary

OpenRouter provides a unified `reasoning` parameter across its API to enable thinking/reasoning mode for supported models. The primary method is passing a `reasoning` object in your chat completion request body with controls for effort level (`effort`) or token budget (`max_tokens`). A legacy `:thinking` model suffix also exists. Reasoning tokens appear in the `reasoning` field of assistant messages and in a structured `reasoning_details` array. They are billed as output tokens and can significantly increase cost (up to ~4× at high effort). The Python `instructor` library does not natively parse reasoning fields — you must access them from the raw API response object.

---

## Findings

### 1. Primary Parameter: `reasoning` Object (Chat Completions API)

The canonical way to enable thinking is via the `reasoning` parameter in the request body. This is OpenRouter's unified interface that normalizes across all providers.

```json
{
  "model": "your-model",
  "messages": [],
  "reasoning": {
    "effort": "high",
    "max_tokens": 2000,
    "exclude": false,
    "enabled": true
  }
}
```

**Sub-parameters:**

| Parameter | Type | Values / Description |
|-----------|------|---------------------|
| `effort` | string | `"xhigh"` (~95% of max_tokens), `"high"` (~80%), `"medium"` (~50%), `"low"` (~20%), `"minimal"` (~10%), `"none"` (disabled) |
| `max_tokens` | integer | Direct token budget for reasoning (min 1024, max 128000 for Anthropic). Supported by Gemini, Anthropic, some Qwen models |
| `exclude` | boolean | `true` = model reasons internally but tokens aren't returned in response |
| `enabled` | boolean | `true` = enable reasoning at default "medium" effort. Inferred from `effort` or `max_tokens` if omitted |

**Important:** Use `effort` OR `max_tokens`, not both. If both are present, behavior is provider-dependent.

[Source: Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)

---

### 2. Alternative: `:thinking` Model Variant

You can append `:thinking` to any model ID to enable extended reasoning:

```json
{
  "model": "deepseek/deepseek-r1:thinking"
}
```

This is a convenience shorthand. For Anthropic models, the `:thinking` variant is **no longer supported** — use the `reasoning` parameter instead.

[Source: Thinking Variant](https://openrouter.ai/docs/guides/routing/model-variants/thinking)

---

### 3. Supported Models

**Proprietary models with reasoning support:**
- **OpenAI**: o1 series, o3 series, o4-mini, GPT-5 series (effort-based)
- **Anthropic**: Claude 3.7+ (max_tokens-based), Claude 4.6 Opus/Sonnet (adaptive thinking by default)
- **Google Gemini**: Gemini 2.5 Flash/Pro (max_tokens-based), Gemini 3 series (thinkingLevel-based)
- **xAI Grok**: Grok models (effort-based)

**Open-source models with reasoning support:**
- **DeepSeek**: R1, V3.1, V3.1 Terminus (hybrid reasoning, 671B params, 37B active)
- **Alibaba Qwen**: Qwen3 series (Qwen3-30B-A3B-Thinking, Qwen3-Next-80B-A3B-Thinking, Qwen3-Max-Thinking, Qwen-Plus thinking variants)
- **Baidu**: ERNIE-4.5-21B-A3B-Thinking
- **Others**: Arcee Trinity, MiniMax M2, MoonShot Kimi K2, NVIDIA Nemotron 3, Prime Intellect INTELLECT-3, Xiaomi MiMo-V2, Z.ai GLM 4.5

**Checking model support programmatically:** Use the `supported_parameters` array from the `/models` endpoint — if it includes `"reasoning"`, the model supports thinking.

[Source: Reasoning Tokens - Preserving Reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
[Source: Models API](https://openrouter.ai/docs/api/api-reference/models/get-models)

---

### 4. API Request Formats

#### 4a. Chat Completions API (Standard — OpenAI-compatible)

**Python with OpenAI SDK:**
```python
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="<OPENROUTER_API_KEY>",
)

# Effort-based (OpenAI models, Grok)
response = client.chat.completions.create(
    model="openai/o3-mini",
    messages=[{"role": "user", "content": "Explain quantum computing."}],
    extra_body={
        "reasoning": {
            "effort": "high"
        }
    },
)

# Token-budget-based (Anthropic models)
response = client.chat.completions.create(
    model="~anthropic/claude-sonnet-latest",
    messages=[{"role": "user", "content": "What's the best sorting algorithm?"}],
    extra_body={
        "reasoning": {
            "max_tokens": 2000
        }
    },
)

msg = response.choices[0].message
print(getattr(msg, "reasoning", None))  # Plaintext reasoning string
print(getattr(msg, "content", None))    # Final answer
```

**JavaScript/TypeScript with OpenRouter SDK:**
```typescript
import { OpenRouter } from '@openrouter/sdk';

const openRouter = new OpenRouter({ apiKey: '<OPENROUTER_API_KEY>' });

const response = await openRouter.chat.send({
    model: 'openai/o3-mini',
    messages: [{ role: 'user', content: "How would you build the world's tallest skyscraper?" }],
    reasoning: { effort: 'high' },
    stream: false,
});

console.log('REASONING:', response.choices[0].message.reasoning);
console.log('CONTENT:', response.choices[0].message.content);
```

**Raw cURL:**
```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek/deepseek-r1",
    "messages": [{"role": "user", "content": "Solve: Which is bigger, 9.11 or 9.9?"}],
    "reasoning": {
      "effort": "high"
    }
  }'
```

#### 4b. Responses API (Beta — OpenAI Responses API-compatible)

```python
import requests

response = requests.post(
    'https://openrouter.ai/api/v1/responses',
    headers={
        'Authorization': 'Bearer YOUR_OPENROUTER_API_KEY',
        'Content-Type': 'application/json',
    },
    json={
        'model': 'openai/o4-mini',
        'input': 'What is the meaning of life?',
        'reasoning': {
            'effort': 'high'
        },
        'max_output_tokens': 9000,
    },
)
result = response.json()
```

[Source: Reasoning Tokens - Examples](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
[Source: Responses API Beta Reasoning](https://openrouter.ai/docs/api/reference/responses/reasoning)

---

### 5. Response Format

#### 5a. Chat Completions API Response

Reasoning content appears in **two fields** on the assistant message:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Based on my analysis, I recommend...",
        "reasoning": "Let me think through this step by step:\n1. First consideration...\n2. Second consideration...",
        "reasoning_details": [
          {
            "type": "reasoning.summary",
            "summary": "Analyzed the problem by breaking it into components",
            "id": "reasoning-summary-1",
            "format": "anthropic-claude-v1",
            "index": 0
          },
          {
            "type": "reasoning.text",
            "text": "Let me work through this systematically:\n1. First consideration...\n2. Second consideration...",
            "signature": null,
            "id": "reasoning-text-1",
            "format": "anthropic-claude-v1",
            "index": 1
          }
        ]
      }
    }
  ]
}
```

**Key fields on `choices[].message`:**

| Field | Type | Description |
|-------|------|-------------|
| `reasoning` | string | Plaintext reasoning content (alias: `reasoning_content`) |
| `reasoning_details` | array | Structured reasoning blocks (see types below) |

**`reasoning_details` types:**

| Type | Description |
|------|-------------|
| `reasoning.summary` | High-level summary of the reasoning process |
| `reasoning.text` | Raw text reasoning with optional `signature` field |
| `reasoning.encrypted` | Encrypted/redacted reasoning data (e.g., Anthropic) |

**Format identifiers:** `"openai-responses-v1"`, `"anthropic-claude-v1"`, `"google-gemini-v1"`, `"xai-responses-v1"`

**Usage breakdown:**
```json
{
  "usage": {
    "completion_tokens": 85,
    "completion_tokens_details": {
      "reasoning_tokens": 45
    },
    "prompt_tokens": 15,
    "total_tokens": 100
  }
}
```

#### 5b. Responses API Response

```json
{
  "id": "resp_1234567890",
  "object": "response",
  "model": "openai/o4-mini",
  "output": [
    {
      "type": "reasoning",
      "id": "rs_abc123",
      "encrypted_content": "gAAAAABotI9...",
      "summary": [
        "First, I need to determine the current year",
        "Then calculate the difference",
        "Finally, compare"
      ]
    },
    {
      "type": "message",
      "id": "msg_xyz789",
      "status": "completed",
      "role": "assistant",
      "content": [
        { "type": "output_text", "text": "Yes. In 2025, 1995 was 30 years ago.", "annotations": [] }
      ]
    }
  ],
  "usage": {
    "input_tokens": 15,
    "output_tokens": 85,
    "output_tokens_details": { "reasoning_tokens": 45 },
    "total_tokens": 100
  }
}
```

[Source: Reasoning Tokens - Reasoning Details API Shape](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
[Source: Responses API Beta Reasoning](https://openrouter.ai/docs/api/reference/responses/reasoning)

---

### 6. Streaming Considerations

#### Chat Completions Streaming

Reasoning content arrives in delta chunks alongside regular content:

```json
{
  "choices": [
    {
      "delta": {
        "reasoning_details": [
          {
            "type": "reasoning.text",
            "text": "Let me think about this step by step...",
            "signature": null,
            "id": "reasoning-text-1",
            "index": 0
          }
        ]
      }
    }
  ]
}
```

**Python streaming example:**
```python
response = client.chat.completions.create(
    model="~anthropic/claude-sonnet-latest",
    messages=[{"role": "user", "content": "What's bigger, 9.9 or 9.11?"}],
    max_tokens=10000,
    extra_body={"reasoning": {"max_tokens": 8000}},
    stream=True,
)

for chunk in response:
    delta = chunk.choices[0].delta
    if hasattr(delta, 'reasoning_details') and delta.reasoning_details:
        for detail in delta.reasoning_details:
            if detail.type == "reasoning.text" and detail.text:
                print(f"REASONING: {detail.text}", end="")
    elif getattr(delta, 'content', None):
        print(f"CONTENT: {delta.content}", end="")
```

#### Responses API Streaming

Uses SSE with event types like `response.reasoning.delta`:

```typescript
const data = JSON.parse(line.slice(6));
if (data.type === 'response.reasoning.delta') {
    console.log('Reasoning:', data.delta);
}
```

**Important notes:**
- The `reasoning` field on `delta` also carries plaintext reasoning in streaming (same as non-streaming)
- `reasoning_details` in each chunk may contain one or more reasoning objects
- For encrypted reasoning, content may appear as `[REDACTED]` in streaming
- Build the complete reasoning sequence by concatenating all chunks in order

[Source: Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
[Source: Responses API Beta Reasoning](https://openrouter.ai/docs/api/reference/responses/reasoning)

---

### 7. Instructor Library Compatibility

The Python `instructor` library (v1.15.1+) is designed for **structured output extraction** using Pydantic models. It does **not** natively parse or surface reasoning/thinking content from responses.

**How to access reasoning with instructor + OpenRouter:**

```python
import instructor
from openai import OpenAI
from pydantic import BaseModel

client = instructor.from_openai(OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="<OPENROUTER_API_KEY>",
))

class Analysis(BaseModel):
    conclusion: str
    confidence: float

# instructor wraps tool calling / structured output
result = client.chat.completions.create(
    model="deepseek/deepseek-r1",
    response_model=Analysis,
    messages=[{"role": "user", "content": "Analyze: Is 9.11 > 9.9?"}],
    extra_body={"reasoning": {"effort": "high"}},
)

# Access raw completion for reasoning
raw = result._raw_response  # The underlying ChatCompletion object
reasoning = getattr(raw.choices[0].message, "reasoning", None)
reasoning_details = getattr(raw.choices[0].message, "reasoning_details", None)

print(f"Reasoning: {reasoning}")
print(f"Structured: {result}")
```

**Key limitations:**
- Instructor's `response_model` uses tool calling or JSON mode to extract structured data — reasoning tokens are a separate concern
- Reasoning content lives on `raw.choices[0].message.reasoning` and `raw.choices[0].message.reasoning_details`
- Use `create_with_completion()` to get both the Pydantic model and the raw response in one call
- No built-in support for streaming reasoning via instructor's streaming interface
- An open GitHub discussion (#1838) exists requesting native thinking support for Ollama models

**For the project's `instructor_client.py`**: Since the project uses `instructor` with OpenRouter, you'll need to extract reasoning from the raw completion object. The `instructor` library will return the structured Pydantic model as the primary result, but reasoning content is accessible via `_raw_response` or `create_with_completion()`.

[Source: Instructor GitHub Discussion #1838](https://github.com/567-labs/instructor/discussions/1838)
[Source: Instructor API Reference](https://python.useinstructor.com/api/)
[Source: Instructor Raw Response](https://github.com/jxnl/instructor/blob/main/docs/concepts/raw_response.md)

---

### 8. Cost Implications

**Reasoning tokens are billed as output tokens.** This means:

1. **Direct cost increase**: Enabling reasoning increases `completion_tokens` by the number of reasoning tokens consumed
2. **Effort-to-cost ratio**: Higher effort = more reasoning tokens = higher cost. Roughly:
   - `minimal` → ~10% of max_tokens as reasoning
   - `low` → ~20%
   - `medium` → ~50%
   - `high` → ~80%
   - `xhigh` → ~95%
3. **Cost multiplier**: High effort can cost ~4× as much as low effort for the same query
4. **Token budget cap**: For Anthropic models, reasoning budget is capped at 128,000 tokens (min 1024)
5. **`max_tokens` constraint**: For Anthropic, `max_tokens` must be strictly higher than the reasoning budget to leave room for the final response

**Usage tracking in responses:**
```json
{
  "usage": {
    "completion_tokens": 85,
    "completion_tokens_details": {
      "reasoning_tokens": 45
    },
    "cost": 0.95,
    "prompt_tokens": 194,
    "total_tokens": 279
  }
}
```

The `reasoning_tokens` count is included automatically in every response (no extra parameters needed).

**Tip**: Use `reasoning.exclude: true` to have the model reason internally without returning reasoning tokens in the response — you still pay for reasoning tokens but reduce response payload size.

[Source: Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
[Source: Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)

---

### 9. Best Practices: When to Enable vs Skip Thinking

**Enable thinking for:**
- Complex multi-step reasoning (math proofs, logic puzzles, code synthesis)
- Tasks requiring chain-of-thought analysis
- Questions where accuracy matters more than speed/cost
- Agentic planning and decision-making
- Debugging and error analysis

**Skip thinking for:**
- Simple factual lookups ("What's the capital of France?")
- Simple formatting or transformation tasks
- High-throughput, low-latency applications where cost matters
- Tasks where the model's base capabilities are sufficient

**Effort level guidance:**

| Effort | Use Case |
|--------|----------|
| `minimal` / `low` | Simple logic, light analysis |
| `medium` | Moderate complexity, general-purpose |
| `high` | Complex reasoning, code generation, math |
| `xhigh` | Maximum depth for hardest problems |

**Model-specific guidance:**

| Model Family | Control Method | Notes |
|-------------|---------------|-------|
| OpenAI o-series, GPT-5 | `reasoning.effort` | Effort levels mapped directly |
| Anthropic Claude 3.7–4.5 | `reasoning.max_tokens` | Direct token budget; `effort` maps to budget formula |
| Anthropic Claude 4.6 | `reasoning.enabled: true` (adaptive) | Uses adaptive thinking by default; `reasoning.effort` is **ignored**; use `reasoning.max_tokens` to force budget-based |
| Gemini 2.5 | `reasoning.max_tokens` | Maps to `thinkingBudget` |
| Gemini 3 | `reasoning.effort` | Maps to `thinkingLevel`; max_tokens also works but Google internally maps it to a level |
| DeepSeek R1 | `reasoning.effort` or `:thinking` suffix | Both work |
| Qwen3 | `reasoning.max_tokens` | Maps to `thinking_budget`; varies by model |

---

### 10. Provider-Specific Caveats

#### Anthropic Claude 4.6 Migration
- **Adaptive thinking** is the new default — Claude decides how much to think
- `reasoning.effort` is **ignored** for Claude 4.6 Opus/Sonnet
- Use `reasoning.max_tokens` for explicit budget control
- New `verbosity: "max"` parameter controls response detail (separate from reasoning)
- Older Claude models (3.7, 4.5) work exactly as before

```python
# Claude 4.6 — Adaptive thinking (recommended)
{"model": "anthropic/claude-4.6-opus", "reasoning": {"enabled": true}}

# Claude 4.6 — Budget-based (if you need control)
{"model": "anthropic/claude-4.6-opus", "reasoning": {"enabled": true, "max_tokens": 10000}}
```

[Source: Claude 4.6 Migration Guide](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/claude-4-6)

#### Some OpenAI Models Don't Return Reasoning Tokens
While most models return reasoning tokens in the response, some (like the OpenAI o-series) do **not** expose them. The model still reasons internally, but you won't see the reasoning content.

#### Gemini 3 thinkingLevel
When using `effort` with Gemini 3, OpenRouter maps to Google's `thinkingLevel` enum. If you specify `max_tokens` instead, Google internally maps the budget to a level — you don't get precise token control.

#### Legacy Parameters (Deprecated)
- `include_reasoning: true` → equivalent to `reasoning: {}`
- `include_reasoning: false` → equivalent to `reasoning: { exclude: true }`

---

### 11. Preserving Reasoning Across Multi-Turn Conversations

When continuing a conversation (especially with tool calls), you must pass reasoning back:

```python
messages = [
    {"role": "user", "content": "What's the weather in Boston?"},
    {
        "role": "assistant",
        "content": message.content,
        "tool_calls": message.tool_calls,
        "reasoning_details": message.reasoning_details  # Pass back unmodified
    },
    {
        "role": "tool",
        "tool_call_id": message.tool_calls[0].id,
        "content": '{"temperature": 45, "condition": "rainy"}'
    }
]
```

**Two ways to preserve reasoning:**
1. `message.reasoning` (string) — simple plaintext
2. `message.reasoning_details` (array) — full structured blocks (required for encrypted/summarized reasoning)

**Critical**: The entire sequence of consecutive reasoning blocks must match the outputs generated by the model — you cannot rearrange or modify them.

[Source: Reasoning Tokens - Preserving Reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)

---

## Sources

- **Kept:**
  - [Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) — Primary reference for the unified `reasoning` parameter, effort levels, max_tokens, response format, streaming, preserving reasoning, and provider-specific behavior
  - [Thinking Variant](https://openrouter.ai/docs/guides/routing/model-variants/thinking) — Documents the `:thinking` model suffix
  - [Responses API Beta Reasoning](https://openrouter.ai/docs/api/reference/responses/reasoning) — Beta Responses API reasoning configuration and streaming
  - [Claude 4.6 Migration Guide](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/claude-4-6) — Adaptive thinking, effort level changes, verbosity parameter
  - [Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting) — Token counting, reasoning_tokens in usage, cost tracking
  - [API Parameters](https://openrouter.ai/docs/api/reference/parameters) — General parameter reference
  - [Instructor GitHub Discussion #1838](https://github.com/567-labs/instructor/discussions/1838) — Instructor's lack of native thinking support
  - [Instructor Raw Response](https://github.com/jxnl/instructor/blob/main/docs/concepts/raw_response.md) — How to access raw API response via `_raw_response`
  - [LangChain OpenRouter Reference](https://reference.langchain.com/python/langchain-openrouter/chat_models/ChatOpenRouter/reasoning) — Confirms `effort` values: `'xhigh'`, `'high'`, `'medium'`, `'low'`, `'minimal'`, `'none'` and `summary` values: `'auto'`, `'concise'`, `'detailed'`

- **Dropped:**
  - Baidu ERNIE pricing page — redundant with general findings
  - Qwen pricing pages — model-specific, not generalizable
  - General FAQ — no unique reasoning-specific info
  - OmniRoute GitHub discussion — third-party wrapper, not OpenRouter-specific
  - Various repo READMEs — not directly relevant to OpenRouter API

## Gaps

1. **Exact pricing multipliers**: OpenRouter docs confirm reasoning tokens are billed as output tokens but don't specify per-model reasoning token pricing separately. Need to check individual model pricing pages for reasoning vs. non-reasoning output token costs.
2. **Instructor `create_with_completion()` reasoning access**: Need to verify in practice whether `_raw_response` correctly exposes `reasoning` and `reasoning_details` fields when using instructor with OpenRouter, since these are OpenRouter-specific extensions to the OpenAI response format.
3. **Gemini 3 `thinkingLevel` token ranges**: Google doesn't publicly document token consumption per thinking level. Actual token counts can only be determined empirically.
4. **Claude 4.6 adaptive thinking token limits**: The exact bounds of adaptive thinking aren't documented — how much can it decide to think?
5. **DeepSeek V3.1 thinking mode API**: The V3.1 Terminus model claims "supports both thinking and non-thinking modes" but the exact API parameters for switching between them need verification on the model page.

## Supervisor coordination

No supervisor contact needed — research is complete with comprehensive coverage of all requested areas.
