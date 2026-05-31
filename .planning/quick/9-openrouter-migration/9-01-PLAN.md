---
phase: 9-openrouter-migration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/requirements.txt
  - server/utils/vertex_client.py (delete)
  - server/main.py
  - server/config.py
  - server/utils/instructor_client.py
  - server/utils/__init__.py
  - server/routers/learning.py
  - server/routers/llm.py (new)
  - server/routers/__init__.py
  - server/schemas/llm.py (new)
  - server/services/course_orchestrator.py
  - server/agents/base.py
  - server/agents/planner.py
  - server/agents/generator.py
  - server/agents/quizzer.py
autonomous: true
must_haves:
  truths:
    - Backend starts without Google Cloud credentials installed/configured
    - All learning endpoints that invoke LLMs require X-OpenRouter-Key
    - InstructorClient uses OpenRouter via openai.AsyncOpenAI
    - /llm/models proxies OpenRouter model list for the frontend
  artifacts:
    - path: server/utils/instructor_client.py
      provides: OpenRouter-based structured output generation
    - path: server/routers/llm.py
      provides: GET /llm/models
---

<objective>
Implement the backend migration to OpenRouter.

End state after this phase:
- Vertex AI is fully removed from runtime and startup.
- Learning endpoints accept OpenRouter credentials via headers.
- Orchestrator and agents pass those credentials down to InstructorClient.
- New endpoint GET /llm/models exists for frontend model picker.
</objective>

<context>
@openrouter_problem_statement.md
@.planning/codebase/CONVENTIONS.md
@server/main.py
@server/config.py
@server/utils/instructor_client.py
@server/services/course_orchestrator.py
@server/routers/learning.py

OpenRouter docs:
- https://openrouter.ai/docs/quickstart
- https://openrouter.ai/docs/app-attribution
</context>

<tasks>

<task type="auto">
  <name>Task 1: Dependency cleanup (remove Vertex SDK; add OpenAI SDK)</name>
  <files>server/requirements.txt</files>
  <action>
    1. Edit server/requirements.txt:
       - Remove google-cloud-aiplatform
       - Add openai (pin version if the repo pins; otherwise leave unpinned but verify)
    2. Rebuild the server venv deps:
       - cd server
       - .venv activation
       - pip install -r requirements.txt
    3. Verify `python -c "import openai"` succeeds.
    4. Verify `python -c "import google.cloud"` fails (optional check; ensures dependency removed).
  </action>
  <verify>
    - `pip show google-cloud-aiplatform` returns not found.
    - `pip show openai` returns installed.
  </verify>
  <done>Vertex SDK removed and OpenAI SDK installed.</done>
</task>

<task type="auto">
  <name>Task 2: Delete Vertex client module and remove startup initialization</name>
  <files>
    server/utils/vertex_client.py (delete)
    server/main.py
    server/utils/__init__.py
  </files>
  <action>
    1. Delete server/utils/vertex_client.py.
    2. Update server/main.py:
       - Remove imports of init_vertex/get_vertex_status.
       - Remove lifespan Vertex init block.
       - Replace /health response to report OpenRouter status instead (see Task 5 for details).
    3. Update server/utils/__init__.py docstring to remove vertex_client references.
    4. Run a repo search to ensure no imports remain:
       - rg "vertex_client|init_vertex|get_vertex_status|google\\.cloud|aiplatform" server
  </action>
  <verify>
    - `python -m uvicorn server.main:app --reload --port 8000` starts.
    - `GET /health` returns 200.
  </verify>
  <done>Server no longer imports or initializes Vertex AI.</done>
</task>

