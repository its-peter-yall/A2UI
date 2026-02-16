// RevisionPage.test.tsx
// Integration tests for RevisionPage component

// Tests header rendering for both modes, data loading, navigation,
// and revision-specific progress bar.

// @see: RevisionPage.tsx
// @see: LearningPage.test.tsx (pattern reference)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type {
  LearningSessionWithNodes,
  RevisionSessionWithProgress,
  RevisionNodeProgressWithDetails,
} from '@/types/learning';

// Mock learningApi
vi.mock('@/lib/learningApi', () => ({
  getLearningSession: vi.fn(),
  getRevisionSession: vi.fn(),
  markNodeReviewed: vi.fn(),
  submitRevisionQuiz: vi.fn(),
}));

import * as api from '@/lib/learningApi';

// Mock MarkdownRenderer
vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => (
      <div {...filterMotionProps(props)}>{children as ReactNode}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/**
 * Filter out framer-motion specific props that would cause React warnings.
 */
function filterMotionProps(props: Record<string, unknown>): Record<string, unknown> {
  const motionKeys = ['variants', 'initial', 'animate', 'exit', 'custom', 'transition'];
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!motionKeys.includes(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

// Mutable params for per-test control
let mockSessionId: string | undefined = 'session-1';
let mockRevisionId: string | undefined = 'revision-1';
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ sessionId: mockSessionId, revisionId: mockRevisionId }),
  };
});

// Import after mocks
import { RevisionPage } from './RevisionPage';

function createOriginalSession(
  overrides: Partial<LearningSessionWithNodes> = {}
): LearningSessionWithNodes {
  return {
    id: 'session-1',
    user_id: null,
    query: 'test topic',
    course_title: 'Test Course Title',
    total_nodes: 2,
    completed_nodes: 2,
    last_active_node_id: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: null,
    nodes: [
      {
        id: 'node-0',
        learning_session_id: 'session-1',
        sequence_index: 0,
        title: 'Topic 1',
        content_markdown: 'Content for topic 1',
        status: 'COMPLETED',
        error_message: null,
        retry_available: false,
        quiz: {
          question_text: 'Quiz question 1?',
          options: [
            { option_id: 'q1-a', display_label: 'A', text: 'Answer A', is_correct: true, explanation: 'Correct' },
            { option_id: 'q1-b', display_label: 'B', text: 'Answer B', is_correct: false, explanation: 'Wrong' },
          ],
          difficulty: 'easy',
        },
        quiz_set: null,
        quiz_hidden: null,
        quiz_set_hidden: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: null,
      },
      {
        id: 'node-1',
        learning_session_id: 'session-1',
        sequence_index: 1,
        title: 'Topic 2',
        content_markdown: 'Content for topic 2',
        status: 'COMPLETED',
        error_message: null,
        retry_available: false,
        quiz: {
          question_text: 'Quiz question 2?',
          options: [
            { option_id: 'q2-a', display_label: 'A', text: 'Choice A', is_correct: false, explanation: 'Wrong' },
            { option_id: 'q2-b', display_label: 'B', text: 'Choice B', is_correct: true, explanation: 'Correct' },
          ],
          difficulty: 'medium',
        },
        quiz_set: null,
        quiz_hidden: null,
        quiz_set_hidden: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: null,
      },
    ],
    ...overrides,
  };
}

