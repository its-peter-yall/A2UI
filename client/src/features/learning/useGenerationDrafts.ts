/**
 * ============================================================================
 * FILE: useGenerationDrafts.ts
 * LOCATION: client/src/features/learning/useGenerationDrafts.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Ephemeral live-draft state with sequence dedup and snapshot replacement.
 *
 * ROLE IN PROJECT:
 *    Consumes id:0 SSE frames independently of the durable Last-Event-ID
 *    cursor so streaming research, outline, and topic text never pollutes
 *    TanStack Query cache or unlocks quiz/module transitions.
 *
 * KEY COMPONENTS:
 *    - TargetDraft / GenerationDraftsState: Per-target display accumulators
 *    - reduceDrafts: Attempt/sequence guards and snapshot replacement
 *    - useGenerationDrafts: RAF-batched React facade over the reducer
 *
 * DEPENDENCIES:
 *    - External: react
 *    - Internal: @/types/generation
 *
 * USAGE:
 *    const drafts = useGenerationDrafts(sessionId, jobId);
 *    drafts.handleLiveEvent(event);
 * ============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  DraftSnapshot,
  LiveDraftEvent,
  LiveDraftPayload,
  OutlineTextDeltaPayload,
  ResearchSourcesUpdatedPayload,
  ResearchTextDeltaPayload,
  TopicContentDeltaPayload,
} from '@/types/generation';

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

interface ParsedTarget {
  readonly targetType: 'research' | 'outline' | 'topic';
  readonly targetId: string;
  readonly sequenceIndex: number | null;
}

const EMPTY_STATE: GenerationDraftsState = {
  draftsByTarget: {},
  activeJobId: null,
};

function parseTarget(target: string): ParsedTarget | null {
  try {
    const parsed: unknown = JSON.parse(target);
    if (!Array.isArray(parsed) || parsed.length !== 3) {
      return null;
    }
    const targetType = parsed[0];
    const targetId = parsed[1];
    const sequenceIndex = parsed[2];
    if (
      targetType !== 'research' &&
      targetType !== 'outline' &&
      targetType !== 'topic'
    ) {
      return null;
    }
    if (typeof targetId !== 'string') {
      return null;
    }
    if (sequenceIndex !== null && typeof sequenceIndex !== 'number') {
      return null;
    }
    return { targetType, targetId, sequenceIndex };
  } catch {
    return null;
  }
}

function toNumberKeyedTopics(
  topics: DraftSnapshot['topics'],
): Record<number, string> {
  const next: Record<number, string> = {};
  for (const [key, value] of Object.entries(topics)) {
    const index = Number(key);
    if (Number.isInteger(index)) {
      next[index] = value;
    }
  }
  return next;
}

function createDraft(
  event: LiveDraftEvent,
  parsed: ParsedTarget,
): TargetDraft {
  return {
    target: event.target,
    targetType: parsed.targetType,
    targetId: parsed.targetId,
    sequenceIndex: parsed.sequenceIndex,
    attempt: event.attempt,
    sequence: event.sequence,
    text: '',
    textOffset: 0,
    truncated: false,
    explanationReady: false,
    courseTitle: '',
    topics: {},
    uniqueSourceCount: null,
    newSourcesCount: null,
    providerId: null,
  };
}

function applySnapshot(
  base: TargetDraft,
  event: LiveDraftEvent,
  snapshot: DraftSnapshot,
): TargetDraft {
  return {
    ...base,
    attempt: event.attempt,
    sequence: event.sequence,
    text: snapshot.text,
    textOffset: snapshot.text_offset,
    truncated: snapshot.truncated,
    explanationReady: snapshot.explanation_ready,
    courseTitle: snapshot.course_title,
    topics: toNumberKeyedTopics(snapshot.topics),
    uniqueSourceCount: snapshot.unique_source_count ?? null,
    newSourcesCount: snapshot.new_sources_count ?? null,
    providerId: snapshot.provider_id ?? null,
  };
}

function isResearchSourcesPayload(
  payload: LiveDraftPayload,
): payload is ResearchSourcesUpdatedPayload {
  return 'unique_source_count' in payload && 'new_sources_count' in payload;
}

function isResearchTextPayload(
  payload: LiveDraftPayload,
): payload is ResearchTextDeltaPayload {
  return 'text_delta' in payload && 'report_id' in payload;
}

function isOutlinePayload(
  payload: LiveDraftPayload,
): payload is OutlineTextDeltaPayload {
  return (
    'attempt' in payload &&
    ('course_title_delta' in payload || 'topic_title_delta' in payload)
  );
}

function isTopicContentPayload(
  payload: LiveDraftPayload,
): payload is TopicContentDeltaPayload {
  return 'text_delta' in payload && 'node_id' in payload;
}

function applyDelta(current: TargetDraft, event: LiveDraftEvent): TargetDraft {
  const payload = event.payload;
  switch (event.event_type) {
    case 'research_sources_updated': {
      if (!isResearchSourcesPayload(payload)) {
        return { ...current, sequence: event.sequence, attempt: event.attempt };
      }
      return {
        ...current,
        sequence: event.sequence,
        attempt: event.attempt,
        uniqueSourceCount: payload.unique_source_count,
        newSourcesCount: payload.new_sources_count,
        providerId: payload.provider_id ?? null,
      };
    }
    case 'research_text_delta': {
      if (!isResearchTextPayload(payload)) {
        return { ...current, sequence: event.sequence, attempt: event.attempt };
      }
      return {
        ...current,
        sequence: event.sequence,
        attempt: event.attempt,
        text: current.text + payload.text_delta,
      };
    }
    case 'outline_text_delta': {
      if (!isOutlinePayload(payload)) {
        return { ...current, sequence: event.sequence, attempt: event.attempt };
      }
      const topics = { ...current.topics };
      if (
        payload.topic_index !== null &&
        payload.topic_index !== undefined &&
        payload.topic_title_delta
      ) {
        const existing = topics[payload.topic_index] ?? '';
        topics[payload.topic_index] = existing + payload.topic_title_delta;
      }
      return {
        ...current,
        sequence: event.sequence,
        attempt: event.attempt,
        courseTitle:
          current.courseTitle + (payload.course_title_delta ?? ''),
        topics,
      };
    }
    case 'topic_content_delta': {
      if (!isTopicContentPayload(payload)) {
        return { ...current, sequence: event.sequence, attempt: event.attempt };
      }
      return {
        ...current,
        sequence: event.sequence,
        attempt: event.attempt,
        text: current.text + payload.text_delta,
      };
    }
    case 'topic_explanation_ready': {
      return {
        ...current,
        sequence: event.sequence,
        attempt: event.attempt,
        explanationReady: true,
      };
    }
    case 'target_draft_reset': {
      return {
        ...createDraft(event, {
          targetType: current.targetType,
          targetId: current.targetId,
          sequenceIndex: current.sequenceIndex,
        }),
        attempt: event.attempt,
        sequence: event.sequence,
      };
    }
    default:
      return { ...current, sequence: event.sequence, attempt: event.attempt };
  }
}

function shouldApply(
  current: TargetDraft | undefined,
  event: LiveDraftEvent,
): boolean {
  if (!current) {
    return true;
  }
  if (event.attempt < current.attempt) {
    return false;
  }
  if (event.snapshot) {
    return event.sequence >= current.sequence;
  }
  if (
    event.attempt === current.attempt &&
    event.sequence <= current.sequence
  ) {
    return false;
  }
  return true;
}

export function reduceLiveDraftEvent(
  state: GenerationDraftsState,
  event: LiveDraftEvent,
  sessionId: string,
  jobId: string,
): GenerationDraftsState {
  if (event.id !== 0) {
    return state;
  }
  if (event.session_id !== sessionId || event.job_id !== jobId) {
    return state;
  }
  const parsed = parseTarget(event.target);
  if (!parsed) {
    return state;
  }

  const current = state.draftsByTarget[event.target];
  if (!shouldApply(current, event)) {
    return state;
  }

  const base =
    current && event.attempt > current.attempt
      ? createDraft(event, parsed)
      : (current ?? createDraft(event, parsed));

  const nextDraft = event.snapshot
    ? applySnapshot(base, event, event.snapshot)
    : applyDelta(base, event);

  return {
    activeJobId: jobId,
    draftsByTarget: {
      ...state.draftsByTarget,
      [event.target]: nextDraft,
    },
  };
}

function retireDraft(
  state: GenerationDraftsState,
  target: string,
): GenerationDraftsState {
  if (!(target in state.draftsByTarget)) {
    return state;
  }
  const next = { ...state.draftsByTarget };
  delete next[target];
  return { ...state, draftsByTarget: next };
}

function findTopicDraft(
  state: GenerationDraftsState,
  nodeId: string,
): TargetDraft | undefined {
  return Object.values(state.draftsByTarget).find(
    (draft) => draft.targetType === 'topic' && draft.targetId === nodeId,
  );
}

function findOutlineDraft(
  state: GenerationDraftsState,
): TargetDraft | undefined {
  return Object.values(state.draftsByTarget).find(
    (draft) => draft.targetType === 'outline',
  );
}

function findResearchDraft(
  state: GenerationDraftsState,
): TargetDraft | undefined {
  const drafts = Object.values(state.draftsByTarget).filter(
    (draft) => draft.targetType === 'research',
  );
  const withText = drafts.find((draft) => draft.text.length > 0);
  if (withText) {
    return withText;
  }
  return drafts.find((draft) => draft.uniqueSourceCount !== null) ?? drafts[0];
}

function scheduleCommit(commit: () => void): () => void {
  if (import.meta.env.MODE === 'test') {
    commit();
    return () => undefined;
  }
  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(commit);
    return () => cancelAnimationFrame(handle);
  }
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) {
      commit();
    }
  });
  return () => {
    cancelled = true;
  };
}

export function useGenerationDrafts(
  sessionId?: string | null,
  jobId?: string | null,
) {
  const resolvedSessionId = sessionId ?? null;
  const resolvedJobId = jobId ?? null;
  const [identity, setIdentity] = useState({
    sessionId: resolvedSessionId,
    jobId: resolvedJobId,
  });
  const [state, setState] = useState<GenerationDraftsState>({
    ...EMPTY_STATE,
    activeJobId: resolvedJobId,
  });
  const stateRef = useRef(state);
  const cancelCommitRef = useRef<(() => void) | null>(null);

  let viewState = state;
  if (
    identity.sessionId !== resolvedSessionId ||
    identity.jobId !== resolvedJobId
  ) {
    viewState = {
      draftsByTarget: {},
      activeJobId: resolvedJobId,
    };
    setIdentity({ sessionId: resolvedSessionId, jobId: resolvedJobId });
    setState(viewState);
  }

  useEffect(() => {
    cancelCommitRef.current?.();
    cancelCommitRef.current = null;
    stateRef.current = {
      draftsByTarget: {},
      activeJobId: resolvedJobId,
    };
    return () => {
      cancelCommitRef.current?.();
      cancelCommitRef.current = null;
    };
  }, [resolvedSessionId, resolvedJobId]);

  const queueCommit = useCallback(() => {
    if (cancelCommitRef.current) {
      return;
    }
    cancelCommitRef.current = scheduleCommit(() => {
      cancelCommitRef.current = null;
      setState(stateRef.current);
    });
  }, []);

  const syncIdentity = useCallback((): GenerationDraftsState => {
    if (
      identity.sessionId === resolvedSessionId &&
      identity.jobId === resolvedJobId &&
      stateRef.current.activeJobId === resolvedJobId
    ) {
      return stateRef.current;
    }
    const next: GenerationDraftsState = {
      draftsByTarget: {},
      activeJobId: resolvedJobId,
    };
    stateRef.current = next;
    return next;
  }, [identity.jobId, identity.sessionId, resolvedJobId, resolvedSessionId]);

  const handleLiveEvent = useCallback(
    (event: LiveDraftEvent) => {
      if (!resolvedSessionId || !resolvedJobId) {
        return;
      }
      const current = syncIdentity();
      const next = reduceLiveDraftEvent(
        current,
        event,
        resolvedSessionId,
        resolvedJobId,
      );
      if (next === current) {
        return;
      }
      stateRef.current = next;
      queueCommit();
    },
    [queueCommit, resolvedJobId, resolvedSessionId, syncIdentity],
  );

  const retireTarget = useCallback(
    (target: string) => {
      const next = retireDraft(syncIdentity(), target);
      if (next === stateRef.current) {
        return;
      }
      stateRef.current = next;
      queueCommit();
    },
    [queueCommit, syncIdentity],
  );

  const getTopicDraft = useCallback(
    (nodeId: string) => findTopicDraft(syncIdentity(), nodeId),
    [syncIdentity],
  );

  const getOutlineDraft = useCallback(
    () => findOutlineDraft(syncIdentity()),
    [syncIdentity],
  );

  const getResearchDraft = useCallback(
    () => findResearchDraft(syncIdentity()),
    [syncIdentity],
  );

  return {
    draftsByTarget: viewState.draftsByTarget,
    activeJobId: viewState.activeJobId,
    handleLiveEvent,
    retireTarget,
    getTopicDraft,
    getOutlineDraft,
    getResearchDraft,
  };
}