<task type="auto">
  <name>Task 3: Replace server/config.py Vertex settings with OpenRouter constants</name>
  <files>server/config.py</files>
  <action>
    1. Remove all Vertex-specific env variables and side-effects:
       - PROJECT_ID, LOCATION, GOOGLE_APPLICATION_CREDENTIALS, VERTEX_CONFIG
       - Exporting GOOGLE_APPLICATION_CREDENTIALS into os.environ
    2. Add minimal settings needed for OpenRouter integration.

    Recommended fields (even if API keys are client-provided):
    - OPENROUTER_BASE_URL (default: https://openrouter.ai/api/v1)
    - OPENROUTER_TIMEOUT_SECONDS (optional; default matches existing timeouts)

    Note: Do NOT add OPENROUTER_API_KEY as required in server settings; keys are client-provided.
  </action>
  <verify>
    - Running the server does not require any env vars.
    - No more references to PROJECT_ID/LOCATION exist in server/*.py.
  </verify>
  <done>Config module is provider-agnostic and Vertex-free.</done>
</task>

<task type="auto">
  <name>Task 4: Rewrite InstructorClient to use OpenRouter (OpenAI-compatible) and accept per-request key+headers</name>
  <files>server/utils/instructor_client.py</files>
  <action>
    1. Update file header comment to reflect OpenRouter (not Vertex).
    2. Update MODEL_CONFIGS model names to OpenRouter slugs:
       - planner: google/gemini-2.5-pro
       - generator + quizzer: google/gemini-2.5-flash
       (Keep temps and token limits the same, but rename max_output_tokens -> max_tokens).

    3. Remove the Vertex-style init() method and role-client cache that depends on project/location.
       Replace with one of these patterns:

       Pattern A (recommended for simplicity): create patched client per request.
       - create_structured(..., api_key: str, model_override: Optional[str], attribution_headers: dict)
         - NOTE: model_override is a GLOBAL override used for ALL roles.
       - build AsyncOpenAI(base_url=settings.OPENROUTER_BASE_URL, api_key=api_key, default_headers=attribution_headers)
       - wrap with instructor.from_openai(..., mode=instructor.Mode.JSON or JSON_SCHEMA)
       - call `await patched.chat.completions.create(...)` with:
         - model: model_override or MODEL_CONFIGS[role]["model"]
         - messages: full_messages
         - temperature: config["temperature"]
         - max_tokens: config["max_tokens"]
         - response_model: response_model

       Pattern B (optional perf): tiny in-memory cache keyed by (api_key_hash, title, referer).
       - Only if you can do it safely without logging keys.

    4. Enforce validation:
       - If api_key is missing/empty, raise ValueError early.

    5. Confirm we still use tenacity retries for transient errors.
  </action>
  <verify>
    - Unit tests still import instructor_client without Vertex.
    - A minimal manual call from a Python REPL works (optional):
      - Provide a real key and ask for a simple response_model.
  </verify>
  <done>InstructorClient can generate structured outputs via OpenRouter with per-request auth.</done>
</task>

<task type="auto">
  <name>Task 5: Plumb OpenRouter request context through router → orchestrator → agents</name>
  <files>
    server/routers/learning.py
    server/services/course_orchestrator.py
    server/agents/base.py
    server/agents/planner.py
    server/agents/generator.py
    server/agents/quizzer.py
  </files>
  <action>
    1. Define a small, explicit “LLM request context” structure. Two safe options:
       - A Pydantic model in server/schemas/llm.py (recommended)
       - A TypedDict/dataclass in server/utils

       Required fields:
       - api_key: str
       Optional fields:
       - model: str | None
       - http_referer: str | None
       - app_title: str | None

    2. Update server/routers/learning.py to extract headers:
       - X-OpenRouter-Key (required)
       - X-OpenRouter-Model (optional; if provided it applies to ALL agents)
       - HTTP-Referer (optional)
       - X-OpenRouter-Title (optional)

       If X-OpenRouter-Key missing: return HTTP 401.

       Important: do NOT log header values.

    3. Update CourseOrchestrator.generate_course(...) signature to accept llm_context and pass it to:
       - planner_agent.plan(...)
       - generator/quizzer calls in _generate_concept_unit
       - regenerate_node(...) when called

    4. Update PlannerAgent.plan/GeneratorAgent.generate_explanation/QuizzerAgent.generate_quiz (and any other LLM-touching methods) to accept llm_context (or **kwargs) and pass through to BaseAgent.generate.

    5. Update BaseAgent.generate to pass llm_context into instructor_client.create_structured (either explicitly or via kwargs).

    6. Ensure non-LLM endpoints still work (session listing, node retrieval, quiz submission).
  </action>
  <verify>
    - Starting server works.
    - Calling POST /learning/generate WITHOUT header returns 401.
    - Calling POST /learning/generate WITH headers reaches orchestrator (may still fail until UI exists; use curl).
  </verify>
  <done>All LLM calls now require OpenRouter context and no longer rely on global init.</done>
</task>

<task type="auto">
  <name>Task 6: Add /llm/models endpoint (backend proxy for model picker)</name>
  <files>
    server/routers/llm.py (new)
    server/routers/__init__.py
    server/schemas/llm.py (new)
    server/main.py
  </files>
  <action>
    1. Create a new router module server/routers/llm.py with prefix "/llm".
    2. Implement GET /llm/models:
       - Requires X-OpenRouter-Key (401 if missing)
       - Calls OpenRouter GET https://openrouter.ai/api/v1/models
       - Forwards attribution headers if provided
       - Returns a trimmed payload suitable for the UI:
         - id (model slug)
         - name (if available)
         - context_length (if available)
         - pricing (optional)

       Keep the schema stable; add fields later without breaking.

    3. Register the router:
       - Preferred: export it from server/routers/__init__.py and include in server/main.py
       - Acceptable: import router directly in server/main.py


    Notes:
    - Prefer httpx.AsyncClient (already a transitive dependency of openai) OR use openai client if easier.
    - Add explicit timeout and good error mapping:
      - 401/403 from OpenRouter → 401 to client
      - other failures → 502 Bad Gateway
  </action>
  <verify>
    - GET /llm/models without key returns 401.
    - GET /llm/models with invalid key returns 401.
  </verify>
  <done>Backend exposes model list endpoint for the frontend.</done>
</task>

</tasks>

<verification>
- `rg "google-cloud-aiplatform|aiplatform|vertex_client|vertex_ai" server` returns no matches (except docs that are handled in Phase 4).
- `python -m uvicorn server.main:app --reload --port 8000` boots.
- `curl http://localhost:8000/health` returns 200.
</verification>

<success_criteria>
- Server can run without any Google Cloud SDK installed.
- LLM-calling endpoints require X-OpenRouter-Key.
- InstructorClient uses OpenRouter via OpenAI-compatible base_url.
- /llm/models exists and returns JSON.
</success_criteria>
