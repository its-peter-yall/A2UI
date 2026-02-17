/**
 * ============================================================================
 * FILE: LearningPage.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Main learning page component that displays an interactive learning path for
 * a specific session. Handles session routing via URL parameters, displays real-time
 * progress tracking, and celebrates course completion with an accessible modal.
 * 
 * KEY COMPONENTS:
 * - LearningPage: Main page wrapper with header navigation and completion modal
 * - Completion Modal: Accessible overlay celebrating course mastery with animation
 * - Progress Integration: Syncs with LearningPathContainer via refetch for progress bar
 * 
 * DEPENDENCIES:
 * - react-router-dom: URL parameter parsing and navigation
 * - @tanstack/react-query: Session data fetching with auto-refresh
 * - framer-motion: Celebration animation (respects prefers-reduced-motion)
 * 
 * USAGE PATTERN:
 * ```tsx
 * // Route: /learn/:sessionId
 * // When sessionId is missing, shows "Start Learning" button to /learn
 * // When all nodes are COMPLETED, shows celebration modal
 * 
 * <LearningPage />
 * ```
 * 
 * ERROR HANDLING:
 * - Missing sessionId: Renders "No session ID provided" with navigation link
 * - Session not found: Redirect handled by LearningPathContainer error states
 * 
 * PERFORMANCE NOTES:
 * - Session refetch interval (2s) ensures progress bar stays in sync
 * - Modal focus management preserves keyboard focus state
 * - Animation disabled for users with prefers-reduced-motion
 * 
 * RELATED FILES:
 * - LearningPathContainer.tsx: Renders the actual learning path carousel
 * - ProgressBar.tsx: Displays completion progress (synced via refetch)
 * - MasteryCelebration.tsx: Animation component for completion
 * 
 * NOTES:
 * - Route: /learn/:sessionId
 * - Best practices: prefers-reduced-motion, non-blocking modal, focus management
 * - Keyboard accessible: Escape key dismisses completion modal
 * ============================================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { LearningPathContainer } from './LearningPathContainer';
import { getLearningSession } from '@/lib/learningApi';
import { cn } from '@/lib/utils';

export function LearningPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Fetch session for progress bar
  const { data: session, refetch, isError, error: sessionError } = useQuery({
    queryKey: ['learningSession', sessionId],
    queryFn: () => getLearningSession(sessionId!),
    enabled: !!sessionId,
    staleTime: 60_000,
    // Refetch to sync progress bar with LearningPathContainer
    refetchInterval: 2000,
  });

  // Invalidate course list on unmount so dashboard is fresh
  useEffect(() => {
    return () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    };
  }, [queryClient]);

  // Flush last-active node with keepalive request on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionId && session?.last_active_node_id) {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const url = `${baseUrl}/learning/sessions/${sessionId}/last-active`;
        void fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ node_id: session.last_active_node_id }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionId, session?.last_active_node_id]);

  // Show resume banner when session has a last active node
  useEffect(() => {
    if (session?.last_active_node_id) {
      queueMicrotask(() => setShowResumeBanner(true));
      const timer = setTimeout(() => setShowResumeBanner(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [session?.last_active_node_id]);

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

  // Handle session not found (404)
  const isNotFound =
    isError &&
    axios.isAxiosError(sessionError) &&
    sessionError.response?.status === 404;

  if (isNotFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-xl font-semibold">Course not found</p>
        <p className="text-muted-foreground">
          This course doesn&apos;t exist or has been removed.
        </p>
        <Link
          to="/learn"
          className={cn(
            'flex items-center gap-2 text-primary hover:text-primary/80 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
          )}
        >
          ← Dashboard
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
              onClick={() => navigate('/learn')}
              className={cn(
                'flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
              )}
              aria-label="Go to dashboard"
            >
              <span aria-hidden="true">←</span>
              <span>Dashboard</span>
            </button>
            {session?.course_title && (
              <h1 className="text-sm font-medium text-foreground truncate max-w-xs">
                {session.course_title}
              </h1>
            )}
            <nav className="flex items-center gap-4" aria-label="Main navigation">
              <Link
                to="/learn?new=true"
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

      {/* Resume banner */}
      {showResumeBanner && (
        <div className="bg-primary/10 text-primary text-sm text-center py-1.5 px-4 animate-in fade-in duration-300">
          Resuming where you left off...
        </div>
      )}

      {/* Main content */}
      <main className="py-8">
        <LearningPathContainer
          sessionId={sessionId}
          session={session ?? undefined}
          initialNodeId={session?.last_active_node_id ?? undefined}
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
