// useNodeState.ts
// Hook for determining available actions based on node status

// Provides a declarative interface for node state and available actions.
// Enforces sequential flow: explanation → quiz → feedback → (retry|complete)

// @see: server/schemas/learning.py - NodeStatus enum definition
// @note: Server is authoritative; this provides client-side UX guidance

import type { NodeStatus, ConceptNode, QuizSubmitResponse } from '@/types/learning';

/**
 * Available actions for a node based on current status.
 * Used by UI components to enable/disable action buttons.
 */
export interface NodeActions {
  /** Can view explanation content (VIEWING_EXPLANATION or COMPLETED review) */
  canViewExplanation: boolean;
  /** Can click "I understand, proceed to quiz" (only in VIEWING_EXPLANATION) */
  canProceedToQuiz: boolean;
  /** Can submit quiz answer (only in IN_QUIZ) */
  canSubmitQuiz: boolean;
  /** Can retry quiz after incorrect answer (SHOWING_FEEDBACK and not mastered) */
  canRetryQuiz: boolean;
  /** Can continue to next topic after mastery (SHOWING_FEEDBACK and mastered) */
  canContinueToNext: boolean;
  /** Can regenerate failed content (only in ERROR) */
  canRegenerate: boolean;
}

/**
 * Complete node state result including status, actions, and computed flags.
 */
export interface NodeStateResult {
  /** Current node status from server */
  status: NodeStatus;
  /** Available actions based on status and mastery */
  actions: NodeActions;
  /** Node is locked (cannot interact) */
  isLocked: boolean;
  /** Node is in an active learning state */
  isActive: boolean;
  /** Node is completed (mastered) */
  isCompleted: boolean;
  /** Node has error state */
  isError: boolean;
  /** User has achieved 100% mastery */
  isMastered: boolean;
  /** Current view to render based on status */
  currentView: 'locked' | 'explanation' | 'quiz' | 'feedback' | 'completed' | 'error';
}

/**
 * Hook to determine available actions and state for a node.
 * 
 * Enforces sequential learning flow:
 * - LOCKED: No actions available, wait for previous node
 * - VIEWING_EXPLANATION: Can read and proceed to quiz
 * - IN_QUIZ: Can submit answer
 * - SHOWING_FEEDBACK: Can retry (if wrong) or continue (if mastered)
 * - COMPLETED: Can review explanation
 * - ERROR: Can regenerate content
 * 
 * @param node - The concept node to evaluate
 * @param quizResult - Optional quiz result from recent submission
 * @returns State result with actions and computed flags
 */
export function useNodeState(
  node: ConceptNode,
  quizResult?: QuizSubmitResponse | null
): NodeStateResult {
  const { status } = node;

  // Determine current view based on status
  const currentView = getViewForStatus(status);

  // Check if mastered (from quiz result or status)
  const isMastered = quizResult?.is_mastered || status === 'COMPLETED';

  // Determine available actions based on sequential flow
  const actions: NodeActions = {
    // Can view explanation in VIEWING_EXPLANATION or COMPLETED (review)
    canViewExplanation:
      status === 'VIEWING_EXPLANATION' || status === 'COMPLETED',

    // Can proceed to quiz only from VIEWING_EXPLANATION
    canProceedToQuiz: status === 'VIEWING_EXPLANATION',

    // Can submit quiz only when IN_QUIZ
    canSubmitQuiz: status === 'IN_QUIZ',

    // Can retry only from SHOWING_FEEDBACK and not mastered
    canRetryQuiz: status === 'SHOWING_FEEDBACK' && !isMastered,

    // Can continue to next only from SHOWING_FEEDBACK and mastered
    canContinueToNext: status === 'SHOWING_FEEDBACK' && isMastered,

    // Can regenerate only from ERROR state
    canRegenerate: status === 'ERROR',
  };

  return {
    status,
    actions,
    isLocked: status === 'LOCKED',
    isActive: status !== 'LOCKED' && status !== 'COMPLETED' && status !== 'ERROR',
    isCompleted: status === 'COMPLETED',
    isError: status === 'ERROR',
    isMastered,
    currentView,
  };
}

/**
 * Maps NodeStatus to the view that should be rendered.
 */
function getViewForStatus(
  status: NodeStatus
): 'locked' | 'explanation' | 'quiz' | 'feedback' | 'completed' | 'error' {
  switch (status) {
    case 'LOCKED':
      return 'locked';
    case 'VIEWING_EXPLANATION':
      return 'explanation';
    case 'IN_QUIZ':
      return 'quiz';
    case 'SHOWING_FEEDBACK':
      return 'feedback';
    case 'COMPLETED':
      return 'completed';
    case 'ERROR':
      return 'error';
    default:
      return 'locked';
  }
}

/**
 * Valid state transitions for the sequential learning flow.
 * Mirrors server-side validation in learning_persistence.py
 * 
 * State Machine:
 * ```
 * LOCKED ─────────────────────┬──► VIEWING_EXPLANATION
 *                             │
 * VIEWING_EXPLANATION ────────┼──► IN_QUIZ
 *                             │
 * IN_QUIZ ────────────────────┼──► SHOWING_FEEDBACK
 *                             │
 * SHOWING_FEEDBACK ───────────┼──► IN_QUIZ (retry, if not mastered)
 *                             └──► COMPLETED (if mastered)
 * 
 * Any state ──────────────────────► ERROR (on failure)
 * ERROR ──────────────────────────► LOCKED | VIEWING_EXPLANATION (on regenerate)
 * ```
 */
const ALLOWED_TRANSITIONS: Record<NodeStatus, NodeStatus[]> = {
  LOCKED: ['VIEWING_EXPLANATION', 'ERROR'],
  VIEWING_EXPLANATION: ['IN_QUIZ', 'ERROR'],
  IN_QUIZ: ['SHOWING_FEEDBACK', 'ERROR'],
  SHOWING_FEEDBACK: ['IN_QUIZ', 'COMPLETED'], // Retry or master
  COMPLETED: [], // Terminal state
  ERROR: ['LOCKED', 'VIEWING_EXPLANATION'],
};

/**
 * Check if a transition from current status to target is valid.
 * Mirrors server-side validation in learning_persistence.py
 * 
 * @param current - Current node status
 * @param target - Desired target status
 * @returns True if transition is allowed
 */
export function isValidTransition(
  current: NodeStatus,
  target: NodeStatus
): boolean {
  // Same state is always "valid" (no-op)
  if (current === target) return true;

  return ALLOWED_TRANSITIONS[current]?.includes(target) ?? false;
}

/**
 * Get the next expected status in the sequential flow.
 * Useful for optimistic updates.
 * 
 * @param current - Current node status
 * @param isMastered - Whether user has mastered the topic
 * @returns Next expected status or null if terminal/error
 */
export function getNextStatus(
  current: NodeStatus,
  isMastered = false
): NodeStatus | null {
  switch (current) {
    case 'LOCKED':
      return 'VIEWING_EXPLANATION';
    case 'VIEWING_EXPLANATION':
      return 'IN_QUIZ';
    case 'IN_QUIZ':
      return 'SHOWING_FEEDBACK';
    case 'SHOWING_FEEDBACK':
      return isMastered ? 'COMPLETED' : 'IN_QUIZ';
    case 'COMPLETED':
      return null; // Terminal
    case 'ERROR':
      return 'VIEWING_EXPLANATION'; // After regenerate
    default:
      return null;
  }
}
