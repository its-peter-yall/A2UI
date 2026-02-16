/**
 * ============================================================================
 * FILE: LearningPathContainer.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Smart container component that orchestrates the entire learning path experience.
 * Handles session loading, course generation mutations, carousel navigation between
 * nodes, quiz result tracking, and celebration animations. The central hub that
 * connects all learning feature components together.
 * 
 * KEY COMPONENTS:
 * - LearningPathContainer: Main orchestrator managing state for carousel, sessions, celebrations
 * - Carousel Navigation: Keyboard (arrow keys) and click-based slide navigation
 * - Session Management: Loads existing sessions or auto-generates new courses
 * - Error Recovery: Comprehensive error states with retry capabilities
 * - Toast System: Displays transient error messages via useErrorToast hook
 * 
 * DEPENDENCIES:
 * - @tanstack/react-query: Session queries and mutations with optimistic updates
 * - framer-motion: Carousel slide animations and MasteryCelebration overlay
 * - axios: HTTP client with AxiosError type guards for error handling
 * - learningApi: generateCourse and getLearningSession API functions
 * 
 * USAGE PATTERN:
 * ```tsx
 * // Load existing session
 * <LearningPathContainer sessionId="session-123" />
 * 
 * // Generate new course from query
 * <LearningPathContainer query="Machine Learning Basics" userId="user-1" />
 * 
 * // With completion callback
 * <LearningPathContainer
 *   sessionId={sessionId}
 *   onCourseGenerated={(session) => document.title = `Learn: ${session.course_title}`}
 * />
 * ```
 * 
 * ERROR HANDLING:
 * - 404 Not Found: Shows NotFoundState component
 * - Generation Failure: Shows ErrorState with retry option
 * - All Nodes Error: Special state when every node failed to generate
 * - Mutation Errors: Extracted from axios response and displayed via toast
 * 
 * PERFORMANCE NOTES:
 * - Microtask scheduling (queueMicrotask) avoids synchronous setState in effects
 * - Session initialization tracking prevents aggressive auto-advancing
 * - Refs maintain carousel state per session for session switching
 * - Carousel direction tracking enables smooth slide animations
 * 
 * RELATED FILES:
 * - ConceptCard.tsx: Renders individual concept nodes with all states
 * - ProgressBar.tsx: Shows progress with clickable node navigation
 * - useLearningMutations.ts: Handles all mutation logic with optimistic updates
 * - useErrorToast.tsx: Toast notification system for errors
 * - ErrorStates.tsx: Reusable error/loading/empty state components
 * - MasteryCelebration.tsx: Animation overlay for topic/course completion
 * 
 * NOTES:
 * - Requires sessionId prop OR query prop for new course generation
 * - Auto-generates when query provided but no sessionId
 * - Keyboard navigation: Left/Right arrows navigate slides
 * - Sequential flow: Only one node active at a time (first non-COMPLETED, non-LOCKED)
 * ============================================================================
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import type { LearningSessionWithNodes, QuizSubmitResponse } from '@/types/learning';
import { generateCourse, getLearningSession, updateLastActiveNode } from '@/lib/learningApi';
import { ConceptCard } from './ConceptCard';
import { LearningErrorBoundary } from './LearningErrorBoundary';
import { MasteryCelebration } from './animations/MasteryCelebration';
import { ProgressBar } from './ProgressBar';
import {
  carouselSlideVariants,
  carouselSlideReducedMotionVariants,
  prefersReducedMotion,
} from './animations';
import {
  EmptyState,
  ErrorState,
  GeneratingState,
  LoadingState,
  NotFoundState,
} from './ErrorStates';
import { ToastContainer, useErrorToast } from './useErrorToast';
import { useLearningMutations } from './useLearningMutations';

interface LearningPathContainerProps {
  /** Existing session ID to load */
  sessionId?: string;
  /** Query to generate new course (if no sessionId) */
  query?: string;
  /** Optional user ID for new sessions */
  userId?: string;
  /** Initial node ID to scroll to on first load */
  initialNodeId?: string;
  /** Callback when course generation completes */
  onCourseGenerated?: (session: LearningSessionWithNodes) => void;
}

