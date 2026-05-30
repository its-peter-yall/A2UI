# SPECIFICATION: Complete Migration to OpenRouter & Vertex AI Cleanup

**Document Reference:** `openrouter_problem_statement.md`  
**Status:** COMPLETED (Phases 1-4, 2026-05-20)

---

## 1. Executive Summary & Objective

The goal of this initiative is to **completely migrate AgUI's LLM orchestration pipeline from native Google Vertex AI to OpenRouter**, and **completely remove the native Google Cloud Vertex SDK and its configurations** from the codebase. 

By transitioning solely to OpenRouter as our universal API gateway, we:
1. Maintain access to Google's Gemini models (via OpenRouter's `google/gemini-2.5-pro` and `google/gemini-2.5-flash` endpoints).
2. Gain instant access to 300+ additional leading open and closed-source LLMs (e.g., Claude 3.5 Sonnet, DeepSeek-V3, GPT-4o).
3. Dramatically simplify backend dependencies and eliminate the need for Google Cloud Project keys (`config.json`), local GCP service accounts, or the heavy Google Cloud CLI SDKs.

---

## 2. Problem Statement

> **"How can we cleanly remove the `google-cloud-aiplatform` dependency and native Vertex SDK configurations from AgUI, refactoring the `instructor` client to route all agent workflows exclusively through OpenRouter, while maintaining secure API key configuration and strict Pydantic output validation?"**

### Implementation Challenges:
1. **Dependency Deletion:** Remove native Google libraries (`google-cloud-aiplatform`) from dependencies without breaking app startup lifespans or status checks.
2. **Unified Client Rewrite:** Transition `InstructorClient` from a role-based Vertex AI mode to a singular OpenRouter OpenAI-compatible mode, keeping Pydantic validations active.
3. **Configuration Cleanup:** Clean up legacy env variables (`PROJECT_ID`, `VERTEX_CONFIG`, `LOCATION`) in favor of standard OpenRouter parameters (`OPENROUTER_API_KEY`).

---

## 3. Migration Plan & Blueprint

### Step 1: Dependency Cleanup
* **File to modify:** `server/requirements.txt`
* **Change:** Remove `google-cloud-aiplatform` and add `openai` (which `instructor` uses for OpenAI-compatible providers like OpenRouter).
```diff
- google-cloud-aiplatform
+ openai
```

### Step 2: Delete Vertex Client & Lifespan Routines
* **File to delete:** `server/utils/vertex_client.py` (no longer needed).
* **File to modify:** `server/main.py`
  * Remove calls to `init_vertex()` in the FastAPI application startup/lifespan handlers.
  * Remove any unused imports from `server.utils.vertex_client`.

### Step 3: Refactor the Instructor Client
* **File to modify:** `server/utils/instructor_client.py`
* **Change:** Rewrite the client to initialize `instructor.from_openai` using `AsyncOpenAI` targeting OpenRouter.
* **Role Mappings:** Configure default models with OpenRouter-specific strings:
```python
MODEL_CONFIGS = {
    "planner": {
        "model": "google/gemini-2.5-pro",
        "temperature": 0.3,
        "max_output_tokens": 4096,
    },
    "generator": {
        "model": "google/gemini-2.5-flash",
        "temperature": 0.7,
        "max_output_tokens": 2048,
    },
    "quizzer": {
        "model": "google/gemini-2.5-flash",
        "temperature": 0.2,
        "max_output_tokens": 4096,
    },
}
```
* **New Client Class Implementation:**
```python
from openai import AsyncOpenAI
import instructor

class InstructorClient:
    def __init__(self) -> None:
        self._client = None
        self._initialized = False

    def init(self, api_key: str) -> bool:
        if not api_key:
            return False
        
        try:
            self._client = instructor.from_openai(
                AsyncOpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=api_key,
                    default_headers={
                        "HTTP-Referer": "http://localhost:5173",
                        "X-Title": "AgUI Adaptive Learning",
                    }
                ),
                mode=instructor.Mode.JSON
            )
            self._initialized = True
            return True
        except Exception as e:
            self._initialized = False
            raise e
```

### Step 4: Environment Variable Migration
* **Files to modify:** `.env` and `server/.env`
* **Change:** Clear out Vertex configurations and define a global `OPENROUTER_API_KEY` (optionally, let users override this with their own keys via UI settings headers):
```diff
- PROJECT_ID=lucky-processor-480412-n8
- VERTEX_CONFIG=D:/Peter/AURA Twin Proj/AURA-PROJ/AURA-CHAT/config.json
- LOCATION=us-central1
+ OPENROUTER_API_KEY=your_openrouter_api_key_here
```

### Step 5: Frontend Configuration UI
* Provide a clean UI for key administration inside the React frontend:
  * Persistent storage in browser's local cache.
  * Selector list for all 300+ models or quick defaults (Gemini, Claude, GPT).

---

## 4. Security & Privacy Rules
1. **Dynamic Headers Protection:** If dynamic user keys are transmitted in headers, ensure CORS policies allow `X-OpenRouter-Key`.
2. **Log Sanitization:** Ensure `OPENROUTER_API_KEY` or custom user keys are never written to any backend trace files.

---

## 5. Definition of Done (Quality Gates)
- [ ] `google-cloud-aiplatform` library is fully uninstalled from virtual environment.
- [ ] `vertex_client.py` is removed, and all imports of it are deleted.
- [ ] Backend boots up successfully using the OpenRouter client.
- [ ] All agents generate Pydantic outputs successfully using `instructor`'s OpenAI mode.
- [ ] Unit tests are updated to mock OpenAI/OpenRouter calls instead of Vertex AI calls.
- [ ] Course generation endpoint works correctly using OpenRouter's Gemini/other endpoints.
