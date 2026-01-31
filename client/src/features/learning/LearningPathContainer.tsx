// LearningPathContainer.tsx
// Smart container for the learning path feature

// Fetches learning session data via React Query, manages loading/error
// states, and renders the vertical learning path with concept nodes.
// Handles course generation and session restoration.

// @see: client/src/lib/learningApi.ts - API functions
// @note: Requires sessionId prop or generates new course from query

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  generateCourse,
  getLearningSession,
} from '@/lib/learningApi';
import type { LearningSessionWithNodes } from '@/types/learning';

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

      {/* Nodes list */}
      <div className="flex flex-col gap-4">
        {session.nodes.map((node, index) => (
          <div
            key={node.id}
            className={cn(
              'border rounded-lg p-4 transition-all',
              node.status === 'LOCKED' && 'opacity-50 bg-muted',
              node.status === 'COMPLETED' && 'border-green-500 bg-green-50',
              node.status === 'ERROR' && 'border-destructive bg-destructive/10',
              node.status !== 'LOCKED' &&
                node.status !== 'COMPLETED' &&
                node.status !== 'ERROR' &&
                'border-primary'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <h2 className="text-lg font-medium">{node.title}</h2>
              <span className="ml-auto text-xs uppercase tracking-wide text-muted-foreground">
                {node.status.replace('_', ' ')}
              </span>
            </div>
            {/* TODO: Render ConceptCard component here in 05-02 */}
          </div>
        ))}
      </div>
    </div>
  );
}
