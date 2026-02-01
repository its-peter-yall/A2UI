// useLearningMutations.test.tsx
// Tests for learning mutations hook with sequential flow

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLearningMutations } from './useLearningMutations';
import type { ReactNode } from 'react';

// Mock API functions
vi.mock('@/lib/learningApi', () => ({
  transitionNode: vi.fn(),
  submitQuiz: vi.fn(),
  retryQuiz: vi.fn(),
  regenerateNode: vi.fn(),
}));

import * as api from '@/lib/learningApi';

/**
 * Creates a wrapper with React Query provider for hook testing.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('useLearningMutations - Sequential Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('proceedToQuiz (VIEWING_EXPLANATION → IN_QUIZ)', () => {
    it('transitions node to IN_QUIZ state', async () => {
      (api.transitionNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'node-1',
        status: 'IN_QUIZ',
      });

      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1' }),
        { wrapper: createWrapper() }
      );

      result.current.proceedToQuiz('node-1');

      await waitFor(() => {
        expect(api.transitionNode).toHaveBeenCalledWith('node-1', 'IN_QUIZ');
      });
    });

    it('sets isTransitioning to true during mutation', async () => {
      let resolveTransition: (value: unknown) => void;
      (api.transitionNode as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => { resolveTransition = resolve; })
      );

      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1' }),
        { wrapper: createWrapper() }
      );

      expect(result.current.isTransitioning).toBe(false);

      result.current.proceedToQuiz('node-1');

      await waitFor(() => {
        expect(result.current.isTransitioning).toBe(true);
        expect(result.current.isAnyLoading).toBe(true);
      });

      resolveTransition!({ id: 'node-1', status: 'IN_QUIZ' });

      await waitFor(() => {
        expect(result.current.isTransitioning).toBe(false);
        expect(result.current.isAnyLoading).toBe(false);
      });
    });
  });

  describe('submitAnswer (IN_QUIZ → SHOWING_FEEDBACK)', () => {
    it('submits quiz and calls onQuizResult', async () => {
      const mockResult = {
        node_id: 'node-1',
        is_correct: true,
        is_mastered: true,
        score_percent: 100,
        attempt_number: 1,
        correct_option_id: 'B',
        selected_option_id: 'B',
        explanation: 'Correct!',
        next_node_unlocked: true,
        node_status: 'SHOWING_FEEDBACK' as const,
      };
      (api.submitQuiz as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);
      (api.transitionNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'node-1',
        status: 'SHOWING_FEEDBACK',
      });

      const onQuizResult = vi.fn();
      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1', onQuizResult }),
        { wrapper: createWrapper() }
      );

      result.current.submitAnswer('node-1', 'B');

      await waitFor(() => {
        expect(api.submitQuiz).toHaveBeenCalledWith('node-1', {
          selected_option_id: 'B',
        });
        expect(onQuizResult).toHaveBeenCalledWith(mockResult);
      });
    });

    it('calls onMasteryAchieved when score is 100%', async () => {
      const mockResult = {
        node_id: 'node-1',
        is_correct: true,
        is_mastered: true,
        score_percent: 100,
        attempt_number: 1,
        correct_option_id: 'B',
        selected_option_id: 'B',
        explanation: 'Correct!',
        next_node_unlocked: true,
        node_status: 'SHOWING_FEEDBACK' as const,
      };
      (api.submitQuiz as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);
      (api.transitionNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'node-1',
        status: 'SHOWING_FEEDBACK',
      });

      const onMasteryAchieved = vi.fn();
      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1', onMasteryAchieved }),
        { wrapper: createWrapper() }
      );

      result.current.submitAnswer('node-1', 'B');

      await waitFor(() => {
        expect(onMasteryAchieved).toHaveBeenCalledWith('node-1');
      });
    });

    it('calls onRetryNeeded when score < 100%', async () => {
      const mockResult = {
        node_id: 'node-1',
        is_correct: false,
        is_mastered: false,
        score_percent: 0,
        attempt_number: 1,
        correct_option_id: 'B',
        selected_option_id: 'A',
        explanation: 'Incorrect. The correct answer is B.',
        next_node_unlocked: false,
        node_status: 'SHOWING_FEEDBACK' as const,
      };
      (api.submitQuiz as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);
      (api.transitionNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'node-1',
        status: 'SHOWING_FEEDBACK',
      });

      const onRetryNeeded = vi.fn();
      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1', onRetryNeeded }),
        { wrapper: createWrapper() }
      );

      result.current.submitAnswer('node-1', 'A');

      await waitFor(() => {
        expect(onRetryNeeded).toHaveBeenCalledWith('node-1', mockResult);
      });
    });

    it('sets isSubmitting to true during mutation', async () => {
      let resolveSubmit: (value: unknown) => void;
      (api.submitQuiz as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => { resolveSubmit = resolve; })
      );
      (api.transitionNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'node-1',
        status: 'SHOWING_FEEDBACK',
      });

      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1' }),
        { wrapper: createWrapper() }
      );

      expect(result.current.isSubmitting).toBe(false);

      result.current.submitAnswer('node-1', 'B');

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(true);
      });

      resolveSubmit!({
        node_id: 'node-1',
        is_correct: true,
        is_mastered: true,
        score_percent: 100,
        attempt_number: 1,
        correct_option_id: 'B',
        selected_option_id: 'B',
        explanation: 'Correct!',
        next_node_unlocked: true,
        node_status: 'SHOWING_FEEDBACK',
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(false);
      });
    });
  });

  describe('retry (SHOWING_FEEDBACK → IN_QUIZ)', () => {
    it('transitions back to IN_QUIZ for retry', async () => {
      (api.retryQuiz as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'node-1',
        status: 'IN_QUIZ',
      });

      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1' }),
        { wrapper: createWrapper() }
      );

      result.current.retry('node-1');

      await waitFor(() => {
        expect(api.retryQuiz).toHaveBeenCalledWith('node-1');
      });
    });

    it('sets isRetrying to true during mutation', async () => {
      let resolveRetry: (value: unknown) => void;
      (api.retryQuiz as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => { resolveRetry = resolve; })
      );

      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1' }),
        { wrapper: createWrapper() }
      );

      result.current.retry('node-1');

      await waitFor(() => {
        expect(result.current.isRetrying).toBe(true);
      });

      resolveRetry!({ id: 'node-1', status: 'IN_QUIZ' });

      await waitFor(() => {
        expect(result.current.isRetrying).toBe(false);
      });
    });
  });

  describe('regenerate (ERROR → VIEWING_EXPLANATION)', () => {
    it('calls regenerateNode API', async () => {
      (api.regenerateNode as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'node-1',
        status: 'VIEWING_EXPLANATION',
      });

      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1' }),
        { wrapper: createWrapper() }
      );

      result.current.regenerate('node-1');

      await waitFor(() => {
        expect(api.regenerateNode).toHaveBeenCalledWith('node-1');
      });
    });
  });

  describe('error handling', () => {
    it('calls onError callback on transition failure', async () => {
      const error = new Error('Network error');
      (api.transitionNode as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const onError = vi.fn();
      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1', onError }),
        { wrapper: createWrapper() }
      );

      result.current.proceedToQuiz('node-1');

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error, 'transition');
      });
    });

    it('calls onError callback on submitQuiz failure', async () => {
      const error = new Error('Server error');
      (api.submitQuiz as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const onError = vi.fn();
      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1', onError }),
        { wrapper: createWrapper() }
      );

      result.current.submitAnswer('node-1', 'B');

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error, 'submitQuiz');
      });
    });

    it('calls onError callback on retry failure', async () => {
      const error = new Error('Retry failed');
      (api.retryQuiz as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const onError = vi.fn();
      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1', onError }),
        { wrapper: createWrapper() }
      );

      result.current.retry('node-1');

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error, 'retryQuiz');
      });
    });

    it('calls onError callback on regenerate failure', async () => {
      const error = new Error('Regenerate failed');
      (api.regenerateNode as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const onError = vi.fn();
      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1', onError }),
        { wrapper: createWrapper() }
      );

      result.current.regenerate('node-1');

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error, 'regenerate');
      });
    });
  });

  describe('loading states', () => {
    it('isAnyLoading is true when any mutation is pending', async () => {
      let resolveTransition: (value: unknown) => void;
      (api.transitionNode as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => { resolveTransition = resolve; })
      );

      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1' }),
        { wrapper: createWrapper() }
      );

      expect(result.current.isAnyLoading).toBe(false);

      result.current.proceedToQuiz('node-1');

      await waitFor(() => {
        expect(result.current.isAnyLoading).toBe(true);
      });

      resolveTransition!({ id: 'node-1', status: 'IN_QUIZ' });

      await waitFor(() => {
        expect(result.current.isAnyLoading).toBe(false);
      });
    });

    it('individual loading states are independent', async () => {
      let resolveTransition: (value: unknown) => void;
      
      (api.transitionNode as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => { resolveTransition = resolve; })
      );
      (api.submitQuiz as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => { /* never resolves */ })
      );

      const { result } = renderHook(
        () => useLearningMutations({ sessionId: 'session-1' }),
        { wrapper: createWrapper() }
      );

      result.current.proceedToQuiz('node-1');

      await waitFor(() => {
        expect(result.current.isTransitioning).toBe(true);
        expect(result.current.isSubmitting).toBe(false);
      });

      resolveTransition!({ id: 'node-1', status: 'IN_QUIZ' });

      await waitFor(() => {
        expect(result.current.isTransitioning).toBe(false);
      });
    });
  });
});
