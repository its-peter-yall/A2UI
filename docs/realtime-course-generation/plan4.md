# Plan P4: Client Streaming State, Automatic Overlays, and Topic Hydration

**Goal:** Deliver the zero-click, real-time course generation client presentation specified in `docs/realtime-course-generation/goal.md` (acceptance criteria A1, A4, A5, A6, A7, A8, A10, A12, A13, A14). Users see live research source counters, streaming research synthesis, provisional curriculum planning in the Table of Contents, and progressive topic explanation hydration inside active topic cards without render storms, text duplication, modal thrashing, or learning state contamination.

**Architecture:** A dual-stream client model. The existing `EventSource` connection in `useSessionEvents` receives both durable milestone events (`id > 0`, which update the TanStack Query cache) and ephemeral live draft events (`id === 0`, which carry target-scoped display deltas and snapshots). Live draft events bypass TanStack Query and are processed by a dedicated `useGenerationDrafts` hook with sequence deduplication, snapshot replacement, and animation-frame rendering throttles. An overlay finite state machine (`useGenerationOverlays`) orchestrates zero-click opening and closing of Sources and Table of Contents modals, enforcing single-overlay limits and per-attempt manual dismissal overrides. Streaming explanations hydrate active topic cards safely via `DraftMarkdownPreview` (suppressing eager Mermaid rendering and sanitizing raw HTML), while queued topics remain skeletons and completed topics reconcile to server-authoritative saved content.

**Tech Stack:** React 19, TypeScript (strict mode, no `any`/`as`/non-null assertions in production code), `@tanstack/react-query` v5, `lucide-react`, `framer-motion` (mocked in tests), Tailwind CSS 4.x with Cyber Yellow (`#ffb74d`) accents, Vitest 3.x, `@testing-library/react` 16.x, `@testing-library/dom` 10.x, `jsdom`, `FakeEventSource`.

## Authority, Ownership, and Constraints

- Authoritative specs: `docs/realtime-course-generation/goal.md`, `research.md`, and `state.md`.
- Project rules: `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md`, `docs/TESTING.md`, `conductor/product-guidelines.md`.
- File ownership:
  - Owned existing files: `client/src/types/generation.ts`, `client/src/features/learning/generationEvents.ts`, `client/src/features/learning/useSessionEvents.ts`, `client/src/features/learning/LearningPage.tsx`, `client/src/features/learning/LearningPathContainer.tsx`, `client/src/features/learning/GenerationStatusPanel.tsx`, `client/src/features/learning/CourseSourcesPanel.tsx`, `client/src/features/learning/TableOfContentsModal.tsx`, `client/src/features/learning/SkeletonCard.tsx`, `client/vitest.generation.config.ts`.
  - Owned new files: `client/src/features/learning/useGenerationDrafts.ts`, `client/src/features/learning/useGenerationOverlays.ts`, `client/src/features/learning/DraftMarkdownPreview.tsx`, and their colocated `*.test.ts(x)` suites.
  - Strictly forbidden: Any modification to server files or database logic.
- Conventions:
  - Named exports only (never default exports).
  - Single quotes, explicit semicolons, 2-space indentation in TSX/CSS.
  - Strict type safety: no `any`, no `as`, no non-null assertions (`!`) in production code.
  - Exact 76-character `=` separator header block on all new TypeScript files.
  - Colocated tests in the same directory as implementation.
- Working directory: All client test and build commands run in `client/` or root with forward slashes.

---

## Wire Contract Consumed from P1

P1 frozen wire definitions in `server/schemas/progress.py` and `server/services/session_event_stream.py`:

### SSE Framing and Event Distinction
1. **Durable Milestones (9 types):**
   - Framing: `id: <positive_integer>`, `event: <event_type>`, `data: {"id": N, "session_id": "...", "event_type": "...", "payload": {...}, "generation": {...}, "created_at": "..."}`
   - Action: `applyGenerationEvent` updates TanStack Query cache. Invalidates `learningSession` and `courseResearch` queries.
2. **Live Draft Events (6 types):**
   - Types: `research_sources_updated`, `research_text_delta`, `outline_text_delta`, `topic_content_delta`, `topic_explanation_ready`, `target_draft_reset`.
   - Framing: **NO `id:` line** in SSE framing; JSON body has `id: 0`.
   - Wire JSON Envelope (`LiveDraftEvent`):
     ```json
     {
       "id": 0,
       "session_id": "string",
       "job_id": "string",
       "stage": "RESEARCHING | OUTLINING | GENERATING_PREVIEW | GENERATING_BATCH | ...",
       "target": "[\"topic\",\"n1\",0]",
       "attempt": 1,
       "sequence": 1,
       "event_type": "topic_content_delta",
       "payload": { ... },
       "snapshot": { ... } | null
     }
     ```
   - Action: Live events **never** update TanStack Query cache and **never** advance `Last-Event-ID`. Routed exclusively to `useGenerationDrafts`.

### Live Payloads and Snapshot Structure
- `target`: Canonical JSON string: `[target_type, target_id, sequence_index]`.
  - Research text: `["research", report_id, sequence_index]`
  - Research sources: `["research", session_id, null]`
  - Outline: `["outline", session_id, null]`
  - Topic: `["topic", node_id, sequence_index]`
- `target_draft_reset`: `{ target_type, target_id, sequence_index, attempt, reason }`. Clears target draft accumulator on higher attempt.
- `snapshot` (`DraftSnapshot`):
  ```json
  {
    "text": "accumulated text string",
    "text_offset": 0,
    "truncated": false,
    "course_title": "string",
    "topics": { "0": "Topic Title" },
    "explanation_ready": false,
    "unique_source_count": 5,
    "new_sources_count": 2,
    "provider_id": "tavily"
  }
  ```
  When `snapshot != null`, it **replaces** the target draft at that `sequence`. Deltas with sequence at or below the snapshot sequence are suppressed.

---

## State and Architecture Specifications

### 1. `useGenerationDrafts` State Shape

```typescript
export interface TargetDraft {
  readonly target: string;
  readonly targetType: 'research' | 'outline' | 'topic';
  readonly targetId: string;
  readonly sequenceIndex: number | null;
  readonly attempt: number;
  readonly sequence: number;
  readonly text: string;
  readonly textOffset: number;
  readonly truncated: boolean;
  readonly explanationReady: boolean;
  readonly courseTitle: string;
  readonly topics: Readonly<Record<number, string>>;
  readonly uniqueSourceCount: number | null;
  readonly newSourcesCount: number | null;
  readonly providerId: string | null;
}

export interface GenerationDraftsState {
  readonly draftsByTarget: Readonly<Record<string, TargetDraft>>;
  readonly activeJobId: string | null;
}
```

