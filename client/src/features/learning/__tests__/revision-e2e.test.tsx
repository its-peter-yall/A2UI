/**
 * ============================================================================
 * FILE: revision-e2e.test.tsx
 * LOCATION: client/src/features/learning/__tests__/revision-e2e.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    End-to-end integration tests for revision session user flows.
 *
 * ROLE IN PROJECT:
 *    Validates the full revision experience across LearningHome and RevisionPage,
 *    covering revision launch, full-review vs quiz-only modes, mark-as-reviewed
 *    mutations, quiz submission tracking, completion summary display, performance
 *    comparison, and the revise-again flow. All API endpoints are mocked.
 *
 * KEY COMPONENTS:
 *    - Revision e2e flows: Test suite for all revision interaction paths
 *    - renderHomeFlow / renderRevisionFlow: Render helpers with router + query context
 *    - Factory helpers: createDashboardSession, createNode, createRevisionSession, createSummary
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query, react-router-dom
 *    - Internal: ../LearningHome, ../RevisionPage, @/lib/learningApi, @/types/learning
 *
 * USAGE:
 *    npm run test -- src/features/learning/__tests__/revision-e2e.test.tsx
 * ============================================================================
 */
// revision-e2e.test.tsx
// Integration tests for revision end-to-end user flows.
//
// Covers revision launch from dashboard, full-review and quiz-only rendering,
// mutation-driven DOM updates, revision completion summary, and revise-again flow.
//
// @see: client/src/features/learning/LearningHome.tsx
// @see: client/src/features/learning/RevisionPage.tsx
// @note: Revision API endpoints are mocked to keep tests deterministic.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import type {
  ConceptNode,
  LearningSessionSummary,
  LearningSessionWithNodes,
  RevisionNodeProgressWithDetails,
  RevisionSessionWithProgress,
  RevisionSummary,
} from '@/types/learning';
import { LearningHome } from '../LearningHome';
import { RevisionPage } from '../RevisionPage';
import * as learningApi from '@/lib/learningApi';

vi.mock('@/lib/learningApi', () => ({
  generateCourse: vi.fn(),
  getSessionsList: vi.fn(),
  getRevisionsList: vi.fn(),
  createRevisionSession: vi.fn(),
  getLearningSession: vi.fn(),
  getRevisionSession: vi.fn(),
  getRevisionSummary: vi.fn(),
  markNodeReviewed: vi.fn(),
  submitRevisionQuiz: vi.fn(),
}));

function createDashboardSession(
  overrides: Partial<LearningSessionSummary> = {}
): LearningSessionSummary {
  return {
    id: 'session-1',
    query: 'Learn quantum mechanics',
    course_title: 'Quantum Mechanics',
    status: 'completed',
    progress_percent: 100,
    total_nodes: 2,
    completed_nodes: 2,
    last_active_node_title: 'Wave Functions',
    created_at: '2025-02-01T09:00:00Z',
    updated_at: '2025-02-01T10:00:00Z',
    completed_at: '2025-02-01T10:00:00Z',
    revision_count: 0,
    ...overrides,
  };
}

function createNode(
  overrides: Partial<ConceptNode> = {}
): ConceptNode {
  return {
    id: 'node-1',
    learning_session_id: 'session-1',
    sequence_index: 0,
    title: 'Wave-Particle Duality',
    content_markdown: 'Content one',
    status: 'COMPLETED',
    error_message: null,
    retry_available: false,
    quiz: {
      question_text: 'Which option is correct?',
      difficulty: 'easy',
      options: [
        {
          option_id: 'opt-a',
          display_label: 'A',
          text: 'Correct answer',
          is_correct: true,
          explanation: 'Correct',
        },
        {
          option_id: 'opt-b',
          display_label: 'B',
          text: 'Wrong answer',
          is_correct: false,
          explanation: 'Wrong',
        },
      ],
    },
    quiz_set: null,
    quiz_hidden: null,
    quiz_set_hidden: null,
    created_at: '2025-02-01T09:00:00Z',
    updated_at: '2025-02-01T09:00:00Z',
    ...overrides,
  };
}

