/**
 * ============================================================================
 * FILE: useNodeState.test.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Unit tests for useNodeState hook. Validates state machine logic for
 * concept node progression including view determination, action availability,
 * transition validation, and next status calculation.
 * 
 * KEY TESTS:
 * - LOCKED state: No actions available, locked view
 * - VIEWING_EXPLANATION: Can view and proceed to quiz
 * - IN_QUIZ: Can only submit quiz (pure retrieval practice)
 * - SHOWING_FEEDBACK: Retry/continue based on mastery
 * - COMPLETED: Review mode, terminal state
 * - ERROR: Can only regenerate
 * - isValidTransition: Valid/invalid state transitions
 * - getNextStatus: Next status calculation with mastery flag
 * 
 * DEPENDENCIES:
 * - vitest: Testing framework
 * - client/src/features/learning/useNodeState: Hook under test
 * - client/src/types/learning: ConceptNode, NodeStatus types
 * 
 * USAGE PATTERN:
 * ```bash
 * # Run useNodeState tests
 * npm run test -- src/features/learning/useNodeState.test.ts
 * 
 * # Run specific describe block
 * npm run test -- -t "LOCKED state"
 * ```
 * 
 * TEST SETUP:
 * - Creates mock ConceptNode with various statuses
 * - Tests both with and without quizResult parameter
 * - Pure function tests - no React component rendering needed
 * 
 * RELATED FILES:
 * - client/src/features/learning/useNodeState.ts
 * - client/src/types/learning.ts
 * 
 * NOTES:
 * - Node status machine: LOCKED -> VIEWING_EXPLANATION -> IN_QUIZ -> SHOWING_FEEDBACK -> COMPLETED
 * - ERROR is special state for failed generation (can regenerate)
 * - Mastery requires 100% score (correct answer on first try)
 * ============================================================================
 */

// useNodeState.test.ts
// Tests for useNodeState hook

import { describe, it, expect } from 'vitest';
import { useNodeState, isValidTransition, getNextStatus } from './useNodeState';
import type { ConceptNode, NodeStatus } from '@/types/learning';

/**
 * Factory function to create a mock ConceptNode with a given status.
 */
const mockNode = (status: NodeStatus): ConceptNode => ({
  id: 'node-1',
  learning_session_id: 'session-1',
  sequence_index: 0,
  title: 'Test Node',
  content_markdown: '# Test Content\n\nThis is test content.',
  status,
  error_message: null,
  retry_available: false,
  quiz: {
    question_text: 'Test question?',
    options: [
      { option_id: 'opt-a-uuid', display_label: 'A', text: 'Option A', is_correct: false, explanation: 'Wrong' },
      { option_id: 'opt-b-uuid', display_label: 'B', text: 'Option B', is_correct: true, explanation: 'Correct' },
      { option_id: 'opt-c-uuid', display_label: 'C', text: 'Option C', is_correct: false, explanation: 'Wrong' },
      { option_id: 'opt-d-uuid', display_label: 'D', text: 'Option D', is_correct: false, explanation: 'Wrong' },
    ],
    difficulty: 'medium',
  },
  quiz_set: null,
  quiz_hidden: null,
  quiz_set_hidden: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
});

