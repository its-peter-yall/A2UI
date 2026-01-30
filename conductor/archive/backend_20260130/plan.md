# Plan: Backend Session Management & Chat API

## Phase 1: Data Models & Schema (Atomic)
- [x] Task: Create `server/schemas` directory
- [x] Task: Create `server/schemas/common.py` (Timestamp mixins, base models)
- [x] Task: Create `server/schemas/session.py` (SessionCreate, SessionResponse, Message models)
- [x] Task: Create `server/schemas/chat.py` (ChatRequest, ChatResponse)
- [ ] Task: Conductor - User Manual Verification 'Data Models' (Protocol in workflow.md)

## Phase 2: Persistence Layer (Atomic)
- [x] Task: Create `server/database` directory and `server/data` (for storage)
- [x] Task: Create `server/database/persistence.py` defining the `SessionManager` class
- [x] Task: Implement `SessionManager.init_db()` to set up SQLite tables (`sessions`, `messages`)
- [x] Task: Implement `SessionManager.create_session(title)`
- [x] Task: Implement `SessionManager.list_sessions(limit, offset)`
- [x] Task: Implement `SessionManager.add_message(session_id, role, content)`
- [x] Task: Implement `SessionManager.get_history(session_id)`
- [ ] Task: Conductor - User Manual Verification 'Persistence Layer' (Protocol in workflow.md)

## Phase 3: Session Endpoints (Atomic)
- [x] Task: Create `server/routers/sessions.py`
- [x] Task: Implement `POST /sessions` endpoint using `SessionManager`
- [x] Task: Implement `GET /sessions` endpoint
- [x] Task: Implement `GET /sessions/{session_id}` endpoint
- [x] Task: Implement `DELETE /sessions/{session_id}` endpoint
- [x] Task: Register `sessions` router in `main.py`
- [ ] Task: Conductor - User Manual Verification 'Session Endpoints' (Protocol in workflow.md)

## Phase 4: Chat Integration (Atomic)
- [x] Task: Create `server/routers/chat.py`
- [x] Task: Implement helper `build_context(history)` to format messages for Vertex AI
- [x] Task: Implement `POST /chat` endpoint
    - 1. Validate session exists
    - 2. Save user message to DB
    - 3. Fetch recent history
    - 4. Call Vertex AI (via `utils/vertex_client.py`)
    - 5. Save assistant response to DB
    - 6. Return response
- [x] Task: Register `chat` router in `main.py`
- [ ] Task: Conductor - User Manual Verification 'Chat Integration' (Protocol in workflow.md)
