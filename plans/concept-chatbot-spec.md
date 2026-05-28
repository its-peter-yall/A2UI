# Concept Chatbot — Feature Specification

**Date:** 2026-05-28
**Status:** Draft
**Scope:** Inline Q&A helper for learning concept explanations

---

## Problem Statement

After a course is generated, the user reads static markdown explanations for each concept. If they have a doubt ("What does X mean?", "Explain Y differently?", "How does Z relate to W?"), their only option is to re-read the same text or guess on the quiz. There is no way to ask clarifying questions.

## Solution

A context-aware chatbot that:
1. Lives inside each concept card while the user is reading the explanation (`VIEWING_EXPLANATION` state)
2. Allows the user to select specific headings as context focus
3. Maintains conversation history within the current node session
4. Uses the user's preferred LLM from settings

---

## User Experience

### Entry Points

**1. Floating Action Button (FAB)**
- Yellow chat icon, bottom-right corner of the learning page
- Always visible when a concept card is in `VIEWING_EXPLANATION` state
- Opens the chat panel with **no heading pre-selected** (general concept context)

**2. Inline Heading Icons**
- Every heading (`##`, `###`, `####`, etc.) in the rendered markdown gets a small yellow chat icon
- Icons appear **on hover** of the heading row
- Clicking an icon:
  - **Toggles** that heading as selected (highlighted with yellow border/background)
  - Opens the chat panel (if not already open)
  - Adds the heading to the system prompt context

### Heading Selection

- **Multi-select**: User can select multiple headings simultaneously
- **Visual feedback**: Selected headings get a yellow left-border + subtle background highlight
- **Clear all**: "Clear selections" button in the chat panel header to deselect all
- **Live updates**: User can select/deselect headings while the chat panel is open. The next message sent will use the updated heading context
- **Heading detection**: Parse markdown structure to identify headings at render time

### Chat Panel (Right Drawer)

- Slides in from the right, overlays the learning content
- Width: ~400px (responsive)
- Contains:
  - **Header**: "Ask about this concept" + selected heading chips + clear button + close button
  - **Messages area**: Scrollable conversation history
  - **Input area**: Text input + send button at the bottom
- Closes when clicking outside or pressing Escape
- **Ephemeral**: History is discarded when the user navigates to a different node or closes the panel

### Conversation Context

The conversation history is maintained per-node while the panel is open. When the user sends a message:

1. The system prompt includes the **full concept content** + **selected heading names**
2. The conversation history (all previous Q&A in this session) is sent as messages
3. The LLM responds with the answer
4. History is appended

**Heading context changes mid-conversation are allowed.** The system prompt for each request reflects the currently selected headings at the time of sending.

---

## System Prompt Structure

```
You are a helpful teaching assistant. The student is reading a learning 
concept and has questions about it.

CONCEPT CONTENT:
{content_markdown}

The student is specifically asking about the following sections:
- {heading_1}
- {heading_2}

Focus your answer on these sections, but use the full concept content 
for context. If the student's question is about something not covered 
in the selected sections, answer based on the full concept content.

Keep answers concise, clear, and educational. Use examples when helpful.
If you don't know the answer based on the provided content, say so.
```

When no headings are selected:
```
You are a helpful teaching assistant. The student is reading a learning 
concept and has questions about it.

CONCEPT CONTENT:
{content_markdown}

Answer the student's question based on this content. Keep answers 
concise, clear, and educational. Use examples when helpful. If you 
don't know the answer based on the provided content, say so.
```

---

## API Contract

### Endpoint

```
POST /learning/sessions/{session_id}/nodes/{node_id}/chat
```

### Request Body

```json
{
  "message": "Can you explain URL parameters with an example?",
  "history": [
    { "role": "user", "content": "What are URL parameters?" },
    { "role": "assistant", "content": "URL parameters are..." }
  ],
  "selected_headings": ["Exploring URL Parameters", "Type Hints"]
}
```

**History cap**: The client sends full history; the server truncates to the last 10 messages before constructing the LLM prompt.

### Response (Streaming SSE)

```
data: {"type": "text_delta", "content": "URL "}
data: {"type": "text_delta", "content": "parameters "}
data: {"type": "text_delta", "content": "are key-value pairs..."}
data: {"type": "done"}
```

### Response (Non-streaming fallback)

```json
{
  "reply": "URL parameters are key-value pairs that appear after the ? in a URL..."
}
```

### Error Responses

- `404`: Session or node not found
- `400`: Node not in `VIEWING_EXPLANATION` state
- `422`: Invalid request body
- `500`: LLM call failed

---

## Technical Architecture

### Backend

**New files:**

| File | Purpose |
|------|---------|
| `server/routers/chat.py` | Chat endpoint router |
| `server/schemas/chat.py` | Chat request/response Pydantic models |
| `server/services/chat_service.py` | Chat logic (prompt construction, LLM call, streaming, provider resolution from model slug) |
| `server/tests/test_chat_router.py` | Router tests |
| `server/tests/test_chat_service.py` | Service tests |

**Modified files:**

