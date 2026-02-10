// LearningPage.tsx
// Main learning page with routing, progress, and navigation

// Page component that displays the learning path for a session.
// Handles routing via sessionId param, shows progress bar,
// and celebrates course completion.

// @see: client/src/features/learning/LearningPathContainer.tsx
// @note: Route: /learn/:sessionId

// Best practices applied:
// - prefers-reduced-motion for celebration animation
// - Non-blocking modal (user can dismiss immediately)
// - Focus management for accessibility
// - Keyboard accessible navigation

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LearningPathContainer } from './LearningPathContainer';
import { getLearningSession } from '@/lib/learningApi';
import { cn } from '@/lib/utils';

export function LearningPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Fetch session for progress bar
  const { data: session, refetch } = useQuery({
    queryKey: ['learningSession', sessionId],
    queryFn: () => getLearningSession(sessionId!),
    enabled: !!sessionId,
    // Refetch to sync progress bar with LearningPathContainer
    refetchInterval: 2000,
  });

  // Check for course completion
  const isComplete =
    session?.nodes &&
    session.nodes.length > 0 &&
    session.nodes.every((n) => n.status === 'COMPLETED');

  const showCompletion = Boolean(
    sessionId && isComplete && dismissedSessionId !== sessionId
  );

  // Focus management for modal
  useEffect(() => {
    if (showCompletion && modalRef.current) {
      if (!previousFocusRef.current) {
        previousFocusRef.current = document.activeElement as HTMLElement;
      }
      modalRef.current.focus();
    } else if (!showCompletion && previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [showCompletion]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCompletion) {
        setDismissedSessionId(sessionId ?? null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sessionId, showCompletion]);

  const closeCompletionModal = useCallback(() => {
    setDismissedSessionId(sessionId ?? null);
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">No session ID provided</p>
        <Link
          to="/learn"
          className={cn(
            'px-4 py-2 bg-primary text-primary-foreground rounded-md',
            'hover:bg-primary/90 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
          )}
        >
          Start Learning
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with navigation */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate(-1)}
              className={cn(
                'flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
              )}
              aria-label="Go back"
            >
              <span aria-hidden="true">←</span>
              <span>Back</span>
            </button>
            <nav className="flex items-center gap-4" aria-label="Main navigation">
              <Link
                to="/learn"
                className={cn(
                  'text-sm text-muted-foreground hover:text-foreground transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
                )}
              >
                New Topic
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="py-8">
        <LearningPathContainer
          sessionId={sessionId}
          onCourseGenerated={(session) => {
            document.title = `Learn: ${session.course_title}`;
            // Refetch to update progress bar
            refetch();
          }}
        />
      </main>

      {/* Course completion overlay - accessible modal */}
      {showCompletion && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="completion-title"
          aria-describedby="completion-description"
          onClick={closeCompletionModal}
        >
          <div
            ref={modalRef}
            tabIndex={-1}
            className={cn(
              'bg-card p-8 rounded-xl text-center max-w-md mx-4',
              !prefersReducedMotion && 'animate-in zoom-in-95 duration-300',
              'focus:outline-none'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Celebration emoji - hidden from screen readers */}
            <div className="text-6xl mb-4" aria-hidden="true">
              🎉
            </div>
            <h2 id="completion-title" className="text-2xl font-bold mb-2">
              Course Complete!
            </h2>
            <p id="completion-description" className="text-muted-foreground mb-6">
              Congratulations! You've mastered all {session?.nodes.length} topics.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={closeCompletionModal}
                className={cn(
                  'px-4 py-2 border rounded-md hover:bg-muted transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
                )}
              >
                Review Topics
              </button>
              <Link
                to="/learn"
                className={cn(
                  'px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
                )}
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        <p>Powered by retrieval-based learning</p>
      </footer>
    </div>
  );
}
