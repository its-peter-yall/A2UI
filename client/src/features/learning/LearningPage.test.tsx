/**
 * ============================================================================
 * FILE: LearningPage.test.tsx
 * LOCATION: client/src/features/learning/LearningPage.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Integration tests for the LearningPage session view component.
 *
 * ROLE IN PROJECT:
 *    Validates navigation controls (Dashboard button, New Topic link), React
 *    Query cache management (invalidation on unmount, staleTime), error states
 *    (404 not found, missing sessionId), resume banner display, and the
 *    beforeunload keepalive PATCH request for last-active node tracking.
 *
 * KEY COMPONENTS:
 *    - Navigation suite: Dashboard button, New Topic link, course title header
 *    - Cache management suite: Query invalidation on unmount, staleTime config
 *    - Error states suite: 404 handling, missing sessionId guard
 *    - Resume banner suite: last_active_node_id banner display
 *    - beforeunload suite: Keepalive fetch on page unload
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query, react-router-dom, axios
 *    - Internal: ./LearningPage, @/lib/learningApi, @/types/learning
 *
 * USAGE:
 *    npm run test -- src/features/learning/LearningPage.test.tsx
 * ============================================================================
 */
// LearningPage.test.tsx
// Integration tests for session switching and navigation guards

// Tests navigation (Dashboard button, New Topic link), cache management
// (invalidation on unmount, staleTime), error states (404 Course not found,
// missing sessionId), and resume banner display.

// @see: client/src/features/learning/LearningPage.tsx
// @note: Mocks react-router-dom hooks and learningApi; uses MemoryRouter for Link rendering

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import type { ReactNode } from 'react';
import type { LearningSessionWithNodes, NodeStatus } from '@/types/learning';

// Mock learningApi
vi.mock('@/lib/learningApi', () => ({
  generateCourse: vi.fn(),
  getLearningSession: vi.fn(),
  getConceptNode: vi.fn(),
  transitionNode: vi.fn(),
  submitQuiz: vi.fn(),
  retryQuiz: vi.fn(),
  getQuizAttempts: vi.fn(),
  regenerateNode: vi.fn(),
  updateLastActiveNode: vi.fn().mockResolvedValue(undefined),
}));

import * as api from '@/lib/learningApi';

// Mutable sessionId for per-test control
let mockSessionId: string | undefined = 'test-session';
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ sessionId: mockSessionId }),
  };
});

// Import after mocks
import { LearningPage } from './LearningPage';

