/**
 * ============================================================================
 * FILE: RevisionQuizSection.tsx
 * LOCATION: client/src/features/learning/RevisionQuizSection.tsx
 * ============================================================================
 * PURPOSE:
 *    Controlled revision quiz inputs, navigation, feedback, and indicators.
 * ROLE IN PROJECT:
 *    Topic presentation consumes saved attempts and page-owned UI state.
 * KEY COMPONENTS:
 *    - RevisionQuizSection: Accessible controls with no mastery or requests
 * ============================================================================
 */
import type { QuizCard, RevisionQuizAttemptResult } from '@/types/learning';
import { cn } from '@/lib/utils';
import { InlineMarkdown, MarkdownRenderer } from './MarkdownRenderer';
import { QuizResultDetails } from './QuizResultDetails';
import { getRevisionQuizView, revisionQuizReducer, selectRevisionQuizResult } from './revisionQuizState';
import type { RevisionQuizUiState, RevisionQuizUiAction, RevisionQuizRequestStates } from './revisionQuizState';

export interface RevisionQuizSectionProps {
  revisionId?: string;
  nodeId: string;
  quizzes: QuizCard[];
  results: RevisionQuizAttemptResult[];
  state: RevisionQuizUiState;
  onStateChange: (next: RevisionQuizUiState) => void;
  onSubmit: (nodeId: string, optionIds: string[], quizIndex: number) => void;
  requestStates?: RevisionQuizRequestStates;
}
const controlClass = 'rounded-md border px-3 py-1.5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40';
export function RevisionQuizSection({
  revisionId, nodeId, quizzes, results, state, onStateChange, onSubmit, requestStates = {},
}: RevisionQuizSectionProps) {
  const index = Math.max(0, Math.min(state.currentQuizIndex, quizzes.length - 1));
  const quiz = quizzes[index];
  if (!quiz) return <p className="py-4 text-center text-muted-foreground">No quiz available for this topic.</p>;
  const result = selectRevisionQuizResult(results, revisionId, nodeId, index, quiz);
  const { selectedOptionIds, showFeedback } = getRevisionQuizView(state, index, result);
  const request = requestStates[index];
  const pending = request?.isPending ?? false;
  const selected = new Set(selectedOptionIds);
  const change = (action: RevisionQuizUiAction) => onStateChange(revisionQuizReducer(state, action));
  const navigate = (quizIndex: number) => change({ type: 'navigate', quizIndex, quizCount: quizzes.length });
  const questionId = `revision-quiz-question-${nodeId}-${index}`;
  return (
    <section className="mt-4 space-y-4 border-t pt-4" aria-label="Revision quizzes" data-testid="revision-quiz-section">
      <nav className="flex flex-wrap items-center gap-2" aria-label="Quiz navigation">
        <button type="button" aria-label="Previous quiz" className={controlClass}
          disabled={index === 0} onClick={() => navigate(index - 1)}>← Previous Quiz</button>
        <span className="text-sm text-muted-foreground">Quiz {index + 1} of {quizzes.length}</span>
        <div className="flex gap-1" role="group" aria-label="Quiz results">
          {quizzes.map((card, quizIndex) => {
            const saved = selectRevisionQuizResult(results, revisionId, nodeId, quizIndex, card);
            const outcome = saved ? saved.is_correct ? 'correct' : 'incorrect' : 'unanswered';
            return <button key={quizIndex} type="button" aria-label={`Quiz ${quizIndex + 1}: ${outcome}`}
              title={`Quiz ${quizIndex + 1}: ${outcome}`} aria-current={index === quizIndex ? 'step' : undefined}
              onClick={() => navigate(quizIndex)} className={cn(
                'h-7 min-w-7 rounded-full px-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary',
                saved ? saved.is_correct ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                  : 'bg-muted text-muted-foreground',
                index === quizIndex && 'ring-2 ring-primary ring-offset-1',
              )}>{quizIndex + 1}</button>;
          })}
        </div>
        <button type="button" aria-label="Next quiz" className={controlClass}
          disabled={index === quizzes.length - 1} onClick={() => navigate(index + 1)}>Next Quiz →</button>
      </nav>
      {showFeedback && result ? (
        <>
          <QuizResultDetails quiz={quiz} result={result} attemptCount={result.quiz_attempt_count} />
          {!result.is_correct && <button type="button" className={controlClass}
            disabled={pending} onClick={() => change({ type: 'retry', result })}>Try Again</button>}
        </>
      ) : (
        <>
          <div id={questionId}><MarkdownRenderer content={quiz.question_text} className="text-lg font-medium [&>div]:!mt-0" /></div>
          <fieldset disabled={pending} className="space-y-2" aria-describedby={questionId}
            role={quiz.question_type === 'multiple_choice' ? 'group' : 'radiogroup'}>
            <legend className="sr-only">Quiz options</legend>
            {quiz.options.map((option) => <label key={option.option_id} className={cn(
              'flex cursor-pointer items-center gap-3 rounded-md border p-3',
              selected.has(option.option_id) ? 'border-primary bg-primary/10' : 'border-muted hover:border-primary/50',
            )}>
              <input type={quiz.question_type === 'multiple_choice' ? 'checkbox' : 'radio'}
                name={`revision-quiz-${nodeId}-${index}`} value={option.option_id}
                checked={selected.has(option.option_id)} onChange={(event) => {
                  const ids = quiz.question_type === 'single_choice' ? [option.option_id]
                    : event.target.checked ? [...selectedOptionIds, option.option_id]
                      : selectedOptionIds.filter((id) => id !== option.option_id);
                  change({ type: 'select', quizIndex: index, optionIds: ids });
                }} className="h-4 w-4 focus-visible:ring-2 focus-visible:ring-primary" />
              <span className="font-mono text-sm text-muted-foreground">{option.display_label}.</span>
              <InlineMarkdown content={option.text} />
            </label>)}
          </fieldset>
          <button type="button" data-testid="revision-quiz-submit"
            disabled={selectedOptionIds.length === 0 || pending} onClick={() => {
              if (selectedOptionIds.length > 0 && !pending) onSubmit(nodeId, [...selectedOptionIds], index);
            }} className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            {pending ? 'Submitting...' : 'Submit Answer'}
          </button>
        </>
      )}
      {request?.error && <div role="alert" className="text-sm text-destructive">{request.error}</div>}
      {!showFeedback && result && request?.error && (
        <details open className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Previous saved feedback</summary>
          <QuizResultDetails quiz={quiz} result={result} attemptCount={result.quiz_attempt_count} />
        </details>
      )}
      {quizzes.length > 1 && <button type="button" aria-label="Skip quiz" className={controlClass}
        disabled={index === quizzes.length - 1} onClick={() => navigate(index + 1)}>Skip / Next Quiz →</button>}
    </section>
  );
}
