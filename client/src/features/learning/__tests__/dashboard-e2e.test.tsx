/**
 * ============================================================================
 * FILE: dashboard-e2e.test.tsx
 * LOCATION: client/src/features/learning/__tests__/dashboard-e2e.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    End-to-end integration tests for the learning dashboard user flows.
 *
 * ROLE IN PROJECT:
 *    Validates the full dashboard experience from the /learn route, covering
 *    empty state, course card rendering, filter/sort interactions, pagination,
 *    navigation, and progress bar behavior. API calls are mocked for
 *    deterministic test execution.
 *
 * KEY COMPONENTS:
 *    - Dashboard e2e flows: Test suite covering all major dashboard interactions
 *    - createSession / createResponse: Factory helpers for mock data
 *    - renderDashboard: Renders LearningHome inside full router + query context
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query, react-router-dom
 *    - Internal: ../LearningHome, @/lib/learningApi, @/types/learning
 *
 * USAGE:
 *    npm run test -- src/features/learning/__tests__/dashboard-e2e.test.tsx
 * ============================================================================
 */
// dashboard-e2e.test.tsx
// Integration tests for learning dashboard end-to-end flows.
//
// Covers empty state, course card rendering, filters, sorting, navigation,
// pagination, and progress bar behavior from the /learn dashboard route.
//
// @see: client/src/features/learning/LearningHome.tsx
// @see: client/src/features/learning/CourseCard.tsx
// @note: API calls are mocked to keep tests deterministic.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import type {
  LearningSessionSummary,
  SessionListResponse,
} from '@/types/learning';
import { LearningHome } from '../LearningHome';
import * as learningApi from '@/lib/learningApi';

vi.mock('@/lib/learningApi', () => ({
  generateCourse: vi.fn(),
  createRevisionSession: vi.fn(),
  getSessionsList: vi.fn(),
  getRevisionsList: vi.fn(),
}));

function createSession(
  overrides: Partial<LearningSessionSummary> = {}
): LearningSessionSummary {
  return {
    id: 'session-1',
    query: 'Learn Newtonian mechanics',
    course_title: 'Newtonian Mechanics',
    status: 'in_progress',
    progress_percent: 40,
    total_nodes: 5,
    completed_nodes: 2,
    last_active_node_title: 'Inertia',
    created_at: '2025-02-01T09:00:00Z',
    updated_at: '2025-02-01T10:00:00Z',
    completed_at: null,
    revision_count: 0,
    ...overrides,
  };
}

function createResponse(
  sessions: LearningSessionSummary[],
  hasMore: boolean = false
): SessionListResponse {
  return {
    sessions,
    total_count: sessions.length,
    has_more: hasMore,
  };
}

function LocationPath() {
  const location = useLocation();
  return <div data-testid="location-path">{location.pathname}</div>;
}

