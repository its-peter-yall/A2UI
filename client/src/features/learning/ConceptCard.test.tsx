/**
 * ============================================================================
 * FILE: ConceptCard.test.tsx
 * LOCATION: client/src/features/learning/ConceptCard.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for ConceptCard component. Validates rendering across all
 *    node states and callback behaviour.
 *
 * ROLE IN PROJECT:
 *    Ensures ConceptCard correctly renders locked, explanation, quiz,
 *    completed, and error states, and that interaction callbacks fire as
 *    expected for each state transition.
 *
 * KEY COMPONENTS:
 *    - LOCKED: Shows "complete previous topic" message
 *    - VIEWING_EXPLANATION: Shows content with proceed button
 *    - IN_QUIZ: Shows quiz options and submit button
 *    - COMPLETED: Shows "Topic Mastered" with review option
 *    - ERROR: Shows retry button and partial content toggle
 *    - Feedback loading/error states for quiz attempts
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query
 *    - Internal: ./ConceptCard, @/lib/learningApi (mocked)
 *
 * USAGE:
 *    ```bash
 *    npm run test -- src/features/learning/ConceptCard.test.tsx
 *    ```
 * ============================================================================
 */

// ConceptCard.test.tsx
// Tests for ConceptCard component

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConceptCard } from './ConceptCard';
import type { ReactNode } from 'react';
import type { ConceptNode } from '@/types/learning';
import * as api from '@/lib/learningApi';

vi.mock('@/lib/learningApi', () => ({
  getQuizAttempts: vi.fn(),
}));

