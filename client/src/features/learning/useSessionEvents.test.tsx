/**
 * ============================================================================
 * FILE: useSessionEvents.test.tsx
 * LOCATION: client/src/features/learning/useSessionEvents.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests EventSource lifecycle and React Query cache updates.
 *
 * ROLE IN PROJECT:
 *    Guards cursor URL, event application, invalidation, and cleanup.
 *
 * KEY COMPONENTS:
 *    - useSessionEvents hook tests with FakeEventSource
 *
 * DEPENDENCIES:
 *    - External: React Query, Testing Library, Vitest
 *    - Internal: useSessionEvents, FakeEventSource
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/useSessionEvents.test.tsx
 * ============================================================================
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { FakeEventSource } from '@/test/FakeEventSource';
import { useSessionEvents } from './useSessionEvents';
import type { LearningSessionWithNodes } from '@/types/learning';

const sessionBase = {
  id: 'session-1',
  user_id: null,
  query: 'CSS',
  course_title: 'CSS',
  total_nodes: 0,
  completed_nodes: 0,
  last_active_node_id: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: null,
  nodes: [],
  generation: {
    id: 'job-1',
    session_id: 'session-1',
    stage: 'RESEARCHING',
    web_search_requested: true,
    grounding_status: 'PENDING',
    counts: {
      topics_total: 0,
      briefs_ready: 0,
      topics_ready: 0,
      topics_failed: 0,
      research_sections: 0,
      sources: 0,
    },
    warnings: [],
    cancel_requested: false,
    can_cancel: true,
    can_resume: false,
    last_event_id: 4,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
} as LearningSessionWithNodes;

describe('useSessionEvents', () => {
  let client: QueryClient;
  const OriginalEventSource = globalThis.EventSource;

  beforeEach(() => {
    FakeEventSource.reset();
    globalThis.EventSource =
      FakeEventSource as unknown as typeof EventSource;
    client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['learningSession', 'session-1'], sessionBase);
  });

  afterEach(() => {
    globalThis.EventSource = OriginalEventSource;
    FakeEventSource.reset();
    client.clear();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  it('ignores malformed event payloads', async () => {
    renderHook(() => useSessionEvents('session-1', true), { wrapper });
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    act(() => {
      FakeEventSource.instances[0].emit('stage_changed', 'not-json{');
      FakeEventSource.instances[0].emit('stage_changed', {
        id: 'x',
        session_id: 1,
        event_type: null,
      });
    });
    const data = client.getQueryData<LearningSessionWithNodes>([
      'learningSession',
      'session-1',
    ]);
    expect(data?.generation?.last_event_id).toBe(4);
  });

  it('opens EventSource with after cursor from cache', async () => {
    renderHook(() => useSessionEvents('session-1', true), { wrapper });
    await waitFor(() => {
      expect(FakeEventSource.instances.length).toBe(1);
    });
    expect(FakeEventSource.instances[0].url).toMatch(
      /\/learning\/sessions\/session-1\/events\?after=4$/,
    );
  });

  it('applies stage event to session cache', async () => {
    renderHook(() => useSessionEvents('session-1', true), { wrapper });
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

    act(() => {
      FakeEventSource.instances[0].emit('stage_changed', {
        id: 5,
        session_id: 'session-1',
        event_type: 'stage_changed',
        payload: { previous_stage: 'RESEARCHING', stage: 'OUTLINING' },
        generation: {
          ...sessionBase.generation,
          stage: 'OUTLINING',
          last_event_id: 5,
        },
        created_at: '2026-08-01T00:00:01Z',
      });
    });

    await waitFor(() => {
      const data = client.getQueryData<LearningSessionWithNodes>([
        'learningSession',
        'session-1',
      ]);
      expect(data?.generation?.stage).toBe('OUTLINING');
      expect(data?.generation?.last_event_id).toBe(5);
    });
  });

  it('invalidates session on outline_ready and research on research_section_ready', async () => {
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => useSessionEvents('session-1', true), { wrapper });
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

    act(() => {
      FakeEventSource.instances[0].emit('outline_ready', {
        id: 6,
        session_id: 'session-1',
        event_type: 'outline_ready',
        payload: { course_title: 'CSS', topic_count: 3 },
        generation: {
          ...sessionBase.generation,
          stage: 'PLANNING_PREVIEW',
          last_event_id: 6,
        },
        created_at: '2026-08-01T00:00:02Z',
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['learningSession', 'session-1'],
        }),
      );
    });

    act(() => {
      FakeEventSource.instances[0].emit('research_section_ready', {
        id: 7,
        session_id: 'session-1',
        event_type: 'research_section_ready',
        payload: {
          report_id: 'r1',
          section_id: 's1',
          sequence_index: 0,
          source_count: 2,
        },
        generation: {
          ...sessionBase.generation,
          last_event_id: 7,
        },
        created_at: '2026-08-01T00:00:03Z',
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['courseResearch', 'session-1'],
        }),
      );
    });
  });

  it('closes on terminal event and on unmount', async () => {
    const { unmount } = renderHook(
      () => useSessionEvents('session-1', true),
      { wrapper },
    );
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit('generation_complete', {
        id: 10,
        session_id: 'session-1',
        event_type: 'generation_complete',
        payload: {
          stage: 'COMPLETE',
          counts: sessionBase.generation!.counts,
          grounding_status: 'DISABLED',
        },
        generation: {
          ...sessionBase.generation,
          stage: 'COMPLETE',
          last_event_id: 10,
          can_cancel: false,
        },
        created_at: '2026-08-01T00:00:10Z',
      });
    });

    await waitFor(() => {
      expect(source.closed).toBe(true);
    });

    FakeEventSource.reset();
    const again = renderHook(() => useSessionEvents('session-1', true), {
      wrapper,
    });
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const second = FakeEventSource.instances[0];
    again.unmount();
    expect(second.closed).toBe(true);
    unmount();
  });

  it('leaves source open on error for native reconnect', async () => {
    renderHook(() => useSessionEvents('session-1', true), { wrapper });
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const source = FakeEventSource.instances[0];
    act(() => {
      source.emit('error', {});
    });
    expect(source.closed).toBe(false);
  });

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

  it('parses live snapshots and ignores malformed live frames', async () => {
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

    act(() => {
      source.emit('topic_content_delta', '{not-json');
      source.emit('topic_content_delta', {
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'GENERATING_PREVIEW',
        target: '["topic","n1",0]',
        attempt: 1,
        sequence: 2,
        event_type: 'topic_content_delta',
        payload: {
          node_id: 'n1',
          sequence_index: 0,
          text_delta: 'snap',
          attempt: 1,
        },
        snapshot: {
          text: 'Snapshot body',
          text_offset: 10,
          truncated: true,
          course_title: '',
          topics: { 0: 'Intro' },
          explanation_ready: true,
          unique_source_count: 3,
          new_sources_count: 1,
          provider_id: 'tavily',
        },
      });
      source.emit('research_sources_updated', {
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'RESEARCHING',
        target: '["research","session-1",null]',
        attempt: 1,
        sequence: 1,
        event_type: 'research_sources_updated',
        payload: {
          unique_source_count: 2,
          new_sources_count: 2,
        },
      });
    });

    expect(onLiveEventSpy).toHaveBeenCalledTimes(2);
    expect(onLiveEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          text: 'Snapshot body',
          truncated: true,
          provider_id: 'tavily',
        }),
      }),
    );
  });

  it('does not open EventSource when options.enabled is false', () => {
    renderHook(
      () => useSessionEvents('session-1', { enabled: false }),
      { wrapper },
    );
    expect(FakeEventSource.instances.length).toBe(0);
  });

  it('accepts generation null, snapshot null, and rejects invalid snapshots', async () => {
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

    act(() => {
      source.emit('stage_changed', {
        id: 5,
        session_id: 'session-1',
        event_type: 'stage_changed',
        payload: { previous_stage: 'RESEARCHING', stage: 'OUTLINING' },
        generation: null,
        created_at: 123,
      });
      source.emit('stage_changed', {
        id: 6,
        session_id: 'session-1',
        event_type: 'stage_changed',
        payload: { previous_stage: 'OUTLINING', stage: 'PLANNING_PREVIEW' },
        generation: { session_id: 'session-1' },
      });
      source.emit('outline_text_delta', {
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'OUTLINING',
        target: '["outline","session-1",null]',
        attempt: 1,
        sequence: 3,
        event_type: 'outline_text_delta',
        payload: { course_title_delta: 'AI', attempt: 1 },
        snapshot: null,
      });
      source.emit('outline_text_delta', {
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'OUTLINING',
        target: '["outline","session-1",null]',
        attempt: 1,
        sequence: 4,
        event_type: 'outline_text_delta',
        payload: { course_title_delta: 'AI', attempt: 1 },
        snapshot: { text: 1 },
      });
      source.emit('research_sources_updated', {
        id: 0,
        session_id: 'session-1',
        job_id: 'job-1',
        stage: 'RESEARCHING',
        target: '["research","session-1",null]',
        attempt: 1,
        sequence: 5,
        event_type: 'research_sources_updated',
        payload: {
          unique_source_count: 1,
          new_sources_count: 1,
          provider_id: null,
        },
        snapshot: {
          text: '',
          text_offset: 0,
          truncated: false,
          course_title: '',
          topics: { 0: 'Intro', 1: 2 },
          explanation_ready: false,
          unique_source_count: null,
          new_sources_count: null,
          provider_id: null,
        },
      });
    });

    expect(onLiveEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: null }),
    );
    expect(onLiveEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          unique_source_count: null,
          provider_id: null,
        }),
      }),
    );
    const data = client.getQueryData<LearningSessionWithNodes>([
      'learningSession',
      'session-1',
    ]);
    expect(data?.generation?.last_event_id).toBe(6);
  });
});
