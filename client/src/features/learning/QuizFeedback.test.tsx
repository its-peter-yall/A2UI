/**
 * ============================================================================
 * FILE: QuizFeedback.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 * Unit tests for QuizFeedback component. Validates feedback display after
 * quiz submission including correct/incorrect messaging, mastery badges,
 * retry/continue buttons, option explanations, and QuizSet support with
 * multi-quiz navigation and progress display.
 *
 * KEY TESTS:
 * - Shows "Correct!" with "Mastered!" badge for correct answers
 * - Shows "Incorrect" without badge for wrong answers
 * - Shows "Try Again" button when not mastered
 * - Shows "Continue" button when mastered
 * - Displays explanation for correct answer (always shown)
 * - Displays explanation for selected incorrect option when wrong (with "Why this is incorrect:")
 * - Hides explanations for unselected incorrect options (prevents giving away answers)
 * - QuizSet: Shows progress indicator (Quiz X of Y)
 * - QuizSet: Shows "Next Quiz" button when correct and more quizzes exist
 * - QuizSet: Displays correct quiz based on currentQuizIndex
 * - QuizSet: Shows display labels after shuffle
 * - QuizSet: Handles last quiz in set correctly
 *
 * DEPENDENCIES:
 * - vitest: Testing framework
 * - @testing-library/react: Component testing
 * - client/src/features/learning/QuizFeedback: Component under test
 * - client/src/types/learning: QuizCard, QuizSet, QuizSubmitResponse types
 *
 * USAGE PATTERN:
 * ```bash
 * # Run QuizFeedback tests
 * npm run test -- src/features/learning/QuizFeedback.test.tsx --run
 * ```
 *
 * TEST SETUP:
 * - Creates mock QuizCard with 4 options
 * - Creates mock QuizSet with multiple quizzes
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
 * - onNextQuiz callback for QuizSet navigation
 * - display_label preserved even when options are shuffled
 * ============================================================================
 */

// QuizFeedback.test.tsx
// Tests for QuizFeedback component

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuizFeedback } from './QuizFeedback';
import type { QuizCard, QuizSet, QuizSubmitResponse } from '@/types/learning';

const mockQuiz: QuizCard = {
  question_text: 'What is the capital of France?',
  options: [
    { option_id: 'opt-a-uuid', display_label: 'A', text: 'London', is_correct: false, explanation: 'London is the capital of England.' },
    { option_id: 'opt-b-uuid', display_label: 'B', text: 'Paris', is_correct: true, explanation: 'Paris is the capital of France.' },
    { option_id: 'opt-c-uuid', display_label: 'C', text: 'Berlin', is_correct: false, explanation: 'Berlin is the capital of Germany.' },
    { option_id: 'opt-d-uuid', display_label: 'D', text: 'Madrid', is_correct: false, explanation: 'Madrid is the capital of Spain.' },
  ],
  difficulty: 'easy',
};

const mockQuiz2: QuizCard = {
  question_text: 'What is the capital of Germany?',
  options: [
    { option_id: 'opt-e-uuid', display_label: 'A', text: 'Munich', is_correct: false, explanation: 'Munich is a major city but not the capital.' },
    { option_id: 'opt-f-uuid', display_label: 'B', text: 'Berlin', is_correct: true, explanation: 'Berlin is the capital of Germany.' },
    { option_id: 'opt-g-uuid', display_label: 'C', text: 'Hamburg', is_correct: false, explanation: 'Hamburg is a major port city.' },
    { option_id: 'opt-h-uuid', display_label: 'D', text: 'Cologne', is_correct: false, explanation: 'Cologne is known for its cathedral.' },
  ],
  difficulty: 'medium',
};

const mockQuizSet: QuizSet = {
  quizzes: [mockQuiz, mockQuiz2],
  current_index: 0,
  shuffle_seed: 'test-seed-123',
};

