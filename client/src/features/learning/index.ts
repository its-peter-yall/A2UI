/**
 * ============================================================================
 * FILE: index.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Barrel export file for the entire learning feature module. Provides a
 * centralized access point for importing all components, hooks, utilities,
 * and types from the learning feature. Simplifies imports throughout the
 * application and enables tree-shaking of unused exports.
 * 
 * EXPORTED CATEGORIES:
 * - Components: LearningPage, LearningHome, LearningPathContainer, ConceptCard,
 *               QuizFeedback, TopicInput, ProgressBar, SkeletonCard, MarkdownRenderer,
 *               LearningErrorBoundary, ErrorState, NotFoundState, EmptyState,
 *               LoadingState, GeneratingState
 * - Hooks: useQuizFeedback, useNodeState, useLearningMutations, useErrorToast
 * - Utilities: optimisticUpdates (status, completion, unlock, mastery), learningQueryKeys
 * - Animations: Confetti, MasteryCelebration, AnimatedCard, ContentTransition
 * - Types: LearningSession, LearningSessionWithNodes, ConceptNode, NodeStatus,
 *          QuizCard, QuizOption, QuizSubmitResponse, QuizAttemptHistory
 * 
 * DEPENDENCIES:
 * - All dependencies are re-exported from individual feature files
 * - Types from @/types/learning
 * 
 * USAGE PATTERN:
 * ```tsx
 * // Import single component
 * import { LearningPage } from '@/features/learning';
 * 
 * // Import multiple items
 * import { LearningPathContainer, useLearningMutations, learningQueryKeys } from '@/features/learning';
 * 
 * // Import types
 * import type { ConceptNode, NodeStatus, QuizSubmitResponse } from '@/features/learning';
 * ```
 * 
 * ERROR HANDLING:
 * - This is a re-export file; no error handling needed
 * 
 * PERFORMANCE NOTES:
 * - Named exports enable tree-shaking
 * - Type-only imports (import type) don't affect bundle
 * 
 * RELATED FILES:
 * - All individual component/hook/utility files in the learning directory
 * - @/types/learning.ts: Type definitions
 * 
 * NOTES:
 * - Import from this file rather than individual files for consistency
 * - Re-exports are simply pass-throughs from source files
 * - Some hooks export both the hook and related types (UseLearningMutationsProps, NodeActions, NodeStateResult)
 * ============================================================================
 */

// Components
export { LearningPathContainer } from './LearningPathContainer';
export { ConceptCard } from './ConceptCard';
export { MarkdownRenderer } from './MarkdownRenderer';
export { SkeletonCard, SkeletonPath } from './SkeletonCard';
export { QuizFeedback } from './QuizFeedback';
export { TopicInput } from './TopicInput';
export { ProgressBar } from './ProgressBar';
export { LearningPage } from './LearningPage';
export { LearningHome } from './LearningHome';
export { LearningErrorBoundary } from './LearningErrorBoundary';
export {
  ErrorState,
  NotFoundState,
  EmptyState,
  LoadingState,
  GeneratingState,
} from './ErrorStates';

// Hooks
export { useQuizFeedback } from './useQuizFeedback';
export { useNodeState, isValidTransition, getNextStatus } from './useNodeState';
export { useLearningMutations } from './useLearningMutations';
export { useErrorToast, ToastContainer } from './useErrorToast';
export type { UseLearningMutationsProps } from './useLearningMutations';
export type { NodeActions, NodeStateResult } from './useNodeState';

// Utilities
export {
  optimisticStatusUpdate,
  optimisticCompletionUpdate,
  optimisticUnlockNext,
  optimisticMasteryUpdate,
  combineRollbacks,
  learningQueryKeys,
} from './optimisticUpdates';
export type { RollbackFn } from './optimisticUpdates';
export {
  Confetti,
  MasteryCelebration,
  AnimatedCard,
  ContentTransition,
} from './animations';
export type {
  LearningSession,
  LearningSessionWithNodes,
  ConceptNode,
  NodeStatus,
  QuizCard,
  QuizOption,
  QuizSubmitResponse,
  QuizAttemptHistory,
} from '@/types/learning';
