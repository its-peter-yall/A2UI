/**
 * ============================================================================
 * FILE: ConceptCard.test.tsx
 * LOCATION: client/src/features/learning/ConceptCard.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the ConceptCard component.
 *
 * ROLE IN PROJECT:
 *    Verifies rendering and interactivity of the ConceptCard component,
 *    specifically checking confirmation dialogs and skeleton loading.
 *
 * KEY COMPONENTS:
 *    - ConceptCard rendering tests
 *
 * DEPENDENCIES:
 *    - External: @testing-library/react, vitest
 *    - Internal: ./ConceptCard
 *
 * USAGE:
 *    npm run test
 * ============================================================================
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, test, expect, vi } from "vitest";
import { ConceptCard } from "./ConceptCard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConceptNode, QuizCard, QuizSubmitResponse } from "@/types/learning";

const api = vi.hoisted(() => ({ getQuizAttempts: vi.fn() }));
vi.mock("@/lib/learningApi", () => api);

// Mock the streamRegenerateNode API
vi.mock("@/lib/regenApi", () => ({
	streamRegenerateNode: vi.fn(),
}));

vi.mock("@/lib/providerSettings", () => ({
	getProviderSettings: () => ({
		activeProvider: "openrouter",
		agentModels: {
			researcher: { modelId: "r" },
			planner: { modelId: "p" },
			generator: { modelId: "g" },
			quizzer: { modelId: "q" },
		},
		providers: {
			openrouter: {
				apiKey: "k",
				model: "m",
				modelTitle: "M",
			},
			generalcompute: { apiKey: "", model: "", modelTitle: "" },
		},
	}),
	areAgentModelsConfigured: () => true,
}));

const mockNode: ConceptNode = {
	id: "node-1",
	learning_session_id: "session-1",
	sequence_index: 0,
	title: "Introduction to AI",
	content_markdown: "Artificial Intelligence is...",
	status: "VIEWING_EXPLANATION",
	error_message: null,
	retry_available: false,
	complexity: "Basic",
	quiz: null,
	quiz_set: null,
	quiz_hidden: null,
	quiz_set_hidden: null,
	created_at: "2026-01-01T00:00:00Z",
	updated_at: null,
};

function renderWithProviders(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});
	return render(
		<QueryClientProvider client={queryClient}>
			{ui}
		</QueryClientProvider>
	);
}

beforeEach(() => {
	api.getQuizAttempts.mockResolvedValue({
		node_id: mockNode.id,
		total_attempts: 0,
		is_mastered: false,
		best_score: 0,
		attempts: [],
	});
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("ConceptCard Component", () => {
	test("renders the concept node title", () => {
		renderWithProviders(<ConceptCard node={mockNode} isActive={true} />);
		expect(screen.getByText("Introduction to AI")).toBeDefined();
	});

	test("shows the confirmation dialog when the refresh button is clicked", () => {
		renderWithProviders(<ConceptCard node={mockNode} isActive={true} />);
		
		// Find refresh button by title
		const refreshButton = screen.getByLabelText("Regenerate the content");
		expect(refreshButton).toBeDefined();

		// Click the refresh button
		fireEvent.click(refreshButton);

		// Confirmation dialog should appear
		expect(screen.getByText("Regenerate Topic Content?")).toBeDefined();
		expect(
			screen.getByText(
				"This will overwrite the current explanation and quizzes. You will need to complete the quiz again to master this topic."
			)
		).toBeDefined();

		// Click cancel
		const cancelButton = screen.getByText("Cancel");
		fireEvent.click(cancelButton);

		// Confirmation dialog should disappear
		expect(screen.queryByText("Regenerate Topic Content?")).toBeNull();
	});

	test("regenerate icon only appears on in-progress nodes", () => {
		const inProgressStatuses: ("VIEWING_EXPLANATION" | "IN_QUIZ" | "SHOWING_FEEDBACK")[] = [
			"VIEWING_EXPLANATION",
			"IN_QUIZ",
			"SHOWING_FEEDBACK",
		];
		// M12: ERROR also shows per-card regen; LOCKED/COMPLETED do not.
		const regenStatuses = [...inProgressStatuses, "ERROR" as const];
		const otherStatuses: ("LOCKED" | "COMPLETED")[] = ["LOCKED", "COMPLETED"];

		regenStatuses.forEach((status) => {
			const { unmount } = renderWithProviders(
				<ConceptCard node={{ ...mockNode, status }} isActive={true} />
			);
			expect(screen.queryByLabelText("Regenerate the content")).not.toBeNull();
			unmount();
		});

		otherStatuses.forEach((status) => {
			const { unmount } = renderWithProviders(
				<ConceptCard node={{ ...mockNode, status }} isActive={true} />
			);
			expect(screen.queryByLabelText("Regenerate the content")).toBeNull();
			unmount();
		});
	});

	test("adds dark:bg-black class when regenerating", () => {
		const { container } = renderWithProviders(
			<ConceptCard node={mockNode} isActive={true} isRegenerating={true} />
		);
		const article = container.querySelector("article");
		const header = container.querySelector(".border-b");
		expect(article?.className).toContain("dark:bg-black");
		expect(header?.className).toContain("dark:bg-black");
	});

	test("adds dark:bg-black class when in loading phase, but removes it when streaming starts", async () => {
		const { streamRegenerateNode } = await import("@/lib/regenApi");
		const mockedStreamRegenerateNode = vi.mocked(streamRegenerateNode);

		let triggerDelta: (delta: string) => void = () => {};
		mockedStreamRegenerateNode.mockImplementation(async (params) => {
			triggerDelta = params.onDelta;
			return new Promise(() => {});
		});

		const { container } = renderWithProviders(<ConceptCard node={mockNode} isActive={true} />);

		fireEvent.click(screen.getByLabelText("Regenerate the content"));
		fireEvent.click(screen.getByText("Regenerate"));

		const article = container.querySelector("article");
		const header = container.querySelector(".border-b");

		expect(article?.className).toContain("dark:bg-black");
		expect(header?.className).toContain("dark:bg-black");

		// Start streaming
		await act(async () => {
			triggerDelta("Some content");
		});

		expect(article?.className).not.toContain("dark:bg-black");
		expect(header?.className).not.toContain("dark:bg-black");
	});

	test("displays Generating quiz... button when explanation finishes and quizzes start generating", async () => {
		const { streamRegenerateNode } = await import("@/lib/regenApi");
		const mockedStreamRegenerateNode = vi.mocked(streamRegenerateNode);
		
		mockedStreamRegenerateNode.mockImplementation(async (params) => {
			params.onDelta("This is regenerated content.");
			params.onStatusChange?.("generating_quizzes");
			return new Promise(() => {});
		});

		renderWithProviders(<ConceptCard node={mockNode} isActive={true} />);

		fireEvent.click(screen.getByLabelText("Regenerate the content"));
		fireEvent.click(screen.getByText("Regenerate"));

		expect(screen.getByText("This is regenerated content.")).toBeDefined();
		expect(screen.getByText("Generating quiz...")).toBeDefined();
	});
});

describe("ConceptCard normal feedback regression", () => {
	test("keeps learning mastery actions and explains each multi-correct option", () => {
		const quiz: QuizCard = {
			question_text: "Normal learning multi-select", difficulty: "easy",
			question_type: "multiple_choice", options: [
				{ option_id: "x", display_label: "D", text: "X", is_correct: true, explanation: "X explanation is unique" },
				{ option_id: "y", display_label: "A", text: "Y", is_correct: true, explanation: "Y explanation is unique" },
				{ option_id: "z", display_label: "B", text: "Z", is_correct: false, explanation: "Z distractor explanation" },
				{ option_id: "w", display_label: "C", text: "W", is_correct: false, explanation: "W distractor explanation" },
			],
		};
		const result: QuizSubmitResponse = {
			node_id: mockNode.id, attempt_number: 1, is_correct: true,
			score_percent: 100, selected_option_ids: ["y", "x"], correct_option_ids: ["x", "y"],
			explanation: "X explanation is unique", is_mastered: true,
			next_node_unlocked: true, node_status: "SHOWING_FEEDBACK",
		};
		const onContinue = vi.fn();
		renderWithProviders(<ConceptCard node={{ ...mockNode, status: "SHOWING_FEEDBACK", quiz }}
			quizResult={result} onContinueToNext={onContinue} />);
		expect(screen.getByText("Y explanation is unique")).toBeInTheDocument();
		expect(screen.getByText("Mastered!")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Continue to Next Topic →" }));
		expect(onContinue).toHaveBeenCalledWith(mockNode.id);
	});

	test("quiz options and submit match revision static styling without transitions", () => {
		renderWithProviders(
			<ConceptCard
				node={{
					...mockNode,
					status: "IN_QUIZ",
					quiz_hidden: {
						question_text: "What is AI?",
						difficulty: "easy",
						question_type: "single_choice",
						options: [
							{ option_id: "a", display_label: "A", text: "Option A" },
							{ option_id: "b", display_label: "B", text: "Option B" },
						],
					},
				}}
			/>,
		);
		const option = screen.getByText("Option A").closest("label");
		expect(option?.className).not.toMatch(/transition/);
		expect(option?.className).toContain("border-muted");
		fireEvent.click(screen.getByRole("radio", { name: /Option A/ }));
		expect(option?.className).toContain("border-primary");
		expect(option?.className).toContain("bg-primary/10");
		const submit = screen.getByRole("button", { name: "Submit Answer" });
		expect(submit.className).not.toMatch(/transition/);
		expect(submit).toHaveClass("disabled:opacity-50");
	});

	test("keeps the quiz form visible until feedback is ready", () => {
		renderWithProviders(
			<ConceptCard
				node={{
					...mockNode,
					status: "SHOWING_FEEDBACK",
					quiz: null,
					quiz_set: null,
					quiz_hidden: {
						question_text: "What is AI?",
						difficulty: "easy",
						question_type: "single_choice",
						options: [
							{ option_id: "a", display_label: "A", text: "Option A" },
							{ option_id: "b", display_label: "B", text: "Option B" },
						],
					},
				}}
			/>,
		);
		expect(screen.getByRole("button", { name: "Submit Answer" })).toBeInTheDocument();
		expect(screen.queryByText("Loading quiz feedback...")).not.toBeInTheDocument();
		expect(screen.queryByText("Correct!")).not.toBeInTheDocument();
	});

	test("restores persisted feedback after reload without mutation state", async () => {
		api.getQuizAttempts.mockResolvedValue({
			node_id: mockNode.id,
			total_attempts: 1,
			is_mastered: false,
			best_score: 0,
			attempts: [
				{
					id: "attempt-1",
					node_id: mockNode.id,
					attempt_number: 1,
					quiz_index: 0,
					selected_option_ids: ["z"],
					is_correct: false,
					score_percent: 0,
					correct_option_ids: ["x"],
					explanation: "Z distractor explanation",
					is_mastered: false,
					created_at: "2026-10-07T00:00:00Z",
					updated_at: null,
				},
			],
		});
		const quiz: QuizCard = {
			question_text: "Normal learning multi-select",
			difficulty: "easy",
			question_type: "multiple_choice",
			options: [
				{ option_id: "x", display_label: "D", text: "X", is_correct: true, explanation: "X explanation is unique" },
				{ option_id: "y", display_label: "A", text: "Y", is_correct: true, explanation: "Y explanation is unique" },
				{ option_id: "z", display_label: "B", text: "Z", is_correct: false, explanation: "Z distractor explanation" },
				{ option_id: "w", display_label: "C", text: "W", is_correct: false, explanation: "W distractor explanation" },
			],
		};
		const onRetry = vi.fn();
		renderWithProviders(
			<ConceptCard
				node={{ ...mockNode, status: "SHOWING_FEEDBACK", quiz }}
				onRetryQuiz={onRetry}
			/>,
		);
		expect(await screen.findByText("Incorrect")).toBeInTheDocument();
		expect(screen.queryByText("Feedback unavailable")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
		expect(onRetry).toHaveBeenCalledWith(mockNode.id);
	});

	test("offers retry when SHOWING_FEEDBACK cannot restore a result", async () => {
		api.getQuizAttempts.mockResolvedValue({
			node_id: mockNode.id,
			total_attempts: 0,
			is_mastered: false,
			best_score: 0,
			attempts: [],
		});
		const onRetry = vi.fn();
		const onPrevious = vi.fn();
		renderWithProviders(
			<ConceptCard
				node={{ ...mockNode, status: "SHOWING_FEEDBACK", quiz: null, quiz_set: null }}
				onRetryQuiz={onRetry}
				onPrevious={onPrevious}
				canPrevious={true}
			/>,
		);
		expect(await screen.findByText("Feedback unavailable")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
		expect(onRetry).toHaveBeenCalledWith(mockNode.id);
		fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
		expect(onPrevious).toHaveBeenCalled();
	});
});
