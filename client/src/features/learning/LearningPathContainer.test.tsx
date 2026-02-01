// LearningPathContainer.test.tsx
// Tests for LearningPathContainer component

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { LearningPathContainer } from './LearningPathContainer';
import * as api from '@/lib/learningApi';
import type { ReactNode } from 'react';
import type { LearningSessionWithNodes } from '@/types/learning';

// Mock the API module
vi.mock('@/lib/learningApi', () => ({
  generateCourse: vi.fn(),
  getLearningSession: vi.fn(),
  getConceptNode: vi.fn(),
  transitionNode: vi.fn(),
  submitQuiz: vi.fn(),
  retryQuiz: vi.fn(),
  getQuizAttempts: vi.fn(),
  regenerateNode: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
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

describe('LearningPathContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when fetching session', () => {
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );
    render(
      <LearningPathContainer sessionId="test-session" />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/loading your learning session/i)).toBeInTheDocument();
  });

  it('renders loading state when generating course', async () => {
    (api.generateCourse as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );
    render(
      <LearningPathContainer query="test query" />,
      { wrapper: createWrapper() }
    );
    await waitFor(() => {
      expect(
        screen.getByText(/creating your learning path/i)
      ).toBeInTheDocument();
    });
  });

  it('renders not found state for 404 session', async () => {
    const axiosSpy = vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    const error = { response: { status: 404 }, isAxiosError: true };
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    render(
      <LearningPathContainer sessionId="missing-session" />,
      { wrapper: createWrapper() }
    );

    expect(await screen.findByText(/session not found/i)).toBeInTheDocument();
    axiosSpy.mockRestore();
  });

  it('renders empty state when session has no nodes', async () => {
    const session: LearningSessionWithNodes = {
      id: 'session-1',
      user_id: null,
      query: 'test',
      course_title: 'Test Course',
      total_nodes: 0,
      completed_nodes: 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: null,
      nodes: [],
    };

    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    render(
      <LearningPathContainer sessionId="session-1" />,
      { wrapper: createWrapper() }
    );

    expect(await screen.findByText(/no topics yet/i)).toBeInTheDocument();
  });
});
