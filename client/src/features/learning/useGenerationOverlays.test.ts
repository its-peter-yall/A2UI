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
import {
  useGenerationOverlays,
  type OverlayStage,
} from './useGenerationOverlays';
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
      (props: { stage: OverlayStage }) =>
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