function createSession(
  overrides: Partial<LearningSessionWithNodes> = {}
): LearningSessionWithNodes {
  return {
    id: 'test-session',
    user_id: null,
    query: 'test topic',
    course_title: 'Test Course Title',
    total_nodes: 2,
    completed_nodes: 0,
    last_active_node_id: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: null,
    nodes: [
      {
        id: 'node-0',
        learning_session_id: 'test-session',
        sequence_index: 0,
        title: 'Topic 1',
        content_markdown: 'Content 1',
        status: 'VIEWING_EXPLANATION' as NodeStatus,
        error_message: null,
        retry_available: false,
        quiz: null,
        quiz_set: null,
        quiz_hidden: null,
        quiz_set_hidden: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: null,
      },
      {
        id: 'node-1',
        learning_session_id: 'test-session',
        sequence_index: 1,
        title: 'Topic 2',
        content_markdown: 'Content 2',
        status: 'LOCKED' as NodeStatus,
        error_message: null,
        retry_available: false,
        quiz: null,
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

describe('LearningPage', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionId = 'test-session';
    mockNavigate.mockReset();
    fetchSpy = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('Navigation', () => {
    it('renders "← Dashboard" button that navigates to /learn', async () => {
      const session = createSession();
      (api.getLearningSession as ReturnType<typeof vi.fn>)
        .mockResolvedValue(session);

      render(<LearningPage />, { wrapper: createWrapper() });

      const dashboardBtn = await screen.findByRole('button', {
        name: 'Go to dashboard',
      });
      expect(dashboardBtn).toBeInTheDocument();

      fireEvent.click(dashboardBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/learn');
    });

    it('"← Dashboard" button has aria-label "Go to dashboard"', async () => {
      const session = createSession();
      (api.getLearningSession as ReturnType<typeof vi.fn>)
        .mockResolvedValue(session);

      render(<LearningPage />, { wrapper: createWrapper() });

      const dashboardBtn = await screen.findByLabelText('Go to dashboard');
      expect(dashboardBtn).toBeInTheDocument();
    });

    it('"New Topic" link has href /learn?new=true', async () => {
      const session = createSession();
      (api.getLearningSession as ReturnType<typeof vi.fn>)
        .mockResolvedValue(session);

      render(<LearningPage />, { wrapper: createWrapper() });

      const newTopicLink = await screen.findByRole('link', {
        name: 'New Topic',
      });
      expect(newTopicLink).toHaveAttribute('href', '/learn?new=true');
    });

    it('shows course title in header when session is loaded', async () => {
      const session = createSession({ course_title: 'Advanced React' });
      (api.getLearningSession as ReturnType<typeof vi.fn>)
        .mockResolvedValue(session);

      render(<LearningPage />, { wrapper: createWrapper() });

      // The header renders the course title in an <h1> inside the sticky header
      await waitFor(() => {
        const header = document.querySelector('header');
        expect(header).toBeTruthy();
        const titleEl = header!.querySelector('h1');
        expect(titleEl).toBeTruthy();
        expect(titleEl!.textContent).toBe('Advanced React');
      });
    });
  });

  describe('Cache management', () => {
    it('invalidates courses query on unmount', async () => {
      const session = createSession();
      (api.getLearningSession as ReturnType<typeof vi.fn>)
        .mockResolvedValue(session);

      const wrapper = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { unmount } = render(<LearningPage />, { wrapper });

      // Wait for session to load
      await screen.findByLabelText('Go to dashboard');

      // Reset spy to ignore any calls during render
      invalidateSpy.mockClear();

      unmount();

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['courses'],
      });

      invalidateSpy.mockRestore();
    });

    it('session query uses staleTime of 60_000', () => {
      const session = createSession();
      (api.getLearningSession as ReturnType<typeof vi.fn>)
        .mockResolvedValue(session);

      const wrapper = createWrapper();
      render(<LearningPage />, { wrapper });

      const queryCache = queryClient.getQueryCache();
      const sessionQuery = queryCache.find({
        queryKey: ['learningSession', 'test-session'],
      });

      expect(sessionQuery).toBeDefined();
      // Cast to access staleTime which exists at runtime but is not
      // on the narrow QueryOptions type surface.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((sessionQuery?.options as any).staleTime).toBe(60_000);
    });
  });

  describe('Error states', () => {
    it('shows "Course not found" with Dashboard link for 404', async () => {
      const axiosSpy = vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);
      const error = { response: { status: 404 }, isAxiosError: true };
      (api.getLearningSession as ReturnType<typeof vi.fn>)
        .mockRejectedValue(error);

      render(<LearningPage />, { wrapper: createWrapper() });

      expect(
        await screen.findByText('Course not found')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/doesn.t exist or has been removed/i)
      ).toBeInTheDocument();

      const dashboardLink = screen.getByRole('link', {
        name: /dashboard/i,
      });
      expect(dashboardLink).toHaveAttribute('href', '/learn');

      axiosSpy.mockRestore();
    });

    it('shows "No session ID provided" with "Start Learning" link when sessionId missing', async () => {
      mockSessionId = undefined;

      render(<LearningPage />, { wrapper: createWrapper() });

      expect(
        screen.getByText('No session ID provided')
      ).toBeInTheDocument();

      const startLink = screen.getByRole('link', {
        name: 'Start Learning',
      });
      expect(startLink).toHaveAttribute('href', '/learn');
    });
  });

  describe('Resume banner', () => {
    it('shows resume banner when session has last_active_node_id', async () => {
      const session = createSession({
        last_active_node_id: 'node-1',
      });
      (api.getLearningSession as ReturnType<typeof vi.fn>)
        .mockResolvedValue(session);

      render(<LearningPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(
          screen.getByText(/resuming where you left off/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('beforeunload handling', () => {
    it('sends keepalive PATCH request for last active node on page unload', async () => {
      const session = createSession({
        last_active_node_id: 'node-1',
      });
      (api.getLearningSession as ReturnType<typeof vi.fn>)
        .mockResolvedValue(session);

      render(<LearningPage />, { wrapper: createWrapper() });

      await screen.findByText('Topic 1');

      window.dispatchEvent(new Event('beforeunload'));

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8000/learning/sessions/test-session/last-active',
        expect.objectContaining({
          method: 'PATCH',
          keepalive: true,
        })
      );
    });
  });
});