function createOriginalSession(
  overrides: Partial<LearningSessionWithNodes> = {}
): LearningSessionWithNodes {
  return {
    id: 'session-1',
    user_id: null,
    query: 'Learn quantum mechanics',
    course_title: 'Quantum Mechanics',
    total_nodes: 2,
    completed_nodes: 2,
    last_active_node_id: null,
    created_at: '2025-02-01T09:00:00Z',
    updated_at: '2025-02-01T10:00:00Z',
    nodes: [
      createNode(),
      createNode({
        id: 'node-2',
        sequence_index: 1,
        title: 'Uncertainty Principle',
        content_markdown: 'Content two',
      }),
    ],
    ...overrides,
  };
}

function createRevisionNodes(
  overrides: Array<Partial<RevisionNodeProgressWithDetails>> = []
): RevisionNodeProgressWithDetails[] {
  const defaults: RevisionNodeProgressWithDetails[] = [
    {
      id: 'progress-1',
      node_id: 'node-1',
      node_title: 'Wave-Particle Duality',
      sequence_index: 0,
      status: 'pending',
      reviewed_at: null,
    },
    {
      id: 'progress-2',
      node_id: 'node-2',
      node_title: 'Uncertainty Principle',
      sequence_index: 1,
      status: 'pending',
      reviewed_at: null,
    },
  ];

  return defaults.map((item, index) => ({
    ...item,
    ...overrides[index],
  }));
}

function createRevisionSession(
  overrides: Partial<RevisionSessionWithProgress> = {}
): RevisionSessionWithProgress {
  return {
    id: 'revision-1',
    original_session_id: 'session-1',
    revision_number: 1,
    mode: 'full_review',
    status: 'in_progress',
    progress_percent: 0,
    total_quiz_score_percent: null,
    started_at: '2025-02-01T10:30:00Z',
    completed_at: null,
    nodes: createRevisionNodes(),
    ...overrides,
  };
}

function createSummary(
  overrides: Partial<RevisionSummary> = {}
): RevisionSummary {
  return {
    revision_id: 'revision-1',
    mode: 'full_review',
    progress_percent: 100,
    total_quiz_score_percent: 80,
    nodes_reviewed: 2,
    nodes_total: 2,
    quizzes_passed: 2,
    quizzes_failed: 0,
    quizzes_total: 2,
    time_spent_seconds: 120,
    comparison: {
      original_quiz_score_percent: 60,
      improvement_percent: 20,
    },
    ...overrides,
  };
}

function LocationTracker() {
  const location = useLocation();
  return (
    <>
      <div data-testid="location-path">{location.pathname}</div>
      <div data-testid="location-state">
        {JSON.stringify(location.state ?? {})}
      </div>
    </>
  );
}

