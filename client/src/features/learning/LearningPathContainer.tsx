// LearningPathContainer.tsx
// Smart container for the learning path feature

// Longer description (2-4 lines):
// - Loads learning sessions, orchestrates mutations, and tracks quiz results.
// - Handles generation, error recovery, and sequential flow transitions.
// - Renders the learning path list with active state and progress.

// @see: client/src/lib/learningApi.ts - API functions
// @note: Requires sessionId prop or generates new course from query

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import type { LearningSessionWithNodes, QuizSubmitResponse } from '@/types/learning';
import { generateCourse, getLearningSession } from '@/lib/learningApi';
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
    if (session && activeNodeIndex >= 0) {
      // Check if we haven't initialized this session yet
      if (!initializedSessionsRef.current.has(activeSessionKey)) {
        initializedSessionsRef.current.add(activeSessionKey);
        previousActiveNodeIndexRef.current = activeNodeIndex;
        
        // Schedule state update in a microtask to avoid synchronous setState in effect
        queueMicrotask(() => {
          setCarouselStateBySession((prev) => ({
            ...prev,
            [activeSessionKey]: { currentIndex: activeNodeIndex, direction: 0 },
          }));
        });
      } else if (activeNodeIndex !== previousActiveNodeIndexRef.current) {
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
  }, [session, activeNodeIndex, activeSessionKey, carouselState.currentIndex]);

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
                    className="w-full"
                  >
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
