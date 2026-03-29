# Initial Concept

A standalone 'Pure Chat' application (`A2UI`) that replicates the UI layout, session management, and Vertex AI integration of `AURA-CHAT` but explicitly excludes all RAG (Retrieval-Augmented Generation) and Knowledge Graph functionality. It features a React frontend with a session sidebar and chat interface, backed by a FastAPI server for session persistence and direct Vertex AI model interaction.

# Product Guide

## 1. Vision & Purpose
`A2UI` serves as a lightweight, "Pure Chat" counterpart to the AURA ecosystem. It isolates the high-quality UI and direct LLM interaction capabilities of AURA-CHAT into a standalone tool. It allows researchers and students to leverage the power of Google's Gemini models via Vertex AI in a persistent, session-based environment, free from the complexity of document processing and knowledge graphs.

## 2. Target Audience
- **Primary:** Researchers and Students who need a reliable, distraction-free interface for direct AI interaction.
- **Secondary:** Developers needing a reference implementation for Vertex AI integration using React and FastAPI.

## 3. Core Capabilities
### 3.1 Chat Experience
- **Replicated Layout:** Faithful recreation of the AURA-CHAT `ChatLayout`, including `MessageDisplay` bubbles and `InputArea`.
- **Rich Interaction:** Support for Markdown rendering, code syntax highlighting, and responsive design.
- **Thinking Mode:** Visualization of the model's "thinking" process (for supported models), providing transparency into reasoning.

### 3.2 Session Management
- **Persistent Workspace:** `SessionPanel` for creating, listing, and deleting study sessions.
- **Context Retention:** Seamless switching between sessions with full history restoration.
- **Backend Persistence:** Robust storage of session metadata and message logs.

## 4. Technical Architecture
### 4.1 Frontend (React)
- **State Management:**
    - **Server State:** TanStack Query for efficient fetching and caching of session lists and message history.
    - **UI State:** React Context or Zustand for managing local chat state (input, loading phases).
- **Styling:** Tailwind CSS to strictly match the AURA-CHAT aesthetic.
- **Components:** Modular reconstruction of core UI elements (`ChatPage`, `SessionSidebar`, `MessageBubble`) adapted for a non-RAG context.

### 4.2 Backend (FastAPI)
- **API Design:** RESTful endpoints for Session CRUD (`/sessions`, `/sessions/{id}`) and Chat (`/chat`).
- **Data Model:** Pydantic models defining the structure of `Session`, `Message`, and `ChatRequest`.
- **AI Integration:**
    - Direct usage of the `vertexai` Python SDK.
    - Configuration via `google.cloud.aiplatform.init()` (referencing `AURA-CHAT/backend/utils/vertex_ai_client.py` patterns).

## 5. Constraints & Exclusions
- **No RAG:** All retrieval logic, document uploaders, and citation panels are explicitly excluded.
- **No Graph DB:** Neo4j and Knowledge Graph visualization components are omitted.
- **Direct Model Access:** The system connects directly to Vertex AI without intermediate vector search steps.