const mockNode: ConceptNode = {
  id: 'node-1',
  learning_session_id: 'session-1',
  sequence_index: 0,
  title: 'Test Topic',
  content_markdown: '# Test Content\n\nThis is test content.',
  status: 'VIEWING_EXPLANATION',
  error_message: null,
  retry_available: false,
  quiz: {
    question_text: 'What is the answer?',
    options: [
      { option_id: 'opt-a-uuid', display_label: 'A', text: 'Option A', is_correct: false, explanation: 'Wrong' },
      { option_id: 'opt-b-uuid', display_label: 'B', text: 'Option B', is_correct: true, explanation: 'Correct!' },
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
};

const mockQuizSetHiddenNode: ConceptNode = {
  ...mockNode,
  id: 'node-quizset',
  quiz: null,
  quiz_hidden: null,
  quiz_set_hidden: {
    quizzes: [
      {
        question_text: 'First quiz question?',
        options: [
          { option_id: 'q1-a', display_label: 'A', text: 'First Option' },
          { option_id: 'q1-b', display_label: 'B', text: 'Second Option' },
        ],
        difficulty: 'easy',
      },
      {
        question_text: 'Second quiz question?',
        options: [
          { option_id: 'q2-a', display_label: 'A', text: 'Third Option' },
          { option_id: 'q2-b', display_label: 'B', text: 'Fourth Option' },
        ],
        difficulty: 'medium',
      },
      {
        question_text: 'Third quiz question?',
        options: [
          { option_id: 'q3-a', display_label: 'A', text: 'Fifth Option' },
          { option_id: 'q3-b', display_label: 'B', text: 'Sixth Option' },
        ],
        difficulty: 'hard',
      },
    ],
    current_index: 0,
    total_quizzes: 3,
  },
};

describe('ConceptCard', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  it('renders locked state correctly', () => {
    render(<ConceptCard node={{ ...mockNode, status: 'LOCKED' }} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText(/complete the previous topic/i)).toBeInTheDocument();
  });

  it('renders explanation with proceed button', () => {
    render(<ConceptCard node={mockNode} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText(/proceed to quiz/i)).toBeInTheDocument();
  });

  it('calls onProceedToQuiz when button clicked', () => {
    const onProceed = vi.fn();
    render(<ConceptCard node={mockNode} onProceedToQuiz={onProceed} />, {
      wrapper: createWrapper(),
    });
    fireEvent.click(screen.getByText(/proceed to quiz/i));
    expect(onProceed).toHaveBeenCalledWith('node-1');
  });

  it('renders quiz options in IN_QUIZ state', () => {
    render(<ConceptCard node={{ ...mockNode, status: 'IN_QUIZ' }} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.getByText('Submit Answer')).toBeInTheDocument();
  });

  it('renders QuizSet with progress indicator', () => {
    render(
      <ConceptCard node={{ ...mockQuizSetHiddenNode, status: 'IN_QUIZ' }} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText('Quiz 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('First quiz question?')).toBeInTheDocument();
    expect(screen.getByText('First Option')).toBeInTheDocument();
    expect(screen.getByText('Second Option')).toBeInTheDocument();
  });

  it('calls onQuizSubmit with quiz_index for single quiz', () => {
    const onQuizSubmit = vi.fn();
    render(
      <ConceptCard
        node={{ ...mockNode, status: 'IN_QUIZ' }}
        onQuizSubmit={onQuizSubmit}
      />,
      { wrapper: createWrapper() }
    );
    fireEvent.click(screen.getByText('Option A'));
    fireEvent.click(screen.getByText('Submit Answer'));
    expect(onQuizSubmit).toHaveBeenCalledWith('node-1', 'opt-a-uuid', 0);
  });

  it('calls onQuizSubmit with correct quiz_index for QuizSet', () => {
    const onQuizSubmit = vi.fn();
    render(
      <ConceptCard
        node={{
          ...mockQuizSetHiddenNode,
          status: 'IN_QUIZ',
          quiz_set_hidden: {
            ...mockQuizSetHiddenNode.quiz_set_hidden!,
            current_index: 1,
          },
        }}
        onQuizSubmit={onQuizSubmit}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText('Quiz 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Second quiz question?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Third Option'));
    fireEvent.click(screen.getByText('Submit Answer'));
    expect(onQuizSubmit).toHaveBeenCalledWith('node-quizset', 'q2-a', 1);
  });

  it('renders completed state with review option', () => {
    render(<ConceptCard node={{ ...mockNode, status: 'COMPLETED' }} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText(/topic mastered/i)).toBeInTheDocument();
    expect(screen.getByText(/review explanation/i)).toBeInTheDocument();
  });

  it('renders error state with retry button and partial content', () => {
    const onRegenerate = vi.fn();
    render(
      <ConceptCard
        node={{ ...mockNode, status: 'ERROR' }}
        onRegenerate={onRegenerate}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/content generation failed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/show partial content/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(/retry generation/i));
    expect(onRegenerate).toHaveBeenCalledWith('node-1');
  });

  it('renders skip button when canSkip is true', () => {
    const onSkipNode = vi.fn();
    render(
      <ConceptCard
        node={{ ...mockNode, status: 'ERROR' }}
        onSkipNode={onSkipNode}
        canSkip
      />,
      { wrapper: createWrapper() }
    );
    fireEvent.click(screen.getByText(/skip for now/i));
    expect(onSkipNode).toHaveBeenCalledWith('node-1');
  });

  it('shows loading feedback state while quiz attempts load', async () => {
    (api.getQuizAttempts as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    render(
      <ConceptCard node={{ ...mockNode, status: 'SHOWING_FEEDBACK' }} />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText(/loading quiz feedback/i)).toBeInTheDocument();
    });
  });

  it('shows feedback error state when attempts fail to load', async () => {
    (api.getQuizAttempts as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Failed to load attempts')
    );

    render(
      <ConceptCard node={{ ...mockNode, status: 'SHOWING_FEEDBACK' }} />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText(/unable to load feedback/i)).toBeInTheDocument();
    });
  });

  it('renders complexity badge when node has complexity', () => {
    render(
      <ConceptCard node={{ ...mockNode, complexity: 'Advanced' }} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('does not render complexity badge when node has no complexity', () => {
    render(
      <ConceptCard node={{ ...mockNode, complexity: undefined }} />,
      { wrapper: createWrapper() }
    );
    expect(screen.queryByText(/Basic|Intermediate|Advanced/)).not.toBeInTheDocument();
  });

  it('renders difficulty label in IN_QUIZ state with QuizSet', () => {
    render(
      <ConceptCard
        node={{
          ...mockQuizSetHiddenNode,
          status: 'IN_QUIZ',
        }}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText('Easy')).toBeInTheDocument();
    expect(screen.getByText('Quiz 1 of 3')).toBeInTheDocument();
  });

  it('calls onNextQuiz when Next Quiz button clicked after correct answer', async () => {
    const onNextQuiz = vi.fn();
    const feedbackResult = {
      node_id: 'node-quizset',
      is_correct: true,
      is_mastered: false,
      selected_option_id: 'q1-a',
      correct_option_id: 'q1-a',
      explanation: 'Correct explanation',
      selected_explanation: '',
      score_percent: 50,
      quiz_index: 0,
      next_node_unlocked: false,
      attempt_number: 1,
      node_status: 'SHOWING_FEEDBACK' as const,
    };
    
    render(
      <ConceptCard 
        node={{
          ...mockQuizSetHiddenNode,
          status: 'SHOWING_FEEDBACK',
          quiz_set: {
            quizzes: [
              {
                question_text: 'First quiz question?',
                options: [
                  { option_id: 'q1-a', display_label: 'A', text: 'First Option', is_correct: true, explanation: 'Correct!' },
                  { option_id: 'q1-b', display_label: 'B', text: 'Second Option', is_correct: false, explanation: 'Wrong' },
                ],
                difficulty: 'easy',
              },
              {
                question_text: 'Second quiz question?',
                options: [
                  { option_id: 'q2-a', display_label: 'A', text: 'Third Option', is_correct: true, explanation: 'Correct!' },
                  { option_id: 'q2-b', display_label: 'B', text: 'Fourth Option', is_correct: false, explanation: 'Wrong' },
                ],
                difficulty: 'medium',
              },
              {
                question_text: 'Third quiz question?',
                options: [
                  { option_id: 'q3-a', display_label: 'A', text: 'Fifth Option', is_correct: true, explanation: 'Correct!' },
                  { option_id: 'q3-b', display_label: 'B', text: 'Sixth Option', is_correct: false, explanation: 'Wrong' },
                ],
                difficulty: 'hard',
              },
            ],
            current_index: 0,
            shuffle_seed: null,
          },
        }}
        quizResult={feedbackResult}
        onNextQuiz={onNextQuiz}
      />,
      { wrapper: createWrapper() }
    );
    
    await waitFor(() => {
      const nextButton = screen.getByRole('button', { name: /next quiz/i });
      expect(nextButton).toBeInTheDocument();
    });

    const nextButton = screen.getByRole('button', { name: /next quiz/i });
    fireEvent.click(nextButton);
    
    expect(onNextQuiz).toHaveBeenCalledTimes(1);
  });
});