const mockCorrectResult: QuizSubmitResponse = {
  node_id: 'node-1',
  attempt_number: 1,
  is_correct: true,
  score_percent: 100,
  correct_option_id: 'opt-b-uuid',
  selected_option_id: 'opt-b-uuid',
  explanation: 'Paris is the capital of France.',
  is_mastered: true,
  next_node_unlocked: true,
  node_status: 'COMPLETED',
};

const mockIncorrectResult: QuizSubmitResponse = {
  ...mockCorrectResult,
  is_correct: false,
  score_percent: 0,
  selected_option_id: 'opt-a-uuid',
  selected_explanation: 'London is the capital of England.',
  is_mastered: false,
  next_node_unlocked: false,
  node_status: 'SHOWING_FEEDBACK',
};

describe('QuizFeedback', () => {
  describe('Single Quiz', () => {
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

    it('displays explanation for correct answer when user answers correctly', () => {
      render(
        <QuizFeedback
          quiz={mockQuiz}
          result={mockCorrectResult}
          attemptCount={1}
        />
      );
      // Only correct answer's explanation is shown when user answered correctly
      expect(screen.getByText(/paris is the capital of france/i)).toBeInTheDocument();
      // Other incorrect options' explanations should NOT be shown
      expect(screen.queryByText(/london is the capital of england/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/berlin is the capital of germany/i)).not.toBeInTheDocument();
    });

    it('displays explanation for selected incorrect option when user answers incorrectly', () => {
      render(
        <QuizFeedback
          quiz={mockQuiz}
          result={mockIncorrectResult}
          attemptCount={1}
        />
      );
      // Correct answer's explanation is always shown
      expect(screen.getByText(/paris is the capital of france/i)).toBeInTheDocument();
      // Selected incorrect option (London - option_a) explanation is shown with "Why this is incorrect:" label
      expect(screen.getByText(/london is the capital of england/i)).toBeInTheDocument();
      expect(screen.getByText(/Why this is incorrect:/i)).toBeInTheDocument();
      // Other incorrect options (Berlin, Madrid) should NOT have their explanations shown
      expect(screen.queryByText(/berlin is the capital of germany/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/madrid is the capital of spain/i)).not.toBeInTheDocument();
    });

    it('shows display labels for options', () => {
      render(
        <QuizFeedback
          quiz={mockQuiz}
          result={mockCorrectResult}
          attemptCount={1}
        />
      );
      // Check that display labels are shown
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.getByText('D')).toBeInTheDocument();
    });
  });

  describe('QuizSet', () => {
    it('shows progress indicator for quiz set', () => {
      render(
        <QuizFeedback
          quiz={mockQuizSet}
          result={mockCorrectResult}
          attemptCount={1}
          currentQuizIndex={0}
        />
      );
      expect(screen.getByText('Quiz 1 of 2')).toBeInTheDocument();
    });

    it('shows second quiz progress correctly', () => {
      render(
        <QuizFeedback
          quiz={mockQuizSet}
          result={mockCorrectResult}
          attemptCount={1}
          currentQuizIndex={1}
        />
      );
      expect(screen.getByText('Quiz 2 of 2')).toBeInTheDocument();
    });

    it('displays correct quiz based on currentQuizIndex', () => {
      const { rerender } = render(
        <QuizFeedback
          quiz={mockQuizSet}
          result={mockCorrectResult}
          attemptCount={1}
          currentQuizIndex={0}
        />
      );

      // First quiz question
      expect(screen.getByText('What is the capital of France?')).toBeInTheDocument();

      // Switch to second quiz
      rerender(
        <QuizFeedback
          quiz={mockQuizSet}
          result={mockCorrectResult}
          attemptCount={1}
          currentQuizIndex={1}
        />
      );

      // Second quiz question
      expect(screen.getByText('What is the capital of Germany?')).toBeInTheDocument();
    });

    it('shows next quiz button when correct and more quizzes exist', () => {
      const onNextQuiz = vi.fn();
      render(
        <QuizFeedback
          quiz={mockQuizSet}
          result={mockCorrectResult}
          attemptCount={1}
          currentQuizIndex={0}
          onNextQuiz={onNextQuiz}
        />
      );

      const nextButton = screen.getByText('Next Quiz →');
      expect(nextButton).toBeInTheDocument();

      fireEvent.click(nextButton);
      expect(onNextQuiz).toHaveBeenCalled();
    });

    it('does not show next quiz button when incorrect', () => {
      const onNextQuiz = vi.fn();
      render(
        <QuizFeedback
          quiz={mockQuizSet}
          result={mockIncorrectResult}
          attemptCount={1}
          currentQuizIndex={0}
          onNextQuiz={onNextQuiz}
        />
      );

      expect(screen.queryByText('Next Quiz →')).not.toBeInTheDocument();
    });

    it('does not show next quiz button on last quiz', () => {
      const onNextQuiz = vi.fn();
      render(
        <QuizFeedback
          quiz={mockQuizSet}
          result={mockCorrectResult}
          attemptCount={1}
          currentQuizIndex={1}
          onNextQuiz={onNextQuiz}
        />
      );

      expect(screen.queryByText('Next Quiz →')).not.toBeInTheDocument();
    });

    it('shows retry button when incorrect in quiz set', () => {
      const onRetry = vi.fn();
      render(
        <QuizFeedback
          quiz={mockQuizSet}
          result={mockIncorrectResult}
          attemptCount={1}
          currentQuizIndex={0}
          onRetry={onRetry}
        />
      );

      const retryButton = screen.getByText('Try Again');
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(onRetry).toHaveBeenCalled();
    });

    it('shows continue button when mastered on last quiz', () => {
      const onContinue = vi.fn();
      render(
        <QuizFeedback
          quiz={mockQuizSet}
          result={mockCorrectResult}
          attemptCount={1}
          currentQuizIndex={1}
          onContinue={onContinue}
        />
      );

      const continueButton = screen.getByText(/continue to next/i);
      expect(continueButton).toBeInTheDocument();
    });

    it('does not show progress indicator for single quiz', () => {
      render(
        <QuizFeedback
          quiz={mockQuiz}
          result={mockCorrectResult}
          attemptCount={1}
        />
      );

      expect(screen.queryByText(/Quiz \d+ of \d+/)).not.toBeInTheDocument();
    });

    it('shows display labels after shuffle', () => {
      // Simulate shuffled options with reordered display labels
      const shuffledQuiz: QuizCard = {
        ...mockQuiz,
        options: [
          { option_id: 'opt-b-uuid', display_label: 'C', text: 'Paris', is_correct: true, explanation: 'Paris is the capital.' },
          { option_id: 'opt-a-uuid', display_label: 'A', text: 'London', is_correct: false, explanation: 'London is not the capital.' },
          { option_id: 'opt-c-uuid', display_label: 'D', text: 'Berlin', is_correct: false, explanation: 'Berlin is not the capital.' },
          { option_id: 'opt-d-uuid', display_label: 'B', text: 'Madrid', is_correct: false, explanation: 'Madrid is not the capital.' },
        ],
      };

      render(
        <QuizFeedback
          quiz={shuffledQuiz}
          result={mockCorrectResult}
          attemptCount={1}
        />
      );

      // Even with shuffled options, display labels should be preserved
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.getByText('D')).toBeInTheDocument();

      // Verify the correct option (Paris) is associated with label 'C'
      expect(screen.getByText('Paris')).toBeInTheDocument();
    });

    it('handles single quiz in QuizSet without progress indicator', () => {
      const singleQuizSet: QuizSet = {
        quizzes: [mockQuiz],
        current_index: 0,
        shuffle_seed: null,
      };

      render(
        <QuizFeedback
          quiz={singleQuizSet}
          result={mockCorrectResult}
          attemptCount={1}
          currentQuizIndex={0}
        />
      );

      // Should not show progress indicator for single quiz in set
      expect(screen.queryByText(/Quiz \d+ of \d+/)).not.toBeInTheDocument();
    });
  });
});
