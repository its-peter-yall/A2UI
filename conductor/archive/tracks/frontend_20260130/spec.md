# Spec: Frontend UI Port & Cleanup

## Overview
Reconstruct the `AURA-CHAT` user interface within `A2UI`, preserving the visual fidelity and session management UX while stripping out all RAG/Graph components.

## Objectives
- Implement a typed API client to communicate with the `A2UI` backend.
- Port `MessageBubble` and `SessionSidebar` components, removing citation/module references.
- Implement the `ChatPage` as the main application view.
- Ensure the UI is fully functional (send messages, switch sessions, "thinking" visualization).

## Technical Requirements
- **Client:** React 19, Tailwind CSS.
- **State:** TanStack Query (Server state), React Context/Zustand (UI state).
- **Assets:** Lucide React icons.
- **Design:** strict adherence to AURA-CHAT colors (#FFD400) and layout.

## Success Criteria
- [ ] Sidebar lists sessions fetched from backend.
- [ ] Clicking a session loads chat history.
- [ ] Sending a message updates the UI immediately (optimistic or loading state) and then shows the response.
- [ ] Markdown rendering works for AI responses.
- [ ] No console errors related to missing RAG props/types.