function renderDashboard(route: string = '/learn') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <LocationPath />
        <Routes>
          <Route path="/learn" element={<LearningHome />} />
          <Route path="/learn/:sessionId" element={<div>Learning Session</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Dashboard e2e flows', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders empty state for new users', async () => {
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
      createResponse([])
    );

    renderDashboard();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /learn anything/i })
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Your Courses')).not.toBeInTheDocument();
  });

  it('shows course cards after course generation', async () => {
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
      createResponse([
        createSession({ id: 'session-1', course_title: 'Physics 101' }),
        createSession({ id: 'session-2', course_title: 'Linear Algebra' }),
      ])
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });
    expect(screen.getByText('Linear Algebra')).toBeInTheDocument();
    expect(screen.getAllByTestId('course-card')).toHaveLength(2);
  });

  it('shows resume button for in-progress courses', async () => {
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
      createResponse([createSession({ status: 'in_progress' })])
    );

    renderDashboard();

    expect(
      await screen.findByRole('button', { name: /resume course/i })
    ).toBeInTheDocument();
  });

  it('shows revise buttons for completed courses', async () => {
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
      createResponse([
        createSession({
          id: 'session-2',
          status: 'completed',
          progress_percent: 100,
          completed_nodes: 5,
          completed_at: '2025-02-01T11:00:00Z',
          course_title: 'Completed Biology',
        }),
      ])
    );

    renderDashboard();

    expect(
      await screen.findByRole('button', { name: /revise course/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /practice quizzes/i })
    ).toBeInTheDocument();
  });

  it('filter "In Progress" hides completed courses', async () => {
    const allCoursesResponse = createResponse([
      createSession({ id: 'session-1', course_title: 'In Progress Course' }),
      createSession({
        id: 'session-2',
        course_title: 'Completed Course',
        status: 'completed',
        progress_percent: 100,
        completed_nodes: 5,
        completed_at: '2025-02-01T11:00:00Z',
      }),
    ]);
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(allCoursesResponse) // Initial load
      .mockResolvedValueOnce(allCoursesResponse) // Unfiltered count check
      .mockResolvedValueOnce(
        createResponse([
          createSession({ id: 'session-1', course_title: 'In Progress Course' }),
        ])
      );

    renderDashboard();

    await screen.findByText('Completed Course');
    fireEvent.click(screen.getByRole('tab', { name: 'In Progress' }));

    await waitFor(() => {
      expect(screen.getByText('In Progress Course')).toBeInTheDocument();
      expect(screen.queryByText('Completed Course')).not.toBeInTheDocument();
    });
  });

  it('filter "Completed" hides in-progress courses', async () => {
    const allCoursesResponse = createResponse([
      createSession({ id: 'session-1', course_title: 'In Progress Course' }),
      createSession({
        id: 'session-2',
        course_title: 'Completed Course',
        status: 'completed',
        progress_percent: 100,
        completed_nodes: 5,
        completed_at: '2025-02-01T11:00:00Z',
      }),
    ]);
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(allCoursesResponse) // Initial load
      .mockResolvedValueOnce(allCoursesResponse) // Unfiltered count check
      .mockResolvedValueOnce(
        createResponse([
          createSession({
            id: 'session-2',
            course_title: 'Completed Course',
            status: 'completed',
            progress_percent: 100,
            completed_nodes: 5,
            completed_at: '2025-02-01T11:00:00Z',
          }),
        ])
      );

    renderDashboard();

    await screen.findByText('In Progress Course');
    fireEvent.click(screen.getByRole('tab', { name: 'Completed' }));

    await waitFor(() => {
      expect(screen.getByText('Completed Course')).toBeInTheDocument();
      expect(screen.queryByText('In Progress Course')).not.toBeInTheDocument();
    });
  });

  it('sort by progress orders cards correctly', async () => {
    const initialResponse = createResponse([
      createSession({
        id: 'session-1',
        course_title: 'Low Progress',
        progress_percent: 10,
        completed_nodes: 1,
      }),
      createSession({
        id: 'session-2',
        course_title: 'High Progress',
        progress_percent: 90,
        completed_nodes: 9,
        total_nodes: 10,
      }),
      createSession({
        id: 'session-3',
        course_title: 'Medium Progress',
        progress_percent: 50,
        completed_nodes: 5,
        total_nodes: 10,
      }),
    ]);
    const sortedResponse = createResponse([
      createSession({
        id: 'session-2',
        course_title: 'High Progress',
        progress_percent: 90,
        completed_nodes: 9,
        total_nodes: 10,
      }),
      createSession({
        id: 'session-3',
        course_title: 'Medium Progress',
        progress_percent: 50,
        completed_nodes: 5,
        total_nodes: 10,
      }),
      createSession({
        id: 'session-1',
        course_title: 'Low Progress',
        progress_percent: 10,
        completed_nodes: 1,
      }),
    ]);
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(initialResponse) // Initial load
      .mockResolvedValueOnce(initialResponse) // Unfiltered count check
      .mockResolvedValueOnce(sortedResponse); // After sort change

    renderDashboard();

    await screen.findByText('Low Progress');
    fireEvent.click(screen.getByRole('tab', { name: 'Progress' }));

    await waitFor(() => {
      expect(learningApi.getSessionsList).toHaveBeenCalledWith(
        expect.objectContaining({ sort_by: 'progress_percent' })
      );
      const cards = screen.getAllByTestId('course-card');
      const titles = cards.map((card) =>
        within(card).getByRole('heading', { level: 3 }).textContent
      );
      expect(titles).toEqual([
        'High Progress',
        'Medium Progress',
        'Low Progress',
      ]);
    });
  });

  it('resume navigates to /learn/{sessionId}', async () => {
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
      createResponse([createSession({ id: 'session-resume' })])
    );

    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: /resume course/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent(
        '/learn/session-resume'
      );
    });
  });

  it('load more fetches the next page', async () => {
    const firstPageResponse = createResponse(
      [createSession({ id: 'session-1', course_title: 'First Page Course' })],
      true
    );
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(firstPageResponse) // Initial load
      .mockResolvedValueOnce(firstPageResponse) // Unfiltered count check
      .mockResolvedValueOnce(
        createResponse([
          createSession({ id: 'session-2', course_title: 'Second Page Course' }),
        ])
      );

    renderDashboard();

    await screen.findByText('First Page Course');
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(learningApi.getSessionsList).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 4, offset: 4 })
      );
      expect(screen.getByText('Second Page Course')).toBeInTheDocument();
    });
  });

  it('progress bar animation matches percent value', async () => {
    (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
      createResponse([
        createSession({
          progress_percent: 42,
          completed_nodes: 2,
          total_nodes: 5,
        }),
      ])
    );

    renderDashboard();

    const progressBar = await screen.findByRole('progressbar', {
      name: /course progress: 42%/i,
    });
    expect(progressBar).toHaveAttribute('aria-valuenow', '42');
    const fill = screen.getByTestId('progress-bar-fill');
    expect(fill).toHaveStyle({ width: '42%' });
    expect(fill.className).toContain('duration-500');
  });
});
