/**
 * ============================================================================
 * FILE: useSessionEvents.ts
 * LOCATION: client/src/features/learning/useSessionEvents.ts
 * ============================================================================
 *
 * PURPOSE:
 *    EventSource lifecycle for progressive generation progress events.
 *
 * ROLE IN PROJECT:
 *    Opens a credential-free SSE stream, applies events to React Query cache,
 *    and invalidates session/research queries for structural updates.
 *
 * KEY COMPONENTS:
 *    - useSessionEvents: Hook managing EventSource + cache updates
 *    - PROGRESS_EVENT_TYPES: All nine server event names
 *
 * DEPENDENCIES:
 *    - External: @tanstack/react-query
 *    - Internal: generationEvents, types
 *
 * USAGE:
 *    useSessionEvents(sessionId, enabled);
 * ============================================================================
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  applyGenerationEvent,
  isTerminalGenerationStage,
} from './generationEvents';
import type {
  DraftSnapshot,
  GenerationEvent,
  GenerationEventPayload,
  GenerationJobPublic,
  GenerationStage,
  LiveDraftEvent,
  LiveDraftPayload,
  ProgressEventType,
} from '@/types/generation';
import type { LearningSessionWithNodes } from '@/types/learning';

const PROGRESS_EVENT_TYPES: readonly ProgressEventType[] = [
  'stage_changed',
  'research_section_ready',
  'research_degraded',
  'outline_ready',
  'module_ready',
  'module_failed',
  'generation_paused',
  'generation_cancelled',
  'generation_complete',
];

const LIVE_EVENT_TYPES: readonly ProgressEventType[] = [
  'research_sources_updated',
  'research_text_delta',
  'outline_text_delta',
  'topic_content_delta',
  'topic_explanation_ready',
  'target_draft_reset',
];

export interface UseSessionEventsOptions {
  enabled?: boolean;
  onLiveEvent?: (event: LiveDraftEvent) => void;
}

const SESSION_INVALIDATING: ReadonlySet<ProgressEventType> = new Set([
  'outline_ready',
  'module_ready',
  'module_failed',
]);

const RESEARCH_INVALIDATING: ReadonlySet<ProgressEventType> = new Set([
  'research_section_ready',
  'research_degraded',
]);

const TERMINAL_EVENTS: ReadonlySet<ProgressEventType> = new Set([
  'generation_complete',
  'generation_cancelled',
]);

const ALL_EVENT_TYPES: ReadonlySet<string> = new Set([
  ...PROGRESS_EVENT_TYPES,
  ...LIVE_EVENT_TYPES,
]);

const GENERATION_STAGES: ReadonlySet<string> = new Set([
  'INITIALIZING',
  'RESEARCHING',
  'OUTLINING',
  'PLANNING_PREVIEW',
  'GENERATING_PREVIEW',
  'PLANNING_BATCH',
  'GENERATING_BATCH',
  'PAUSED',
  'CANCELLED',
  'COMPLETE',
  'COMPLETE_DEGRADED',
  'FAILED',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProgressEventType(value: unknown): value is ProgressEventType {
  return typeof value === 'string' && ALL_EVENT_TYPES.has(value);
}

function isGenerationStage(value: unknown): value is GenerationStage {
  return typeof value === 'string' && GENERATION_STAGES.has(value);
}

function isGenerationEventPayload(
  value: unknown,
): value is GenerationEventPayload {
  return isRecord(value);
}

function isGenerationJobPublic(
  value: unknown,
): value is GenerationJobPublic {
  return isRecord(value) && typeof value.id === 'string';
}

function parseGenerationEvent(raw: string): GenerationEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    if (
      typeof parsed.id !== 'number' ||
      parsed.id <= 0 ||
      typeof parsed.session_id !== 'string' ||
      !isProgressEventType(parsed.event_type) ||
      !isGenerationEventPayload(parsed.payload)
    ) {
      return null;
    }
    let generation: GenerationJobPublic | null | undefined;
    if (parsed.generation === undefined) {
      generation = undefined;
    } else if (parsed.generation === null) {
      generation = null;
    } else if (isGenerationJobPublic(parsed.generation)) {
      generation = parsed.generation;
    } else {
      generation = undefined;
    }
    return {
      id: parsed.id,
      session_id: parsed.session_id,
      event_type: parsed.event_type,
      payload: parsed.payload,
      generation,
      created_at:
        typeof parsed.created_at === 'string' ? parsed.created_at : '',
    };
  } catch {
    return null;
  }
}

function parseDraftSnapshot(value: unknown): DraftSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.text !== 'string' ||
    typeof value.text_offset !== 'number' ||
    typeof value.truncated !== 'boolean' ||
    typeof value.course_title !== 'string' ||
    typeof value.explanation_ready !== 'boolean' ||
    !isRecord(value.topics)
  ) {
    return null;
  }
  const topics: Record<string | number, string> = {};
  for (const [key, topicTitle] of Object.entries(value.topics)) {
    if (typeof topicTitle === 'string') {
      topics[key] = topicTitle;
    }
  }
  return {
    text: value.text,
    text_offset: value.text_offset,
    truncated: value.truncated,
    course_title: value.course_title,
    topics,
    explanation_ready: value.explanation_ready,
    unique_source_count:
      typeof value.unique_source_count === 'number'
        ? value.unique_source_count
        : value.unique_source_count === null
          ? null
          : undefined,
    new_sources_count:
      typeof value.new_sources_count === 'number'
        ? value.new_sources_count
        : value.new_sources_count === null
          ? null
          : undefined,
    provider_id:
      typeof value.provider_id === 'string'
        ? value.provider_id
        : value.provider_id === null
          ? null
          : undefined,
  };
}

function isLiveDraftPayload(value: unknown): value is LiveDraftPayload {
  return isRecord(value);
}

function parseLiveDraftEvent(raw: string): LiveDraftEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.id !== 0) {
      return null;
    }
    if (
      typeof parsed.session_id !== 'string' ||
      typeof parsed.job_id !== 'string' ||
      !isGenerationStage(parsed.stage) ||
      typeof parsed.target !== 'string' ||
      typeof parsed.attempt !== 'number' ||
      typeof parsed.sequence !== 'number' ||
      !isProgressEventType(parsed.event_type) ||
      !isLiveDraftPayload(parsed.payload)
    ) {
      return null;
    }
    let snapshot: DraftSnapshot | null | undefined;
    if (parsed.snapshot === undefined) {
      snapshot = undefined;
    } else if (parsed.snapshot === null) {
      snapshot = null;
    } else {
      snapshot = parseDraftSnapshot(parsed.snapshot);
      if (!snapshot) {
        return null;
      }
    }
    return {
      id: 0,
      session_id: parsed.session_id,
      job_id: parsed.job_id,
      stage: parsed.stage,
      target: parsed.target,
      attempt: parsed.attempt,
      sequence: parsed.sequence,
      event_type: parsed.event_type,
      payload: parsed.payload,
      snapshot,
    };
  } catch {
    return null;
  }
}

function resolveOptions(
  enabledOrOptions: boolean | UseSessionEventsOptions,
): { enabled: boolean; onLiveEvent?: (event: LiveDraftEvent) => void } {
  if (typeof enabledOrOptions === 'boolean') {
    return { enabled: enabledOrOptions };
  }
  return {
    enabled: enabledOrOptions.enabled !== false,
    onLiveEvent: enabledOrOptions.onLiveEvent,
  };
}

/**
 * Subscribe to session generation SSE while enabled.
 * Uses cached last_event_id as ?after= cursor. No credentials in URL.
 * Live id:0 frames are routed to onLiveEvent and never advance Last-Event-ID.
 */
