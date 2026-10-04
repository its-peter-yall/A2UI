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

  it('validates remaining live payload shapes', () => {
    const sources: ResearchSourcesUpdatedPayload = {
      unique_source_count: 5,
      new_sources_count: 2,
      provider_id: 'tavily',
    };
    const researchText: ResearchTextDeltaPayload = {
      report_id: 'report-1',
      theme: 'overview',
      sequence_index: 0,
      text_delta: 'Findings',
      attempt: 1,
    };
    const outline: OutlineTextDeltaPayload = {
      course_title_delta: 'AI',
      attempt: 1,
    };
    const explanationReady: TopicExplanationReadyPayload = {
      node_id: 'node-1',
      sequence_index: 0,
      attempt: 1,
    };
    const reset: TargetDraftResetPayload = {
      target_type: 'topic',
      target_id: 'node-1',
      sequence_index: 0,
      attempt: 2,
      reason: 'retry',
    };

    expect(sources.unique_source_count).toBe(5);
    expect(researchText.text_delta).toBe('Findings');
    expect(outline.course_title_delta).toBe('AI');
    expect(explanationReady.node_id).toBe('node-1');
    expect(reset.reason).toBe('retry');
  });
});
