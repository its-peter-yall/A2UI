# Plan: Frontend UI Port & Cleanup

## Phase 1: API Client Infrastructure (Atomic)
- [x] Task: Create `client/src/types` directory and `api.ts` (interfaces for Session, Message, User). [bc5986d]
- [x] Task: Create `client/src/lib/api.ts` with Axios instance and typed fetch functions (`getSessions`, `createSession`, `sendMessage`). [bc5986d]
- [x] Task: Configure TanStack Query `QueryClient` in `client/src/main.tsx` or separate provider. [bc5986d]
- [x] Task: Conductor - User Manual Verification 'API Client Infrastructure' (Protocol in workflow.md) [checkpoint: 1a765de]

## Phase 2: Component Porting (Atomic)
- [x] Task: Create `client/src/components` directory. [eafaf73]
- [x] Task: Port `MessageBubble.tsx` (simplified: remove citations, keep markdown/syntax highlighting). [b726d33]
- [x] Task: Port `SessionSidebar.tsx` (simplified: remove 'New from Module' logic, keep basic CRUD). [b1cc350]
- [x] Task: Create simple `SessionNameModal.tsx` for renaming/creating. [b1cc350]
- [x] Task: Conductor - User Manual Verification 'Component Porting' (Protocol in workflow.md) [checkpoint: 2469f8b]

## Phase 3: Main Chat View (Atomic)
- [x] Task: Create `client/src/features/chat` directory. [a05c786]
- [x] Task: Implement `useChat` hook (encapsulating Query/Mutation logic). [Current]
- [x] Task: Implement `ChatPage.tsx` layout (Sidebar + MessageList + Input). [Current]
- [x] Task: Wire up `InputArea` to `useChat` mutation. [Current]
- [x] Task: Implement "Thinking" state visualization (fake or real based on backend data). [Existing MessageBubble logic]
- [ ] Task: Conductor - User Manual Verification 'Main Chat View' (Protocol in workflow.md)

## Phase 4: Polish & Integration (Atomic)
- [ ] Task: Set up `client/src/App.tsx` routing (Route to ChatPage).
- [ ] Task: Apply final CSS polish to match AURA-CHAT (scrollbars, glassmorphism).
- [ ] Task: Verify responsive mobile layout (Sidebar toggle).
- [ ] Task: Conductor - User Manual Verification 'Polish & Integration' (Protocol in workflow.md)
