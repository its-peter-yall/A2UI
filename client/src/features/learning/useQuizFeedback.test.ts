/**
 * ============================================================================
 * FILE: useQuizFeedback.test.ts
 * LOCATION: client/src/features/learning/useQuizFeedback.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Guards quiz-feedback restoration after reload when mutation state is gone.
 *
 * ROLE IN PROJECT:
 *    Prevents SHOWING_FEEDBACK from soft-locking on "Feedback unavailable"
 *    because attempt history uses selected_option_ids, not the legacy singular
 *    field, and current_index may already point at the next quiz.
 *
 * KEY COMPONENTS:
 *    - Reload restoration from persisted attempt history
 *    - Multi-quiz index: restore the graded quiz, not the advanced current one
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query
 *    - Internal: ./useQuizFeedback, @/lib/learningApi
 *
 * USAGE:
 *    npx vitest run src/features/learning/useQuizFeedback.test.ts
 * ============================================================================
 */

import { createElement } from 'react';
import type { ReactNode } from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizAttemptHistory, QuizCard } from '@/types/learning';
import { useQuizFeedback } from './useQuizFeedback';

const api = vi.hoisted(() => ({ getQuizAttempts: vi.fn() }));

vi.mock('@/lib/learningApi', () => api);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const quiz: QuizCard = {
	question_text: 'What is a tool?',
	difficulty: 'medium',
	question_type: 'single_choice',
	options: [
		{
			option_id: 'opt-a',
			display_label: 'A',
			text: 'A function the model can call',
			is_correct: true,
			explanation: 'Tools are callable functions.',
		},
		{
			option_id: 'opt-b',
			display_label: 'B',
			text: 'A prompt template',
			is_correct: false,
			explanation: 'Templates are not tools.',
		},
	],
};

const nextQuiz: QuizCard = {
	question_text: 'What is a context window?',
	difficulty: 'medium',
	question_type: 'single_choice',
	options: [
		{
			option_id: 'opt-c',
			display_label: 'A',
			text: 'Token budget',
			is_correct: true,
			explanation: 'The window is the token budget.',
		},
		{
			option_id: 'opt-d',
			display_label: 'B',
			text: 'A vector store',
			is_correct: false,
			explanation: 'Stores are not the window.',
		},
	],
};

function history(
	overrides: Partial<QuizAttemptHistory['attempts'][number]> = {},
): QuizAttemptHistory {
	return {
		node_id: 'node-1',
		total_attempts: 1,
		is_mastered: false,
		best_score: 0,
		attempts: [
			{
				id: 'attempt-1',
				node_id: 'node-1',
				attempt_number: 1,
				quiz_index: 0,
				selected_option_ids: ['opt-b'],
				is_correct: false,
				score_percent: 0,
				correct_option_ids: ['opt-a'],
				explanation: 'Templates are not tools.',
				is_mastered: false,
				created_at: '2026-10-07T00:00:00Z',
				updated_at: null,
				...overrides,
			},
		],
	};
}

function wrapper() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return {
		client,
		wrapper: ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client }, children),
	};
}

describe('useQuizFeedback reload restoration', () => {
	it('rebuilds feedback from selected_option_ids after a refresh', async () => {
		api.getQuizAttempts.mockResolvedValue(history());
		const { wrapper: Provider } = wrapper();
		const hook = renderHook(
			() =>
				useQuizFeedback({
					nodeId: 'node-1',
					nodeStatus: 'SHOWING_FEEDBACK',
					enabled: true,
					quiz,
				}),
			{ wrapper: Provider },
		);

		await waitFor(() => expect(hook.result.current.result).toBeDefined());
		expect(hook.result.current.result).toMatchObject({
			node_id: 'node-1',
			attempt_number: 1,
			is_correct: false,
			score_percent: 0,
			selected_option_ids: ['opt-b'],
			correct_option_ids: [],
			quiz_index: 0,
			is_mastered: false,
			node_status: 'SHOWING_FEEDBACK',
		});
		expect(hook.result.current.attemptCount).toBe(1);
		hook.unmount();
	});

	it('restores the graded quiz when current_index already advanced', async () => {
		api.getQuizAttempts.mockResolvedValue(
			history({
				is_correct: true,
				score_percent: 100,
				selected_option_ids: ['opt-a'],
				explanation: 'Tools are callable functions.',
				is_mastered: false,
			}),
		);
		const { wrapper: Provider } = wrapper();
		const hook = renderHook(
			() =>
				useQuizFeedback({
					nodeId: 'node-1',
					nodeStatus: 'SHOWING_FEEDBACK',
					enabled: true,
					quiz: nextQuiz,
				}),
			{ wrapper: Provider },
		);

		await waitFor(() => expect(hook.result.current.result).toBeDefined());
		expect(hook.result.current.result).toMatchObject({
			is_correct: true,
			selected_option_ids: ['opt-a'],
			correct_option_ids: ['opt-a'],
			quiz_index: 0,
			explanation: 'Tools are callable functions.',
		});
		hook.unmount();
	});

	it('keeps the in-memory mutation result without refetching', () => {
		const { wrapper: Provider } = wrapper();
		const hook = renderHook(
			() =>
				useQuizFeedback({
					nodeId: 'node-1',
					nodeStatus: 'SHOWING_FEEDBACK',
					enabled: true,
					quiz,
					latestResult: {
						node_id: 'node-1',
						attempt_number: 2,
						is_correct: true,
						score_percent: 100,
						selected_option_ids: ['opt-a'],
						correct_option_ids: ['opt-a'],
						explanation: 'Tools are callable functions.',
						is_mastered: true,
						next_node_unlocked: true,
						node_status: 'SHOWING_FEEDBACK',
					},
				}),
			{ wrapper: Provider },
		);

		expect(api.getQuizAttempts).not.toHaveBeenCalled();
		expect(hook.result.current.result?.attempt_number).toBe(2);
		expect(hook.result.current.result?.is_mastered).toBe(true);
		hook.unmount();
	});
});