- **Duplicate / Stale Rejection:** An incoming event with `event.attempt < current.attempt` is discarded. An incoming delta with `event.attempt === current.attempt && event.sequence <= current.sequence` is discarded.
- **Snapshot Replacement:** When `event.snapshot` is present and `event.sequence >= current.sequence`, the snapshot replaces the target draft completely at `event.sequence`.
- **Render Coalescing:** Draft updates are collected in a pending batch and committed via `requestAnimationFrame` (falling back to microtask in headless test environments) to avoid React render storms (max 60fps).

### 2. `useGenerationOverlays` Finite State Machine

```typescript
export type OverlayType = 'none' | 'sources' | 'toc';
export type OverlayOrigin = 'none' | 'auto' | 'manual';

export interface OverlayFSMState {
  readonly activeOverlay: OverlayType;
  readonly origin: OverlayOrigin;
  readonly dismissedAttempts: Readonly<Record<OverlayType, number>>;
}
```

- **Transitions:**
  - `RESEARCHING` entry: If `webSearchRequested` is true and `dismissedAttempts.sources !== attempt` and `origin !== 'manual'`, transition to `{ activeOverlay: 'sources', origin: 'auto' }`. If web search is disabled, remain at `none`.
  - `OUTLINING` entry: If `activeOverlay === 'sources' && origin === 'auto'`, close Sources. If `dismissedAttempts.toc !== attempt` and `origin !== 'manual'`, transition to `{ activeOverlay: 'toc', origin: 'auto' }`. If Sources was opened manually (`origin === 'manual'`), do not close Sources.
  - `OUTLINE_READY` / `GENERATING_PREVIEW` entry: If `activeOverlay === 'toc' && origin === 'auto'`, transition to `{ activeOverlay: 'none', origin: 'none' }`. If TOC was opened manually, remain open.
  - Manual Dismissal (Escape or Close button): Sets `dismissedAttempts[activeOverlay] = attempt` and closes overlay. Suppresses auto-reopen for that attempt only.
  - Manual Reopening: Clicking "Sources" or "Table of Contents" triggers manual open with `origin = 'manual'`. Stage transitions never auto-close a manually reopened overlay.
  - Single-Overlay Invariant: Only one overlay is active at any time.

---

## File Inventory & Responsibilities

| File | Status | Responsibility |
| --- | --- | --- |
| `client/src/types/generation.ts` | Modified | Add live progress event types, payload models, `DraftSnapshot`, and `LiveDraftEvent`. |
| `client/src/features/learning/generationEvents.ts` | Modified | Ensure `applyGenerationEvent` ignores live draft events (`id === 0`) preserving dual-cursor independence. |
| `client/src/features/learning/useGenerationDrafts.ts` | **NEW** | Hook managing ephemeral draft state, target isolation, sequence deduplication, snapshot replacement, and batched renders. |
| `client/src/features/learning/useGenerationDrafts.test.ts` | **NEW** | Unit tests for draft state reducer, sequence deduplication, snapshot replacement, and attempt resets. |
| `client/src/features/learning/DraftMarkdownPreview.tsx` | **NEW** | Safe markdown preview renderer for partial text; suppresses eager Mermaid diagrams and raw HTML tags. |
| `client/src/features/learning/DraftMarkdownPreview.test.tsx` | **NEW** | Unit tests for streaming markdown sanitization, Mermaid placeholder, and truncation offset notices. |
| `client/src/features/learning/useGenerationOverlays.ts` | **NEW** | Finite state machine for zero-click automatic Sources and TOC modal lifecycle, manual overrides, and single-overlay constraint. |
| `client/src/features/learning/useGenerationOverlays.test.ts` | **NEW** | Unit tests for overlay FSM stage transitions, web-search bypass, manual dismissal suppression, and manual reopen protection. |
| `client/src/features/learning/SkeletonCard.tsx` | Modified | Support streaming explanation preview inside titled skeleton card via `DraftMarkdownPreview`; keep queued topics as skeletons. |
| `client/src/features/learning/SkeletonCard.test.tsx` | **NEW** | Unit tests verifying titled skeleton, live draft explanation hydration, and read-only preview mode. |
| `client/src/features/learning/TableOfContentsModal.tsx` | Modified | Render provisional topics and growing titles from outline draft during planning stage; keep rows read-only. |
| `client/src/features/learning/TableOfContentsModal.test.tsx` | Modified | Unit tests verifying provisional growing outline topic rows and disabled click behavior. |
| `client/src/features/learning/CourseSourcesPanel.tsx` | Modified | Render live unique source counter and streaming research synthesis draft. |
| `client/src/features/learning/CourseSourcesPanel.test.tsx` | Modified | Unit tests verifying live source count updates and research synthesis preview before completion. |
| `client/src/features/learning/useSessionEvents.ts` | Modified | Subscribe to 6 live event types; route `id === 0` frames to draft callback without modifying TanStack Query cache. |
| `client/src/features/learning/useSessionEvents.test.tsx` | Modified | Unit tests verifying live event routing, cache non-interference, and error recovery. |
| `client/src/features/learning/LearningPathContainer.tsx` | Modified | Topic auto-reveal without selection theft; integrate outline draft in TOC and topic draft in active skeleton. |
| `client/src/features/learning/LearningPathContainer.test.tsx` | Modified | Unit tests verifying topic explanation hydration and non-interfering slide navigation. |
| `client/src/features/learning/LearningPage.tsx` | Modified | Wire `useGenerationDrafts`, `useGenerationOverlays`, and accessible `aria-live` polite milestone announcements. |
| `client/src/features/learning/LearningPage.test.tsx` | Modified | Unit tests verifying zero-click lifecycle orchestration, dismiss overrides, and clean teardown. |
| `client/vitest.generation.config.ts` | Modified | Add new presentation modules (`useGenerationDrafts`, `useGenerationOverlays`, `DraftMarkdownPreview`) to coverage thresholds. |

---

## Ordered Implementation Tasks

### Task 1: Type Definitions for Live Events and Drafts

**Files:**
- Modify: `client/src/types/generation.ts`
- Create: `client/src/types/generation.test.ts`

- [ ] **Red Test:** Add `client/src/types/generation.test.ts` asserting type contract validity.

