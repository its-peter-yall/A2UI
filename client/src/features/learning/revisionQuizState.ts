/**
 * ============================================================================
 * FILE: revisionQuizState.ts
 * LOCATION: client/src/features/learning/revisionQuizState.ts
 * ============================================================================
 * PURPOSE:
 *    Pure revision quiz navigation, selection, and retry-display helpers.
 * ROLE IN PROJECT:
 *    Page-owned ephemeral UI state stays separate from authoritative attempts.
 * KEY COMPONENTS:
 *    - revisionQuizReducer: Immutable UI changes
 *    - selectRevisionQuizResult: Identity and option compatibility boundary
 *    - getRevisionQuizView: Restored feedback versus editable retry inputs
 * ============================================================================
 */
import type { QuizCard, RevisionQuizAttemptResult } from '@/types/learning';

export interface RevisionQuizUiState {
  currentQuizIndex: number;
  selections: Partial<Record<number, string[]>>;
  retryAttemptIds: Partial<Record<number, string>>;
}
export type RevisionQuizUiAction =
  | { type: 'navigate'; quizIndex: number; quizCount: number }
  | { type: 'select'; quizIndex: number; optionIds: string[] }
  | { type: 'retry'; result: RevisionQuizAttemptResult };
export interface RevisionQuizRequestState {
  isPending: boolean;
  error?: string;
}
export type RevisionQuizRequestStates = Partial<Record<number, RevisionQuizRequestState>>;

export function createRevisionQuizState(): RevisionQuizUiState {
  return { currentQuizIndex: 0, selections: {}, retryAttemptIds: {} };
}
export function revisionQuizReducer(
  state: RevisionQuizUiState, action: RevisionQuizUiAction,
): RevisionQuizUiState {
  switch (action.type) {
    case 'navigate':
      return { ...state, currentQuizIndex: Math.max(0,
        Math.min(action.quizIndex, Math.max(0, action.quizCount - 1))) };
    case 'select':
      return { ...state, selections: { ...state.selections,
        [action.quizIndex]: [...new Set(action.optionIds)] } };
    case 'retry':
      if (action.result.is_correct) return state;
      return { ...state,
        selections: { ...state.selections, [action.result.quiz_index]: [] },
        retryAttemptIds: { ...state.retryAttemptIds,
          [action.result.quiz_index]: action.result.id },
      };
  }
}
export function selectRevisionQuizResult(
  results: RevisionQuizAttemptResult[], revisionId: string | undefined,
  nodeId: string, quizIndex: number, quiz: QuizCard,
): RevisionQuizAttemptResult | undefined {
  const availableIds = new Set(quiz.options.map((option) => option.option_id));
  return results.find((result) =>
    (revisionId === undefined || result.revision_session_id === revisionId) &&
    result.node_id === nodeId && result.quiz_index === quizIndex &&
    result.selected_option_ids.every((id) => availableIds.has(id)) &&
    result.correct_option_ids.every((id) => availableIds.has(id)),
  );
}
export function getRevisionQuizView(
  state: RevisionQuizUiState, quizIndex: number, result?: RevisionQuizAttemptResult,
): { selectedOptionIds: string[]; showFeedback: boolean } {
  const showFeedback = result !== undefined && state.retryAttemptIds[quizIndex] !== result.id;
  return {
    selectedOptionIds: showFeedback && result
      ? result.selected_option_ids : state.selections[quizIndex] ?? [],
    showFeedback,
  };
}
