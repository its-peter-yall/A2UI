/**
 * ============================================================================
 * FILE: QuizFeedback.test.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Unit tests for QuizFeedback component. Validates feedback display after
 * quiz submission including correct/incorrect messaging, mastery badges,
 * retry/continue buttons, and option explanations.
 * 
 * KEY TESTS:
 * - Shows "Correct!" with "Mastered!" badge for correct answers
 * - Shows "Incorrect" without badge for wrong answers
 * - Shows "Try Again" button when not mastered
 * - Shows "Continue" button when mastered
 * - Displays all option explanations (both correct and incorrect)
 * 
 * DEPENDENCIES:
 * - vitest: Testing framework
 * - @testing-library/react: Component testing
 * - client/src/features/learning/QuizFeedback: Component under test
 * - client/src/types/learning: QuizCard, QuizSubmitResponse types
 * 
 * USAGE PATTERN:
 * ```bash
 * # Run QuizFeedback tests
 * npm run test -- src/features/learning/QuizFeedback.test.tsx
 * ```
 * 
 * TEST SETUP:
 * - Creates mock QuizCard with 4 options
 * - Creates mock QuizSubmitResponse for correct and incorrect cases
 * - Tests button click handlers with fireEvent
 * 
 * RELATED FILES:
 * - client/src/features/learning/QuizFeedback.tsx
 * - client/src/types/learning.ts
 * 
 * NOTES:
 * - Mastery requires 100% score (correct first try)
 * - Explanations shown for ALL options (learning value)
 * - onRetry callback for retry flow
 * - onContinue callback for progression
 * ============================================================================
 */

// QuizFeedback.test.tsx
// Tests for QuizFeedback component

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuizFeedback } from './QuizFeedback';
import type { QuizCard, QuizSubmitResponse } from '@/types/learning';

const mockQuiz: QuizCard = {
  question_text: 'What is the capital of France?',
  options: [
    { id: 'A', text: 'London', is_correct: false, explanation: 'London is the capital of England.' },
    { id: 'B', text: 'Paris', is_correct: true, explanation: 'Paris is the capital of France.' },
    { id: 'C', text: 'Berlin', is_correct: false, explanation: 'Berlin is the capital of Germany.' },
    { id: 'D', text: 'Madrid', is_correct: false, explanation: 'Madrid is the capital of Spain.' },
  ],
  difficulty: 'easy',
};

const mockCorrectResult: QuizSubmitResponse = {
  node_id: 'node-1',
  attempt_number: 1,
  is_correct: true,
  score_percent: 100,
  correct_option_id: 'B',
  selected_option_id: 'B',
  explanation: 'Paris is the capital of France.',
  is_mastered: true,
  next_node_unlocked: true,
  node_status: 'COMPLETED',
};

const mockIncorrectResult: QuizSubmitResponse = {
  ...mockCorrectResult,
  is_correct: false,
  score_percent: 0,
  selected_option_id: 'A',
  is_mastered: false,
  next_node_unlocked: false,
  node_status: 'SHOWING_FEEDBACK',
};

describe('QuizFeedback', () => {
  it('shows correct result with mastered badge', () => {
    render(
      <QuizFeedback
        quiz={mockQuiz}
        result={mockCorrectResult}
        attemptCount={1}
      />
    );
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    expect(screen.getByText('Mastered!')).toBeInTheDocument();
  });

  it('shows incorrect result without mastered badge', () => {
    render(
      <QuizFeedback
        quiz={mockQuiz}
        result={mockIncorrectResult}
        attemptCount={1}
      />
    );
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.queryByText('Mastered!')).not.toBeInTheDocument();
  });

  it('shows retry button when not mastered', () => {
    const onRetry = vi.fn();
    render(
      <QuizFeedback
        quiz={mockQuiz}
        result={mockIncorrectResult}
        attemptCount={1}
        onRetry={onRetry}
      />
    );
    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows continue button when mastered', () => {
    const onContinue = vi.fn();
    render(
      <QuizFeedback
        quiz={mockQuiz}
        result={mockCorrectResult}
        attemptCount={1}
        onContinue={onContinue}
      />
    );
    const continueButton = screen.getByText(/continue to next/i);
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalled();
  });

  it('displays all option explanations', () => {
    render(
      <QuizFeedback
        quiz={mockQuiz}
        result={mockCorrectResult}
        attemptCount={1}
      />
    );
    expect(screen.getByText(/london is the capital of england/i)).toBeInTheDocument();
    expect(screen.getByText(/paris is the capital of france/i)).toBeInTheDocument();
    expect(screen.getByText(/berlin is the capital of germany/i)).toBeInTheDocument();
  });
});
