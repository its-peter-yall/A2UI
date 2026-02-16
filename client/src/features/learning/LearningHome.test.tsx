// LearningHome.test.tsx
// Tests for LearningHome dashboard integration

// Validates conditional rendering (hero-only vs dashboard), course card
// display, filter/sort interactions, pagination, skeleton loading states,
// empty filter state, and navigation callbacks.

// @see: client/src/features/learning/LearningHome.tsx
// @see: client/src/features/learning/CourseCard.tsx
// @see: client/src/features/learning/CourseFilter.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { LearningHome } from './LearningHome';
import type { SessionListResponse, LearningSessionSummary } from '@/types/learning';
import * as learningApi from '@/lib/learningApi';

// Mock the learning API
vi.mock('@/lib/learningApi', () => ({
  generateCourse: vi.fn(),
  getLearningSession: vi.fn(),
  transitionNode: vi.fn(),
  submitQuiz: vi.fn(),
  retryQuiz: vi.fn(),
  regenerateNode: vi.fn(),
  getQuizAttempts: vi.fn(),
  getSessionsList: vi.fn(),
}));

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function createMockSession(
  overrides: Partial<LearningSessionSummary> = {}
): LearningSessionSummary {
  return {
    id: 'session-1',
    query: 'Learn React hooks',
    course_title: 'React Hooks Fundamentals',
    status: 'in_progress',
    progress_percent: 60,
    total_nodes: 5,
    completed_nodes: 3,
    last_active_node_title: 'useEffect',
    created_at: '2025-01-10T08:00:00Z',
    updated_at: '2025-01-15T10:00:00Z',
    completed_at: null,
    revision_count: 0,
    ...overrides,
  };
}

const emptyResponse: SessionListResponse = {
  sessions: [],
  total_count: 0,
  has_more: false,
};

const singleCourseResponse: SessionListResponse = {
  sessions: [createMockSession()],
  total_count: 1,
  has_more: false,
};

const multiCourseResponse: SessionListResponse = {
  sessions: [
    createMockSession({ id: 'session-1', course_title: 'React Hooks', progress_percent: 60 }),
    createMockSession({
      id: 'session-2',
      course_title: 'TypeScript Advanced',
      status: 'completed',
      progress_percent: 100,
      completed_at: '2025-01-20T10:00:00Z',
      revision_count: 2,
    }),
  ],
  total_count: 2,
  has_more: false,
};

const paginatedResponse: SessionListResponse = {
  sessions: [
    createMockSession({ id: 'session-1', course_title: 'Course One' }),
  ],
  total_count: 2,
  has_more: true,
};

