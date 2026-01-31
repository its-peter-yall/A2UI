# Spec: Backend Session Management & Chat API

## Overview
Implement the core business logic for `AgUI`: session persistence, message history management, and the direct integration with Google Vertex AI for chat responses.

## Objectives
- Create a lightweight persistence layer (using local JSON or SQLite) to store Sessions and Messages.
- Define strict Pydantic models for the API contract.
- Implement REST endpoints for Session CRUD (`/sessions`).
- Implement the `/chat` endpoint that orchestrates the "History + Prompt -> Vertex AI -> Response -> Save" flow.

## Technical Requirements
- **Persistence:** Local JSON file (`sessions.json`) or SQLite (`agui.db`). *Decision: JSON for pure simplicity if < 1000 sessions, otherwise SQLite.* -> **Use SQLite** via `sqlite3` standard lib for robustness.
- **Models:**
    - `Session`: id, title, created_at, updated_at.
    - `Message`: id, role (user/model), content, timestamp, thinking_content (optional).
- **API:**
    - `GET /sessions`: List all sessions (sorted by recent).
    - `POST /sessions`: Create new session.
    - `GET /sessions/{id}/messages`: Get full history.
    - `POST /chat`: Send message, get response.

## Success Criteria
- [ ] Swagger UI (`/docs`) shows all endpoints.
- [ ] Can create a session and see it persist after server restart.
- [ ] `/chat` endpoint returns a valid response from Vertex AI.
- [ ] Chat history includes the model's response saved automatically.
