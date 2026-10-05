/**
 * ============================================================================
 * FILE: RevisionConceptCard.tsx
 * LOCATION: client/src/features/learning/RevisionConceptCard.tsx
 * ============================================================================
 * PURPOSE:
 *    Mode-aware revision topic card with controlled quiz section, curiosity
 *    callbacks, citations, and an explicit reading review action.
 *
 * ROLE IN PROJECT:
 *    Replaces ConceptCard presentation inside revision sessions. Full Review
 *    shows explanation, curiosity questions, citations, Mark as Reviewed, and
 *    quizzes in order; Practice is quiz-only. Consumes page-owned controlled
 *    quiz UI state and authoritative saved attempts via RevisionQuizSection,
 *    forwarding chat and submission actions upward without owning requests,
 *    status transitions, or mastery policy.
 *
 * KEY COMPONENTS:
 *    - RevisionConceptCard: Neutral-border card with mode layout and badges
 *    - Legacy quizResult bridge: additive single-result override per index
 *    - RevisionQuizSection (delegated): Controlled quizzes and indicators
 *
 * DEPENDENCIES:
 *    - External: react
 *    - Internal: @/types/learning, ./MarkdownRenderer, ./CuriositySpark,
 *                ./curiosityParser, ./SourceCitations, ./RevisionQuizSection,
 *                ./revisionQuizState
 *
 * USAGE:
 *    <RevisionConceptCard
 *      node={conceptNode}
 *      revisionMode="full_review"
 *      revisionProgress={progressData}
 *      revisionId={revisionId}
 *      quizState={stateByNode[node.id]}
 *      onQuizStateChange={setNodeState}
 *      onMarkReviewed={handleMarkReviewed}
 *      onQuizSubmit={handleQuizSubmit}
 *    />
 * ============================================================================
 */

import { useState } from 'react';
import type { ConceptNode, RevisionMode, RevisionNodeProgressWithDetails,
  RevisionQuizAttemptResult, RevisionQuizResponse } from '@/types/learning';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CuriositySpark } from './CuriositySpark';
import { parseCuriosityQuestions } from './curiosityParser';
import { SourceCitations } from './SourceCitations';
import { RevisionQuizSection } from './RevisionQuizSection';
import { createRevisionQuizState } from './revisionQuizState';
import type { RevisionQuizUiState, RevisionQuizRequestStates } from './revisionQuizState';

export interface RevisionConceptCardProps {
  node: ConceptNode;
  revisionMode: RevisionMode;
  revisionProgress: RevisionNodeProgressWithDetails;
  onMarkReviewed: (nodeId: string) => void;
  onQuizSubmit: (nodeId: string, optionIds: string[], quizIndex?: number) => void;
  isMarkingReviewed?: boolean;
  isSubmitting?: boolean;
  quizResult?: RevisionQuizResponse;
  revisionId?: string;
  quizState?: RevisionQuizUiState;
  onQuizStateChange?: (next: RevisionQuizUiState) => void;
  quizResults?: RevisionQuizAttemptResult[];
  quizRequestStates?: RevisionQuizRequestStates;
  markReviewedError?: string;
  selectedHeadingIds?: string[];
  onToggleHeadingChat?: (headingId: string) => void;
  onAskQuestion?: (question: string) => void;
}
export function RevisionConceptCard({
  node, revisionMode, revisionProgress, onMarkReviewed, onQuizSubmit,
  isMarkingReviewed = false, isSubmitting = false, quizResult, revisionId,
  quizState, onQuizStateChange, quizResults, quizRequestStates, markReviewedError,
  selectedHeadingIds = [], onToggleHeadingChat, onAskQuestion,
}: RevisionConceptCardProps) {
  const [fallbackState, setFallbackState] = useState(createRevisionQuizState);
  const state = quizState ?? fallbackState;
  const updateState = onQuizStateChange ?? setFallbackState;
  const quizzes = node.quiz_set ? node.quiz_set.quizzes : node.quiz ? [node.quiz] : [];
  const restoredResults = quizResults ?? revisionProgress.quiz_results;
  const acceptsLegacy = quizResult !== undefined && quizResult.node_id === node.id &&
    (revisionId === undefined || quizResult.revision_session_id === revisionId);
  const results = acceptsLegacy && quizResult
    ? [quizResult, ...restoredResults.filter((result) => result.quiz_index !== quizResult.quiz_index)]
    : restoredResults;
  const readingDone = revisionProgress.content_reviewed_at !== null;
  const practiceDone = quizzes.length > 0 &&
    (revisionProgress.status === 'quiz_passed' || revisionProgress.status === 'quiz_failed');
  const badge = revisionMode === 'full_review' ? readingDone ? 'Reviewed' : 'Reading pending'
    : quizzes.length === 0 ? 'No practice quiz' : practiceDone ? 'Practice finished' : 'Practice pending';
  const parsed = revisionMode === 'full_review' && onAskQuestion
    ? parseCuriosityQuestions(node.content_markdown)
    : { mainContent: node.content_markdown, questions: [] };
  const requests = quizRequestStates ?? {
    [state.currentQuizIndex]: { isPending: isSubmitting },
  };
  return (
    <article className="topic-card-content overflow-hidden rounded-lg border border-border bg-card"
      data-testid="revision-concept-card">
      <header className="flex items-center gap-3 border-b bg-card/50 p-4">
        <div className="flex-1">
          <h3 className="font-semibold">{node.title}</h3>
          <span className="text-xs text-muted-foreground">Topic #{node.sequence_index + 1}</span>
        </div>
        <span data-testid="revision-status-badge" className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {badge}
        </span>
      </header>
      <div className="p-4">
        {revisionMode === 'full_review' && (
          <div className="space-y-4" data-testid="revision-full-review-content">
            <MarkdownRenderer content={parsed.mainContent} selectedHeadingIds={selectedHeadingIds}
              onToggleHeadingChat={onToggleHeadingChat} enableHeadingChat={onToggleHeadingChat !== undefined} />
            {parsed.questions.length > 0 && onAskQuestion && (
              <CuriositySpark questions={parsed.questions} onAskQuestion={onAskQuestion} />
            )}
            <SourceCitations citations={node.citations ?? []} />
            {!readingDone && <div className="flex justify-end border-t pt-4">
              <button type="button" data-testid="mark-reviewed-button" disabled={isMarkingReviewed}
                onClick={() => onMarkReviewed(node.id)}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
                {isMarkingReviewed ? 'Marking...' : 'Mark as Reviewed'}
              </button>
            </div>}
            {markReviewedError && <p role="alert" className="text-sm text-destructive">{markReviewedError}</p>}
          </div>
        )}
        <div data-testid={revisionMode === 'quiz_only' ? 'revision-quiz-only-content' : 'revision-full-review-quizzes'}>
          {revisionMode === 'quiz_only' && <p className="mb-2 text-sm text-muted-foreground">Test your knowledge on this topic:</p>}
          <RevisionQuizSection revisionId={revisionId} nodeId={node.id} quizzes={quizzes}
            results={results} state={state} onStateChange={updateState} onSubmit={onQuizSubmit}
            requestStates={requests} />
        </div>
      </div>
    </article>
  );
}