function createRevisionNodes(
  statuses: Array<{ nodeId: string; status: RevisionNodeProgressWithDetails['status'] }> = []
): RevisionNodeProgressWithDetails[] {
  const defaults = [
    { nodeId: 'node-0', status: 'pending' as const },
    { nodeId: 'node-1', status: 'pending' as const },
  ];
  const items = statuses.length > 0 ? statuses : defaults;

  return items.map((item, index) => ({
    id: `progress-${index}`,
    node_id: item.nodeId,
    node_title: `Topic ${index + 1}`,
    sequence_index: index,
    status: item.status,
    reviewed_at: item.status !== 'pending' ? '2025-01-01T01:00:00Z' : null,
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
    started_at: '2025-01-01T00:00:00Z',
    completed_at: null,
    nodes: createRevisionNodes(),
    ...overrides,
  };
}

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('RevisionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionId = 'session-1';
    mockRevisionId = 'revision-1';
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Header rendering', () => {
    it('renders correct header for full_review mode', async () => {
      const originalSession = createOriginalSession();
      const revisionSession = createRevisionSession({ mode: 'full_review' });

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      const header = await screen.findByTestId('revision-header');
      expect(header).toHaveTextContent(/Revision #1/);
      expect(header).toHaveTextContent(/Full Review/);
    });

    it('renders correct header for quiz_only mode', async () => {
      const originalSession = createOriginalSession();
      const revisionSession = createRevisionSession({
        mode: 'quiz_only',
        revision_number: 3,
      });

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      const header = await screen.findByTestId('revision-header');
      expect(header).toHaveTextContent(/Revision #3/);
      expect(header).toHaveTextContent(/Quiz Only/);
    });
  });

  describe('Data loading', () => {
    it('loads both original session and revision data', async () => {
      const originalSession = createOriginalSession();
      const revisionSession = createRevisionSession();

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(api.getLearningSession).toHaveBeenCalledWith('session-1');
        expect(api.getRevisionSession).toHaveBeenCalledWith('revision-1');
      });

      // Course title from original session should appear
      expect(await screen.findByText('Test Course Title')).toBeInTheDocument();
    });

    it('shows loading state while data is being fetched', () => {
      // Don't resolve the promises
      (api.getLearningSession as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

      render(<RevisionPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/loading revision session/i)).toBeInTheDocument();
    });

    it('shows missing ID message when sessionId is undefined', () => {
      mockSessionId = undefined;

      render(<RevisionPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/missing session or revision id/i)).toBeInTheDocument();
    });

    it('shows missing ID message when revisionId is undefined', () => {
      mockRevisionId = undefined;

      render(<RevisionPage />, { wrapper: createWrapper() });

      expect(screen.getByText(/missing session or revision id/i)).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('dashboard button navigates to /learn', async () => {
      const originalSession = createOriginalSession();
      const revisionSession = createRevisionSession();

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      const dashboardBtn = await screen.findByTestId('back-to-dashboard');
      fireEvent.click(dashboardBtn);

      expect(mockNavigate).toHaveBeenCalledWith('/learn');
    });
  });

  describe('Revision progress bar', () => {
    it('shows revision-specific progress (not original session progress)', async () => {
      const originalSession = createOriginalSession();
      const revisionSession = createRevisionSession({
        nodes: createRevisionNodes([
          { nodeId: 'node-0', status: 'reviewed' },
          { nodeId: 'node-1', status: 'pending' },
        ]),
      });

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      const progressBar = await screen.findByTestId('revision-progress-bar');
      expect(progressBar).toBeInTheDocument();
      // 1 of 2 completed = 50%
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
      expect(screen.getByText('1 / 2 completed')).toBeInTheDocument();
    });

    it('shows 0% when no nodes are completed', async () => {
      const originalSession = createOriginalSession();
      const revisionSession = createRevisionSession();

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      const progressBar = await screen.findByTestId('revision-progress-bar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
      expect(screen.getByText('0 / 2 completed')).toBeInTheDocument();
    });

    it('shows 100% when all nodes are completed', async () => {
      const originalSession = createOriginalSession();
      const revisionSession = createRevisionSession({
        nodes: createRevisionNodes([
          { nodeId: 'node-0', status: 'quiz_passed' },
          { nodeId: 'node-1', status: 'reviewed' },
        ]),
      });

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      const progressBar = await screen.findByTestId('revision-progress-bar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
      expect(screen.getByText('2 / 2 completed')).toBeInTheDocument();
    });
  });

  describe('Content display', () => {
    it('renders RevisionConceptCard for the current node', async () => {
      const originalSession = createOriginalSession();
      const revisionSession = createRevisionSession();

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      // Should show the first node's card
      await waitFor(() => {
        expect(screen.getByTestId('revision-concept-card')).toBeInTheDocument();
      });
      expect(screen.getByText('Topic 1')).toBeInTheDocument();
    });

    it('shows course title from original session', async () => {
      const originalSession = createOriginalSession({ course_title: 'Advanced Physics' });
      const revisionSession = createRevisionSession();

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      expect(await screen.findByText('Advanced Physics')).toBeInTheDocument();
    });

    it('shows slide counter with total nodes', async () => {
      const originalSession = createOriginalSession();
      const revisionSession = createRevisionSession();

      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(originalSession);
      (api.getRevisionSession as ReturnType<typeof vi.fn>).mockResolvedValue(revisionSession);

      render(<RevisionPage />, { wrapper: createWrapper() });

      expect(await screen.findByText('Topic 1 of 2')).toBeInTheDocument();
    });
  });
});
