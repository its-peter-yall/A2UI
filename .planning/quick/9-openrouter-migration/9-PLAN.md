---
phase: 9-openrouter-migration
plan: 00
type: plan
wave: 1
depends_on: []
files_modified:
  - server/requirements.txt
  - server/main.py
  - server/config.py
  - server/utils/instructor_client.py
  - server/utils/vertex_client.py (delete)
  - server/utils/__init__.py
  - server/services/course_orchestrator.py
  - server/agents/base.py
  - server/agents/planner.py
  - server/agents/generator.py
  - server/agents/quizzer.py
  - server/routers/learning.py
  - server/routers/__init__.py
  - server/routers/(new) llm.py
  - server/schemas/(new) llm.py
  - server/tests/*
  - client/src/lib/learningApi.ts
  - client/src/features/learning/LearningHome.tsx
  - client/src/(new) openrouter settings + model picker components
  - README.md
  - conductor/product.md
  - conductor/tech-stack.md
  - .planning/codebase/{STACK,INTEGRATIONS,ARCHITECTURE,STRUCTURE,CONCERNS}.md
autonomous: false
must_haves:
  truths:
    - No native Google Vertex AI SDK remains in the repo (dependency + code + docs)
    - All LLM calls go through OpenRouter using the OpenAI-compatible API
    - The backend never stores OpenRouter API keys (client supplies them)
    - Instructor + Pydantic validation stays enforced for all agent outputs
    - Frontend provides: (1) API key storage, (2) full OpenRouter model picker
    - Unit tests updated; integration test uses OpenRouter when enabled
  artifacts:
    - path: server/utils/instructor_client.py
      provides: OpenRouter-backed InstructorClient using openai.AsyncOpenAI
    - path: server/routers/llm.py
      provides: Backend endpoints for listing OpenRouter models and validating keys
    - path: client/src/features/settings/OpenRouterSettingsPanel.tsx
      provides: UI to store OpenRouter key + selected model in localStorage
    - path: client/src/features/settings/OpenRouterModelPicker.tsx
      provides: Searchable model picker backed by /llm/models
  key_links:
    - from: client/src/lib/learningApi.ts
      to: server/routers/learning.py
      via: X-OpenRouter-Key + X-OpenRouter-Model headers
    - from: server/routers/learning.py
      to: server/services/course_orchestrator.py
      via: openrouter request context passed to orchestrator
    - from: server/services/course_orchestrator.py
      to: server/agents/*
      via: openrouter request context passed to each agent call
    - from: server/agents/base.py
      to: server/utils/instructor_client.py
      via: create_structured(api_key=..., model=..., attribution_headers=...)
---

<objective>
Migrate the entire LLM pipeline from native Vertex AI to OpenRouter.

This plan is written for SWE interns and is intentionally explicit.

Outcomes:
- Remove `google-cloud-aiplatform` and all Vertex-specific code/config.
- Route ALL agent calls through OpenRouter (OpenAI-compatible API).
- Keep strict structured outputs via `instructor` + Pydantic.
- Implement a frontend “set it and forget it” OpenRouter key + full model picker.

Non-goals (for this migration):
- Adding user authentication / multi-user security.
- Adding server-side key vaulting or key rotation.
- Adding rate limiting (can be follow-up).
</objective>

<context>
@openrouter_problem_statement.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/STACK.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@.planning/codebase/INTEGRATIONS.md
@.planning/codebase/CONCERNS.md

OpenRouter references (for interns to read):
- App attribution headers (HTTP-Referer, X-OpenRouter-Title): https://openrouter.ai/docs/app-attribution
- Quickstart (OpenAI-compatible /api/v1/chat/completions): https://openrouter.ai/docs/quickstart

Instructor references:
- Client setup + modes: https://python.useinstructor.com/learning/getting_started/client_setup
</context>

<high_level_decisions>
These are already decided by the product owner (do not bikeshed during implementation):

1) API key handling: "User key only".
   - The backend MUST NOT read OPENROUTER_API_KEY from env for core functionality.
   - The backend MUST NOT persist/store user keys.
   - The frontend stores the key locally (e.g., localStorage) and sends it on every request.

2) Model selection UI: "Full OpenRouter catalog".
   - The frontend will fetch the model list from the backend (backend proxies OpenRouter).
   - The user selects ONE model slug (global) and the frontend sends it with all learning requests.
   - Backend uses that ONE model for planner/generator/quizzer, while keeping per-role temperatures/max token limits.

3) Attribution headers: "Client-provided".
   - Frontend sends HTTP-Referer and X-OpenRouter-Title.
   - Backend forwards these headers to OpenRouter.
</high_level_decisions>

<integration_contract>
### Headers sent from frontend → backend (ALL learning requests)
- X-OpenRouter-Key: <user api key> (required)
- X-OpenRouter-Model: <model slug> (optional; if present, this ONE model is used for ALL agents; if absent, backend uses role defaults)
- HTTP-Referer: <app url> (optional but recommended for OpenRouter attribution)
- X-OpenRouter-Title: <app name> (optional but recommended for attribution)

### Backend → OpenRouter
- Authorization: Bearer <user api key>
- HTTP-Referer / X-OpenRouter-Title forwarded if provided

### Backend defaults (when model header missing)
- planner: google/gemini-2.5-pro
- generator: google/gemini-2.5-flash
- quizzer: google/gemini-2.5-flash

### New backend endpoints
- GET /llm/models
  - Requires X-OpenRouter-Key (because OpenRouter requires auth)
  - Returns model list (trimmed + stable fields for UI)

Optionally later:
- GET /llm/models/search?q=... (server-side filter)
- POST /llm/validate-key (calls a cheap endpoint; or reuse /llm/models)
</integration_contract>

<phases>

<phase id="1" name="Backend migration to OpenRouter (no UI yet)">
Deliverable: server boots + learning endpoints work when given OpenRouter headers.
Plan file: .planning/quick/9-openrouter-migration/9-01-PLAN.md
</phase>

<phase id="2" name="Update & expand tests (server)">
Deliverable: unit tests pass; new tests cover header parsing + OpenRouter proxy.
Plan file: .planning/quick/9-openrouter-migration/9-02-PLAN.md
</phase>

<phase id="3" name="Frontend: key storage + full model picker">
Deliverable: user can set key once, pick model from catalog, and generate courses.
Plan file: .planning/quick/9-openrouter-migration/9-03-PLAN.md
</phase>

<phase id="4" name="Docs + cleanup + verification">
Deliverable: repo contains no Vertex references; docs & env examples updated.
Plan file: .planning/quick/9-openrouter-migration/9-04-PLAN.md
</phase>

</phases>

<definition_of_done>
- Backend:
  - `google-cloud-aiplatform` removed from requirements and imports.
  - `server/utils/vertex_client.py` deleted; no references remain.
  - `InstructorClient` uses `openai.AsyncOpenAI(base_url='https://openrouter.ai/api/v1')`.
  - Learning endpoints return 401 when X-OpenRouter-Key is missing.
  - /health reflects OpenRouter (not Vertex).

- Frontend:
  - OpenRouter key + selected model are persisted locally.
  - All API calls attach required headers.
  - Model picker loads from /llm/models and supports search.

- Quality gates:
  - `cd server && python -m unittest` passes.
  - `cd client && npm run build` passes.
  - `cd client && npm run test -- --run` passes.
</definition_of_done>
