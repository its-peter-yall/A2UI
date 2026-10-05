/**
 * ============================================================================
 * FILE: generationEvents.ts
 * LOCATION: client/src/features/learning/generationEvents.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Immutable event-ID reducer for progressive generation session cache.
 *
 * ROLE IN PROJECT:
 *    Applies SSE generation snapshots to React Query cache while rejecting
 *    duplicate and out-of-order event IDs.
 *
 * KEY COMPONENTS:
 *    - applyGenerationEvent: Pure session cache reducer
 *    - isTerminalGenerationStage: Terminal stage helper
 *    - shouldShowGenerationStatusPanel: Hide strip when nothing remains to retry
 *
 * DEPENDENCIES:
 *    - External: None
 *    - Internal: @/types/generation, @/types/learning
 *
 * USAGE:
 *    const next = applyGenerationEvent(session, event);
 * ============================================================================
 */

import type { GenerationEvent, GenerationJobPublic, GenerationStage } from '@/types/generation';
import type { LearningSessionWithNodes } from '@/types/learning';

const TERMINAL_STAGES: ReadonlySet<GenerationStage> = new Set([
  'COMPLETE',
  'COMPLETE_DEGRADED',
  'CANCELLED',
  'FAILED',
]);

export function isTerminalGenerationStage(
  stage: GenerationStage | undefined | null,
): boolean {
  if (!stage) return true;
  return TERMINAL_STAGES.has(stage);
}

/**
 * Shows the generation strip only while work can still run or be retried.
 * Research-only warnings (COMPLETE_DEGRADED with every topic ready) hide it.
 */
export function shouldShowGenerationStatusPanel(
  generation: GenerationJobPublic | null | undefined,
): boolean {
  if (!generation) {
    return false;
  }

  const { stage, counts } = generation;
  const hasUnfinishedTopics =
    counts.topics_failed > 0 ||
    (counts.topics_total > 0 && counts.topics_ready < counts.topics_total);

  if (stage === 'COMPLETE' || stage === 'COMPLETE_DEGRADED') {
    return hasUnfinishedTopics;
  }

  return true;
}

/**
 * Applies a generation event to a session cache entry.
 * Returns the original reference when the event id is not newer.
 */
export const reconcileGenerationSession = (
  current: LearningSessionWithNodes | undefined,
  incoming: LearningSessionWithNodes,
): LearningSessionWithNodes => {
  if (!current?.generation || !incoming.generation) {
    return incoming;
  }
  if (
    incoming.generation.last_event_id <
    current.generation.last_event_id
  ) {
    return current;
  }
  // M9: equal event IDs — prefer newer updated_at so stale poll cannot undo resume.
  if (
    incoming.generation.last_event_id ===
    current.generation.last_event_id
  ) {
    const incomingTs = Date.parse(incoming.generation.updated_at ?? '');
    const currentTs = Date.parse(current.generation.updated_at ?? '');
    if (
      !Number.isNaN(incomingTs) &&
      !Number.isNaN(currentTs) &&
      incomingTs < currentTs
    ) {
      return current;
    }
    // Prefer non-terminal over terminal when timestamps equal/unknown.
    if (
      isTerminalGenerationStage(incoming.generation.stage) &&
      !isTerminalGenerationStage(current.generation.stage)
    ) {
      return current;
    }
  }
  return incoming;
};

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

  const generationSnapshot = event.generation;
  if (!generationSnapshot) {
    return {
      ...session,
      generation: session.generation
        ? { ...session.generation, last_event_id: event.id }
        : session.generation,
    };
  }

  return {
    ...session,
    generation: {
      ...generationSnapshot,
      last_event_id: Math.max(
        generationSnapshot.last_event_id ?? 0,
        event.id,
      ),
    },
  };
}
