/**
 * ============================================================================
 * FILE: e2e.test.tsx
 * LOCATION: client/src/features/learning/__tests__/e2e.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    End-to-end integration tests for the learning feature. Tests complete
 *    user flows from topic input through mastery achievement, validating
 *    component integration and state transitions across the learning journey.
 *
 * ROLE IN PROJECT:
 *    Provides confidence that the full learning flow works end-to-end by
 *    testing component integration rather than isolated units. Catches
 *    regressions in navigation, state transitions, and API interactions.
 *
 * KEY COMPONENTS:
 *    - Topic input to session navigation flow
 *    - Explanation → quiz transition on proceed
 *    - Retry flow on incorrect answer
 *    - Node unlock on correct answer
 *    - Error state and completion overlay
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query, react-router-dom
 *    - Internal: ../LearningHome, ../LearningPage, @/lib/learningApi, @/types/learning
 *
 * USAGE:
 *    ```bash
 *    npm run test -- src/features/learning/__tests__/e2e.test.tsx
 *    npm run test -- -t "navigates from topic input"
 *    ```
 * ============================================================================
 */

// e2e.test.tsx
// End-to-end integration tests for the learning feature

// Tests complete user flows: topic input, session creation, explanation viewing,
// quiz progression, answer submission, and mastery achievement.
// Verifies component integration and state transitions across the learning journey.

// @see: client/src/features/learning/LearningHome.tsx
// @see: client/src/features/learning/LearningPage.tsx
// @note: Uses mocked API to avoid external dependencies

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LearningHome } from '../LearningHome';
import { LearningPage } from '../LearningPage';
import type {
  ConceptNode,
  LearningSessionWithNodes,
  QuizCard,
  QuizSubmitResponse,
} from '@/types/learning';
import * as api from '@/lib/learningApi';

