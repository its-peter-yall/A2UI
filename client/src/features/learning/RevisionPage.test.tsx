/**
 * ============================================================================
 * FILE: RevisionPage.test.tsx
 * LOCATION: client/src/features/learning/RevisionPage.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Integration tests for RevisionPage orchestration against a real
 *    QueryClient and router with deterministic revision transport.
 *
 * ROLE IN PROJECT:
 *    Exercises route-keyed page state, controlled quiz selections, saved
 *    per-quiz restoration, mode-specific completion, explicit summary opening,
 *    notices, revision-only table of contents, and concept chat wiring through
 *    the real P4/P5 card, quiz section, layout, controller, and panel.
 *
 * KEY COMPONENTS:
 *    - mountRevision: Real router and QueryClient page harness
 *    - deferred: Explicit out-of-order response ordering
 *    - saved/summary: Typed revision attempt and summary fixtures
 *
 * DEPENDENCIES:
 *    - External: @testing-library/react, vitest, react-router-dom, @tanstack/react-query
 *    - Internal: ./RevisionPage, ./RevisionConceptCard, ./useRevisionSession, @/lib/learningApi
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/RevisionPage.test.tsx
 * ============================================================================
 */

import type { ReactNode, ComponentPropsWithoutRef } from "react";
import {
	render,
	screen,
	fireEvent,
	within,
	waitFor,
	cleanup,
	act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RevisionPage } from "./RevisionPage";
import { RevisionConceptCard } from "./RevisionConceptCard";
import { revisionQueryKeys } from "./useRevisionSession";
import type {
	ConceptNode,
	LearningSessionWithNodes,
	RevisionMode,
	RevisionQuizResponse,
	RevisionSessionWithProgress,
	RevisionSummary,
} from "@/types/learning";

