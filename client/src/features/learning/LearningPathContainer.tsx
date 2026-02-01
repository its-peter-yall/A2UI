// LearningPathContainer.tsx
// Smart container for the learning path feature

// Longer description (2-4 lines):
// - Loads learning sessions, orchestrates mutations, and tracks quiz results.
// - Handles generation, error recovery, and sequential flow transitions.
// - Renders the learning path list with active state and progress.

// @see: client/src/lib/learningApi.ts - API functions
// @note: Requires sessionId prop or generates new course from query

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { LearningSessionWithNodes, QuizSubmitResponse } from '@/types/learning';
import { generateCourse, getLearningSession } from '@/lib/learningApi';
import { ConceptCard } from './ConceptCard';
import { LearningErrorBoundary } from './LearningErrorBoundary';
import { MasteryCelebration } from './animations/MasteryCelebration';
import { ProgressBar } from './ProgressBar';
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

  // Find active node (first non-completed, non-locked for sequential flow)
  const activeNodeId = session?.nodes.find(
    (n) => n.status !== 'LOCKED' && n.status !== 'COMPLETED'
  )?.id;

  // Handle continue to next (manual button click, not auto-scroll)
  const handleContinueToNext = useCallback((nodeId: string) => {
    const nodeIndex = session?.nodes.findIndex((n) => n.id === nodeId) ?? -1;
    const nextNode = session?.nodes[nodeIndex + 1];
    if (nextNode) {
      continueToNext(nodeId, nextNode.id);
    }
  }, [session?.nodes, continueToNext]);

  // Handle auto-scroll to node
  const scrollToNode = useCallback((nodeId: string) => {
    const element = document.getElementById(`node-${nodeId}`);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, []);

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
        <div className="flex flex-col gap-6 p-4 max-w-3xl mx-auto">
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
            currentNodeId={activeNodeId}
            onNodeClick={scrollToNode}
          />

          {/* Mastery celebration overlay */}
          <MasteryCelebration
            active={celebration.active}
            topicTitle={celebration.topicTitle}
            isCourseComplete={celebration.isCourseComplete}
            onComplete={handleCelebrationComplete}
          />

          {/* Nodes list with ConceptCard components */}
          <div className="flex flex-col gap-4">
            {session.nodes.map((node, index) => {
              const nextNode = session.nodes[index + 1];
              return (
                <div key={node.id} id={`node-${node.id}`} tabIndex={-1}>
                  <ConceptCard
                    node={node}
                    isActive={node.id === activeNodeId}
                    quizResult={quizResults[node.id]}
                    onProceedToQuiz={proceedToQuiz}
                    onQuizSubmit={submitAnswer}
                    onRetryQuiz={retry}
                    onContinueToNext={handleContinueToNext}
                    onRegenerate={regenerate}
                    isRegenerating={isRegenerating}
                    isTransitioning={isTransitioning}
                    canSkip={Boolean(nextNode)}
                    onSkipNode={(nodeId) => {
                      const nodeIndex = session.nodes.findIndex(
                        (currentNode) => currentNode.id === nodeId
                      );
                      const upcomingNode = session.nodes[nodeIndex + 1];
                      if (upcomingNode) {
                        scrollToNode(upcomingNode.id);
                      }
                    }}
                  />
                </div>
              );
            })}
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
