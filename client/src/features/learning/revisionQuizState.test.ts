/**
 * ============================================================================
 * FILE: revisionQuizState.test.ts
 * LOCATION: client/src/features/learning/revisionQuizState.test.ts
 * ============================================================================
 * PURPOSE:
 *    Verify revision quiz UI state without requests or mastery state.
 * ROLE IN PROJECT:
 *    Protect navigation persistence and independent saved-result identity.
 * KEY COMPONENTS:
 *    - Reducer tests: Drafts, retry, result selection, and immutable updates
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import type { QuizCard, RevisionQuizAttemptResult } from '@/types/learning';
import { createRevisionQuizState, getRevisionQuizView,
  revisionQuizReducer, selectRevisionQuizResult } from './revisionQuizState';

const quiz: QuizCard = {
  question_text: 'Q', difficulty: 'easy', question_type: 'single_choice',
  options: [
    { option_id: 'x', display_label: 'B', text: 'X', is_correct: true, explanation: 'X reason' },
    { option_id: 'y', display_label: 'A', text: 'Y', is_correct: false, explanation: 'Y reason' },
    { option_id: 'z', display_label: 'D', text: 'Z', is_correct: false, explanation: 'Z reason' },
    { option_id: 'w', display_label: 'C', text: 'W', is_correct: false, explanation: 'W reason' },
  ],
};
const wrong: RevisionQuizAttemptResult = {
  id: 'a1', revision_session_id: 'r1', node_id: 'n1', quiz_index: 0,
  attempt_number: 6, quiz_attempt_count: 2, selected_option_ids: ['y'],
  is_correct: false, score_percent: 0, correct_option_ids: [], explanation: '',
  selected_explanation: null, created_at: '2026-10-05T10:00:00Z',
};
describe('revisionQuizState', () => {
  it('preserves keyed selections through Previous/Next/Skip without changing input state', () => {
    const initial = createRevisionQuizState();
    const selected = revisionQuizReducer(initial, { type: 'select', quizIndex: 0, optionIds: ['y', 'y'] });
    const next = revisionQuizReducer(selected, { type: 'navigate', quizIndex: 1, quizCount: 2 });
    const other = revisionQuizReducer(next, { type: 'select', quizIndex: 1, optionIds: ['x'] });
    const back = revisionQuizReducer(other, { type: 'navigate', quizIndex: 0, quizCount: 2 });
    expect(back.selections).toEqual({ 0: ['y'], 1: ['x'] });
    expect(initial.selections).toEqual({});
    expect(selected.currentQuizIndex).toBe(0);
    expect(next.currentQuizIndex).toBe(1);
    expect(revisionQuizReducer(back, { type: 'navigate', quizIndex: -4, quizCount: 2 }).currentQuizIndex).toBe(0);
    expect(revisionQuizReducer(back, { type: 'navigate', quizIndex: 9, quizCount: 2 }).currentQuizIndex).toBe(1);
    expect(revisionQuizReducer(back, { type: 'navigate', quizIndex: 9, quizCount: 0 }).currentQuizIndex).toBe(0);
  });
  it('opens empty retry inputs only for its wrong quiz and retains the saved attempt', () => {
    const base = revisionQuizReducer(createRevisionQuizState(), { type: 'select', quizIndex: 1, optionIds: ['z'] });
    const retry = revisionQuizReducer(base, { type: 'retry', result: wrong });
    expect(getRevisionQuizView(retry, 0, wrong)).toEqual({ selectedOptionIds: [], showFeedback: false });
    expect(retry.selections[1]).toEqual(['z']);
    expect(wrong.selected_option_ids).toEqual(['y']);
    const edited = revisionQuizReducer(retry, { type: 'select', quizIndex: 0, optionIds: ['x'] });
    expect(getRevisionQuizView(edited, 0, { ...wrong })).toEqual({ selectedOptionIds: ['x'], showFeedback: false });
    expect(getRevisionQuizView(edited, 0, { ...wrong, id: 'a2' }).showFeedback).toBe(true);
    // Request errors/pending are external props: no reducer action erases drafts/results.
    expect(edited.selections[0]).toEqual(['x']);
  });
  it('restores saved selections and refuses retry for a correct result', () => {
    const correct: RevisionQuizAttemptResult = { ...wrong, is_correct: true,
      score_percent: 100, selected_option_ids: ['x'], correct_option_ids: ['x'], explanation: 'X reason' };
    const state = createRevisionQuizState();
    expect(getRevisionQuizView(state, 0, correct)).toEqual({ selectedOptionIds: ['x'], showFeedback: true });
    expect(revisionQuizReducer(state, { type: 'retry', result: correct })).toBe(state);
    expect(getRevisionQuizView(state, 1)).toEqual({ selectedOptionIds: [], showFeedback: false });
  });
  it('requires matching revision, node, quiz index, and resolvable stable IDs', () => {
    const results = [wrong, { ...wrong, id: 'foreign', revision_session_id: 'r2' },
      { ...wrong, id: 'other-node', node_id: 'n2' }, { ...wrong, id: 'q2', quiz_index: 1 }];
    expect(selectRevisionQuizResult(results, 'r1', 'n1', 0, quiz)).toEqual(wrong);
    expect(selectRevisionQuizResult(results, 'r3', 'n1', 0, quiz)).toBeUndefined();
    expect(selectRevisionQuizResult([{ ...wrong, selected_option_ids: ['missing'] }], 'r1', 'n1', 0, quiz)).toBeUndefined();
    expect(selectRevisionQuizResult([{ ...wrong, correct_option_ids: ['missing'] }], 'r1', 'n1', 0, quiz)).toBeUndefined();
    expect(selectRevisionQuizResult([wrong], undefined, 'n1', 0, quiz)).toEqual(wrong);
  });
});
