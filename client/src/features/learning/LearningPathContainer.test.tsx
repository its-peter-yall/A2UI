/**
 * ============================================================================
 * FILE: LearningPathContainer.test.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Unit tests for LearningPathContainer component. Validates loading states,
 * error handling, empty state display, and session/node rendering.
 * 
 * KEY TESTS:
 * - Shows loading state when fetching session
 * - Shows "Creating your learning path" when generating course
 * - Shows "Session not found" for 404 responses
 * - Shows "No topics yet" for empty sessions
 * - Shows "Failed to generate course" on generation errors
 * 
 * DEPENDENCIES:
 * - vitest: Testing framework
 * - @testing-library/react: Component testing
 * - @tanstack/react-query: Query client provider
 * - axios: For axiosError detection
 * - client/src/features/learning/LearningPathContainer: Component
 * - client/src/lib/learningApi: API functions (mocked)
 * 
 * USAGE PATTERN:
 * ```bash
 * # Run LearningPathContainer tests
 * npm run test -- src/features/learning/LearningPathContainer.test.tsx
 * ```
 * 
 * TEST SETUP:
 * - Mocks @/lib/learningApi module
 * - Uses QueryClient with retry: false
 * - Tests both sessionId query and query (generation) modes
 * - Uses axios.isAxiosError for error detection
 * 
 * RELATED FILES:
 * - client/src/features/learning/LearningPathContainer.tsx
 * - client/src/types/learning.ts
 * 
 * NOTES:
 * - Can load existing session or generate new one
 * - Props: sessionId (load) or query (generate)
 * - Handles axios errors specifically for 404 detection
 * ============================================================================
 */

// LearningPathContainer.test.tsx
// Tests for LearningPathContainer component

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { LearningPathContainer } from './LearningPathContainer';
import * as api from '@/lib/learningApi';
import type { ReactNode } from 'react';
import type { LearningSessionWithNodes, NodeStatus } from '@/types/learning';

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
  updateLastActiveNode: vi.fn().mockResolvedValue(undefined),
}));

function createWrapper() {
  const queryClient = new QueryClient({
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
      last_active_node_id: null,
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

  it('renders generate error state when course generation fails', async () => {
    (api.generateCourse as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Generation failed')
    );

    render(
      <LearningPathContainer query="test query" />,
      { wrapper: createWrapper() }
    );

    expect(await screen.findByText(/failed to generate course/i)).toBeInTheDocument();
  });
});

function createSessionWithNodes(nodeCount: number, lastActiveNodeId?: string): LearningSessionWithNodes {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `node-${i}`,
    learning_session_id: 'session-1',
    sequence_index: i,
    title: `Topic ${i + 1}`,
    content_markdown: `Content for topic ${i + 1}`,
    status: (i === 0 ? 'VIEWING_EXPLANATION' : 'LOCKED') as NodeStatus,
    error_message: null,
    retry_available: false,
    quiz: null,
    quiz_set: null,
    quiz_hidden: null,
    quiz_set_hidden: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null,
  }));

  return {
    id: 'session-1',
    user_id: null,
    query: 'test',
    course_title: 'Test Course',
    total_nodes: nodeCount,
    completed_nodes: 0,
    last_active_node_id: lastActiveNodeId ?? null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null,
    nodes,
  };
}

describe('initialNodeId and resume navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('positions carousel at initialNodeId slide', async () => {
    const session = createSessionWithNodes(5);
    // Make node-2 the active one (non-locked, non-completed)
    session.nodes[0].status = 'COMPLETED';
    session.nodes[1].status = 'COMPLETED';
    session.nodes[2].status = 'VIEWING_EXPLANATION';

    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    render(
      <LearningPathContainer sessionId="session-1" initialNodeId="node-2" />,
      { wrapper: createWrapper() }
    );

    // Should show Topic 3 (node-2, index 2)
    expect(await screen.findByText('Topic 3')).toBeInTheDocument();
  });

  it('falls back to first non-completed node when initialNodeId not found', async () => {
    const session = createSessionWithNodes(3);
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    render(
      <LearningPathContainer sessionId="session-1" initialNodeId="nonexistent-node" />,
      { wrapper: createWrapper() }
    );

    // Should fall back to first VIEWING_EXPLANATION node (node-0, Topic 1)
    expect(await screen.findByText('Topic 1')).toBeInTheDocument();
  });

  it('uses initialNodeId for completed sessions with no active node', async () => {
    const session = createSessionWithNodes(4);
    session.nodes.forEach((node) => {
      node.status = 'COMPLETED';
    });
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    render(
      <LearningPathContainer sessionId="session-1" initialNodeId="node-2" />,
      { wrapper: createWrapper() }
    );

    expect(await screen.findByText('Topic 3')).toBeInTheDocument();
  });

  it('debounced PATCH fires after 2s of no carousel movement', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const session = createSessionWithNodes(3);
    session.nodes[0].status = 'VIEWING_EXPLANATION';
    session.nodes[1].status = 'VIEWING_EXPLANATION';
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    render(
      <LearningPathContainer sessionId="session-1" />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Topic 1')).toBeInTheDocument();
    });

    // Advance past debounce timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    // The debounced call should eventually fire
    await waitFor(() => {
      expect(api.updateLastActiveNode).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });

  it('does not requeue PATCH when query refresh keeps the same active node', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const session = createSessionWithNodes(3);
      session.nodes[0].status = 'VIEWING_EXPLANATION';
      session.nodes[1].status = 'LOCKED';
      (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <LearningPathContainer sessionId="session-1" />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Topic 1')).toBeInTheDocument();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      await waitFor(() => {
        expect(api.updateLastActiveNode).toHaveBeenCalledTimes(1);
      });

      const refreshedSession: LearningSessionWithNodes = {
        ...session,
        nodes: session.nodes.map((node) => ({ ...node })),
        updated_at: '2025-02-01T00:00:00Z',
      };

      act(() => {
        queryClient.setQueryData(['learningSession', 'session-1'], refreshedSession);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(api.updateLastActiveNode).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
