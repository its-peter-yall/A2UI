# External Integrations

**Analysis Date:** 2026-02-16

## APIs & External Services

**AI Provider Abstraction (OpenRouter & General Compute):**
- **Purpose:** Universal LLM inference supporting multiple backends for course generation
- **Providers Supported:**
  - **OpenRouter:** Universal LLM gateway (default base URL: `https://openrouter.ai/api/v1`)
  - **General Compute:** High-efficiency OpenAI-compatible endpoint (default base URL: `https://api.generalcompute.com/v1`)
- **SDK:** `openai` Python library (both providers use standard OpenAI compatibility)
- **Structured Output Client:** `server/utils/instructor_client.py`
  - Dynamic client generation: `AsyncOpenAI` instance initialized on a per-request basis
  - Provider-aware parameters: dynamically sets target `base_url` and `timeout` values
- **Header Contract:**
  - `X-AI-Provider`: Controls routing, must be either `openrouter` or `generalcompute`
  - `Authorization`: standard Bearer token header (`Bearer <API_KEY>`) carrying provider credentials
- **Client Settings Module:** `client/src/lib/providerSettings.ts`
  - Handles key entry, masking, validation, and active model selection
  - Segregates saved state: switches between providers while preserving the API key and model selection of the other
  - Automatic Migration: converts legacy `openrouter_settings` key to `ai_provider_settings` format on first mount
- **Backend Routing:**
  - Dispatched via `get_llm_context()` context manager in FastAPI routes
  - Extracts active provider and credentials from requests, and propagates them to the base agent system

**REST API (Internal):**
- **Client:** Axios-based API client in `client/src/lib/learningApi.ts`
- **Base URL:** `VITE_API_URL` environment variable (default: `http://localhost:8000`)
- **Features:**
  - Response interceptors for error logging
  - Two client instances:
    - Standard: 30s timeout for quick operations
    - `learningApi`: 5-minute timeout for course generation
  - TypeScript types mirroring backend Pydantic schemas

## Data Storage

**Primary Database:**
- **Type:** SQLite (local file-based)
- **Location:** `server/data/agui.db`
- **Path Config:** `server/database/persistence.py` (DB_PATH)
- **Driver:** Native `sqlite3` module (Python stdlib)
- **Features:**
  - Foreign key constraints enabled (`PRAGMA foreign_keys=ON`)
  - Connection-per-operation pattern
  - Row factory for dict-like access

**Database Tables:**
- `learning_sessions` - Learning session metadata
- `concept_nodes` - Educational content nodes with state machine
- `quiz_data` - Quiz questions and answers (JSON payload storage)
- `quiz_attempts` - User quiz attempt history
- `revision_sessions` - Revision/review session tracking
- `revision_node_progress` - Per-node progress in revision sessions

**Indexes:**
- `idx_learning_sessions_user_id` - User-based session queries
- `idx_concept_nodes_session_id` - Session node retrieval
- `idx_concept_nodes_sequence` - Ordered node access
- `idx_quiz_data_node_id` - Quiz lookup by node
- `idx_quiz_attempts_node_id` - Attempt history queries
- `idx_revision_original_session_id` - Revision listings

**File Storage:**
- **Type:** Local filesystem only
- **Database Files:** `server/data/` directory
- **Static Assets:** Built client served as static files

**Caching:**
- **Client-side:** TanStack React Query caching with 5-minute stale time
- **Server-side:** None (stateless API design)

## Authentication & Identity

**Auth Provider:** None/Custom
- **Implementation:** Simple user_id string parameter in API requests
- **Session Management:** None (stateless REST API)
- **Identity Storage:** User ID stored in `learning_sessions.user_id` column
- **Security:** No authentication middleware detected - open API

## Monitoring & Observability

**Error Tracking:**
- **Client:** Console.error logging via Axios interceptors
- **Server:** Python `logging` module with module-level loggers
- **Log Levels:** INFO for general operations, ERROR for failures
- **Log Format:** Standard Python logging format

**Health Checks:**
- **Endpoint:** `GET /health`
- **Response:** `{"status": "ok", "services": {"openrouter": "configured|not_configured"}}`
- **Implementation:** `server/main.py` health endpoint

**Logs:**
- **Server Console:** Application startup/shutdown logging
- **Initialization Logs:** Database, Instructor client status
- **Request Logs:** Not explicitly configured (FastAPI default)

## CI/CD & Deployment

**Hosting:** Not configured
- No Dockerfile detected
- No docker-compose configuration
- No GitHub Actions or CI/CD pipelines
- No cloud deployment configuration

**Build Process:**
- **Client:** `npm run build` (TypeScript compilation + Vite build)
- **Output:** `client/dist/` directory
- **Server:** No build step (interpreted Python)

**Development Workflow:**
- **Client Dev:** `npm run dev` (Vite dev server on port 5173)
- **Server Dev:** `python -m uvicorn server.main:app --reload --port 8000`

## Environment Configuration

**Required Environment Variables:**

**Server (`server/.env`):**
```bash
# Optional - defaults shown
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# OPENROUTER_TIMEOUT_SECONDS=60
```

**Client (`client/.env` - optional):**
```bash
VITE_API_URL=http://localhost:8000
```

**Secrets Location:**
- Service account JSON keys stored in filesystem (referenced by path)
- `.env` files are in `.gitignore` (not committed)
- `.env.example` provides template without actual values

## Webhooks & Callbacks

**Incoming:** None
- No webhook endpoints configured
- No external service callbacks

**Outgoing:** None
- No external webhook notifications
- No third-party integrations requiring callbacks

## CORS Configuration

**Allowed Origins:**
- `http://localhost:5173` (Vite dev server)
- `http://127.0.0.1:5173` (Alternative localhost)

**Configuration:** `server/main.py` - FastAPI CORSMiddleware
- `allow_credentials=True`
- `allow_methods=["*"]`
- `allow_headers=["*"]`

## Network Architecture

**Frontend → Backend:**
- Protocol: HTTP/REST
- Base URL: `http://localhost:8000` (development)
- Content-Type: `application/json`
- Timeout: 30s (standard), 300s (generation operations)

**Backend → OpenRouter:**
- Protocol: gRPC (via Google Cloud SDK)
- Authentication: Service account OAuth2
- Region: Configurable (default: us-central1)

---

*Integration audit: 2026-02-16*