export function useSessionEvents(
  sessionId: string | undefined,
  enabledOrOptions: boolean | UseSessionEventsOptions = true,
): void {
  const queryClient = useQueryClient();
  const sourceRef = useRef<EventSource | null>(null);
  const options = resolveOptions(enabledOrOptions);
  const onLiveEventRef = useRef(options.onLiveEvent);

  useEffect(() => {
    onLiveEventRef.current = options.onLiveEvent;
  }, [options.onLiveEvent]);

  useEffect(() => {
    if (!sessionId || !options.enabled) {
      return;
    }

    const cached = queryClient.getQueryData<LearningSessionWithNodes>([
      'learningSession',
      sessionId,
    ]);
    const after = cached?.generation?.last_event_id ?? 0;
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const url = `${baseURL}/learning/sessions/${sessionId}/events?after=${after}`;

    const source = new EventSource(url);
    sourceRef.current = source;

    const handleDurableEvent = (message: MessageEvent) => {
      const event = parseGenerationEvent(String(message.data));
      if (!event) return;

      queryClient.setQueryData<LearningSessionWithNodes>(
        ['learningSession', sessionId],
        (prev) => {
          if (!prev) return prev;
          return applyGenerationEvent(prev, event);
        },
      );

      const type = event.event_type;
      if (SESSION_INVALIDATING.has(type) || TERMINAL_EVENTS.has(type)) {
        void queryClient.invalidateQueries({
          queryKey: ['learningSession', sessionId],
        });
      }
      if (RESEARCH_INVALIDATING.has(type) || TERMINAL_EVENTS.has(type)) {
        void queryClient.invalidateQueries({
          queryKey: ['courseResearch', sessionId],
        });
      }

      if (TERMINAL_EVENTS.has(type)) {
        source.close();
        sourceRef.current = null;
      }
    };

    const handleLiveEvent = (message: MessageEvent) => {
      const event = parseLiveDraftEvent(String(message.data));
      if (!event) return;
      onLiveEventRef.current?.(event);
    };

    for (const type of PROGRESS_EVENT_TYPES) {
      source.addEventListener(type, handleDurableEvent);
    }
    for (const type of LIVE_EVENT_TYPES) {
      source.addEventListener(type, handleLiveEvent);
    }

    source.onerror = () => {
      // Leave EventSource for native reconnect; polling repairs gaps.
    };

    return () => {
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
    };
  }, [sessionId, options.enabled, queryClient]);
}

export { isTerminalGenerationStage };
