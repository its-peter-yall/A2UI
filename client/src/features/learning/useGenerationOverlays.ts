/**
 * ============================================================================
 * FILE: useGenerationOverlays.ts
 * LOCATION: client/src/features/learning/useGenerationOverlays.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Zero-click overlay FSM for Sources and Table of Contents modals.
 *
 * ROLE IN PROJECT:
 *    Opens and closes generation overlays from stage transitions while
 *    preserving per-attempt dismissal and never auto-closing manual inspection.
 *
 * KEY COMPONENTS:
 *    - OverlayFSMState: Active overlay, origin, and dismissed attempts
 *    - enterStage: Pure stage-entry transition function
 *    - useGenerationOverlays: React facade over the FSM
 *
 * DEPENDENCIES:
 *    - External: react
 *    - Internal: @/types/generation
 *
 * USAGE:
 *    const overlays = useGenerationOverlays({ stage, webSearchRequested });
 * ============================================================================
 */

import { useCallback, useState } from 'react';

import type { GenerationStage } from '@/types/generation';

export type OverlayType = 'none' | 'sources' | 'toc';
export type OverlayOrigin = 'none' | 'auto' | 'manual';
export type OverlayStage = GenerationStage | 'OUTLINE_READY';

export interface OverlayFSMState {
  readonly activeOverlay: OverlayType;
  readonly origin: OverlayOrigin;
  readonly dismissedAttempts: Readonly<Record<OverlayType, number>>;
}

export interface UseGenerationOverlaysOptions {
  stage?: OverlayStage | null;
  webSearchRequested?: boolean;
  attempt?: number;
}

const EMPTY_DISMISSED: Readonly<Record<OverlayType, number>> = {
  none: 0,
  sources: 0,
  toc: 0,
};

const INITIAL_STATE: OverlayFSMState = {
  activeOverlay: 'none',
  origin: 'none',
  dismissedAttempts: EMPTY_DISMISSED,
};

const CLOSE_AUTO_STAGES: ReadonlySet<OverlayStage> = new Set([
  'OUTLINE_READY',
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

function wasDismissed(
  state: OverlayFSMState,
  overlay: OverlayType,
  attempt: number,
): boolean {
  return state.dismissedAttempts[overlay] === attempt;
}

export function enterStage(
  state: OverlayFSMState,
  stage: OverlayStage | null | undefined,
  webSearchRequested: boolean,
  attempt: number,
): OverlayFSMState {
  if (!stage) {
    return state;
  }
  if (state.origin === 'manual') {
    return state;
  }

  if (stage === 'RESEARCHING') {
    if (!webSearchRequested || wasDismissed(state, 'sources', attempt)) {
      return { ...state, activeOverlay: 'none', origin: 'none' };
    }
    return { ...state, activeOverlay: 'sources', origin: 'auto' };
  }

  if (stage === 'OUTLINING') {
    if (wasDismissed(state, 'toc', attempt)) {
      return { ...state, activeOverlay: 'none', origin: 'none' };
    }
    return { ...state, activeOverlay: 'toc', origin: 'auto' };
  }

  if (CLOSE_AUTO_STAGES.has(stage) && state.origin === 'auto') {
    return { ...state, activeOverlay: 'none', origin: 'none' };
  }

  return state;
}

export function useGenerationOverlays({
  stage = null,
  webSearchRequested = false,
  attempt = 1,
}: UseGenerationOverlaysOptions) {
  const [seen, setSeen] = useState({
    stage,
    webSearchRequested,
    attempt,
  });
  const [fsm, setFsm] = useState<OverlayFSMState>(() =>
    enterStage(INITIAL_STATE, stage, webSearchRequested, attempt),
  );

  if (
    seen.stage !== stage ||
    seen.webSearchRequested !== webSearchRequested ||
    seen.attempt !== attempt
  ) {
    setSeen({ stage, webSearchRequested, attempt });
    setFsm((current) =>
      enterStage(current, stage, webSearchRequested, attempt),
    );
  }

  const dismiss = useCallback(() => {
    setFsm((current) => {
      if (current.activeOverlay === 'none') {
        return current;
      }
      return {
        activeOverlay: 'none',
        origin: 'none',
        dismissedAttempts: {
          ...current.dismissedAttempts,
          [current.activeOverlay]: attempt,
        },
      };
    });
  }, [attempt]);

  const openSources = useCallback(() => {
    setFsm((current) => ({
      ...current,
      activeOverlay: 'sources',
      origin: 'manual',
    }));
  }, []);

  const openTOC = useCallback(() => {
    setFsm((current) => ({
      ...current,
      activeOverlay: 'toc',
      origin: 'manual',
    }));
  }, []);

  return {
    activeOverlay: fsm.activeOverlay,
    origin: fsm.origin,
    dismissedAttempts: fsm.dismissedAttempts,
    isSourcesOpen: fsm.activeOverlay === 'sources',
    isTOCOpen: fsm.activeOverlay === 'toc',
    dismiss,
    openSources,
    openTOC,
  };
}
