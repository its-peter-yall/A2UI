// index.ts
// Learning feature exports

// Components
export { LearningPathContainer } from './LearningPathContainer';
export { ConceptCard } from './ConceptCard';
export { MarkdownRenderer } from './MarkdownRenderer';
export { SkeletonCard, SkeletonPath } from './SkeletonCard';
export { QuizFeedback } from './QuizFeedback';

// Hooks
export { useQuizFeedback } from './useQuizFeedback';
export { useNodeState, isValidTransition, getNextStatus } from './useNodeState';
export { useLearningMutations } from './useLearningMutations';
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
