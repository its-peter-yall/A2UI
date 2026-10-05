/**
 * ============================================================================
 * FILE: QuizResultDetails.tsx
 * LOCATION: client/src/features/learning/QuizResultDetails.tsx
 * ============================================================================
 * PURPOSE:
 *    Render quiz outcome and option-specific explanations without actions.
 * ROLE IN PROJECT:
 *    Shared presentation for normal learning and revision; callers own policy.
 * KEY COMPONENTS:
 *    - QuizResultDetails: Stable-ID disclosure and accessible result focus
 * ============================================================================
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { QuizCard, QuizSubmitResponse } from '@/types/learning';
import { cn } from '@/lib/utils';
import { InlineMarkdown, MarkdownRenderer } from './MarkdownRenderer';

export interface QuizResultDetailsProps {
  quiz: QuizCard;
  result: Pick<QuizSubmitResponse,
    'is_correct' | 'score_percent' | 'selected_option_ids' | 'correct_option_ids'>;
  attemptCount: number;
  headerAccessory?: ReactNode;
}

export function QuizResultDetails({
  quiz, result, attemptCount, headerAccessory,
}: QuizResultDetailsProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { headerRef.current?.focus(); }, [result]);
  const selected = new Set(result.selected_option_ids);
  const correct = new Set(result.is_correct ? result.correct_option_ids : []);
  return (
    <div className="space-y-6">
      <div ref={headerRef} tabIndex={-1} role="status" aria-label="Quiz result"
        aria-live="polite" aria-atomic="true" className={cn(
          'flex items-center gap-3 rounded-lg p-4 focus-visible:ring-2 focus-visible:ring-primary',
          result.is_correct
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
        )}>
        <span aria-hidden="true">{result.is_correct ? '✅' : '❌'}</span>
        <div>
          <p className="text-lg font-semibold">{result.is_correct ? 'Correct!' : 'Incorrect'}</p>
          <p className="text-sm">Attempt #{attemptCount} • Score: {result.score_percent}%</p>
          {!result.is_correct && quiz.question_type === 'multiple_choice' && (
            <p className="text-sm">Your selection is incorrect.</p>
          )}
        </div>
        {headerAccessory}
      </div>
      <MarkdownRenderer content={quiz.question_text} className="text-lg font-medium [&>div]:!mt-0" />
      <div className="space-y-3">
        {quiz.options.map((option) => {
          const isSelected = selected.has(option.option_id);
          const isCorrect = correct.has(option.option_id);
          const disclose = result.is_correct || isSelected;
          return (
            <div key={option.option_id} data-testid={`quiz-result-option-${option.option_id}`}
              className={cn('rounded-lg border-2 p-4',
                isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : !result.is_correct && isSelected
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-muted bg-muted/30',
              )}>
              <div className="flex items-start gap-3">
                <span className="shrink-0 font-mono">{option.display_label}.</span>
                <div className="flex-1 space-y-2">
                  <InlineMarkdown content={option.text} className="font-medium" />
                  {isSelected && <span className="ml-2 text-xs text-muted-foreground">Your answer</span>}
                  {result.is_correct && (
                    <p className="text-xs font-medium">{isCorrect ? 'Correct answer' : 'Distractor'}</p>
                  )}
                  {disclose && (
                    <div>
                      {!result.is_correct && <p className="text-xs font-medium">Selected option explanation</p>}
                      <MarkdownRenderer content={option.explanation} className="text-sm [&>div]:!mt-0" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
