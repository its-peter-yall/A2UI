// LearningPathContainer.tsx
// Smart container for the learning path feature

// Longer description (2-4 lines):
// - Loads learning sessions, orchestrates mutations, and tracks quiz results.
// - Handles generation, error recovery, and sequential flow transitions.
// - Renders the learning path list with active state and progress.

// @see: client/src/lib/learningApi.ts - API functions
// @note: Requires sessionId prop or generates new course from query

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import {
  generateCourse,
  getLearningSession,
} from '@/lib/learningApi';
import type { LearningSessionWithNodes, QuizSubmitResponse } from '@/types/learning';
import { useLearningMutations } from './useLearningMutations';
import { ConceptCard } from './ConceptCard';
import { ProgressBar } from './ProgressBar';
import { MasteryCelebration } from './animations/MasteryCelebration';

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

  // Track quiz results for feedback display
  const [quizResults, setQuizResults] = useState<Record<string, QuizSubmitResponse>>({});
  
  // Track celebration state
  const [celebration, setCelebration] = useState<{
    active: boolean;
    topicTitle?: string;
    isCourseComplete: boolean;
  }>({
    active: false,
    isCourseComplete: false,
  });

  useEffect(() => {
    setQuizResults({});
    setCelebration({ active: false, isCourseComplete: false });
  }, [activeSessionId]);

  // Fetch existing session
  const {
    data: session,
    isLoading: isLoadingSession,
    error: sessionError,
  } = useQuery({
    queryKey: ['learningSession', activeSessionId],
    queryFn: () => getLearningSession(activeSessionId!),
    enabled: !!activeSessionId,
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
    setQuizResults((prev) => ({
      ...prev,
      [result.node_id]: result,
    }));
  };

  const handleRetryNeeded = (nodeId: string, result: QuizSubmitResponse) => {
    setQuizResults((prev) => ({
      ...prev,
      [nodeId]: result,
    }));
  };

  const handleMutationError = (error: Error, context: string) => {
    console.error(`Mutation error (${context}):`, error);
  };

  const {
    proceedToQuiz,
    submitAnswer,
    retry,
    continueToNext,
    regenerate,
    isAnyLoading,
  } = useLearningMutations({
    sessionId: activeSessionId ?? '',
    onQuizResult: handleQuizResult,
    onMasteryAchieved: (nodeId) => {
      const node = session?.nodes.find((n) => n.id === nodeId);
      const allOtherCompleted = session?.nodes
        .filter((n) => n.id !== nodeId)
        .every((n) => n.status === 'COMPLETED');
      
      setCelebration({
        active: true,
        topicTitle: node?.title,
        isCourseComplete: allOtherCompleted || false,
      });
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
    const completedTopicTitle = celebration.topicTitle;
    setCelebration({ active: false, isCourseComplete: false });
    
    // Auto-scroll to next node after celebration
    if (completedTopicTitle) {
      const masteredNode = session?.nodes.find(
        (n) => n.title === completedTopicTitle
      );
      if (masteredNode) {
        const nodeIndex = session?.nodes.findIndex(
          (n) => n.id === masteredNode.id
        ) ?? -1;
        const nextNode = session?.nodes[nodeIndex + 1];
        if (nextNode) {
          // Add a small delay for smoother transition
          setTimeout(() => {
            scrollToNode(nextNode.id);
            // Optionally auto-advance the mutation too
            continueToNext(masteredNode.id, nextNode.id);
          }, 500);
        }
      }
    }
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

  // Loading state
  if (isLoadingSession || isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        <p className="text-muted-foreground">
          {isGenerating ? 'Generating your learning path...' : 'Loading session...'}
        </p>
      </div>
    );
  }

  // Error state
  const error = sessionError || generateMutation.error;
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="text-destructive text-lg">
          Failed to load learning path
        </div>
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <button
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          onClick={() => {
            if (activeSessionId) {
              queryClient.invalidateQueries({
                queryKey: ['learningSession', activeSessionId],
              });
            } else if (query) {
              generateMutation.mutate({ query, user_id: userId });
            }
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // No data state
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">No learning session found</p>
      </div>
    );
  }

  // Render learning path
  return (
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
        {session.nodes.map((node) => (
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
            />
          </div>
        ))}
      </div>

      {/* Loading overlay for mutations */}
      {isAnyLoading && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
          <span className="text-sm text-muted-foreground">Updating...</span>
        </div>
      )}
    </div>
  );
}