// Mock framer-motion to avoid animation issues in jsdom environment
vi.mock("framer-motion", () => ({
	motion: {
		div: ({ children, ...props }: ComponentPropsWithoutRef<"div">) => <div {...props}>{children}</div>,
		article: ({ children, ...props }: ComponentPropsWithoutRef<"article">) => <article {...props}>{children}</article>,
	},
	AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const mockNodeWithQuizSet: ConceptNode = {
	id: "node-1",
	learning_session_id: "session-1",
	sequence_index: 0,
	title: "Knowledge Graphs 101",
	content_markdown: "Knowledge graph overview...",
	status: "COMPLETED",
	error_message: null,
	retry_available: false,
	complexity: "Basic",
	created_at: "2026-08-01T00:00:00Z",
	updated_at: "2026-08-01T00:00:00Z",
	quiz: null,
	quiz_set: {
		quizzes: [
			{
				question_text: "What is an entity?",
				question_type: "single_choice",
				difficulty: "easy",
				options: [
					{ option_id: "opt-1", text: "A node", display_label: "A", explanation: "Correct", is_correct: true },
					{ option_id: "opt-2", text: "A line", display_label: "B", explanation: "Incorrect", is_correct: false },
					{ option_id: "opt-5", text: "A table", display_label: "C", explanation: "Tables are not graph entities.", is_correct: false },
					{ option_id: "opt-6", text: "A color", display_label: "D", explanation: "Colors annotate entities.", is_correct: false },
				],
			},
			{
				question_text: "What is a relation?",
				question_type: "single_choice",
				difficulty: "easy",
				options: [
					{ option_id: "opt-3", text: "An edge", display_label: "A", explanation: "Correct", is_correct: true },
					{ option_id: "opt-4", text: "A vertex", display_label: "B", explanation: "Incorrect", is_correct: false },
					{ option_id: "opt-7", text: "A property", display_label: "C", explanation: "Properties describe relations.", is_correct: false },
					{ option_id: "opt-8", text: "A label", display_label: "D", explanation: "Labels identify relations.", is_correct: false },
				],
			},
		],
		current_index: 0,
		shuffle_seed: null,
	},
	quiz_hidden: null,
	quiz_set_hidden: null,
};

const mockOriginalSession: LearningSessionWithNodes = {
	id: "session-1",
	query: "Knowledge Graphs",
	course_title: "Mastering Knowledge Graphs",
	user_id: "user-1",
	total_nodes: 1,
	completed_nodes: 1,
	last_active_node_id: "node-1",
	created_at: "2026-08-01T00:00:00Z",
	updated_at: "2026-08-01T00:00:00Z",
	nodes: [mockNodeWithQuizSet],
};

const mockRevisionSession: RevisionSessionWithProgress = {
	id: "rev-1",
	original_session_id: "session-1",
	mode: "full_review",
	status: "in_progress",
	revision_number: 1,
	progress_percent: 0,
	total_quiz_score_percent: null,
	started_at: "2026-08-06T00:00:00Z",
	completed_at: null,
	notices: [],
	nodes: [
		{
			id: "rev-node-1",
			node_id: "node-1",
			node_title: "Knowledge Graphs 101",
			sequence_index: 0,
			status: "pending",
			reviewed_at: null,
			content_reviewed_at: null,
			quiz_count: 2,
			quiz_results: [],
		},
	],
};

const api = vi.hoisted(() => ({
	getLearningSession: vi.fn(),
	getRevisionSession: vi.fn(),
	getRevisionSummary: vi.fn(),
	createRevisionSession: vi.fn(),
	markNodeReviewed: vi.fn(),
	submitRevisionQuiz: vi.fn(),
}));

vi.mock("@/lib/learningApi", () => api);

/**
 * React Router builds a `Request` for every client-side navigation and passes
 * the ambient `AbortSignal` to it. Under jsdom that signal belongs to a
 * different realm than Node's undici `Request`, which rejects it outright with
 * "Expected signal to be an instance of AbortSignal". Drop a foreign signal
 * instead of failing the navigation: these routes declare no loaders, so the
 * signal is only ever used to cancel in-flight ones.
 */
const NativeRequest = globalThis.Request;

function nativeRequestAccepts(signal: unknown): boolean {
	try {
		new NativeRequest("http://localhost/", { signal: signal as AbortSignal });
		return true;
	} catch {
		return false;
	}
}

class RouterCompatibleRequest extends NativeRequest {
	constructor(input: RequestInfo | URL, init?: RequestInit) {
		if (init?.signal != null && !nativeRequestAccepts(init.signal)) {
			const rest: RequestInit = { ...init };
			delete rest.signal;
			super(input, rest);
			return;
		}
		super(input, init);
	}
}

globalThis.Request = RouterCompatibleRequest;

function deferred<T>() {
	let resolve: (value: T) => void = () => { throw new Error("resolve not initialized"); };
	let reject: (error: Error) => void = () => { throw new Error("reject not initialized"); };
	const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
	return { promise, resolve, reject };
}

function saved(overrides: Partial<RevisionQuizResponse> = {}): RevisionQuizResponse {
	return {
		id: "attempt-1",
		revision_session_id: "rev-1",
		node_id: "node-1",
		quiz_index: 0,
		attempt_number: 5,
		quiz_attempt_count: 1,
		selected_option_ids: ["opt-1"],
		is_correct: true,
		score_percent: 100,
		correct_option_ids: ["opt-1"],
		explanation: "Node explanation",
		selected_explanation: null,
		created_at: "2026-10-05T00:01:00Z",
		revision_node_status: "pending",
		...overrides,
	};
}

function summary(overrides: Partial<RevisionSummary> = {}): RevisionSummary {
	return {
		revision_id: "rev-1",
		mode: "quiz_only",
		progress_percent: 100,
		nodes_reviewed: 1,
		nodes_total: 1,
		total_quiz_score_percent: 50,
		quizzes_passed: 1,
		quizzes_failed: 1,
		quizzes_total: 2,
		time_spent_seconds: 60,
		comparison: { original_quiz_score_percent: 25, improvement_percent: 25 },
		notices: [],
		...overrides,
	};
}

let revisionData: RevisionSessionWithProgress;
let originalData: LearningSessionWithNodes;
const clients: QueryClient[] = [];

beforeEach(() => {
	vi.resetAllMocks();
	localStorage.clear();
	originalData = structuredClone(mockOriginalSession);
	originalData.nodes.push({
		...structuredClone(mockNodeWithQuizSet),
		id: "node-2",
		sequence_index: 1,
		title: "Second topic",
	});
	originalData.total_nodes = 2;
	originalData.completed_nodes = 2;
	revisionData = structuredClone(mockRevisionSession);
	revisionData.nodes.push({
		...structuredClone(mockRevisionSession.nodes[0]),
		id: "rev-node-2",
		node_id: "node-2",
		node_title: "Second topic",
		sequence_index: 1,
	});
	api.getLearningSession.mockImplementation(async () => structuredClone(originalData));
	api.getRevisionSession.mockImplementation(async (id: string) => ({
		...structuredClone(revisionData),
		id,
	}));
	api.getRevisionSummary.mockResolvedValue(summary());
	HTMLElement.prototype.scrollIntoView = vi.fn();
	window.matchMedia = vi.fn().mockImplementation((media: string) => ({
		media,
		matches: true,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}));
});

afterEach(() => {
	cleanup();
	clients.splice(0).forEach((client) => client.clear());
	vi.unstubAllGlobals();
});

function mountRevision(id = "rev-1") {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	clients.push(client);
	const router = createMemoryRouter(
		[
			{ path: "/learn/:sessionId/revise/:revisionId", element: <RevisionPage /> },
			{ path: "/learn", element: <p>Dashboard fixture</p> },
		],
		{ initialEntries: [`/learn/session-1/revise/${id}`] },
	);
	const view = render(
		<QueryClientProvider client={client}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	return { client, router, ...view };
}

const topicNext = () =>
	fireEvent.click(screen.getByRole("button", { name: "Next topic" }));
const topicPrevious = () =>
	fireEvent.click(screen.getByRole("button", { name: "Previous topic" }));

describe("RevisionConceptCard Multi-Quiz Navigation", () => {
	test("renders multi-quiz pagination and allows stepping between Quiz 1 and Quiz 2", () => {
		const handleQuizSubmit = vi.fn();
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		clients.push(client);
		render(
			<QueryClientProvider client={client}>
				<RevisionConceptCard
					node={mockNodeWithQuizSet}
					revisionMode="full_review"
					revisionProgress={mockRevisionSession.nodes[0]}
					onMarkReviewed={vi.fn()}
					onQuizSubmit={handleQuizSubmit}
				/>
			</QueryClientProvider>,
		);

		expect(screen.getByText(/Quiz 1 of 2/i)).toBeInTheDocument();
		expect(screen.getByText(/What is an entity\?/i)).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Next quiz" }));

		expect(screen.getByText(/Quiz 2 of 2/i)).toBeInTheDocument();
		expect(screen.getByText(/What is a relation\?/i)).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Previous quiz" }));

		expect(screen.getByText(/Quiz 1 of 2/i)).toBeInTheDocument();
	});
});

it("renders Table of Contents button and Chat FAB button", async () => {
	mountRevision();
	expect(await screen.findByTestId("toc-button")).toBeInTheDocument();
	expect(screen.getByText("Table of Contents")).toBeInTheDocument();
	expect(screen.getByTestId("revision-chat-fab")).toBeInTheDocument();
});

it.each<RevisionMode>(["full_review", "quiz_only"])(
	"preserves selections when %s topic cards unmount",
	async (mode) => {
		revisionData.mode = mode;
		mountRevision();
		await screen.findByText("What is an entity?");
		fireEvent.click(screen.getByRole("radio", { name: /A node/ }));
		fireEvent.click(screen.getByRole("button", { name: "Next quiz" }));
		fireEvent.click(screen.getByRole("radio", { name: /A vertex/ }));
		topicNext();
		await screen.findByRole("heading", { name: "Second topic" });
		topicPrevious();
		await screen.findByRole("heading", { name: "Knowledge Graphs 101" });
		expect(screen.getByRole("radio", { name: /A vertex/ })).toBeChecked();
		fireEvent.click(screen.getByRole("button", { name: "Previous quiz" }));
		expect(screen.getByRole("radio", { name: /A node/ })).toBeChecked();
		fireEvent.click(screen.getByRole("button", { name: "Skip quiz" }));
		expect(api.submitRevisionQuiz).not.toHaveBeenCalled();
	},
);

it("resets topic, selection, and summary visibility on a revision route switch", async () => {
	const { router } = mountRevision();
	await screen.findByText("What is an entity?");
	fireEvent.click(screen.getByRole("radio", { name: /A node/ }));
	topicNext();
	await act(async () => {
		await router.navigate("/learn/session-1/revise/rev-2");
	});
	await screen.findByRole("heading", { name: "Knowledge Graphs 101" });
	expect(screen.getByRole("radio", { name: /A node/ })).not.toBeChecked();
	expect(
		screen.queryByRole("dialog", { name: "Revision Summary" }),
	).not.toBeInTheDocument();
});