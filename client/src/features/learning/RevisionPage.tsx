// RevisionPage.tsx
// Main page for revision mode, displaying concept cards in either
// full_review or quiz_only mode with revision-specific progress tracking.

// @see: LearningPage.tsx (original learning page)
// @see: RevisionConceptCard.tsx (revision card component)
// @see: useRevisionSession.ts, useRevisionMutations.ts (hooks)

import { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { getLearningSession } from '@/lib/learningApi';
import { useRevisionSession } from './useRevisionSession';
import { useRevisionMutations } from './useRevisionMutations';
import { RevisionConceptCard } from './RevisionConceptCard';
import { cn } from '@/lib/utils';
import {
  carouselSlideVariants,
  carouselSlideReducedMotionVariants,
  prefersReducedMotion,
} from './animations';
import { LoadingState, ErrorState } from './ErrorStates';
import type { RevisionNodeProgressWithDetails } from '@/types/learning';

export function RevisionPage() {
  const { sessionId, revisionId } = useParams<{
    sessionId: string;
    revisionId: string;
  }>();
  const navigate = useNavigate();

  // Carousel state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  // Fetch original session for node content/quizzes
  const {
    data: originalSession,
    isLoading: isLoadingOriginal,
    isError: isOriginalError,
    error: originalError,
  } = useQuery({
    queryKey: ['learningSession', sessionId],
    queryFn: () => getLearningSession(sessionId!),
    enabled: !!sessionId,
    staleTime: 60_000,
  });

  // Fetch revision session for progress
  const {
    data: revisionSession,
    isLoading: isLoadingRevision,
    isError: isRevisionError,
    error: revisionError,
  } = useRevisionSession(revisionId ?? '');

  // Revision mutations
  const {
    markReviewed,
    submitAnswer,
    isMarkingReviewed,
    isSubmitting,
    isAnyLoading,
  } = useRevisionMutations({
    revisionId: revisionId ?? '',
    onError: (error, context) => {
      console.error(`Revision mutation error (${context}):`, error);
    },
  });

  // Carousel navigation
  const goToSlide = useCallback(
    (index: number) => {
      if (!originalSession) return;
      const clamped = Math.max(
        0,
        Math.min(index, originalSession.nodes.length - 1)
      );
      const dir = clamped > currentIndex ? 1 : clamped < currentIndex ? -1 : 0;
      setDirection(dir);
      setCurrentIndex(clamped);
    },
    [originalSession, currentIndex]
  );

  const canGoNext = originalSession
    ? currentIndex < originalSession.nodes.length - 1
    : false;
  const canGoPrev = currentIndex > 0;

  // Loading state
  if (!sessionId || !revisionId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Missing session or revision ID</p>
        <Link
          to="/learn"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (isLoadingOriginal || isLoadingRevision) {
    return <LoadingState message="Loading revision session..." />;
  }

  // Error states
  const error = originalError || revisionError;
  const isNotFound =
    (isOriginalError || isRevisionError) &&
    axios.isAxiosError(error) &&
    error.response?.status === 404;

  if (isNotFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-xl font-semibold">Revision not found</p>
        <p className="text-muted-foreground">
          This revision session doesn&apos;t exist or has been removed.
        </p>
        <Link
          to="/learn"
          className="text-primary hover:text-primary/80 transition-colors"
        >
          &larr; Dashboard
        </Link>
      </div>
    );
  }

  if (isOriginalError || isRevisionError) {
    return (
      <ErrorState
        title="Failed to load revision"
        message="We couldn't load the revision data. Please try again."
        showHomeLink
      />
    );
  }

  if (!originalSession || !revisionSession) {
    return (
      <ErrorState
        title="No data available"
        message="Session or revision data is missing."
        showHomeLink
      />
    );
  }

  // Build a map of node_id -> revision progress
  const revisionProgressMap = new Map<string, RevisionNodeProgressWithDetails>();
  for (const nodeProgress of revisionSession.nodes) {
    revisionProgressMap.set(nodeProgress.node_id, nodeProgress);
  }

  // Determine header text based on mode
  const modeIcon = revisionSession.mode === 'full_review' ? '\uD83D\uDCD6' : '\uD83D\uDCDD';
  const modeLabel =
    revisionSession.mode === 'full_review' ? 'Full Review' : 'Quiz Only';
  const headerTitle = `${modeIcon} Revision #${revisionSession.revision_number} \u2014 ${modeLabel}`;

  // Calculate revision-specific progress
  const totalNodes = revisionSession.nodes.length;
  const completedNodes = revisionSession.nodes.filter(
    (n) =>
      n.status === 'reviewed' ||
      n.status === 'quiz_passed' ||
      n.status === 'quiz_failed'
  ).length;
  const progressPercent =
    totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

  const currentNode = originalSession.nodes[currentIndex];
  const currentRevisionProgress = currentNode
    ? revisionProgressMap.get(currentNode.id)
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate('/learn')}
              className={cn(
                'flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
              )}
              aria-label="Go to dashboard"
              data-testid="back-to-dashboard"
            >
              <span aria-hidden="true">&larr;</span>
              <span>Dashboard</span>
            </button>
            <h1
              className="text-sm font-medium text-foreground truncate max-w-xs"
              data-testid="revision-header"
            >
              {headerTitle}
            </h1>
            <div className="w-24" /> {/* Spacer for alignment */}
          </div>

          {/* Revision progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Revision Progress</span>
              <span>
                {completedNodes} / {totalNodes} completed
              </span>
            </div>
            <div
              className="h-2 bg-muted rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Revision progress: ${progressPercent}% complete`}
              data-testid="revision-progress-bar"
            >
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Node step indicators */}
          <nav aria-label="Revision progress" className="mt-2">
            <ol className="flex items-center gap-1 list-none p-0 m-0">
              {originalSession.nodes.map((node, index) => {
                const progress = revisionProgressMap.get(node.id);
                const isCurrent = index === currentIndex;
                const stepColor = getRevisionStepColor(progress?.status);

                return (
                  <li key={node.id} className="flex-1">
                    <button
                      onClick={() => goToSlide(index)}
                      aria-current={isCurrent ? 'step' : undefined}
                      aria-label={`${node.title}: ${progress?.status ?? 'pending'}`}
                      title={`${node.title} (${progress?.status ?? 'pending'})`}
                      className={cn(
                        'w-full h-2 rounded-full transition-colors duration-200 cursor-pointer hover:opacity-80',
                        stepColor,
                        isCurrent && 'ring-2 ring-offset-1 ring-primary',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                      )}
                    />
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="py-8">
        <div className="flex flex-col gap-6 p-4 max-w-4xl mx-auto">
          {/* Course title */}
          <header className="text-center">
            <h2 className="text-2xl font-bold">
              {originalSession.course_title}
            </h2>
          </header>

          {/* Slide counter */}
          <div className="flex justify-center text-sm text-muted-foreground">
            <span>
              Topic {currentIndex + 1} of {originalSession.nodes.length}
            </span>
          </div>

          {/* Carousel */}
          <div
            className="relative overflow-hidden"
            role="region"
            aria-roledescription="carousel"
            aria-label="Revision carousel"
          >
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              {currentNode && currentRevisionProgress && (
                <motion.div
                  key={currentNode.id}
                  custom={direction}
                  variants={
                    prefersReducedMotion()
                      ? carouselSlideReducedMotionVariants
                      : carouselSlideVariants
                  }
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="w-full relative"
                >
                  <RevisionConceptCard
                    node={currentNode}
                    revisionMode={revisionSession.mode}
                    revisionProgress={currentRevisionProgress}
                    onMarkReviewed={markReviewed}
                    onQuizSubmit={submitAnswer}
                    isMarkingReviewed={isMarkingReviewed}
                    isSubmitting={isSubmitting}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => goToSlide(currentIndex - 1)}
              disabled={!canGoPrev}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                canGoPrev
                  ? 'text-muted-foreground hover:bg-muted'
                  : 'opacity-0 pointer-events-none'
              )}
            >
              &larr; Previous
            </button>
            <button
              onClick={() => goToSlide(currentIndex + 1)}
              disabled={!canGoNext}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                canGoNext
                  ? 'text-muted-foreground hover:bg-muted'
                  : 'opacity-0 pointer-events-none'
              )}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </main>

      {/* Loading overlay for mutations */}
      {isAnyLoading && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
          <span className="text-sm text-muted-foreground">Updating...</span>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        <p>Revision mode &mdash; your original progress is preserved</p>
      </footer>
    </div>
  );
}

/**
 * Get step indicator color for revision node status.
 */
function getRevisionStepColor(
  status?: string
): string {
  switch (status) {
    case 'reviewed':
    case 'quiz_passed':
      return 'bg-green-500';
    case 'quiz_failed':
      return 'bg-red-500';
    case 'pending':
    default:
      return 'bg-muted-foreground/30';
  }
}