| File | Change |
|------|--------|
| `server/main.py` | Register chat router |
| `server/routers/__init__.py` | Export chat router |
| `server/schemas/llm.py` | Add `chat_model` field to `LLMContext` |

**Key design decisions:**

1. **Non-structured output**: Unlike existing agents that use `instructor` for Pydantic-validated structured output, the chat endpoint needs **free-form text responses**. Use `openai.AsyncOpenAI` directly (without `instructor` wrapper) for streaming text.

2. **Streaming**: Use SSE (`StreamingResponse` from FastAPI) for real-time token delivery. The `instructor` library doesn't support streaming well for unstructured output.

3. **Model selection**: Use `LLMContext` dependency with an added `chat_model` field (read from `X-Chat-Model` header). Falls back to the main model if not specified.

4. **Provider resolution**: The chat service resolves the provider from the model slug prefix:
   - Models starting with known prefixes (e.g., `openai/`, `anthropic/`, `google/`) → OpenRouter
   - Models with `generalcompute/` prefix → GeneralCompute
   - Uses the provider's base URL and the user's API key from `LLMContext`

5. **No persistence**: Chat history is not stored in SQLite. It's ephemeral, managed client-side, and sent with each request.

6. **History cap**: Server truncates history to last 10 messages before constructing the LLM prompt.

### Frontend

**New files:**

| File | Purpose |
|------|---------|
| `client/src/features/learning/ChatPanel.tsx` | Right drawer chat component |
| `client/src/features/learning/ChatMessage.tsx` | Individual message bubble |
| `client/src/features/learning/HeadingIcon.tsx` | Inline chat icon for headings |
| `client/src/features/learning/useChatState.ts` | Chat panel state hook |
| `client/src/features/learning/useChatStream.ts` | SSE streaming hook |
| `client/src/features/learning/headingParser.ts` | Extract headings from markdown |
| `client/src/lib/chatApi.ts` | Chat API client (SSE streaming, sends X-Chat-Model header) |
| `client/src/types/chat.ts` | Chat types (ChatMessage, ChatRequest, ChatDelta) |

**Modified files:**

| File | Change |
|------|--------|
| `client/src/features/learning/MarkdownRenderer.tsx` | Add custom heading component with icons |
| `client/src/features/learning/ConceptCard.tsx` | Integrate ChatPanel, heading selection state |
| `client/src/features/learning/LearningPathContainer.tsx` | Add FAB, manage chat open state |
| `client/src/features/learning/index.ts` | Export new components |
| `client/src/features/settings/SettingsPage.tsx` | Add second `ModelPicker` instance for chatbot model |
| `client/src/lib/providerSettings.ts` | Add `chatModel`/`chatModelTitle` to `ProviderConfig`, add `setChatModel()` helper |

---

## Component Details

### `headingParser.ts`

Extract headings from markdown content:

```typescript
interface ParsedHeading {
  id: string;           // slugified text
  text: string;         // raw text
  level: number;        # 2, 3, 4, etc.
  startIndex: number;   # position in markdown
}

function parseHeadings(markdown: string): ParsedHeading[]
```

Uses regex: `/^(#{2,6})\s+(.+)$/gm` to match `##` through `######`.

### `MarkdownRenderer.tsx` (modified)

Add custom `h2`-`h6` component overrides:

```tsx
components={{
  h2: ({ children, ...props }) => (
    <HeadingIcon level={2} onToggle={onHeadingToggle} selected={selectedHeadings.has(text)}>
      <h2 {...props}>{children}</h2>
    </HeadingIcon>
  ),
  // ... h3, h4, h5, h6
}}
```

The `onHeadingToggle` and `selectedHeadings` are passed as props from `ConceptCard`.

### `ChatPanel.tsx`

- Uses `framer-motion` for slide-in animation (matches existing animation patterns)
- Message list with auto-scroll to bottom
- Input with Enter to send, Shift+Enter for newline
- Loading state with thinking indicator
- Error handling with toast notifications

### `useChatStream.ts`

```typescript
function useChatStream() {
  const streamMessage = async (
    message: string,
    history: ChatMessage[],
    selectedHeadings: string[],
    sessionId: string,
    nodeId: string
  ): Promise<void> => {
    // POST to /learning/sessions/{sessionId}/nodes/{nodeId}/chat
    // Read SSE stream via fetch + ReadableStream
    // Append text deltas to messages state in real-time
  };
  
  return { streamMessage, isStreaming };
}
```

### `chatApi.ts`

```typescript
// Reads chatModel from providerSettings
// Attaches X-Chat-Model header (falls back to main model if not set)
// Uses fetch() for SSE streaming (not axios — axios doesn't support streaming well)
// Returns ReadableStream for consumption by useChatStream
```

---

## Heading Highlighting

When a heading is selected:
- **Yellow left border** (3px solid `#FFD400`)
- **Subtle background** (`bg-primary/5` or similar)
- **Transition**: Smooth 200ms transition on toggle
- **Deselection**: Clicking the icon again removes the highlight

---

## Model Selection

### Settings Page