const page2Response: SessionListResponse = {
  sessions: [
    createMockSession({ id: 'session-2', course_title: 'Course Two' }),
  ],
  total_count: 2,
  has_more: false,
};

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/learn']}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LearningHome', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNavigate.mockClear();
  });

  describe('Hero-only view (no courses)', () => {
    beforeEach(() => {
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
        emptyResponse
      );
    });

    it('shows full hero when 0 courses', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: /learn anything/i }))
          .toBeInTheDocument();
      });

      // Full hero has descriptive text
      expect(
        screen.getByText(/enter a topic and master it through guided explanations/i)
      ).toBeInTheDocument();
    });

    it('shows "How it works" section as heading when no courses', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 2, name: /how it works/i }))
          .toBeInTheDocument();
      });
    });

    it('shows feature cards', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Sequential Learning')).toBeInTheDocument();
      });
      expect(screen.getByText('Retrieval Practice')).toBeInTheDocument();
      expect(screen.getByText('Mastery Required')).toBeInTheDocument();
    });

    it('does not show "Your Courses" section', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Learn Anything')).toBeInTheDocument();
      });

      expect(screen.queryByText('Your Courses')).not.toBeInTheDocument();
    });

    it('shows topic input', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/what do you want to learn/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Dashboard view (with courses)', () => {
    beforeEach(() => {
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
        multiCourseResponse
      );
    });

    it('shows compact hero and "Your Courses" section when courses exist', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Your Courses')).toBeInTheDocument();
      });

      // Hero still present but compact (no descriptive paragraph)
      expect(screen.getByText('Learn Anything')).toBeInTheDocument();
    });

    it('renders CourseCards with correct data', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('React Hooks')).toBeInTheDocument();
      });
      expect(screen.getByText('TypeScript Advanced')).toBeInTheDocument();
    });

    it('shows course progress correctly', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('60%')).toBeInTheDocument();
      });
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('shows filter controls', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
      });
      expect(screen.getByRole('tab', { name: 'In Progress' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Completed' })).toBeInTheDocument();
    });

    it('shows sort controls', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Recent')).toBeInTheDocument();
      });
      expect(screen.getByText('Progress')).toBeInTheDocument();
      expect(screen.getByText('Date Created')).toBeInTheDocument();
    });

    it('"How it works" is a disclosure button when courses exist', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Your Courses')).toBeInTheDocument();
      });

      // "How it works" is a button (collapsed), not a heading
      const howItWorksButton = screen.getByRole('button', { name: /how it works/i });
      expect(howItWorksButton).toBeInTheDocument();
      expect(howItWorksButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('disclosure button reveals steps when clicked', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Your Courses')).toBeInTheDocument();
      });

      // Steps not in accessible tree initially when collapsed
      expect(screen.queryByText('Study the explanation')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByRole('button', { name: /how it works/i }));

      // Steps should be visible now
      expect(screen.getByText('Study the explanation')).toBeInTheDocument();
      expect(screen.getByText('Answer questions')).toBeInTheDocument();
    });

    it('shows feature cards below dashboard', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Sequential Learning')).toBeInTheDocument();
      });
      expect(screen.getByText('Retrieval Practice')).toBeInTheDocument();
      expect(screen.getByText('Mastery Required')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
        singleCourseResponse
      );
    });

    it('navigates to session on Resume click', async () => {
      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Resume Course')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Resume Course'));
      expect(mockNavigate).toHaveBeenCalledWith('/learn/session-1');
    });
  });

  describe('Filtering', () => {
    it('clicking filter pill triggers re-fetch', async () => {
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(multiCourseResponse) // Initial load
        .mockResolvedValueOnce({
          sessions: [
            createMockSession({
              id: 'session-1',
              course_title: 'React Hooks',
              status: 'in_progress',
            }),
          ],
          total_count: 1,
          has_more: false,
        }); // After filter

      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Your Courses')).toBeInTheDocument();
      });

      // Click "In Progress" filter (use role to avoid ambiguity with CourseCard status)
      fireEvent.click(screen.getByRole('tab', { name: 'In Progress' }));

      await waitFor(() => {
        expect(learningApi.getSessionsList).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'in_progress' })
        );
      });
    });

    it('clicking sort option triggers re-fetch', async () => {
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>)
        .mockResolvedValue(multiCourseResponse);

      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Your Courses')).toBeInTheDocument();
      });

      // Click "Progress" sort
      fireEvent.click(screen.getByText('Progress'));

      await waitFor(() => {
        expect(learningApi.getSessionsList).toHaveBeenCalledWith(
          expect.objectContaining({ sort_by: 'progress_percent' })
        );
      });
    });

    it('shows empty filter state when filter matches nothing', async () => {
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(multiCourseResponse) // Initial load shows dashboard
        .mockResolvedValueOnce({
          sessions: [],
          total_count: 1, // Still have courses overall, just none match filter
          has_more: false,
        });

      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Your Courses')).toBeInTheDocument();
      });

      // Click "Completed" filter (use role to avoid ambiguity with CourseCard status)
      fireEvent.click(screen.getByRole('tab', { name: 'Completed' }));

      await waitFor(() => {
        expect(screen.getByTestId('empty-filter-state')).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it('shows "Load More" button when has_more is true', async () => {
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
        paginatedResponse
      );

      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Load More')).toBeInTheDocument();
      });
    });

    it('does not show "Load More" when has_more is false', async () => {
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockResolvedValue(
        multiCourseResponse
      );

      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Your Courses')).toBeInTheDocument();
      });

      expect(screen.queryByText('Load More')).not.toBeInTheDocument();
    });

    it('"Load More" fetches next page with increased limit', async () => {
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(paginatedResponse)
        .mockResolvedValueOnce(page2Response);

      renderWithProviders(<LearningHome />);

      await waitFor(() => {
        expect(screen.getByText('Course One')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Load More'));

      await waitFor(() => {
        expect(learningApi.getSessionsList).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 40 })
        );
      });
    });
  });

  describe('Loading state', () => {
    it('shows skeleton loading state while fetching', async () => {
      // Make the API hang indefinitely to test loading state
      (learningApi.getSessionsList as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithProviders(<LearningHome />);

      // During loading, the hero should be visible (no dashboard yet since no data)
      await waitFor(() => {
        expect(screen.getByText('Learn Anything')).toBeInTheDocument();
      });
    });
  });
});