type CelebrationState = {
  active: boolean;
  nodeId?: string;
  topicTitle?: string;
  isCourseComplete: boolean;
};

export function LearningPathContainer({
  sessionId,
  query,
  userId,
  initialNodeId,
  onCourseGenerated,
}: LearningPathContainerProps) {
  const queryClient = useQueryClient();
  const [generatedSessionId, setGeneratedSessionId] = useState<string | undefined>(
    undefined
  );
  const activeSessionId = sessionId ?? generatedSessionId;
  const activeSessionKey = activeSessionId ?? 'new';
  const { toasts, showError, dismissToast } = useErrorToast();

  // Track quiz results for feedback display
  const [quizResultsBySession, setQuizResultsBySession] = useState<
    Record<string, Record<string, QuizSubmitResponse>>
  >({});
  const quizResults = quizResultsBySession[activeSessionKey] ?? {};
  
  // Track celebration state
  const [celebrationBySession, setCelebrationBySession] = useState<
    Record<string, CelebrationState>
  >({});
  const celebration = celebrationBySession[activeSessionKey] ?? {
    active: false,
    isCourseComplete: false,
  };

  // Carousel state: track current slide index and navigation direction
  const [carouselStateBySession, setCarouselStateBySession] = useState<
    Record<string, { currentIndex: number; direction: number }>
  >({});
  const carouselState = carouselStateBySession[activeSessionKey] ?? {
    currentIndex: 0,
    direction: 0,
  };

  // Track initialized sessions and previous active node to prevent aggressive auto-advancing
  const initializedSessionsRef = useRef<Set<string>>(new Set());
  const previousActiveNodeIndexRef = useRef<number>(-1);

  // Highlight state for initial node glow effect
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced last-active tracking
  const lastActiveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNodeIdRef = useRef<string | null>(null);
  const lastFlushedNodeIdRef = useRef<string | null>(null);

  // Fetch existing session
  const {
    data: session,
    isLoading: isLoadingSession,
    isError: isSessionError,
    error: sessionError,
    refetch: refetchSession,
  } = useQuery({
    queryKey: ['learningSession', activeSessionId],
    queryFn: () => getLearningSession(activeSessionId ?? ''),
    enabled: !!activeSessionId,
    retry: (failureCount, error) => {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // Generate new course mutation
  const generateMutation = useMutation({
    mutationFn: generateCourse,
    onSuccess: (data) => {
      setGeneratedSessionId(data.id);
      queryClient.setQueryData(['learningSession', data.id], data);
      onCourseGenerated?.(data);
    },
  });

  const handleQuizResult = (result: QuizSubmitResponse) => {
    setQuizResultsBySession((prev) => ({
      ...prev,
      [activeSessionKey]: {
        ...(prev[activeSessionKey] ?? {}),
        [result.node_id]: result,
      },
    }));
  };

  const handleRetryNeeded = (nodeId: string, result: QuizSubmitResponse) => {
    setQuizResultsBySession((prev) => ({
      ...prev,
      [activeSessionKey]: {
        ...(prev[activeSessionKey] ?? {}),
        [nodeId]: result,
      },
    }));
  };

  const handleMutationError = (error: Error, context: string) => {
    console.error(`Mutation error (${context}):`, error);
    // Extract server error message if available
    const axiosError = error as { response?: { data?: { detail?: string } } };
    const serverMessage = axiosError?.response?.data?.detail;
    const displayMessage = serverMessage || `Failed to ${context}. Please try again.`;
    showError(displayMessage);
  };

  const {
    proceedToQuiz,
    submitAnswer,
    retry,
    continueToNext,
    regenerate,
    isAnyLoading,
    isRegenerating,
    isTransitioning,
  } = useLearningMutations({
    sessionId: activeSessionId ?? '',
    onQuizResult: handleQuizResult,
    onMasteryAchieved: (nodeId) => {
      const node = session?.nodes.find((n) => n.id === nodeId);
      const allOtherCompleted = session?.nodes
        .filter((n) => n.id !== nodeId)
        .every((n) => n.status === 'COMPLETED');
      
      setCelebrationBySession((prev) => ({
        ...prev,
        [activeSessionKey]: {
          active: true,
          nodeId,
          topicTitle: node?.title,
          isCourseComplete: allOtherCompleted || false,
        },
      }));
    },
    onRetryNeeded: handleRetryNeeded,
    onError: handleMutationError,
  });

  // Find the index of the active node (first non-completed, non-locked)
  const activeNodeIndex = session?.nodes.findIndex(
    (n) => n.status !== 'LOCKED' && n.status !== 'COMPLETED'
  ) ?? -1;
  const activeNodeId = activeNodeIndex >= 0 ? session?.nodes[activeNodeIndex]?.id : undefined;

  // Initialize carousel index to active node when session loads/changes
  // Also auto-advance when active node changes (e.g., after completing a topic)
  useEffect(() => {
    if (session && session.nodes.length > 0) {
      const fallbackIndex = activeNodeIndex >= 0 ? activeNodeIndex : 0;

      // Check if we haven't initialized this session yet
      if (!initializedSessionsRef.current.has(activeSessionKey)) {
        initializedSessionsRef.current.add(activeSessionKey);

        // Determine initial index: prefer initialNodeId if found
        let startIndex = fallbackIndex;
        if (initialNodeId) {
          const foundIndex = session.nodes.findIndex((n) => n.id === initialNodeId);
          if (foundIndex >= 0) {
            startIndex = foundIndex;
            // Trigger glow highlight on the initial node
            queueMicrotask(() => setHighlightNodeId(initialNodeId));
            if (highlightTimeoutRef.current) {
              clearTimeout(highlightTimeoutRef.current);
            }
            highlightTimeoutRef.current = setTimeout(() => {
              setHighlightNodeId(null);
              highlightTimeoutRef.current = null;
            }, 1500);
          }
          // If not found, fall back to activeNodeIndex (existing behavior)
        }

        previousActiveNodeIndexRef.current = activeNodeIndex;
        
        // Schedule state update in a microtask to avoid synchronous setState in effect
        queueMicrotask(() => {
          setCarouselStateBySession((prev) => ({
            ...prev,
            [activeSessionKey]: { currentIndex: startIndex, direction: 0 },
          }));
        });
      } else if (
        activeNodeIndex >= 0 &&
        activeNodeIndex !== previousActiveNodeIndexRef.current
      ) {
        // Only auto-advance if the active node index has ACTUALLY changed
        // This prevents locking the user to the active node during manual navigation
        previousActiveNodeIndexRef.current = activeNodeIndex;
        
        queueMicrotask(() => {
          const direction = activeNodeIndex > carouselState.currentIndex ? 1 : -1;
          setCarouselStateBySession((prev) => ({
            ...prev,
            [activeSessionKey]: { currentIndex: activeNodeIndex, direction },
          }));
        });
      }
    }
  }, [session, activeNodeIndex, activeSessionKey, carouselState.currentIndex, initialNodeId]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Flush pending last-active update to the server
  const flushLastActive = useCallback(() => {
    const nodeIdToFlush = pendingNodeIdRef.current;
    if (nodeIdToFlush && activeSessionId) {
      updateLastActiveNode(activeSessionId, nodeIdToFlush)
        .then(() => {
          lastFlushedNodeIdRef.current = nodeIdToFlush;
        })
        .catch((err) => console.error('Failed to update last active node:', err));
      pendingNodeIdRef.current = null;
    }
    if (lastActiveTimeoutRef.current) {
      clearTimeout(lastActiveTimeoutRef.current);
      lastActiveTimeoutRef.current = null;
    }
  }, [activeSessionId]);

  // Track carousel changes with debounce
  const currentNodeId = session?.nodes[carouselState.currentIndex]?.id;

  useEffect(() => {
    if (!currentNodeId || !activeSessionId) return;

    // Don't track during initial mount
    if (!initializedSessionsRef.current.has(activeSessionKey)) return;
    // Avoid duplicate scheduling when periodic refetches replace session arrays.
    if (
      pendingNodeIdRef.current === currentNodeId &&
      lastActiveTimeoutRef.current
    ) {
      return;
    }
    // Skip writes when this node is already persisted.
    if (lastFlushedNodeIdRef.current === currentNodeId) return;

    pendingNodeIdRef.current = currentNodeId;

    if (lastActiveTimeoutRef.current) {
      clearTimeout(lastActiveTimeoutRef.current);
    }

    lastActiveTimeoutRef.current = setTimeout(() => {
      flushLastActive();
    }, 2000);
  }, [currentNodeId, activeSessionId, activeSessionKey, flushLastActive]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      flushLastActive();
    };
  }, [flushLastActive]);

  // Carousel navigation functions
  const goToSlide = useCallback((index: number) => {
    if (!session) return;
    const clampedIndex = Math.max(0, Math.min(index, session.nodes.length - 1));
    const currentIndex = carouselState.currentIndex;
    const direction = clampedIndex > currentIndex ? 1 : clampedIndex < currentIndex ? -1 : 0;

    setCarouselStateBySession((prev) => ({
      ...prev,
      [activeSessionKey]: { currentIndex: clampedIndex, direction },
    }));
  }, [session, carouselState.currentIndex, activeSessionKey]);

  const goToNext = useCallback(() => {
    goToSlide(carouselState.currentIndex + 1);
  }, [goToSlide, carouselState.currentIndex]);

  const goToPrev = useCallback(() => {
    goToSlide(carouselState.currentIndex - 1);
  }, [goToSlide, carouselState.currentIndex]);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      
      // Also ignore if modifier keys are pressed (e.g. Alt+Left for browser back)
      if (isInput || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev]);

  // Get current slide node
  const currentSlideNode = session?.nodes[carouselState.currentIndex];
  const canGoNext = session ? carouselState.currentIndex < session.nodes.length - 1 : false;
  const canGoPrev = carouselState.currentIndex > 0;

  // Handle continue to next (manual button click, not auto-scroll)
  const handleContinueToNext = useCallback((nodeId: string) => {
    const nodeIndex = session?.nodes.findIndex((n) => n.id === nodeId) ?? -1;
    const nextNode = session?.nodes[nodeIndex + 1];
    
    // Always call continueToNext to complete the current node
    // Pass nextNode.id only if it exists
    continueToNext(nodeId, nextNode?.id);
  }, [session?.nodes, continueToNext]);

  // Handle celebration completion
  const handleCelebrationComplete = () => {
    setCelebrationBySession((prev) => ({
      ...prev,
      [activeSessionKey]: { active: false, isCourseComplete: false },
    }));
    // Note: We do NOT auto-advance here. The user must click
    // "Continue to Next Topic" in QuizFeedback to proceed.
  };

  // Auto-generate if query provided but no sessionId
  const shouldGenerate = !activeSessionId && !!query;
  const shouldAutoGenerate =
    shouldGenerate &&
    !generateMutation.isPending &&
    !generateMutation.isError &&
    !generateMutation.isSuccess;

  useEffect(() => {
    if (!shouldAutoGenerate || !query) {
      return;
    }
    generateMutation.mutate({ query, user_id: userId });
  }, [query, shouldAutoGenerate, userId, generateMutation]);

  const isGenerating =
    generateMutation.isPending ||
    (shouldGenerate && !generateMutation.data && !generateMutation.isError);

  if (isGenerating) {
    return (
      <>
        <GeneratingState />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (isLoadingSession) {
    return (
      <>
        <LoadingState message="Loading your learning session..." />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const error = sessionError || generateMutation.error;
  if (error) {
    const isGenerateError = Boolean(generateMutation.error && !activeSessionId);
    const isNotFound =
      isSessionError &&
      axios.isAxiosError(error) &&
      error.response?.status === 404;

    if (isNotFound) {
      return (
        <>
          <NotFoundState type="session" />
          <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </>
      );
    }

    return (
      <>
        <ErrorState
          title={isGenerateError ? 'Failed to generate course' : 'Failed to load session'}
          message={
            isGenerateError
              ? "We couldn't generate your learning path. Please try again."
              : "We couldn't load your learning session. Please try again."
          }
          onRetry={() => {
            if (activeSessionId) {
              refetchSession();
              return;
            }
            if (query) {
              generateMutation.mutate({ query, user_id: userId });
            }
          }}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <NotFoundState type="session" />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (session.nodes.length === 0) {
    return (
      <>
        <EmptyState
          title="No topics yet"
          message="This learning path doesn't have any topics."
          action={
            query
              ? {
                  label: 'Generate Topics',
                  onClick: () =>
                    generateMutation.mutate({ query, user_id: userId }),
                }
              : undefined
          }
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const allNodesError = session.nodes.every((node) => node.status === 'ERROR');
  if (allNodesError) {
    return (
      <>
        <ErrorState
          title="Generation failed"
          message="All topics failed to generate. Please try again."
          onRetry={() => {
            if (activeSessionId) {
              refetchSession();
              return;
            }
            if (query) {
              generateMutation.mutate({ query, user_id: userId });
            }
          }}
          showHomeLink
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Render learning path
  return (
    <>
      <LearningErrorBoundary
        onError={(boundaryError: Error) => {
          console.error('Learning component crashed:', boundaryError);
        }}
      >
        <div className="flex flex-col gap-6 p-4 max-w-4xl mx-auto">
          {/* Header */}
          <header className="text-center">
            <h1 className="text-2xl font-bold">{session.course_title}</h1>
            <p className="text-muted-foreground mt-1">
              {session.completed_nodes} of {session.total_nodes} completed
            </p>
          </header>

          {/* Progress bar using specialized component */}
          <ProgressBar
            nodes={session.nodes}
            currentNodeId={currentSlideNode?.id}
            onNodeClick={(nodeId) => {
              const index = session.nodes.findIndex((n) => n.id === nodeId);
              if (index >= 0) {
                goToSlide(index);
              }
            }}
          />

          {/* Mastery celebration overlay */}
          <MasteryCelebration
            active={celebration.active}
            topicTitle={celebration.topicTitle}
            isCourseComplete={celebration.isCourseComplete}
            onComplete={handleCelebrationComplete}
          />

          {/* Carousel container with single ConceptCard */}
          <div
            className="relative"
            role="region"
            aria-roledescription="carousel"
            aria-label="Learning path carousel"
          >
            {/* Slide counter */}
            <div className="flex justify-center mb-4 text-sm text-muted-foreground">
              <span>
                Topic {carouselState.currentIndex + 1} of {session.nodes.length}
              </span>
            </div>

            {/* Single ConceptCard with direction-aware slide animation */}
            <div className="relative overflow-hidden">
              <AnimatePresence
                mode="wait"
                custom={carouselState.direction}
                initial={false}
              >
                {currentSlideNode && (
                  <motion.div
                    key={currentSlideNode.id}
                    id={`node-${currentSlideNode.id}`}
                    tabIndex={-1}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${currentSlideNode.title}, slide ${carouselState.currentIndex + 1} of ${session.nodes.length}`}
                    custom={carouselState.direction}
                    variants={prefersReducedMotion()
                      ? carouselSlideReducedMotionVariants
                      : carouselSlideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="w-full relative"
                  >
                    {highlightNodeId === currentSlideNode.id && (
                      <motion.div
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        initial={{ boxShadow: '0 0 0px rgba(255, 212, 0, 0)' }}
                        animate={{ boxShadow: ['0 0 20px rgba(255, 212, 0, 0.6)', '0 0 0px rgba(255, 212, 0, 0)'] }}
                        transition={{ duration: 1.5, ease: 'easeOut' }}
                        aria-hidden="true"
                      />
                    )}
                    <ConceptCard
                      node={currentSlideNode}
                      isActive={currentSlideNode.id === activeNodeId}
                      quizResult={quizResults[currentSlideNode.id]}
                      onProceedToQuiz={proceedToQuiz}
                      onQuizSubmit={submitAnswer}
                      onRetryQuiz={retry}
                      onContinueToNext={handleContinueToNext}
                      onRegenerate={regenerate}
                      isRegenerating={isRegenerating}
                      isTransitioning={isTransitioning}
                      canSkip={canGoNext}
                      onSkipNode={() => {
                        if (canGoNext) {
                          goToNext();
                        }
                      }}
                      onPrevious={goToPrev}
                      canPrevious={canGoPrev}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Loading overlay for mutations */}
          {isAnyLoading && (
            <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
              <span className="text-sm text-muted-foreground">Updating...</span>
            </div>
          )}
        </div>
      </LearningErrorBoundary>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
