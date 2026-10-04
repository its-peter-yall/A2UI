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
import {
  reduceLiveDraftEvent,
  useGenerationDrafts,
} from './useGenerationDrafts';
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

  it('ignores mismatched session/job, invalid targets, and non-live ids', () => {
    const { result } = renderHook(() => useGenerationDrafts('session-1', 'job-1'));

    act(() => {
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'session-1',
        job_id: 'other-job',
        stage: 'GENERATING_PREVIEW',
        target: topicTarget,
        attempt: 1,
        sequence: 1,
        event_type: 'topic_content_delta',
        payload: {
          node_id: 'node-1',
          sequence_index: 0,
          text_delta: 'Nope',
          attempt: 1,
        },
      });
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'other',
        job_id: 'job-1',
        stage: 'GENERATING_PREVIEW',
        target: topicTarget,
        attempt: 1,
        sequence: 1,
        event_type: 'topic_content_delta',
        payload: {
          node_id: 'node-1',
          sequence_index: 0,
          text_delta: 'Nope',
          attempt: 1,
        },
      });
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'GENERATING_PREVIEW',
        target: 'not-json',
        attempt: 1,
        sequence: 1,
        event_type: 'topic_content_delta',
        payload: {
          node_id: 'node-1',
          sequence_index: 0,
          text_delta: 'Nope',
          attempt: 1,
        },
      });
    });

    expect(result.current.getTopicDraft('node-1')).toBeUndefined();
  });

  it('updates research sources and text and exposes getResearchDraft', () => {
    const { result } = renderHook(() => useGenerationDrafts('session-1', 'job-1'));
    const sourcesTarget = '["research","session-1",null]';
    const textTarget = '["research","report-1",0]';

    act(() => {
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'RESEARCHING',
        target: sourcesTarget,
        attempt: 1,
        sequence: 1,
        event_type: 'research_sources_updated',
        payload: {
          unique_source_count: 4,
          new_sources_count: 2,
          provider_id: 'tavily',
        },
      });
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'RESEARCHING',
        target: textTarget,
        attempt: 1,
        sequence: 1,
        event_type: 'research_text_delta',
        payload: {
          report_id: 'report-1',
          theme: 'overview',
          sequence_index: 0,
          text_delta: 'Findings',
          attempt: 1,
        },
      });
    });

    const research = result.current.getResearchDraft();
    expect(research?.text).toBe('Findings');
    expect(research?.uniqueSourceCount).toBeNull();
    expect(result.current.draftsByTarget[sourcesTarget]?.uniqueSourceCount).toBe(4);
    expect(result.current.draftsByTarget[sourcesTarget]?.providerId).toBe('tavily');
  });

  it('marks explanation ready and rejects lower attempts and stale snapshots', () => {
    const { result } = renderHook(() => useGenerationDrafts('session-1', 'job-1'));

    act(() => {
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'GENERATING_PREVIEW',
        target: topicTarget,
        attempt: 2,
        sequence: 3,
        event_type: 'topic_content_delta',
        payload: {
          node_id: 'node-1',
          sequence_index: 0,
          text_delta: 'Keep',
          attempt: 2,
        },
      });
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'GENERATING_PREVIEW',
        target: topicTarget,
        attempt: 1,
        sequence: 9,
        event_type: 'topic_content_delta',
        payload: {
          node_id: 'node-1',
          sequence_index: 0,
          text_delta: 'Old',
          attempt: 1,
        },
      });
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'GENERATING_PREVIEW',
        target: topicTarget,
        attempt: 2,
        sequence: 2,
        event_type: 'topic_content_delta',
        payload: {
          node_id: 'node-1',
          sequence_index: 0,
          text_delta: 'ignored',
          attempt: 2,
        },
        snapshot: {
          text: 'Stale snap',
          text_offset: 0,
          truncated: false,
          course_title: '',
          topics: {},
          explanation_ready: false,
        },
      });
      result.current.handleLiveEvent({
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'GENERATING_PREVIEW',
        target: topicTarget,
        attempt: 2,
        sequence: 4,
        event_type: 'topic_explanation_ready',
        payload: {
          node_id: 'node-1',
          sequence_index: 0,
          attempt: 2,
        },
      });
    });

    const draft = result.current.getTopicDraft('node-1');
    expect(draft?.text).toBe('Keep');
    expect(draft?.explanationReady).toBe(true);
    expect(draft?.sequence).toBe(4);
  });

  it('clears drafts on session change and no-ops retire of unknown targets', () => {
    const { result, rerender } = renderHook(
      (props: { sessionId: string; jobId: string }) =>
        useGenerationDrafts(props.sessionId, props.jobId),
      { initialProps: { sessionId: 'session-1', jobId: 'job-1' } },
    );

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
      result.current.retireTarget('missing');
    });
    expect(result.current.getTopicDraft('node-1')).toBeDefined();

    rerender({ sessionId: 'session-2', jobId: 'job-2' });
    expect(result.current.getTopicDraft('node-1')).toBeUndefined();
    expect(result.current.activeJobId).toBe('job-2');
  });

  it('reducer ignores durable event ids', () => {
    const ignored = reduceLiveDraftEvent(
      { draftsByTarget: {}, activeJobId: null },
      {
        id: 1,
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
          text_delta: 'Nope',
          attempt: 1,
        },
      } as unknown as LiveDraftEvent,
      'session-1',
      'job-1',
    );
    expect(ignored.draftsByTarget).toEqual({});
  });
});
