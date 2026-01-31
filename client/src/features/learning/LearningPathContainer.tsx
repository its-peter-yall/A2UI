// LearningPathContainer.tsx
// Smart container for the learning path feature

// Fetches learning session data via React Query, manages loading/error
// states, and renders the vertical learning path with concept nodes.
// Handles course generation, session restoration, and sequential flow mutations.

// @see: client/src/lib/learningApi.ts - API functions
// @note: Requires sessionId prop or generates new course from query

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  generateCourse,
  getLearningSession,
} from '@/lib/learningApi';
import type { LearningSessionWithNodes, QuizSubmitResponse } from '@/types/learning';
import { useLearningMutations } from './useLearningMutations';
import { ConceptCard } from './ConceptCard';

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
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(
    sessionId
  );

  // Track quiz results for feedback display
  const [quizResults, setQuizResults] = useState<Record<string, QuizSubmitResponse>>({});
  
  // Track which node just achieved mastery (for celebration animation)
  const [masteredNodeId, setMasteredNodeId] = useState<string | null>(null);

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
      setActiveSessionId(data.id);
      queryClient.setQueryData(['learningSession', data.id], data);
      onCourseGenerated?.(data);
    },
  });

  // Learning mutations hook with sequential flow callbacks
  const {
    proceedToQuiz,
    submitAnswer,
    retry,
    continueToNext,
    regenerate,
    isAnyLoading,
  } = useLearningMutations({
    sessionId: activeSessionId!,
    onQuizResult: (result) => {
      // Store result for the node to show in feedback view
      setQuizResults((prev) => ({
        ...prev,
        [result.node_id]: result,
      }));
    },
    onMasteryAchieved: (nodeId) => {
      // Trigger celebration animation
      setMasteredNodeId(nodeId);
      
      // Clear after animation completes
      setTimeout(() => setMasteredNodeId(null), 2000);
      
      // Find next node and scroll to it after a delay
      const nodeIndex = session?.nodes.findIndex((n) => n.id === nodeId) ?? -1;
      const nextNode = session?.nodes[nodeIndex + 1];
      if (nextNode) {
        setTimeout(() => {
          continueToNext(nodeId, nextNode.id);
        }, 1500);
      }
    },
    onRetryNeeded: (nodeId, result) => {
      // User needs to retry - result already stored in quizResults
      console.log(`Retry needed for node ${nodeId}: ${result.score_percent}%`);
    },
    onError: (error, context) => {
      console.error(`Mutation error (${context}):`, error);
      // TODO: Show toast notification
    },
  });

  // Find active node (first non-completed, non-locked for sequential flow)
  const activeNodeId = session?.nodes.find(
    (n) => n.status !== 'LOCKED' && n.status !== 'COMPLETED'
  )?.id;

  // Handle continue to next (manual button click, not auto-scroll)
  const handleContinueToNext = (nodeId: string) => {
    const nodeIndex = session?.nodes.findIndex((n) => n.id === nodeId) ?? -1;
    const nextNode = session?.nodes[nodeIndex + 1];
    if (nextNode) {
      continueToNext(nodeId, nextNode.id);
    }
  };

  // Auto-generate if query provided but no sessionId
  const shouldGenerate = !activeSessionId && query && !generateMutation.isPending;

  // Trigger generation on mount if needed
  if (shouldGenerate && !generateMutation.data) {
    generateMutation.mutate({ query, user_id: userId });
  }

  // Loading state
  if (isLoadingSession || generateMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        <p className="text-muted-foreground">
          {generateMutation.isPending
            ? 'Generating your learning path...'
            : 'Loading session...'}
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

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-300"
          style={{
            width: `${(session.completed_nodes / session.total_nodes) * 100}%`,
          }}
        />
      </div>

      {/* Nodes list with ConceptCard components */}
      <div className="flex flex-col gap-4">
        {session.nodes.map((node) => (
          <div key={node.id} id={`node-${node.id}`}>
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
            {/* Mastery celebration overlay */}
            {masteredNodeId === node.id && (
              <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
                <div className="animate-bounce text-6xl">
                  🎉
                </div>
              </div>
            )}
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