```typescript
/**
 * ============================================================================
 * FILE: generation.test.ts
 * LOCATION: client/src/types/generation.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Type assertion tests for live generation progress event contracts.
 *
 * ROLE IN PROJECT:
 *    Ensures client TypeScript contracts match server schemas exactly.
 *
 * KEY COMPONENTS:
 *    - Type narrowing and discriminated union checks
 * ============================================================================
 */

import { describe, expect, it } from 'vitest';
import type {
  LiveDraftEvent,
  ProgressEventType,
  ResearchSourcesUpdatedPayload,
  ResearchTextDeltaPayload,
  OutlineTextDeltaPayload,
  TopicContentDeltaPayload,
  TopicExplanationReadyPayload,
  TargetDraftResetPayload,
} from './generation';

describe('generation live event types', () => {
  it('allows all six live progress event types', () => {
    const liveTypes: ProgressEventType[] = [
      'research_sources_updated',
      'research_text_delta',
      'outline_text_delta',
      'topic_content_delta',
      'topic_explanation_ready',
      'target_draft_reset',
    ];
    expect(liveTypes).toHaveLength(6);
  });

  it('validates LiveDraftEvent envelope shape', () => {
    const payload: TopicContentDeltaPayload = {
      node_id: 'node-1',
      sequence_index: 0,
      text_delta: 'Hello world',
      attempt: 1,
    };

    const event: LiveDraftEvent = {
      id: 0,
      session_id: 'session-123',
      job_id: 'job-456',
      stage: 'GENERATING_PREVIEW',
      target: '["topic","node-1",0]',
      attempt: 1,
      sequence: 1,
      event_type: 'topic_content_delta',
      payload,
      snapshot: null,
    };

    expect(event.id).toBe(0);
    expect(event.sequence).toBe(1);
    expect(event.event_type).toBe('topic_content_delta');
  });

  it('supports snapshot with truncated text and outline topics', () => {
    const event: LiveDraftEvent = {
      id: 0,
      session_id: 'session-123',
      job_id: 'job-456',
      stage: 'OUTLINING',
      target: '["outline","session-123",null]',
      attempt: 1,
      sequence: 2,
      event_type: 'outline_text_delta',
      payload: { course_title_delta: 'AI', attempt: 1 },
      snapshot: {
        text: '',
        text_offset: 0,
        truncated: false,
        course_title: 'AI Engineering',
        topics: { 0: 'Intro', 1: 'Advanced' },
        explanation_ready: false,
      },
    };

    expect(event.snapshot?.course_title).toBe('AI Engineering');
    expect(event.snapshot?.topics[0]).toBe('Intro');
  });
});
```

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/types/generation.test.ts
  ```
  *Expected failure: TypeScript compilation error because types do not exist in `generation.ts`.*

- [ ] **Implementation:**
  In `client/src/types/generation.ts`, add:
  - Updated `ProgressEventType` union to include the 6 live events:
    ```typescript
    export type ProgressEventType =
      | 'stage_changed'
      | 'research_section_ready'
      | 'research_degraded'
      | 'outline_ready'
      | 'module_ready'
      | 'module_failed'
      | 'generation_paused'
      | 'generation_cancelled'
      | 'generation_complete'
      | 'research_sources_updated'
      | 'research_text_delta'
      | 'outline_text_delta'
      | 'topic_content_delta'
      | 'topic_explanation_ready'
      | 'target_draft_reset';
    ```
  - New payload interfaces:
    ```typescript
    export interface ResearchSourcesUpdatedPayload {
      unique_source_count: number;
      new_sources_count: number;
      provider_id?: string | null;
    }

    export interface ResearchTextDeltaPayload {
      report_id: string;
      theme: string;
      sequence_index: number;
      text_delta: string;
      attempt: number;
    }

    export interface OutlineTextDeltaPayload {
      course_title_delta?: string | null;
      topic_index?: number | null;
      topic_title_delta?: string | null;
      attempt: number;
    }

    export interface TopicContentDeltaPayload {
      node_id: string;
      sequence_index: number;
      text_delta: string;
      attempt: number;
    }

    export interface TopicExplanationReadyPayload {
      node_id: string;
      sequence_index: number;
      attempt: number;
    }

    export interface TargetDraftResetPayload {
      target_type: 'research' | 'outline' | 'topic';
      target_id: string;
      sequence_index?: number | null;
      attempt: number;
      reason: string;
    }

    export interface DraftSnapshot {
      text: string;
      text_offset: number;
      truncated: boolean;
      course_title: string;
      topics: Record<string | number, string>;
      explanation_ready: boolean;
      unique_source_count?: number | null;
      new_sources_count?: number | null;
      provider_id?: string | null;
    }

    export type LiveDraftPayload =
      | ResearchSourcesUpdatedPayload
      | ResearchTextDeltaPayload
      | OutlineTextDeltaPayload
      | TopicContentDeltaPayload
      | TopicExplanationReadyPayload
      | TargetDraftResetPayload;

    export interface LiveDraftEvent {
      id: 0;
      session_id: string;
      job_id: string;
      stage: GenerationStage;
      target: string;
      attempt: number;
      sequence: number;
      event_type: ProgressEventType;
      payload: LiveDraftPayload;
      snapshot?: DraftSnapshot | null;
    }
    ```

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/types/generation.test.ts
  ```
  *Verification: 3 tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/types/generation.ts client/src/types/generation.test.ts
  git commit -m "feat(realtime): add live progress event and draft snapshot contracts"
  ```

---

### Task 2: Dual Cursor Isolation in `generationEvents.ts`

**Files:**
- Modify: `client/src/features/learning/generationEvents.ts`
- Modify: `client/src/features/learning/generationEvents.test.ts`

- [ ] **Red Test:** Add test in `client/src/features/learning/generationEvents.test.ts` asserting that `applyGenerationEvent` drops live draft events (`id: 0`) and never modifies the session or durable cursor.

```typescript
  it('ignores live draft events with id 0 to protect durable milestone cursor', () => {
    const session = {
      ...baseSession,
      generation: { ...baseSession.generation, last_event_id: 3 },
    } as LearningSessionWithNodes;

    const liveEvent: GenerationEvent = {
      id: 0,
      session_id: 'session-1',
      event_type: 'topic_content_delta',
      payload: {
        node_id: 'n1',
        sequence_index: 0,
        text_delta: 'delta',
        attempt: 1,
      } as unknown as GenerationEventPayload,
      created_at: '2026-08-01T00:00:00Z',
    };

    const next = applyGenerationEvent(session, liveEvent);
    expect(next).toBe(session);
    expect(next.generation?.last_event_id).toBe(3);
  });
```

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/generationEvents.test.ts
  ```
  *Expected failure: `next.generation?.last_event_id` assertion or event processing check fails if id 0 is not guarded.*

- [ ] **Implementation:**
  In `client/src/features/learning/generationEvents.ts`:
  In `applyGenerationEvent`, update the check:
  ```typescript
  export function applyGenerationEvent(
    session: LearningSessionWithNodes,
    event: GenerationEvent & { generation?: GenerationJobPublic | null },
  ): LearningSessionWithNodes {
    if (event.id <= 0) {
      return session;
    }
    const currentId = session.generation?.last_event_id ?? 0;
    if (event.id <= currentId) {
      return session;
    }
    ...
  ```

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/generationEvents.test.ts
  ```
  *Verification: All existing and new tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/features/learning/generationEvents.ts client/src/features/learning/generationEvents.test.ts
  git commit -m "fix(realtime): isolate durable cursor from live draft event frames"
  ```