A **separate model picker** is added to the Settings page for the chatbot:
- Label: "Chat Assistant Model"
- **Reuses** the existing `ModelPicker` component (already fetches from both providers and combines them)
- Different `onSelect` handler that stores to `chatModel`/`chatModelTitle` instead of `model`/`modelTitle`
- Stored in localStorage within `ProviderConfig`:
  ```typescript
  interface ProviderConfig {
    apiKey: string;
    model: string;           // generation model
    modelTitle: string;
    chatModel?: string;      // chatbot model slug
    chatModelTitle?: string; // chatbot model display name
    maxCompletionTokens?: number;
    thinking?: ThinkingConfig;
  }
  ```
- The chatbot model is **provider-agnostic** at storage time — the provider is inferred from the model slug prefix (e.g., `openai/` → OpenRouter, `generalcompute/` → GeneralCompute)
- Independent from the generation model — user may want a cheaper/faster model for chat

### Transport

The chat endpoint receives the chatbot model via a dedicated header:
- `X-Chat-Model`: The selected chatbot model slug (e.g., `openai/gpt-4o-mini`)
- Other provider headers (`X-AI-Provider`, `X-OpenRouter-Key`, etc.) are reused from existing settings
- The chat service resolves the provider from the model slug prefix and uses the appropriate base URL
- If `X-Chat-Model` is not provided, falls back to the main generation model from `X-OpenRouter-Model`

### History Cap

Conversation history sent to the LLM is **capped at the last 10 messages** (5 user + 5 assistant turns). Earlier messages are dropped. The system prompt is always included regardless of cap.

---

## Edge Cases

1. **Node not in VIEWING_EXPLANATION**: Return 400. Chat is only available while reading the explanation.

2. **Empty heading selection**: Use general concept context (no heading emphasis in system prompt).

3. **Very long content**: The system prompt includes the full `content_markdown`. If it exceeds the model's context window, truncate from the middle (keep beginning and end). The LLM context's `max_completion_tokens` is respected.

4. **Long conversation history**: Server truncates to last 10 messages before constructing the LLM prompt. Earlier messages are silently dropped.

4. **Streaming failure**: If the stream drops mid-response, show the partial response + error toast. User can retry.

5. **Rapid heading toggling**: Debounce is not needed — heading state is read only when "Send" is clicked, not on every toggle.

6. **Navigation away**: Chat history is discarded. No confirmation dialog (ephemeral by design).

---

## Testing Strategy

### Backend (unittest)

| Test | File |
|------|------|
| Chat endpoint returns 404 for invalid session | `test_chat_router.py` |
| Chat endpoint returns 400 for non-reading node | `test_chat_router.py` |
| Chat endpoint returns 200 with valid request | `test_chat_router.py` |
| System prompt includes selected headings | `test_chat_service.py` |
| System prompt omits heading section when none selected | `test_chat_service.py` |
| Streaming response format is valid SSE | `test_chat_router.py` |
| LLMContext is correctly extracted from headers | `test_chat_router.py` |
| X-Chat-Model header overrides default model | `test_chat_router.py` |
| History is truncated to last 10 messages | `test_chat_service.py` |

### Frontend (Vitest)

| Test | File |
|------|------|
| parseHeadings extracts all h2-h6 from markdown | `headingParser.test.ts` |
| HeadingIcon toggles selection state | `HeadingIcon.test.tsx` |
| ChatPanel renders messages in order | `ChatPanel.test.tsx` |
| ChatPanel sends message with correct payload | `ChatPanel.test.tsx` |
| Selected headings are highlighted in markdown | `MarkdownRenderer.test.tsx` |
| FAB opens chat panel | `LearningPathContainer.test.tsx` |
| Chat history is cleared on node navigation | `useChatState.test.ts` |
| Chatbot model picker loads all provider models | `ModelPicker.test.tsx` |
| Chatbot model selection persists to localStorage | `providerSettings.test.ts` |
| Chat API sends X-Chat-Model header | `chatApi.test.ts` |

---

## Implementation Order

1. **Backend**: Chat schema + service + router (with tests)
2. **Frontend types**: `chat.ts` types + `chatApi.ts` client
3. **Settings**: Chatbot model picker in settings page + localStorage helpers
4. **Heading parser**: `headingParser.ts` utility + tests
5. **Markdown renderer**: Add heading component overrides with icons
6. **Chat panel**: `ChatPanel.tsx` + `ChatMessage.tsx` + `useChatState.ts`
7. **Streaming**: `useChatStream.ts` hook
8. **Integration**: Wire up in `ConceptCard.tsx` + `LearningPathContainer.tsx` (FAB)
9. **Tests**: Component tests for all new frontend components
10. **Polish**: Animations, error states, loading indicators

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Rate limiting** | None (for now) | Same concern applies to course generation — separate concern |
| **Token budget** | Cap history to last 10 messages | Prevents context window overflow |
| **Markdown in responses** | Yes | Use same `MarkdownRenderer` component with code highlighting |
| **Streaming** | SSE streaming from day one | Real-time token delivery for better UX |
| **Chatbot model** | Separate model picker in settings | User may want a different (cheaper/faster) model for chat vs generation |