describe('useNodeState', () => {
  describe('LOCKED state', () => {
    it('returns locked view with no actions available', () => {
      const result = useNodeState(mockNode('LOCKED'));
      
      expect(result.currentView).toBe('locked');
      expect(result.isLocked).toBe(true);
      expect(result.isActive).toBe(false);
      expect(result.isCompleted).toBe(false);
      expect(result.isMastered).toBe(false);
      
      // All actions should be disabled
      expect(result.actions.canViewExplanation).toBe(false);
      expect(result.actions.canProceedToQuiz).toBe(false);
      expect(result.actions.canSubmitQuiz).toBe(false);
      expect(result.actions.canRetryQuiz).toBe(false);
      expect(result.actions.canContinueToNext).toBe(false);
      expect(result.actions.canRegenerate).toBe(false);
    });
  });

  describe('VIEWING_EXPLANATION state', () => {
    it('allows viewing explanation and proceeding to quiz', () => {
      const result = useNodeState(mockNode('VIEWING_EXPLANATION'));
      
      expect(result.currentView).toBe('explanation');
      expect(result.isLocked).toBe(false);
      expect(result.isActive).toBe(true);
      expect(result.isCompleted).toBe(false);
      
      // Can view explanation and proceed to quiz
      expect(result.actions.canViewExplanation).toBe(true);
      expect(result.actions.canProceedToQuiz).toBe(true);
      
      // Cannot do other actions
      expect(result.actions.canSubmitQuiz).toBe(false);
      expect(result.actions.canRetryQuiz).toBe(false);
      expect(result.actions.canContinueToNext).toBe(false);
      expect(result.actions.canRegenerate).toBe(false);
    });
  });

  describe('IN_QUIZ state', () => {
    it('allows submitting quiz only', () => {
      const result = useNodeState(mockNode('IN_QUIZ'));
      
      expect(result.currentView).toBe('quiz');
      expect(result.isActive).toBe(true);
      
      // Can only submit quiz
      expect(result.actions.canSubmitQuiz).toBe(true);
      
      // Cannot do other actions (pure retrieval practice - no explanation visible)
      expect(result.actions.canViewExplanation).toBe(false);
      expect(result.actions.canProceedToQuiz).toBe(false);
      expect(result.actions.canRetryQuiz).toBe(false);
      expect(result.actions.canContinueToNext).toBe(false);
      expect(result.actions.canRegenerate).toBe(false);
    });
  });

  describe('SHOWING_FEEDBACK state', () => {
    it('allows retry when NOT mastered', () => {
      const quizResult = {
        node_id: 'node-1',
        is_mastered: false,
        is_correct: false,
        score_percent: 0,
        attempt_number: 1,
        correct_option_id: 'B',
        selected_option_id: 'A',
        explanation: 'Incorrect',
        next_node_unlocked: false,
        node_status: 'SHOWING_FEEDBACK' as const,
      };
      
      const result = useNodeState(mockNode('SHOWING_FEEDBACK'), quizResult);
      
      expect(result.currentView).toBe('feedback');
      expect(result.isMastered).toBe(false);
      
      // Can retry
      expect(result.actions.canRetryQuiz).toBe(true);
      
      // Cannot continue (not mastered)
      expect(result.actions.canContinueToNext).toBe(false);
    });

    it('allows continue when mastered', () => {
      const quizResult = {
        node_id: 'node-1',
        is_mastered: true,
        is_correct: true,
        score_percent: 100,
        attempt_number: 1,
        correct_option_id: 'B',
        selected_option_id: 'B',
        explanation: 'Correct!',
        next_node_unlocked: true,
        node_status: 'SHOWING_FEEDBACK' as const,
      };
      
      const result = useNodeState(mockNode('SHOWING_FEEDBACK'), quizResult);
      
      expect(result.isMastered).toBe(true);
      
      // Can continue
      expect(result.actions.canContinueToNext).toBe(true);
      
      // Cannot retry (already mastered)
      expect(result.actions.canRetryQuiz).toBe(false);
    });

    it('defaults to not mastered when no quiz result provided', () => {
      const result = useNodeState(mockNode('SHOWING_FEEDBACK'));
      
      // Without quiz result, assume not mastered
      expect(result.isMastered).toBe(false);
      expect(result.actions.canRetryQuiz).toBe(true);
      expect(result.actions.canContinueToNext).toBe(false);
    });
  });

  describe('COMPLETED state', () => {
    it('allows reviewing explanation and marks as mastered', () => {
      const result = useNodeState(mockNode('COMPLETED'));
      
      expect(result.currentView).toBe('completed');
      expect(result.isCompleted).toBe(true);
      expect(result.isMastered).toBe(true);
      expect(result.isActive).toBe(false);
      expect(result.isLocked).toBe(false);
      
      // Can review explanation
      expect(result.actions.canViewExplanation).toBe(true);
      
      // Cannot do progression actions (terminal state)
      expect(result.actions.canProceedToQuiz).toBe(false);
      expect(result.actions.canSubmitQuiz).toBe(false);
      expect(result.actions.canRetryQuiz).toBe(false);
      expect(result.actions.canContinueToNext).toBe(false);
    });
  });

  describe('ERROR state', () => {
    it('allows regeneration only', () => {
      const result = useNodeState(mockNode('ERROR'));
      
      expect(result.currentView).toBe('error');
      expect(result.isError).toBe(true);
      expect(result.isActive).toBe(false);
      
      // Can only regenerate
      expect(result.actions.canRegenerate).toBe(true);
      
      // Cannot do other actions
      expect(result.actions.canViewExplanation).toBe(false);
      expect(result.actions.canProceedToQuiz).toBe(false);
      expect(result.actions.canSubmitQuiz).toBe(false);
      expect(result.actions.canRetryQuiz).toBe(false);
      expect(result.actions.canContinueToNext).toBe(false);
    });
  });
});