vi.mock('@/lib/learningApi', () => ({
  generateCourse: vi.fn(),
  getLearningSession: vi.fn(),
  transitionNode: vi.fn(),
  submitQuiz: vi.fn(),
  retryQuiz: vi.fn(),
  regenerateNode: vi.fn(),
  getQuizAttempts: vi.fn(),
  updateLastActiveNode: vi.fn().mockResolvedValue(undefined),
  getSessionsList: vi.fn().mockResolvedValue({
    sessions: [],
    total_count: 0,
    has_more: false,
  }),
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createQuiz = (overrides: Partial<QuizCard> = {}): QuizCard => ({
  question_text: 'What is inertia?',
  difficulty: 'easy',
  options: [
    { option_id: 'opt-a-uuid', display_label: 'A', text: 'Resistance to change', is_correct: true, explanation: 'Correct!' },
    { option_id: 'opt-b-uuid', display_label: 'B', text: 'Speed of motion', is_correct: false, explanation: 'Wrong' },
    { option_id: 'opt-c-uuid', display_label: 'C', text: 'Force applied', is_correct: false, explanation: 'Wrong' },
    { option_id: 'opt-d-uuid', display_label: 'D', text: 'Mass of object', is_correct: false, explanation: 'Wrong' },
  ],
  ...overrides,
});

const createMockNode = (overrides: Partial<ConceptNode> = {}): ConceptNode => ({
  id: 'node-1',
  learning_session_id: 'session-1',
  sequence_index: 0,
  title: 'Newton’s First Law',
  content_markdown: '# First Law\n\nAn object at rest stays at rest.',
  status: 'VIEWING_EXPLANATION',
  error_message: null,
  retry_available: false,
  quiz: createQuiz(),
  quiz_set: null,
  quiz_hidden: null,
  quiz_set_hidden: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const createSession = (
  nodes: ConceptNode[],
  overrides: Partial<LearningSessionWithNodes> = {}
): LearningSessionWithNodes => ({
  id: 'session-1',
  user_id: null,
  query: 'Newton’s Laws',
  course_title: 'Newton’s Laws of Motion',
  total_nodes: nodes.length,
  completed_nodes: nodes.filter((node) => node.status === 'COMPLETED').length,
  last_active_node_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  nodes,
  ...overrides,
});

const renderRoutes = (initialEntries: string[]) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/learn" element={<LearningHome />} />
          <Route path="/learn/:sessionId" element={<LearningPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Learning feature integration flow', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: vi.fn(),
      writable: true,
    });
    vi.clearAllMocks();
    const mockSettings = {
      activeProvider: 'openrouter',
      providers: {
        openrouter: {
          apiKey: 'sk-or-test-key-123456',
          model: 'openai/gpt-4o',
          modelTitle: 'GPT-4o',
          thinking: { enabled: false, effort: 'high' }
        },
        generalcompute: {
          apiKey: '',
          model: '',
          modelTitle: '',
          thinking: { enabled: false, effort: 'high' }
        }
      }
    };
    localStorage.setItem('ai_provider_settings', JSON.stringify(mockSettings));
  });

  it('navigates from topic input to session page', async () => {
    const node = createMockNode();
    const session = createSession([node]);
    (api.generateCourse as ReturnType<typeof vi.fn>).mockResolvedValue(session);
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    renderRoutes(['/learn']);

    const input = screen.getByPlaceholderText(/what do you want to learn/i);
    fireEvent.change(input, { target: { value: 'Newton’s Laws' } });
    fireEvent.submit(screen.getByRole('search'));

    await waitFor(() => {
      const calls = (api.generateCourse as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toEqual({
        query: 'Newton’s Laws',
        user_id: undefined,
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText('Newton’s Laws of Motion').length).toBeGreaterThan(0);
    });
  });

  it('shows explanation first and transitions to quiz on proceed', async () => {
    const node = createMockNode();
    const session = createSession([node]);
    const quizSession = createSession([
      { ...node, status: 'IN_QUIZ' },
    ]);

    (api.getLearningSession as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(session)
      .mockResolvedValue(quizSession);
    (api.transitionNode as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...node,
      status: 'IN_QUIZ',
    });

    renderRoutes(['/learn/session-1']);

    await waitFor(() => {
      expect(screen.getByText('Newton’s First Law')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/an object at rest stays at rest/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('What is inertia?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /proceed to quiz/i }));

    await waitFor(() => {
      expect(api.transitionNode).toHaveBeenCalledWith('node-1', 'IN_QUIZ');
    });

    await waitFor(() => {
      expect(screen.getByText('What is inertia?')).toBeInTheDocument();
    });
  });

  it('shows retry flow when quiz answer is incorrect', async () => {
    const node = createMockNode({ status: 'IN_QUIZ' });
    const session = createSession([node]);
    const feedbackSession = createSession([
      { ...node, status: 'SHOWING_FEEDBACK' },
    ]);

    const result: QuizSubmitResponse = {
      node_id: 'node-1',
      attempt_number: 1,
      is_correct: false,
      score_percent: 0,
      correct_option_id: 'opt-a-uuid',
      selected_option_id: 'opt-b-uuid',
      explanation: 'Wrong answer',
      is_mastered: false,
      next_node_unlocked: false,
      node_status: 'SHOWING_FEEDBACK',
    };

    (api.getLearningSession as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(session)
      .mockResolvedValue(feedbackSession);
    (api.submitQuiz as ReturnType<typeof vi.fn>).mockResolvedValue(result);

    renderRoutes(['/learn/session-1']);

    await waitFor(() => {
      expect(screen.getByText('What is inertia?')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/speed of motion/i));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    await waitFor(() => {
      expect(api.submitQuiz).toHaveBeenCalledWith('node-1', 'opt-b-uuid', 0);
    });

    await waitFor(() => {
      expect(screen.getByText('Incorrect')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  it('unlocks next node when quiz answer is correct', async () => {
    const node = createMockNode({ status: 'IN_QUIZ' });
    const nextNode = createMockNode({
      id: 'node-2',
      title: 'Newton’s Second Law',
      sequence_index: 1,
      status: 'LOCKED',
    });
    const session = createSession([node, nextNode]);
    const feedbackSession = createSession([
      { ...node, status: 'SHOWING_FEEDBACK' },
      nextNode,
    ]);
    const unlockedSession = createSession([
      { ...node, status: 'COMPLETED' },
      { ...nextNode, status: 'VIEWING_EXPLANATION' },
    ]);

    const result: QuizSubmitResponse = {
      node_id: 'node-1',
      attempt_number: 1,
      is_correct: true,
      score_percent: 100,
      correct_option_id: 'A',
      selected_option_id: 'A',
      explanation: 'Correct!',
      is_mastered: true,
      next_node_unlocked: true,
      node_status: 'SHOWING_FEEDBACK',
    };

    let currentSessionState = session;
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockImplementation(async () => currentSessionState);
    (api.submitQuiz as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      currentSessionState = feedbackSession;
      return result;
    });
    (api.transitionNode as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      currentSessionState = unlockedSession;
      return {
        id: 'node-1',
        status: 'SHOWING_FEEDBACK',
      };
    });

    renderRoutes(['/learn/session-1']);

    await waitFor(() => {
      expect(screen.getByText('What is inertia?')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/resistance to change/i));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /continue to next topic/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /continue to next topic/i }));

    await waitFor(() => {
      expect(screen.getByText('Newton’s Second Law')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /proceed to quiz/i })
      ).toBeInTheDocument();
    });
  });

  it('shows error state when session fails to load', async () => {
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    );

    renderRoutes(['/learn/session-1']);

    await waitFor(() => {
      expect(screen.getByText('Failed to load session')).toBeInTheDocument();
      expect(
        screen.getByText(/couldn't load your learning session/i)
      ).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  it('shows completion overlay when all nodes are complete', async () => {
    const completedSession = createSession([
      createMockNode({ status: 'COMPLETED' }),
    ]);
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      completedSession
    );

    renderRoutes(['/learn/session-1']);

    await waitFor(() => {
      expect(screen.getByText('Course Complete!')).toBeInTheDocument();
    });
  });
});