function renderHomeFlow() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/learn']}>
        <LocationTracker />
        <Routes>
          <Route path="/learn" element={<LearningHome />} />
          <Route path="/learn/:sessionId" element={<div>Learning Session</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderRevisionFlow(initialPath: string = '/learn/session-1/revise/revision-1') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LocationTracker />
        <Routes>
          <Route path="/learn" element={<div>Dashboard</div>} />
          <Route path="/learn/:sessionId/revise/:revisionId" element={<RevisionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Revision e2e flows', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('start full_review revision creates session and navigates', async () => {
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [createDashboardSession()],
      total_count: 1,
      has_more: false,
    });
    (learningApi.createRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'revision-1',
      original_session_id: 'session-1',
      revision_number: 1,
      mode: 'full_review',
      status: 'in_progress',
      progress_percent: 0,
      total_quiz_score_percent: null,
      started_at: '2025-02-01T10:30:00Z',
      completed_at: null,
    });

    renderHomeFlow();

    fireEvent.click(await screen.findByRole('button', { name: /revise course/i }));

    await waitFor(() => {
      expect(learningApi.createRevisionSession).toHaveBeenCalledWith(
        'session-1',
        { mode: 'full_review' }
      );
      expect(screen.getByTestId('location-path')).toHaveTextContent('/learn/session-1/revise/revision-1');
    });
  });

  it('full review shows all content unlocked', async () => {
    (learningApi.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createOriginalSession()
    );
    (learningApi.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createRevisionSession()
    );

    renderRevisionFlow();

    await screen.findByText('Content one');
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText('Content two')).toBeInTheDocument();
    });
  });

  it('mark as reviewed updates badge', async () => {
    (learningApi.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createOriginalSession()
    );
    (learningApi.getRevisionSession as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(createRevisionSession())
      .mockResolvedValue(
        createRevisionSession({
          nodes: createRevisionNodes([{ status: 'reviewed', reviewed_at: '2025-02-01T11:00:00Z' }]),
        })
      );
    (learningApi.markNodeReviewed as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });

    renderRevisionFlow();

    fireEvent.click(await screen.findByTestId('mark-reviewed-button'));

    await waitFor(() => {
      expect(learningApi.markNodeReviewed).toHaveBeenCalledWith('revision-1', 'node-1');
      expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Reviewed');
    });
  });

  it('quiz submission in revision tracked separately', async () => {
    (learningApi.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createOriginalSession()
    );
    (learningApi.getRevisionSession as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(createRevisionSession())
      .mockResolvedValue(
        createRevisionSession({
          nodes: createRevisionNodes([{ status: 'quiz_passed' }]),
        })
      );
    (learningApi.submitRevisionQuiz as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'attempt-1',
      node_id: 'node-1',
      attempt_number: 1,
      selected_option_id: 'opt-a',
      is_correct: true,
      score_percent: 100,
      correct_option_id: 'opt-a',
      explanation: 'Correct',
      revision_node_status: 'quiz_passed',
    });

    renderRevisionFlow();

    fireEvent.click(await screen.findByLabelText(/correct answer/i));
    fireEvent.click(screen.getByTestId('revision-quiz-submit'));

    await waitFor(() => {
      expect(learningApi.submitRevisionQuiz).toHaveBeenCalledWith(
        'revision-1',
        'node-1',
        'opt-a',
        0
      );
      expect(screen.getByTestId('revision-status-badge')).toHaveTextContent('Passed');
    });
  });

  it('start quiz_only revision hides explanations', async () => {
    (learningApi.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createOriginalSession()
    );
    (learningApi.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createRevisionSession({ mode: 'quiz_only' })
    );

    renderRevisionFlow();

    await screen.findByTestId('revision-quiz-only-content');
    expect(screen.queryByText('Content one')).not.toBeInTheDocument();
    expect(screen.getByText('Which option is correct?')).toBeInTheDocument();
  });

  it('revision completion shows summary modal', async () => {
    (learningApi.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createOriginalSession()
    );
    (learningApi.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createRevisionSession({
        status: 'completed',
        completed_at: '2025-02-01T12:00:00Z',
      })
    );
    (learningApi.getRevisionSummary as ReturnType<typeof vi.fn>).mockResolvedValue(
      createSummary()
    );

    renderRevisionFlow();

    expect(await screen.findByText('Revision Complete!')).toBeInTheDocument();
  });

  it('performance comparison displays correctly', async () => {
    (learningApi.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createOriginalSession()
    );
    (learningApi.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createRevisionSession({
        status: 'completed',
        completed_at: '2025-02-01T12:00:00Z',
      })
    );
    (learningApi.getRevisionSummary as ReturnType<typeof vi.fn>).mockResolvedValue(
      createSummary({
        comparison: {
          original_quiz_score_percent: 60,
          improvement_percent: 20,
        },
      })
    );

    renderRevisionFlow();

    await screen.findByText('Revision Complete!');
    expect(screen.getByText('Performance Comparison')).toBeInTheDocument();
    expect(screen.getByTestId('original-score')).toHaveTextContent('60%');
    expect(screen.getByTestId('improvement-badge')).toHaveTextContent('+20%');
  });

  it('Revise Again creates new revision', async () => {
    (learningApi.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createOriginalSession()
    );
    (learningApi.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      createRevisionSession({
        status: 'completed',
        completed_at: '2025-02-01T12:00:00Z',
      })
    );
    (learningApi.getRevisionSummary as ReturnType<typeof vi.fn>).mockResolvedValue(
      createSummary()
    );
    (learningApi.createRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'revision-2',
      original_session_id: 'session-1',
      revision_number: 2,
      mode: 'full_review',
      status: 'in_progress',
      progress_percent: 0,
      total_quiz_score_percent: null,
      started_at: '2025-02-01T12:05:00Z',
      completed_at: null,
    });

    renderRevisionFlow();

    fireEvent.click(await screen.findByTestId('revise-again-btn'));

    await waitFor(() => {
      expect(learningApi.createRevisionSession).toHaveBeenCalledWith(
        'session-1',
        { mode: 'full_review' }
      );
      expect(screen.getByTestId('location-path')).toHaveTextContent(
        '/learn/session-1/revise/revision-2'
      );
    });
  });
});