describe('isValidTransition', () => {
  describe('valid transitions', () => {
    it('allows LOCKED → VIEWING_EXPLANATION', () => {
      expect(isValidTransition('LOCKED', 'VIEWING_EXPLANATION')).toBe(true);
    });

    it('allows LOCKED → ERROR', () => {
      expect(isValidTransition('LOCKED', 'ERROR')).toBe(true);
    });

    it('allows VIEWING_EXPLANATION → IN_QUIZ', () => {
      expect(isValidTransition('VIEWING_EXPLANATION', 'IN_QUIZ')).toBe(true);
    });

    it('allows VIEWING_EXPLANATION → ERROR', () => {
      expect(isValidTransition('VIEWING_EXPLANATION', 'ERROR')).toBe(true);
    });

    it('allows IN_QUIZ → SHOWING_FEEDBACK', () => {
      expect(isValidTransition('IN_QUIZ', 'SHOWING_FEEDBACK')).toBe(true);
    });

    it('allows IN_QUIZ → ERROR', () => {
      expect(isValidTransition('IN_QUIZ', 'ERROR')).toBe(true);
    });

    it('allows SHOWING_FEEDBACK → IN_QUIZ (retry)', () => {
      expect(isValidTransition('SHOWING_FEEDBACK', 'IN_QUIZ')).toBe(true);
    });

    it('allows SHOWING_FEEDBACK → COMPLETED (mastery)', () => {
      expect(isValidTransition('SHOWING_FEEDBACK', 'COMPLETED')).toBe(true);
    });

    it('allows ERROR → LOCKED', () => {
      expect(isValidTransition('ERROR', 'LOCKED')).toBe(true);
    });

    it('allows ERROR → VIEWING_EXPLANATION', () => {
      expect(isValidTransition('ERROR', 'VIEWING_EXPLANATION')).toBe(true);
    });

    it('allows same state transition (no-op)', () => {
      expect(isValidTransition('LOCKED', 'LOCKED')).toBe(true);
      expect(isValidTransition('IN_QUIZ', 'IN_QUIZ')).toBe(true);
      expect(isValidTransition('COMPLETED', 'COMPLETED')).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('denies LOCKED → COMPLETED (skip)', () => {
      expect(isValidTransition('LOCKED', 'COMPLETED')).toBe(false);
    });

    it('denies LOCKED → IN_QUIZ (skip explanation)', () => {
      expect(isValidTransition('LOCKED', 'IN_QUIZ')).toBe(false);
    });

    it('denies LOCKED → SHOWING_FEEDBACK (skip)', () => {
      expect(isValidTransition('LOCKED', 'SHOWING_FEEDBACK')).toBe(false);
    });

    it('denies VIEWING_EXPLANATION → COMPLETED (skip quiz)', () => {
      expect(isValidTransition('VIEWING_EXPLANATION', 'COMPLETED')).toBe(false);
    });

    it('denies VIEWING_EXPLANATION → SHOWING_FEEDBACK (skip quiz)', () => {
      expect(isValidTransition('VIEWING_EXPLANATION', 'SHOWING_FEEDBACK')).toBe(false);
    });

    it('denies IN_QUIZ → COMPLETED (skip feedback)', () => {
      expect(isValidTransition('IN_QUIZ', 'COMPLETED')).toBe(false);
    });

    it('denies IN_QUIZ → VIEWING_EXPLANATION (go back)', () => {
      expect(isValidTransition('IN_QUIZ', 'VIEWING_EXPLANATION')).toBe(false);
    });

    it('denies COMPLETED → any (terminal state)', () => {
      expect(isValidTransition('COMPLETED', 'LOCKED')).toBe(false);
      expect(isValidTransition('COMPLETED', 'VIEWING_EXPLANATION')).toBe(false);
      expect(isValidTransition('COMPLETED', 'IN_QUIZ')).toBe(false);
      expect(isValidTransition('COMPLETED', 'SHOWING_FEEDBACK')).toBe(false);
      expect(isValidTransition('COMPLETED', 'ERROR')).toBe(false);
    });

    it('denies SHOWING_FEEDBACK → VIEWING_EXPLANATION (go back)', () => {
      expect(isValidTransition('SHOWING_FEEDBACK', 'VIEWING_EXPLANATION')).toBe(false);
    });

    it('denies SHOWING_FEEDBACK → LOCKED (go back)', () => {
      expect(isValidTransition('SHOWING_FEEDBACK', 'LOCKED')).toBe(false);
    });
  });
});

describe('getNextStatus', () => {
  it('returns VIEWING_EXPLANATION for LOCKED', () => {
    expect(getNextStatus('LOCKED')).toBe('VIEWING_EXPLANATION');
  });

  it('returns IN_QUIZ for VIEWING_EXPLANATION', () => {
    expect(getNextStatus('VIEWING_EXPLANATION')).toBe('IN_QUIZ');
  });

  it('returns SHOWING_FEEDBACK for IN_QUIZ', () => {
    expect(getNextStatus('IN_QUIZ')).toBe('SHOWING_FEEDBACK');
  });

  it('returns COMPLETED for SHOWING_FEEDBACK when mastered', () => {
    expect(getNextStatus('SHOWING_FEEDBACK', true)).toBe('COMPLETED');
  });

  it('returns IN_QUIZ for SHOWING_FEEDBACK when NOT mastered (retry)', () => {
    expect(getNextStatus('SHOWING_FEEDBACK', false)).toBe('IN_QUIZ');
  });

  it('returns null for COMPLETED (terminal state)', () => {
    expect(getNextStatus('COMPLETED')).toBe(null);
  });

  it('returns VIEWING_EXPLANATION for ERROR (after regenerate)', () => {
    expect(getNextStatus('ERROR')).toBe('VIEWING_EXPLANATION');
  });
});
