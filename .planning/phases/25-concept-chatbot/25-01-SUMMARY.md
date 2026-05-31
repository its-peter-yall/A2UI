---
phase: 25-concept-chatbot
plan: 25-01
subsystem: api
tags: [fastapi, sse, openai, streaming, pydantic, concept-chat]

requires:
  - none
provides:
  - Concept chat Pydantic schemas (ConceptChatMessage, ConceptChatRequest)
  - LLMContext chat_model field for chat model override
  - Concept chat service with provider resolution and SSE streaming
  - POST /learning/sessions/{id}/nodes/{id}/chat SSE endpoint
  - 16 unit tests covering streaming, headers, validation, history capping
affects:
  - concept-chatbot-frontend (phase 25 plans >01)

tech-stack:
  added: []
  patterns:
    - "SSE streaming via openai.AsyncOpenAI (not Instructor) for free-form chat"
    - "Model slug prefix resolution: openai/ and gpt- → OpenAI, others → OpenRouter"
    - "Server-side history capping to last 10 messages"
    - "X-Chat-Model header overrides X-Model; falls back when absent"

key-files:
  created:
    - server/services/concept_chat.py
    - server/tests/test_concept_chat.py
  modified:
    - server/schemas/learning.py
    - server/schemas/llm.py
    - server/routers/learning.py
    - pyrightconfig.json

key-decisions:
  - "openai.AsyncOpenAI used directly (not instructor) for free-form streaming text"
  - "Provider resolved from model slug prefix (openai/ and gpt- → api.openai.com, others → openrouter.ai)"
  - "X-Provider-Api-Key header made optional at FastAPI level, validated in handler for better 400 error responses"
  - "X-Chat-Model header takes precedence over X-Model with fallback"
  - "Ephemeral chat history capped at 10 messages server-side; system prompt always included"

patterns-established:
  - "SSE streaming via openai.AsyncOpenAI: yield data: {\"delta\":\"...\"}\\n\\n then data: [DONE]\\n\\n"
  - "Header-based model selection: X-Chat-Model and X-Model with priority resolution"
  - "Concept chat context injection: system prompt with content_markdown + heading selection"

requirements-completed:
  - CHAT-01
  - CHAT-02
  - CHAT-03
  - CHAT-04
  - CHAT-05

duration: 25 min
completed: 2026-05-28
---

# Phase 25 Plan 01 Summary: Backend Chat Endpoint, Streaming, and Provider Resolution

**Concept chat SSE streaming endpoint with Pydantic schemas, direct AsyncOpenAI integration, and model slug prefix provider resolution**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-28
- **Completed:** 2026-05-28
- **Tasks:** 5
- **Files modified:** 4 created, 3 modified (6 total including pyrightconfig)

## Accomplishments
- `POST /learning/sessions/{session_id}/nodes/{node_id}/chat` SSE streaming endpoint
- Provider resolution from model slug prefix (openai/ → OpenAI, others → OpenRouter)
- Server-side chat history capped to last 10 messages before LLM call
- `ConceptChatMessage` and `ConceptChatRequest` Pydantic v2 schemas
- `LLMContext.chat_model` field for independent chat model selection

## Task Commits

Each task committed atomically:

1. **Task 1: Add backend chat schemas** - `0ccdf73` (feat)
2. **Task 2: Extend LLMContext with chat_model** - `bbafc2c` (feat)
3. **Task 3: Implement concept chat service** - `c4ca1ac` (feat)
4. **Task 4: Wire FastAPI chat endpoint** - `8b2c21b` (feat)
5. **Task 5: Add backend unit tests** - `395f3da` (test)

## Files Created/Modified
- `server/services/concept_chat.py` - Service with provider resolution, message building, and SSE streaming
- `server/tests/test_concept_chat.py` - 16 unit tests: service + endpoint coverage
- `server/schemas/learning.py` - Added ConceptChatMessage and ConceptChatRequest
- `server/schemas/llm.py` - Added chat_model field to LLMContext
- `server/routers/learning.py` - Added concept_chat SSE endpoint, Header/StreamingResponse imports
- `pyrightconfig.json` - Added extraPaths for venv resolution

## Decisions Made
- X-Provider-Api-Key header made `Optional[str]` at FastAPI level with internal validation to return proper 400 (instead of FastAPI's default 422)
- Provider resolution: `openai/` and `gpt-` prefix → OpenAI API; all others → OpenRouter
- System prompt always includes full content_markdown + heading context as pointers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Required header validation returned 422 instead of 400**
- **Found during:** Task 5 (test_missing_provider_key_returns_400)
- **Issue:** FastAPI's `Header(...)` returns 422 for missing required headers; plan specified 400
- **Fix:** Changed `Header(...)` to `Header(None)` with manual validation in handler body
- **Files modified:** server/routers/learning.py
- **Verification:** test_missing_provider_key_returns_400 now passes with status 400
- **Committed in:** 395f3da (Task 5 commit)

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Minimal - header validation pattern adjusted to match spec. No scope creep.

## Issues Encountered
- LSP errors on all Python files due to pyright venv resolution — configured extraPaths in pyrightconfig.json
- All 120 tests pass (16 new + 104 existing)

## Next Phase Readiness
- Backend contract complete for concept chat
- Ready for frontend implementation (plan 25-02+): SSE stream consumption, ChatPanel component, heading selection UI

---
*Phase: 25-concept-chatbot*
*Plan: 25-01*
*Completed: 2026-05-28*
