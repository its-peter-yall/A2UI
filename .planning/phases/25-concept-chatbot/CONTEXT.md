# Phase 25: Concept Chatbot — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Source:** Exploratory ideation session + spec at `plans/concept-chatbot-spec.md`

<domain>
## Phase Boundary

Add a context-aware chatbot assistant that helps users with questions about learning concept explanations. The chatbot:
- Lives inside each concept card while the user is reading the explanation (`VIEWING_EXPLANATION` state)
- Allows users to select specific headings as context focus
- Maintains conversation history within the current node session (ephemeral)
- Uses the user's preferred LLM from a separate model picker in settings

</domain>

<decisions>
## Implementation Decisions

### Entry Points
- **Floating Action Button (FAB)**: Yellow chat icon, bottom-right corner, always visible during `VIEWING_EXPLANATION` state. Opens chat panel with no heading pre-selected.
- **Inline Heading Icons**: Every heading (`##`, `###`, `####`, etc.) gets a small yellow chat icon on hover. Clicking toggles selection and opens chat panel.

### Heading Selection
- Multi-select: User can select multiple headings simultaneously
- Visual feedback: Selected headings get yellow left-border + subtle background highlight
- Clear all: "Clear selections" button in chat panel header
- Live updates: User can select/deselect headings while chat panel is open; next message uses updated context
- Heading detection: Parse markdown structure to identify headings at render time

### Chat Panel
- Right-side drawer that slides in from the right, overlays learning content
- Width: ~400px (responsive)
- Contains: Header with selected heading chips + clear button + close button, scrollable message area, text input with send button
- Closes on outside click or Escape key
- Ephemeral: History discarded on node navigation or panel close

### System Prompt Construction
- Full `content_markdown` is always sent to LLM
- Selected heading names are included as pointers (e.g., "The student is specifically asking about: Exploring URL Parameters, Type Hints")
- When no headings selected: general concept context only

### Conversation Context
- History maintained per-node while panel is open
- Heading context changes mid-conversation are allowed
- History capped at last 10 messages (server-side truncation)
- System prompt always included regardless of cap

### Model Selection
- Separate model picker in Settings page labeled "Chat Assistant Model"
- Reuses existing `ModelPicker` component (fetches from both providers)
- Stores to `chatModel`/`chatModelTitle` in `ProviderConfig`
- Provider inferred from model slug prefix
- Independent from generation model

### Backend Design
- New endpoint: `POST /learning/sessions/{session_id}/nodes/{node_id}/chat`
- Uses `openai.AsyncOpenAI` directly (not `instructor`) for free-form streaming text
- SSE streaming via `StreamingResponse` from FastAPI
- Resolves provider from model slug prefix (not tied to active provider)
- New `X-Chat-Model` header, falls back to main model if not set
- No persistence — chat history is ephemeral, managed client-side

### Response Format
- SSE streaming with `data: {"type": "text_delta", "content": "..."}` format
- Non-streaming fallback for error cases
- Markdown in responses rendered via existing `MarkdownRenderer` component

### Edge Cases
- Node not in VIEWING_EXPLANATION: Return 400
- Empty heading selection: Use general concept context
- Very long content: Truncate from middle if exceeds context window
- Streaming failure: Show partial response + error toast
- Rapid heading toggling: No debounce needed — state read only on Send

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & Stack
- `.planning/codebase/ARCHITECTURE.md` — Product vision and architecture
- `.planning/codebase/STACK.md` — Technology specifications
- `.planning/codebase/CONVENTIONS.md` — Coding conventions for all languages
- `.planning/codebase/STRUCTURE.md` — Directory layout

### Learning Feature (Primary Integration Point)
- `server/routers/learning.py` — All REST endpoints for learning
- `server/schemas/learning.py` — Pydantic v2 models for learning domain
- `server/database/learning_persistence.py` — SQLite persistence layer
- `server/agents/base.py` — Base agent class for LLM calls
- `server/utils/instructor_client.py` — Instructor library integration
- `client/src/features/learning/ConceptCard.tsx` — State-driven card rendering
- `client/src/features/learning/MarkdownRenderer.tsx` — Markdown rendering with Tailwind Typography
- `client/src/features/learning/LearningPathContainer.tsx` — Smart container with carousel

### Settings (Model Picker Integration)
- `client/src/features/settings/SettingsPage.tsx` — Settings page
- `client/src/features/settings/ModelPicker.tsx` — Searchable unified model picker
- `client/src/lib/providerSettings.ts` — localStorage-based provider config
- `client/src/lib/providerApi.ts` — Model catalog fetching

### LLM Infrastructure
- `server/schemas/llm.py` — LLMContext and provider schemas
- `server/config.py` — Environment configuration
- `client/src/lib/learningApi.ts` — Axios client with provider headers

### Product Guidelines
- `conductor/product-guidelines.md` — Visual identity (Cyber Yellow #FFD400), UX principles

</canonical_refs>

<specifics>
## Specific Ideas

- The chatbot should feel like a "study buddy" — helpful, not intrusive
- Heading selection should be discoverable (icons appear on hover, not always visible)
- The FAB should use the same yellow chat icon style as existing UI elements
- Chat panel should have smooth slide-in animation (framer-motion, matching existing patterns)
- Model picker in settings should clearly label "Chat Assistant Model" vs "Course Generation Model"

</specifics>

<deferred>
## Deferred Ideas

- **Streaming model override in chat panel header**: Future enhancement — for v1, model is only configurable in settings
- **Rate limiting**: Same concern applies to course generation — separate concern
- **Persistence**: Chat history is ephemeral by design — could add SQLite persistence in future
- **Multi-modal responses**: Images, diagrams — future enhancement

</deferred>

---

*Phase: 25-concept-chatbot*
*Context gathered: 2026-05-28 via exploratory ideation session*
