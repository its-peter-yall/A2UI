// optimisticUpdates.ts
// Optimistic update utilities for learning mutations

// Provides functions to optimistically update the React Query cache
// before mutations complete, with rollback support on error.
// Implements the TanStack Query v5 "snapshot and rollback" pattern.

// Pattern: onMutate → snapshot → update → return rollback
// Best Practice: Always invalidate on onSettled (success or error)

// @see: client/src/types/learning.ts - Type definitions
// @see: https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates

import type { QueryClient } from '@tanstack/react-query';
import type {
  LearningSessionWithNodes,
  NodeStatus,
} from '@/types/learning';

/**
 * Type for rollback function returned by optimistic updates.
 * Call this in onError to restore previous state.
 */
export type RollbackFn = () => void;

/**
 * No-op rollback for cases where no update was made.
 */
const noopRollback: RollbackFn = () => {};

/**
 * Query key factory for learning sessions.
 */
export const learningQueryKeys = {
  session: (sessionId: string) => ['learningSession', sessionId] as const,
} as const;

/**
 * Optimistically update a node's status in the cache.
 * 
 * Best Practice: Call queryClient.cancelQueries before this in onMutate
 * to prevent background refetches from overwriting optimistic data.
 * 
 * @param queryClient - React Query client instance
 * @param sessionId - Learning session ID
 * @param nodeId - Node to update
 * @param newStatus - Target status
 * @returns Rollback function to restore previous state on error
 * 
 * @example
 * ```typescript
 * onMutate: async ({ nodeId, targetStatus }) => {
 *   await queryClient.cancelQueries({ queryKey: ['learningSession', sessionId] });
 *   const rollback = optimisticStatusUpdate(queryClient, sessionId, nodeId, targetStatus);
 *   return { rollback };
 * },
 * onError: (error, variables, context) => {
 *   context?.rollback?.();
 * }
 * ```
 */
export function optimisticStatusUpdate(
  queryClient: QueryClient,
  sessionId: string,
  nodeId: string,
  newStatus: NodeStatus
): RollbackFn {
  const queryKey = learningQueryKeys.session(sessionId);
  const previousData = queryClient.getQueryData<LearningSessionWithNodes>(queryKey);

  if (!previousData) {
    return noopRollback;
  }

  queryClient.setQueryData<LearningSessionWithNodes>(queryKey, {
    ...previousData,
    nodes: previousData.nodes.map((node) =>
      node.id === nodeId ? { ...node, status: newStatus } : node
    ),
  });

  // Return rollback function that restores previous state
  return () => {
    queryClient.setQueryData(queryKey, previousData);
  };
}

/**
 * Optimistically update completed_nodes count.
 * 
 * @param queryClient - React Query client instance
 * @param sessionId - Learning session ID
 * @param increment - Amount to add (usually 1 on mastery)
 * @returns Rollback function
 */
export function optimisticCompletionUpdate(
  queryClient: QueryClient,
  sessionId: string,
  increment: number
): RollbackFn {
  const queryKey = learningQueryKeys.session(sessionId);
  const previousData = queryClient.getQueryData<LearningSessionWithNodes>(queryKey);

  if (!previousData) {
    return noopRollback;
  }

  queryClient.setQueryData<LearningSessionWithNodes>(queryKey, {
    ...previousData,
    completed_nodes: previousData.completed_nodes + increment,
  });

  return () => {
    queryClient.setQueryData(queryKey, previousData);
  };
}

/**
 * Optimistically unlock the next node after mastery.
 * Sets next node status to VIEWING_EXPLANATION (not LOCKED).
 * 
 * @param queryClient - React Query client instance
 * @param sessionId - Learning session ID
 * @param currentNodeIndex - Index of the just-completed node
 * @returns Rollback function
 */
export function optimisticUnlockNext(
  queryClient: QueryClient,
  sessionId: string,
  currentNodeIndex: number
): RollbackFn {
  const queryKey = learningQueryKeys.session(sessionId);
  const previousData = queryClient.getQueryData<LearningSessionWithNodes>(queryKey);

  if (!previousData) {
    return noopRollback;
  }

  const nextIndex = currentNodeIndex + 1;
  
  // No next node - course completed
  if (nextIndex >= previousData.nodes.length) {
    return noopRollback;
  }

  // Only unlock if next node is currently LOCKED
  const nextNode = previousData.nodes[nextIndex];
  if (nextNode.status !== 'LOCKED') {
    return noopRollback; // Already unlocked somehow
  }

  queryClient.setQueryData<LearningSessionWithNodes>(queryKey, {
    ...previousData,
    nodes: previousData.nodes.map((node, idx) =>
      idx === nextIndex
        ? { ...node, status: 'VIEWING_EXPLANATION' as NodeStatus }
        : node
    ),
  });

  return () => {
    queryClient.setQueryData(queryKey, previousData);
  };
}

/**
 * Batch optimistic update for mastery: complete current + unlock next.
 * Combines multiple updates into a single cache write for efficiency.
 * 
 * This is the recommended approach when a user masters a topic:
 * 1. Mark current node as COMPLETED
 * 2. Increment completed_nodes count
 * 3. Unlock next node (if exists)
 * 
 * All changes are atomic with single rollback.
 * 
 * @param queryClient - React Query client instance
 * @param sessionId - Learning session ID
 * @param nodeId - ID of the mastered node
 * @param nodeIndex - Index of the mastered node
 * @returns Rollback function that undoes all changes
 */
export function optimisticMasteryUpdate(
  queryClient: QueryClient,
  sessionId: string,
  nodeId: string,
  nodeIndex: number
): RollbackFn {
  const queryKey = learningQueryKeys.session(sessionId);
  const previousData = queryClient.getQueryData<LearningSessionWithNodes>(queryKey);

  if (!previousData) {
    return noopRollback;
  }

  const nextIndex = nodeIndex + 1;
  const hasNextNode = nextIndex < previousData.nodes.length;

  queryClient.setQueryData<LearningSessionWithNodes>(queryKey, {
    ...previousData,
    completed_nodes: previousData.completed_nodes + 1,
    nodes: previousData.nodes.map((node, idx) => {
      // Mark current node as completed
      if (node.id === nodeId) {
        return { ...node, status: 'COMPLETED' as NodeStatus };
      }
      // Unlock next node if it exists and is locked
      if (hasNextNode && idx === nextIndex && node.status === 'LOCKED') {
        return { ...node, status: 'VIEWING_EXPLANATION' as NodeStatus };
      }
      return node;
    }),
  });

  return () => {
    queryClient.setQueryData(queryKey, previousData);
  };
}

/**
 * Create a combined rollback function from multiple individual rollbacks.
 * Useful when chaining multiple optimistic updates.
 * 
 * @param rollbacks - Array of rollback functions
 * @returns Single rollback function that calls all in reverse order
 */
export function combineRollbacks(...rollbacks: RollbackFn[]): RollbackFn {
  return () => {
    // Execute in reverse order (LIFO)
    for (let i = rollbacks.length - 1; i >= 0; i--) {
      rollbacks[i]();
    }
  };
}