---

### Task 3: Streaming Draft State Hook (`useGenerationDrafts.ts`)

**Files:**
- Create: `client/src/features/learning/useGenerationDrafts.ts`
- Create: `client/src/features/learning/useGenerationDrafts.test.ts`

- [ ] **Red Test:** Create `client/src/features/learning/useGenerationDrafts.test.ts`.

```typescript
/**
 * ============================================================================
 * FILE: useGenerationDrafts.test.ts
 * LOCATION: client/src/features/learning/useGenerationDrafts.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for live generation draft state reducer and hook.
 *
 * ROLE IN PROJECT:
 *    Guards sequence deduplication, attempt resets, and snapshot replacement.
 *
 * KEY COMPONENTS:
 *    - useGenerationDrafts
 * ============================================================================
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGenerationDrafts } from './useGenerationDrafts';
import type { LiveDraftEvent } from '@/types/generation';

describe('useGenerationDrafts', () => {
  const topicTarget = '["topic","node-1",0]';
  const outlineTarget = '["outline","session-1",null]';

  it('accumulates topic content deltas for matching sequence', () => {
    const { result } = renderHook(() => useGenerationDrafts('session-1', 'job-1'));

    const event1: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'GENERATING_PREVIEW',
      target: topicTarget,
      attempt: 1,
      sequence: 1,
      event_type: 'topic_content_delta',
      payload: {
        node_id: 'node-1',
        sequence_index: 0,
        text_delta: 'Hello ',
        attempt: 1,
      },
    };

    const event2: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'GENERATING_PREVIEW',
      target: topicTarget,
      attempt: 1,
      sequence: 2,
      event_type: 'topic_content_delta',
      payload: {
        node_id: 'node-1',
        sequence_index: 0,
        text_delta: 'World!',
        attempt: 1,
      },
    };

    act(() => {
      result.current.handleLiveEvent(event1);
      result.current.handleLiveEvent(event2);
    });

    const draft = result.current.getTopicDraft('node-1');
    expect(draft).toBeDefined();
    expect(draft?.text).toBe('Hello World!');
    expect(draft?.sequence).toBe(2);
  });

  it('rejects stale or duplicate sequence deltas', () => {
    const { result } = renderHook(() => useGenerationDrafts('session-1', 'job-1'));

    const event1: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'GENERATING_PREVIEW',
      target: topicTarget,
      attempt: 1,
      sequence: 3,
      event_type: 'topic_content_delta',
      payload: {
        node_id: 'node-1',
        sequence_index: 0,
        text_delta: 'Initial',
        attempt: 1,
      },
    };

    const staleEvent: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'GENERATING_PREVIEW',
      target: topicTarget,
      attempt: 1,
      sequence: 2,
      event_type: 'topic_content_delta',
      payload: {
        node_id: 'node-1',
        sequence_index: 0,
        text_delta: 'Stale',
        attempt: 1,
      },
    };

    act(() => {
      result.current.handleLiveEvent(event1);
      result.current.handleLiveEvent(staleEvent);
    });

    const draft = result.current.getTopicDraft('node-1');
    expect(draft?.text).toBe('Initial');
    expect(draft?.sequence).toBe(3);
  });

  it('replaces target draft completely when snapshot arrives', () => {
    const { result } = renderHook(() => useGenerationDrafts('session-1', 'job-1'));

    const delta: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'GENERATING_PREVIEW',
      target: topicTarget,
      attempt: 1,
      sequence: 1,
      event_type: 'topic_content_delta',
      payload: {
        node_id: 'node-1',
        sequence_index: 0,
        text_delta: 'Prefix',
        attempt: 1,
      },
    };

    const snapshotEvent: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'GENERATING_PREVIEW',
      target: topicTarget,
      attempt: 1,
      sequence: 4,
      event_type: 'topic_content_delta',
      payload: {
        node_id: 'node-1',
        sequence_index: 0,
        text_delta: 'ignored',
        attempt: 1,
      },
      snapshot: {
        text: 'Snapshot Text',
        text_offset: 50,
        truncated: true,
        course_title: '',
        topics: {},
        explanation_ready: true,
      },
    };

    act(() => {
      result.current.handleLiveEvent(delta);
      result.current.handleLiveEvent(snapshotEvent);
    });

    const draft = result.current.getTopicDraft('node-1');
    expect(draft?.text).toBe('Snapshot Text');
    expect(draft?.textOffset).toBe(50);
    expect(draft?.truncated).toBe(true);
    expect(draft?.explanationReady).toBe(true);
    expect(draft?.sequence).toBe(4);
  });

  it('resets target draft on target_draft_reset with new attempt', () => {
    const { result } = renderHook(() => useGenerationDrafts('session-1', 'job-1'));

    const deltaAttempt1: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'GENERATING_PREVIEW',
      target: topicTarget,
      attempt: 1,
      sequence: 5,
      event_type: 'topic_content_delta',
      payload: {
        node_id: 'node-1',
        sequence_index: 0,
        text_delta: 'Attempt 1 content',
        attempt: 1,
      },
    };

    const resetEvent: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'GENERATING_PREVIEW',
      target: topicTarget,
      attempt: 2,
      sequence: 1,
      event_type: 'target_draft_reset',
      payload: {
        target_type: 'topic',
        target_id: 'node-1',
        sequence_index: 0,
        attempt: 2,
        reason: 'retry',
      },
    };

    act(() => {
      result.current.handleLiveEvent(deltaAttempt1);
      result.current.handleLiveEvent(resetEvent);
    });

    const draft = result.current.getTopicDraft('node-1');
    expect(draft?.text).toBe('');
    expect(draft?.attempt).toBe(2);
    expect(draft?.sequence).toBe(1);
  });

  it('accumulates outline course title and topic titles correctly', () => {
    const { result } = renderHook(() => useGenerationDrafts('session-1', 'job-1'));

    const titleDelta: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'OUTLINING',
      target: outlineTarget,
      attempt: 1,
      sequence: 1,
      event_type: 'outline_text_delta',
      payload: {
        course_title_delta: 'Web ',
        attempt: 1,
      },
    };

    const topicDelta: LiveDraftEvent = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'OUTLINING',
      target: outlineTarget,
      attempt: 1,
      sequence: 2,
      event_type: 'outline_text_delta',
      payload: {
        topic_index: 0,
        topic_title_delta: 'HTML & CSS',
        attempt: 1,
      },
    };

    act(() => {
      result.current.handleLiveEvent(titleDelta);
      result.current.handleLiveEvent(topicDelta);
    });

    const draft = result.current.getOutlineDraft();
    expect(draft?.courseTitle).toBe('Web ');
    expect(draft?.topics[0]).toBe('HTML & CSS');
  });

  it('retires target draft when retireTarget is called', () => {
    const { result } = renderHook(() => useGenerationDrafts('session-1', 'job-1'));

    act(() => {
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'GENERATING_PREVIEW',
        target: topicTarget,
        attempt: 1,
        sequence: 1,
        event_type: 'topic_content_delta',
        payload: {
          node_id: 'node-1',
          sequence_index: 0,
          text_delta: 'Data',
          attempt: 1,
        },
      });
    });

    expect(result.current.getTopicDraft('node-1')).toBeDefined();

    act(() => {
      result.current.retireTarget(topicTarget);
    });

    expect(result.current.getTopicDraft('node-1')).toBeUndefined();
  });
});
```

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/useGenerationDrafts.test.ts
  ```
  *Expected failure: `useGenerationDrafts.ts` file not found.*

- [ ] **Implementation:**
  Create `client/src/features/learning/useGenerationDrafts.ts` with the 76-character header, pure draft reducer, sequence/attempt deduplication, snapshot replacement, and RAF batching.
  Expose named export `useGenerationDrafts`.

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/useGenerationDrafts.test.ts
  ```
  *Verification: 6 tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/features/learning/useGenerationDrafts.ts client/src/features/learning/useGenerationDrafts.test.ts
  git commit -m "feat(realtime): add useGenerationDrafts hook with sequence deduplication"
  ```

---

### Task 4: Safe Partial Markdown Renderer (`DraftMarkdownPreview.tsx`)

**Files:**
- Create: `client/src/features/learning/DraftMarkdownPreview.tsx`
- Create: `client/src/features/learning/DraftMarkdownPreview.test.tsx`

- [ ] **Red Test:** Create `client/src/features/learning/DraftMarkdownPreview.test.tsx`.

```typescript
/**
 * ============================================================================
 * FILE: DraftMarkdownPreview.test.tsx
 * LOCATION: client/src/features/learning/DraftMarkdownPreview.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests streaming markdown preview sanitization and Mermaid suppression.
 *
 * ROLE IN PROJECT:
 *    Guards XSS safety, link safety, and graceful streaming diagram rendering.
 *
 * KEY COMPONENTS:
 *    - DraftMarkdownPreview
 * ============================================================================
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DraftMarkdownPreview } from './DraftMarkdownPreview';

describe('DraftMarkdownPreview', () => {
  it('renders basic markdown content safely', () => {
    render(<DraftMarkdownPreview content="## Concept Overview\n\nThis is a streaming preview." />);
    expect(screen.getByRole('heading', { level: 2, name: /concept overview/i })).toBeInTheDocument();
    expect(screen.getByText(/this is a streaming preview/i)).toBeInTheDocument();
  });

  it('escapes and sanitizes raw HTML without executing scripts', () => {
    const malicious = 'Hello <script>alert(1)</script> <img src="x" onerror="alert(2)" /> world';
    const { container } = render(<DraftMarkdownPreview content={malicious} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img[onerror]')).toBeNull();
  });

  it('suppresses eager Mermaid rendering and displays paused diagram box', () => {
    const mermaidContent = 'Here is a diagram:\n\n```mermaid\ngraph TD\n  A-->B\n```';
    render(<DraftMarkdownPreview content={mermaidContent} />);
    expect(screen.getByText(/diagram generation in progress/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mermaid-diagram')).not.toBeInTheDocument();
  });

  it('sanitizes unsafe link URLs', () => {
    const markdown = '[Safe Link](https://example.com) and [Unsafe Link](javascript:alert(1))';
    render(<DraftMarkdownPreview content={markdown} />);
    const safeLink = screen.getByRole('link', { name: /safe link/i });
    expect(safeLink).toHaveAttribute('href', 'https://example.com');
    expect(screen.queryByRole('link', { name: /unsafe link/i })).toBeNull();
  });

  it('displays truncation offset notice when isTruncated is true', () => {
    render(
      <DraftMarkdownPreview
        content="Remaining tail of text"
        isTruncated={true}
        textOffset={1200}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/offset 1200/i);
  });
});
```

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/DraftMarkdownPreview.test.tsx
  ```
  *Expected failure: `DraftMarkdownPreview.tsx` file not found.*

- [ ] **Implementation:**
  Create `client/src/features/learning/DraftMarkdownPreview.tsx` with:
  - 76-character `=` header.
  - `ReactMarkdown` with `remarkGfm` and `remarkMath`. NO `rehypeRaw` (so raw HTML is escaped).
  - Code block interceptor replacing `language-mermaid` with a clean dashed Cyber Yellow banner: `"Diagram generation in progress..."`.
  - Link interceptor validating `http:` and `https:`.
  - Truncation notice banner when `isTruncated === true`.
  - Typography classes (`font-lexend` and `font-fira`).
  - Named export `DraftMarkdownPreview`.

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/DraftMarkdownPreview.test.tsx
  ```
  *Verification: 5 tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/features/learning/DraftMarkdownPreview.tsx client/src/features/learning/DraftMarkdownPreview.test.tsx
  git commit -m "feat(realtime): add DraftMarkdownPreview with Mermaid suppression and sanitization"
  ```

---

### Task 5: Automatic Overlay FSM (`useGenerationOverlays.ts`)

**Files:**
- Create: `client/src/features/learning/useGenerationOverlays.ts`
- Create: `client/src/features/learning/useGenerationOverlays.test.ts`

- [ ] **Red Test:** Create `client/src/features/learning/useGenerationOverlays.test.ts`.

```typescript
/**
 * ============================================================================
 * FILE: useGenerationOverlays.test.ts
 * LOCATION: client/src/features/learning/useGenerationOverlays.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for automatic overlay finite state machine.
 *
 * ROLE IN PROJECT:
 *    Guards zero-click lifecycle (A1, A4, A8), dismissal, and manual overrides.
 *
 * KEY COMPONENTS:
 *    - useGenerationOverlays
 * ============================================================================
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGenerationOverlays } from './useGenerationOverlays';
import type { GenerationStage } from '@/types/generation';

describe('useGenerationOverlays', () => {
  it('auto-opens Sources on RESEARCHING when web search is enabled', () => {
    const { result, rerender } = renderHook(
      (props: { stage: GenerationStage; webSearchRequested: boolean }) =>
        useGenerationOverlays(props),
      { initialProps: { stage: 'INITIALIZING', webSearchRequested: true } },
    );

    expect(result.current.activeOverlay).toBe('none');

    rerender({ stage: 'RESEARCHING', webSearchRequested: true });
    expect(result.current.activeOverlay).toBe('sources');
    expect(result.current.origin).toBe('auto');
    expect(result.current.isSourcesOpen).toBe(true);
  });

  it('skips Sources auto-open when web search is disabled', () => {
    const { result, rerender } = renderHook(
      (props: { stage: GenerationStage; webSearchRequested: boolean }) =>
        useGenerationOverlays(props),
      { initialProps: { stage: 'INITIALIZING', webSearchRequested: false } },
    );

    rerender({ stage: 'RESEARCHING', webSearchRequested: false });
    expect(result.current.activeOverlay).toBe('none');
    expect(result.current.isSourcesOpen).toBe(false);
  });

  it('closes Sources and auto-opens TOC when advancing from RESEARCHING to OUTLINING', () => {
    const { result, rerender } = renderHook(
      (props: { stage: GenerationStage; webSearchRequested: boolean }) =>
        useGenerationOverlays(props),
      { initialProps: { stage: 'RESEARCHING', webSearchRequested: true } },
    );

    expect(result.current.activeOverlay).toBe('sources');

    rerender({ stage: 'OUTLINING', webSearchRequested: true });
    expect(result.current.activeOverlay).toBe('toc');
    expect(result.current.origin).toBe('auto');
    expect(result.current.isSourcesOpen).toBe(false);
    expect(result.current.isTOCOpen).toBe(true);
  });

  it('closes TOC when advancing to OUTLINE_READY or GENERATING_PREVIEW', () => {
    const { result, rerender } = renderHook(
      (props: { stage: GenerationStage }) =>
        useGenerationOverlays({ stage: props.stage, webSearchRequested: true }),
      { initialProps: { stage: 'OUTLINING' } },
    );

    expect(result.current.activeOverlay).toBe('toc');

    rerender({ stage: 'OUTLINE_READY' });
    expect(result.current.activeOverlay).toBe('none');
    expect(result.current.isTOCOpen).toBe(false);
  });

  it('suppresses auto-reopen for the same attempt when manually dismissed', () => {
    const { result, rerender } = renderHook(
      (props: { stage: GenerationStage; attempt: number }) =>
        useGenerationOverlays({
          stage: props.stage,
          webSearchRequested: true,
          attempt: props.attempt,
        }),
      { initialProps: { stage: 'RESEARCHING', attempt: 1 } },
    );

    expect(result.current.activeOverlay).toBe('sources');

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.activeOverlay).toBe('none');

    // Rerender same stage and attempt: remains closed
    rerender({ stage: 'RESEARCHING', attempt: 1 });
    expect(result.current.activeOverlay).toBe('none');

    // New attempt resets suppression: auto-opens
    rerender({ stage: 'RESEARCHING', attempt: 2 });
    expect(result.current.activeOverlay).toBe('sources');
  });

  it('never auto-closes an overlay reopened manually for inspection', () => {
    const { result, rerender } = renderHook(
      (props: { stage: GenerationStage }) =>
        useGenerationOverlays({ stage: props.stage, webSearchRequested: true }),
      { initialProps: { stage: 'PLANNING_PREVIEW' } },
    );

    expect(result.current.activeOverlay).toBe('none');

    act(() => {
      result.current.openSources();
    });

    expect(result.current.activeOverlay).toBe('sources');
    expect(result.current.origin).toBe('manual');

    // Advancing stage does NOT close manual inspection
    rerender({ stage: 'GENERATING_PREVIEW' });
    expect(result.current.activeOverlay).toBe('sources');
    expect(result.current.isSourcesOpen).toBe(true);
  });
});
```

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/useGenerationOverlays.test.ts
  ```
  *Expected failure: `useGenerationOverlays.ts` file not found.*

- [ ] **Implementation:**
  Create `client/src/features/learning/useGenerationOverlays.ts` implementing the state machine with:
  - 76-character `=` header.
  - State tracking for `activeOverlay` ('none' | 'sources' | 'toc'), `origin` ('none' | 'auto' | 'manual'), and `dismissedAttempts`.
  - Named export `useGenerationOverlays`.

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/useGenerationOverlays.test.ts
  ```
  *Verification: 6 tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/features/learning/useGenerationOverlays.ts client/src/features/learning/useGenerationOverlays.test.ts
  git commit -m "feat(realtime): add useGenerationOverlays finite state machine"
  ```

---

### Task 6: Titled Skeleton Hydration in `SkeletonCard.tsx`

**Files:**
- Modify: `client/src/features/learning/SkeletonCard.tsx`
- Create: `client/src/features/learning/SkeletonCard.test.tsx`

- [ ] **Red Test:** Create `client/src/features/learning/SkeletonCard.test.tsx`.

```typescript
/**
 * ============================================================================
 * FILE: SkeletonCard.test.tsx
 * LOCATION: client/src/features/learning/SkeletonCard.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests titled skeleton card and live draft explanation hydration.
 *
 * ROLE IN PROJECT:
 *    Guards topic preview hydration and read-only preview boundaries.
 *
 * KEY COMPONENTS:
 *    - SkeletonCard
 * ============================================================================
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonCard } from './SkeletonCard';

describe('SkeletonCard', () => {
  it('renders titled skeleton bars when no draft text is provided', () => {
    render(<SkeletonCard title="Variables & Types" sequenceIndex={0} animated={true} />);
    expect(screen.getByText('Variables & Types')).toBeInTheDocument();
    expect(screen.getByRole('generic', { hidden: true })).toHaveAttribute('data-module-skeleton', 'generating');
  });

  it('hydrates with DraftMarkdownPreview when draft text is provided', () => {
    render(
      <SkeletonCard
        title="Variables & Types"
        sequenceIndex={0}
        animated={true}
        draftText="In JavaScript, variables store data values."
      />,
    );
    expect(screen.getByText('Variables & Types')).toBeInTheDocument();
    expect(screen.getByText(/in javascript, variables store data values/i)).toBeInTheDocument();
    expect(screen.getByText(/preview mode · generating explanation/i)).toBeInTheDocument();
  });

  it('indicates quiz generation when explanationReady is true', () => {
    render(
      <SkeletonCard
        title="Variables & Types"
        sequenceIndex={0}
        animated={true}
        draftText="Explanation complete."
        explanationReady={true}
      />,
    );
    expect(screen.getByText(/generating quizzes/i)).toBeInTheDocument();
    expect(screen.getByText(/quiz generation in progress/i)).toBeInTheDocument();
  });
});
```

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/SkeletonCard.test.tsx
  ```
  *Expected failure: `draftText` and `explanationReady` props not recognized, or preview elements missing.*

- [ ] **Implementation:**
  In `client/src/features/learning/SkeletonCard.tsx`:
  - Extend `SkeletonCardProps`:
    ```typescript
    interface SkeletonCardProps {
      className?: string;
      title?: string;
      sequenceIndex?: number;
      animated?: boolean;
      draftText?: string;
      isTruncated?: boolean;
      textOffset?: number;
      explanationReady?: boolean;
    }
    ```
  - When `draftText` is provided, render the card body with `DraftMarkdownPreview` and status headers, while disabling interactions (read-only preview).
  - Preserve the 76-character `=` file header.

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/SkeletonCard.test.tsx
  ```
  *Verification: 3 tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/features/learning/SkeletonCard.tsx client/src/features/learning/SkeletonCard.test.tsx
  git commit -m "feat(realtime): hydrate SkeletonCard with streaming draft explanation preview"
  ```

---

### Task 7: Provisional Outline Streaming in `TableOfContentsModal.tsx`

**Files:**
- Modify: `client/src/features/learning/TableOfContentsModal.tsx`
- Modify: `client/src/features/learning/TableOfContentsModal.test.tsx`

- [ ] **Red Test:** Add tests in `client/src/features/learning/TableOfContentsModal.test.tsx` verifying growing title and provisional read-only topic rows from `outlineDraft`.

```typescript
  it('renders provisional topics and growing titles during outlining', () => {
    render(
      <TableOfContentsModal
        isOpen={true}
        onClose={vi.fn()}
        nodes={[]}
        onSelectTopic={vi.fn()}
        outlineDraft={{
          courseTitle: 'TypeScript Essentials',
          topics: {
            0: 'Basic Types',
            1: 'Generics',
          },
        }}
      />,
    );

    expect(screen.getByText('TypeScript Essentials')).toBeInTheDocument();
    expect(screen.getByText('Basic Types')).toBeInTheDocument();
    expect(screen.getByText('Generics')).toBeInTheDocument();
    expect(screen.getAllByText('Planning...')).toHaveLength(2);
  });

  it('disables clicking on provisional outline rows', () => {
    const handleSelect = vi.fn();
    render(
      <TableOfContentsModal
        isOpen={true}
        onClose={vi.fn()}
        nodes={[]}
        onSelectTopic={handleSelect}
        outlineDraft={{
          courseTitle: 'TypeScript Essentials',
          topics: { 0: 'Basic Types' },
        }}
      />,
    );

    const topicSpan = screen.getByText('Basic Types');
    expect(topicSpan.closest('button')).toBeNull();
    fireEvent.click(topicSpan);
    expect(handleSelect).not.toHaveBeenCalled();
  });
```

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/TableOfContentsModal.test.tsx
  ```
  *Expected failure: `outlineDraft` prop not supported or provisional rows not rendered.*

- [ ] **Implementation:**
  In `client/src/features/learning/TableOfContentsModal.tsx`:
  - Extend `TableOfContentsModalProps` to accept `outlineDraft?: { courseTitle?: string; topics: Readonly<Record<number, string>> }`.
  - When `nodes.length === 0` and `outlineDraft` has topics, render rows for each provisional topic with badge "Planning..." and `cursor-not-allowed` span instead of click button.
  - Show `outlineDraft.courseTitle` if present in modal header.
  - Preserve the 76-character `=` file header.

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/TableOfContentsModal.test.tsx
  ```
  *Verification: All existing and new tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/features/learning/TableOfContentsModal.tsx client/src/features/learning/TableOfContentsModal.test.tsx
  git commit -m "feat(realtime): render provisional growing outline topics in TableOfContentsModal"
  ```

---

### Task 8: Live Sources and Research Synthesis in `CourseSourcesPanel.tsx`

**Files:**
- Modify: `client/src/features/learning/CourseSourcesPanel.tsx`
- Modify: `client/src/features/learning/CourseSourcesPanel.test.tsx`

- [ ] **Red Test:** Add tests in `client/src/features/learning/CourseSourcesPanel.test.tsx` verifying live source counts and streaming research synthesis.

```typescript
  it('renders live retrieved source count and streaming synthesis draft before report completes', () => {
    render(
      <CourseSourcesPanel
        isOpen={true}
        onClose={vi.fn()}
        report={null}
        draftText="Synthesizing findings on modern web frameworks..."
        liveSourceCount={7}
      />,
    );

    expect(screen.getByText(/research in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/7 sources retrieved/i)).toBeInTheDocument();
    expect(screen.getByText(/synthesizing findings on modern web frameworks/i)).toBeInTheDocument();
  });
```

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/CourseSourcesPanel.test.tsx
  ```
  *Expected failure: `draftText` and `liveSourceCount` props missing or live synthesis block absent.*

- [ ] **Implementation:**
  In `client/src/features/learning/CourseSourcesPanel.tsx`:
  - Extend `CourseSourcesPanelProps` to accept `draftText?: string`, `liveSourceCount?: number`, `liveProviderId?: string | null`.
  - When `!report` and (`draftText` or `liveSourceCount`), display live synthesis container using `DraftMarkdownPreview` and show `"${liveSourceCount} sources retrieved"`.
  - Preserve the 76-character `=` file header.

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/CourseSourcesPanel.test.tsx
  ```
  *Verification: All existing and new tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/features/learning/CourseSourcesPanel.tsx client/src/features/learning/CourseSourcesPanel.test.tsx
  git commit -m "feat(realtime): display live source counts and research synthesis in CourseSourcesPanel"
  ```

---

### Task 9: Live SSE Event Transport in `useSessionEvents.ts`

**Files:**
- Modify: `client/src/features/learning/useSessionEvents.ts`
- Modify: `client/src/features/learning/useSessionEvents.test.tsx`

- [ ] **Red Test:** Add tests in `client/src/features/learning/useSessionEvents.test.tsx` verifying live event dispatch to `onLiveEvent` callback without calling `queryClient.setQueryData`.

```typescript
  it('routes live draft events to onLiveEvent callback without modifying TanStack Query cache', async () => {
    const onLiveEventSpy = vi.fn();
    renderHook(
      () =>
        useSessionEvents('session-1', {
          enabled: true,
          onLiveEvent: onLiveEventSpy,
        }),
      { wrapper },
    );

    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const source = FakeEventSource.instances[0];

    const liveDelta = {
      id: 0,
      session_id: 'session-1',
      job_id: 'job-1',
      stage: 'GENERATING_PREVIEW',
      target: '["topic","n1",0]',
      attempt: 1,
      sequence: 1,
      event_type: 'topic_content_delta',
      payload: {
        node_id: 'n1',
        sequence_index: 0,
        text_delta: 'Streamed chunk',
        attempt: 1,
      },
    };

    act(() => {
      source.emit('topic_content_delta', liveDelta);
    });

    expect(onLiveEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 0,
        event_type: 'topic_content_delta',
        sequence: 1,
      }),
    );

    const sessionData = client.getQueryData<LearningSessionWithNodes>([
      'learningSession',
      'session-1',
    ]);
    expect(sessionData?.generation?.last_event_id).toBe(4);
  });
```

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/useSessionEvents.test.tsx
  ```
  *Expected failure: `onLiveEvent` option not accepted or live events not routed.*

- [ ] **Implementation:**
  In `client/src/features/learning/useSessionEvents.ts`:
  - Accept `enabledOrOptions: boolean | UseSessionEventsOptions`.
  - Add `LIVE_EVENT_TYPES` to event listener registrations on `EventSource`.
  - Parse both durable events (`id > 0`) and live events (`id === 0`).
  - Route `id === 0` frames to `options.onLiveEvent?.(event)`.
  - Ensure `Last-Event-ID` cursor in EventSource constructor remains durable-only.
  - Preserve the 76-character `=` file header.

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/useSessionEvents.test.tsx
  ```
  *Verification: All 6 tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/features/learning/useSessionEvents.ts client/src/features/learning/useSessionEvents.test.tsx
  git commit -m "feat(realtime): subscribe to live events and route to draft handler in useSessionEvents"
  ```

---

### Task 10: Wire Live Pipeline in `LearningPathContainer.tsx`, `LearningPage.tsx`, and Coverage Config

**Files:**
- Modify: `client/src/features/learning/LearningPathContainer.tsx`
- Modify: `client/src/features/learning/LearningPage.tsx`
- Modify: `client/vitest.generation.config.ts`
- Modify: `client/src/features/learning/LearningPathContainer.test.tsx`
- Modify: `client/src/features/learning/LearningPage.test.tsx`

- [ ] **Red Test:** Update `LearningPage.test.tsx` and `LearningPathContainer.test.tsx` to assert:
  1. `LearningPage` auto-opens Sources on `RESEARCHING` with web search, closes Sources and auto-opens TOC on `OUTLINING`, and closes TOC on `OUTLINE_READY` (A1, A4, A8).
  2. `LearningPathContainer` reveals the actively streaming topic's explanation preview without stealing selection once user navigates (A6, A7).

- [ ] **Red Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/LearningPage.test.tsx src/features/learning/LearningPathContainer.test.tsx
  ```
  *Expected failure: Auto-overlay wiring or draft preview passing missing.*

- [ ] **Implementation:**
  1. In `client/src/features/learning/LearningPage.tsx`:
     - Instantiate `useGenerationDrafts(sessionId, session?.generation?.id)`.
     - Instantiate `useGenerationOverlays({ stage: session?.generation?.stage, webSearchRequested: !!session?.generation?.web_search_requested, attempt: 1 })`.
     - Pass `handleLiveEvent` to `useSessionEvents`.
     - Wire `isSourcesOpen` and `isTOCOpen` to `CourseSourcesPanel` and `LearningPathContainer`.
     - Add `aria-live="polite"` status region announcing stage changes (never tokens).
  2. In `client/src/features/learning/LearningPathContainer.tsx`:
     - Accept optional `drafts` or topic draft.
     - Pass `topicDraft` to `SkeletonCard` when `module_status === 'GENERATING' || module_status === 'SKELETON'`.
     - Pass `outlineDraft` to `TableOfContentsModal`.
     - When `GENERATING_PREVIEW` begins, auto-reveal topic 0 once if user has not navigated away; mark `userNavigatedRef = true` upon arrow key or slide click to protect learner focus.
  3. In `client/vitest.generation.config.ts`:
     - Add to coverage `include`:
       - `'src/features/learning/useGenerationDrafts.ts'`
       - `'src/features/learning/useGenerationOverlays.ts'`
       - `'src/features/learning/DraftMarkdownPreview.tsx'`

- [ ] **Green Test Execution:**
  ```bash
  cd client && npx vitest run src/features/learning/LearningPage.test.tsx src/features/learning/LearningPathContainer.test.tsx
  ```
  *Verification: All tests pass.*

- [ ] **Commit:**
  ```bash
  git add client/src/features/learning/LearningPathContainer.tsx client/src/features/learning/LearningPage.tsx client/vitest.generation.config.ts client/src/features/learning/LearningPathContainer.test.tsx client/src/features/learning/LearningPage.test.tsx
  git commit -m "feat(realtime): wire live pipeline UI in LearningPage and LearningPathContainer"
  ```

---

## Final Verification and Quality Gates

Execute all four mandatory quality commands in `client/` and record the results:

1. **Full Client Test Suite:**
   ```bash
   cd client && npm run test -- --run
   ```
2. **Generation Coverage Thresholds (>80% on all metrics):**
   ```bash
   cd client && npm run test:generation:coverage
   ```
3. **ESLint Verification:**
   ```bash
   cd client && npm run lint
   ```
4. **TypeScript Production Build:**
   ```bash
   cd client && npm run build
   ```

---

## Traceability to Acceptance Criteria

| Acceptance ID | Spec Requirement | Owned Tasks | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **A1** | Research panel opens without interaction on a live research-stage event | Task 5, Task 10 | `useGenerationOverlays.test.ts`, `LearningPage.test.tsx` verify zero-click auto-open on `RESEARCHING`. |
| **A4** | Research-to-planning transition closes automatic Sources panel and opens TOC without clicks | Task 5, Task 10 | `useGenerationOverlays.test.ts` proves automatic Sources close and TOC open on transition to `OUTLINING`. |
| **A5** | TOC title/entries grow during unfinished planner response; final validation reconciles and closes it | Task 7, Task 10 | `TableOfContentsModal.test.tsx` asserts provisional rows and growing title; FSM closes TOC on `OUTLINE_READY`. |
| **A6** | Final outline creates titled skeletons; at least two growing topic-text updates appear before generator completion | Task 3, Task 6, Task 10 | `SkeletonCard.test.tsx` and `LearningPathContainer.test.tsx` verify titled skeletons with live explanation preview. |
| **A7** | Interleaved concurrent topic streams remain isolated; readiness waits for required artifacts, including quizzes | Task 3, Task 6 | `useGenerationDrafts.test.ts` verifies target key isolation; `SkeletonCard` renders read-only preview mode. |
| **A8** | Complete successful generation lifecycle requires zero UI interaction | Task 5, Task 10 | `LearningPage.test.tsx` verifies the full zero-click progression from `RESEARCHING` through `COMPLETE`. |
| **A10** | Duplicate events, reconnect, refresh, stale polling, and session switching neither duplicate text nor replay old modals | Task 2, Task 3, Task 5, Task 9 | `useGenerationDrafts.test.ts` asserts sequence deduplication and snapshot replacement; dual cursor guards cache. |
| **A12** | Pause/cancel/failure/degraded research have truthful, non-stuck UI and preserve recovery controls | Task 5, Task 6, Task 8 | Modals stay closed on failure; `SkeletonCard` displays recoverable error rather than endless animation. |
| **A13** | Optional dismissal, focus transitions, reduced motion, and manual inspection work without blocking generation | Task 5, Task 10 | Manual dismissal suppresses auto-reopen for that attempt; manual inspection remains open across stage changes. |
| **A14** | Malicious partial text, unsafe links, secrets, hidden reasoning, and quiz answers are not exposed unsafely | Task 4, Task 6 | `DraftMarkdownPreview.test.tsx` verifies raw HTML escaping, safe URL protocol filtering, and Mermaid suppression. |
