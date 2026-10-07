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
const chatApi = vi.hoisted(() => ({ streamConceptChat: vi.fn() }));

vi.mock("@/lib/chatApi", () => chatApi);


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
	chatApi.streamConceptChat.mockResolvedValue(undefined);
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

/**
 * Scope a feedback assertion to the result header.
 *
 * A wrong answer also discloses the selected option's explanation, and fixtures
 * use the same word there, so an unscoped text match is ambiguous.
 */
const findResultHeader = (outcome: "Correct!" | "Incorrect") =>
	screen.findByRole("status", { name: "Quiz result" }).then((header) => {
		expect(header).toHaveTextContent(outcome);
		return header;
	});

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

it("does not offer concept chat during Practice Quizzes", async () => {
	revisionData.mode = "quiz_only";
	mountRevision();
	await screen.findByText("What is an entity?");
	expect(screen.queryByTestId("revision-chat-fab")).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Open concept chat" }),
	).not.toBeInTheDocument();
	expect(
		screen.queryByRole("dialog", { name: /Chat:/ }),
	).not.toBeInTheDocument();
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

it.each<RevisionMode>(["full_review", "quiz_only"])(
	"restores independent saved feedback after a fresh %s mount",
	async (mode) => {
		revisionData.mode = mode;
		revisionData.nodes[0].quiz_results = [
			saved(),
			saved({
				id: "wrong",
				quiz_index: 1,
				attempt_number: 6,
				quiz_attempt_count: 2,
				is_correct: false,
				score_percent: 0,
				selected_option_ids: ["opt-4"],
				correct_option_ids: [],
				explanation: "",
			}),
		];
		const first = mountRevision();
		await findResultHeader("Correct!");
		expect(screen.getByRole("button", { name: "Quiz 1: correct" })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Quiz 2: incorrect" }));
		await findResultHeader("Incorrect");
		expect(screen.getByText("Attempt #2 • Score: 0%")).toBeInTheDocument();
		first.unmount();
		mountRevision();
		await findResultHeader("Correct!");
		fireEvent.click(screen.getByRole("button", { name: "Quiz 2: incorrect" }));
		expect(screen.getByRole("status", { name: "Quiz result" })).toHaveTextContent("Incorrect");
		expect(api.getRevisionSession).toHaveBeenCalledTimes(2);
	},
);

it("does not leak late failures or pending into a destination revision route", async () => {
	const pending = deferred<RevisionQuizResponse>();
	api.submitRevisionQuiz.mockReturnValue(pending.promise);
	const { router, client } = mountRevision();
	await screen.findByText("What is an entity?");
	fireEvent.click(screen.getByRole("radio", { name: /A node/ }));
	fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
	await waitFor(() => expect(api.submitRevisionQuiz).toHaveBeenCalledTimes(1));
	await act(async () => {
		await router.navigate("/learn/session-1/revise/rev-2");
	});
	await screen.findByText("What is an entity?");
	await act(async () => pending.reject(new Error("late old error")));
	expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument();
	expect(screen.queryByText("Updating...")).not.toBeInTheDocument();
	expect(
		client.getQueryData<RevisionSessionWithProgress>(
			revisionQueryKeys.session("rev-2"),
		)?.nodes[0].quiz_results,
	).toEqual([]);
});

it("handles two visible quiz requests resolving in reverse order without crossed feedback", async () => {
	revisionData.mode = "quiz_only";
	const first = deferred<RevisionQuizResponse>();
	const second = deferred<RevisionQuizResponse>();
	api.submitRevisionQuiz.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
	mountRevision();
	await screen.findByText("What is an entity?");
	fireEvent.click(screen.getByRole("radio", { name: /A node/ }));
	fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
	await waitFor(() => expect(api.submitRevisionQuiz).toHaveBeenCalledTimes(1));
	fireEvent.click(screen.getByRole("button", { name: "Next quiz" }));
	expect(screen.getByRole("button", { name: "Submit Answer" })).not.toHaveTextContent("Submitting...");
	fireEvent.click(screen.getByRole("radio", { name: /A vertex/ }));
	fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
	await waitFor(() => expect(api.submitRevisionQuiz).toHaveBeenCalledTimes(2));
	await act(async () =>
		second.resolve(
			saved({
				id: "second",
				quiz_index: 1,
				attempt_number: 6,
				is_correct: false,
				score_percent: 0,
				selected_option_ids: ["opt-4"],
				correct_option_ids: [],
				explanation: "",
			}),
		),
	);
	await findResultHeader("Incorrect");
	expect(screen.getByRole("button", { name: "Quiz 1: unanswered" })).toBeInTheDocument();
	await act(async () => first.resolve(saved()));
	await waitFor(() =>
		expect(screen.getByRole("button", { name: "Quiz 1: correct" })).toBeInTheDocument(),
	);
	expect(screen.getByRole("button", { name: "Quiz 2: incorrect" })).toBeInTheDocument();
	expect(screen.getByRole("status", { name: "Quiz result" })).toHaveTextContent("Incorrect");
	expect(screen.getByTestId("revision-concept-card")).toHaveClass("border-border");
	expect(screen.getByTestId("revision-concept-card")).not.toHaveClass(
		"border-green-500",
		"border-red-500",
	);
	fireEvent.click(screen.getByRole("button", { name: "Previous quiz" }));
	expect(screen.getByRole("status", { name: "Quiz result" })).toHaveTextContent("Correct!");
});
it("keeps final wrong feedback readable and opens summary only by request", async () => {
	revisionData.mode = "quiz_only";
	revisionData.nodes = [revisionData.nodes[0]];
	revisionData.nodes[0].quiz_results = [saved()];
	api.submitRevisionQuiz.mockImplementation(async () => {
		const result = saved({ id: "second", quiz_index: 1, attempt_number: 6,
			is_correct: false, score_percent: 0, selected_option_ids: ["opt-4"],
			correct_option_ids: [], explanation: "", revision_node_status: "quiz_failed" });
		revisionData.nodes[0].quiz_results.push(result);
		revisionData.nodes[0].status = "quiz_failed";
		revisionData.status = "completed"; revisionData.progress_percent = 100;
		revisionData.total_quiz_score_percent = 50; revisionData.completed_at = "2026-10-05T00:02:00Z";
		return result;
	});
	mountRevision();
	await findResultHeader("Correct!");
	fireEvent.click(screen.getByRole("button", { name: "Quiz 2: unanswered" }));
	fireEvent.click(screen.getByRole("radio", { name: /A vertex/ }));
	fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
	await findResultHeader("Incorrect");
	expect(
		screen.queryByRole("dialog", { name: "Revision Summary" }),
	).not.toBeInTheDocument();
	expect(api.getRevisionSummary).not.toHaveBeenCalled();
	fireEvent.click(await screen.findByRole("button", { name: "View Summary" }));
	const modal = await screen.findByRole("dialog", { name: "Revision Summary" });
	expect(within(modal).getByText("50%")).toBeInTheDocument();
});

it("invalidates a viewed summary on retry and preserves the first completion timestamp", async () => {
	revisionData.mode = "quiz_only"; revisionData.nodes = [revisionData.nodes[0]];
	const wrong = saved({ id: "wrong", quiz_index: 1, is_correct: false, score_percent: 0,
		selected_option_ids: ["opt-4"], correct_option_ids: [], explanation: "", attempt_number: 6 });
	revisionData.nodes[0].quiz_results = [saved(), wrong];
	revisionData.nodes[0].status = "quiz_failed";
	revisionData.status = "completed"; revisionData.progress_percent = 100;
	revisionData.total_quiz_score_percent = 50; revisionData.completed_at = "2026-10-05T00:02:00Z";
	const { client } = mountRevision();
	await findResultHeader("Correct!");
	expect(screen.queryByRole("dialog", { name: "Revision Summary" })).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "View Summary" }));
	await screen.findByRole("dialog", { name: "Revision Summary" });
	fireEvent.click(screen.getByRole("button", { name: "Close summary" }));
	fireEvent.click(screen.getByRole("button", { name: "Quiz 2: incorrect" }));
	fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
	api.getRevisionSummary.mockResolvedValue(summary({ total_quiz_score_percent: 66, quizzes_passed: 2, quizzes_failed: 1, quizzes_total: 3 }));
	api.submitRevisionQuiz.mockImplementation(async () => {
		const result = saved({ id: "retry", quiz_index: 1, attempt_number: 7, quiz_attempt_count: 2,
			selected_option_ids: ["opt-3"], correct_option_ids: ["opt-3"], revision_node_status: "quiz_passed" });
		revisionData.nodes[0].quiz_results = [saved(), result];
		revisionData.nodes[0].status = "quiz_passed";
		revisionData.total_quiz_score_percent = 66;
		return result;
	});
	fireEvent.click(screen.getByRole("radio", { name: /An edge/ }));
	fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
	await screen.findByText("Attempt #2 • Score: 100%");
	await waitFor(() =>
		expect(
			client.getQueryData<RevisionSessionWithProgress>(
				revisionQueryKeys.session("rev-1"),
			)?.total_quiz_score_percent,
		).toBe(66),
	);
	expect(
		client.getQueryData<RevisionSessionWithProgress>(
			revisionQueryKeys.session("rev-1"),
		)?.completed_at,
	).toBe("2026-10-05T00:02:00Z");
	fireEvent.click(screen.getByRole("button", { name: "View Summary" }));
	const modal = await screen.findByRole("dialog", { name: "Revision Summary" });
	expect(within(modal).getByText("66%")).toBeInTheDocument();
	expect(within(modal).getByText("3 total attempts")).toBeInTheDocument();
	expect(api.getRevisionSummary).toHaveBeenCalledTimes(2);
});

it("uses finished Practice coverage, including wrong attempts, in header and TOC", async () => {
	revisionData.mode = "quiz_only";
	revisionData.nodes[0].quiz_results = [
		saved(),
		saved({ id: "wrong", quiz_index: 1, is_correct: false,
			score_percent: 0, selected_option_ids: ["opt-4"], correct_option_ids: [], explanation: "" }),
	];
	revisionData.nodes[0].status = "quiz_failed"; revisionData.progress_percent = 50;
	mountRevision();
	await findResultHeader("Correct!");
	expect(screen.getByText("1 / 2 topics finished")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Open Table of Contents" }));
	const toc = screen.getByRole("dialog", { name: "Table of Contents" });
	expect(within(toc).getByText("Practice finished")).toBeInTheDocument();
	expect(within(toc).queryByText(/Mastered|Locked/)).not.toBeInTheDocument();
	fireEvent.click(within(toc).getByRole("button", { name: "Second topic" }));
	expect(screen.getByRole("heading", { name: "Second topic" })).toBeInTheDocument();
});

it("displays compatibility notices once per page and leaves compatible quizzes usable", async () => {
	revisionData.notices = [
		{ code: "legacy_review_required", node_id: "node-1", attempt_count: 0 },
		{ code: "legacy_review_required", node_id: "node-2", attempt_count: 0 },
		{ code: "incompatible_attempts", node_id: "node-1", attempt_count: 2 },
		{ code: "completion_recalculated", node_id: null, attempt_count: 0 },
		{ code: "legacy_review_inferred", node_id: "node-2", attempt_count: 0 },
	];
	mountRevision();
	await screen.findByText("What is an entity?");
	expect(screen.getAllByText(/Earlier quiz activity did not record explicit reading review/)).toHaveLength(1);
	expect(screen.getByText(/2 historical attempts were retained/)).toBeInTheDocument();
	expect(screen.getByText(/Completion was recalculated/)).toBeInTheDocument();
	expect(screen.getByText(/Earlier explicit review was restored/)).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Mark as Reviewed" })).toBeEnabled();
});

it("keeps quizless topics navigable and never auto-opens an empty Practice summary", async () => {
	revisionData.mode = "quiz_only";
	revisionData.nodes.forEach((node) => { node.quiz_count = 0; });
	originalData.nodes.forEach((node) => { node.quiz = null; node.quiz_set = null; });
	mountRevision();
	await screen.findByText("No practice quizzes available.");
	expect(screen.getByText("0 / 0 topics finished")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "View Summary" })).not.toBeInTheDocument();
	topicNext();
	await screen.findByRole("heading", { name: "Second topic" });
	expect(screen.getByText("No quiz available for this topic.")).toBeInTheDocument();
});

it("handles an empty revision without a nonexistent Topic 1 of 0", async () => {
	revisionData.nodes = []; originalData.nodes = [];
	mountRevision();
	await screen.findByText("No topics available in this revision.");
	expect(screen.queryByText("Topic 1 of 0")).not.toBeInTheDocument();
	expect(api.getRevisionSummary).not.toHaveBeenCalled();
});

it("prefills repeated curiosity clicks without sending and retains explicit chat ownership", async () => {
	originalData.nodes[0].content_markdown =
		"## Entities\nBody.\n\n## Curious to explore more?\n- Why use graphs?";
	originalData.nodes[1].content_markdown =
		"## Relations\nBody.\n\n## Curious to explore more?\n- Why use edges?";
	mountRevision();
	const question = await screen.findByRole("button", { name: /Why use graphs/ });
	fireEvent.click(question);
	const composer = await screen.findByRole("textbox", {
		name: "Ask a question about this concept",
	});
	await waitFor(() => expect(composer).toHaveValue("Why use graphs?"));
	await waitFor(() => expect(composer).toHaveFocus());
	expect(chatApi.streamConceptChat).not.toHaveBeenCalled();
	fireEvent.change(composer, { target: { value: "edited draft" } });
	fireEvent.click(question);
	await waitFor(() => expect(composer).toHaveValue("Why use graphs?"));
	topicNext();
	await screen.findByRole("heading", { name: "Second topic" });
	expect(screen.getByRole("heading", { name: "Chat: Knowledge Graphs 101" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: /Why use edges/ }));
	expect(screen.getByRole("heading", { name: "Chat: Second topic" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Close concept chat" }));
	fireEvent.click(screen.getByRole("button", { name: /Why use edges/ }));
	await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("Why use edges?"));
});

it("places desktop chat within the bounded main shell and preserves it on revision completion", async () => {
	revisionData.status = "completed"; revisionData.mode = "full_review";
	revisionData.nodes.forEach((node) => {
		node.content_reviewed_at = "2026-10-05T00:01:00Z"; node.status = "reviewed";
	});
	localStorage.setItem("concept_chat_session-1_node-1", JSON.stringify({
		messages: [{ role: "user", content: "Preserved conversation" }],
		lastPromptTimestamp: Date.now(),
		webSearchEnabled: false,
	}));
	mountRevision();
	fireEvent.click(await screen.findByRole("button", { name: "Open concept chat" }));
	const chat = screen.getByRole("dialog", { name: "Chat: Knowledge Graphs 101" });
	expect(screen.getByRole("main").contains(chat)).toBe(true);
	expect(screen.getByRole("separator", { name: "Resize chat panel" })).toHaveAttribute(
		"aria-valuenow",
		"25",
	);
	fireEvent.keyDown(screen.getByRole("separator"), { key: "End" });
	expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "38");
	expect(await screen.findByText("Preserved conversation")).toBeInTheDocument();
	fireEvent.keyDown(document, { key: "Escape" });
	await waitFor(() =>
		expect(screen.queryByRole("dialog", { name: /Chat:/ })).not.toBeInTheDocument(),
	);
	expect(localStorage.getItem("concept_chat_session-1_node-1")).toContain(
		"Preserved conversation",
	);
});

it("uses the mobile overlay without a desktop separator", async () => {
	window.matchMedia = vi.fn().mockImplementation((media: string) => ({
		media, matches: false, onchange: null,
		addListener: vi.fn(), removeListener: vi.fn(),
		addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
	}));
	mountRevision();
	fireEvent.click(await screen.findByRole("button", { name: "Open concept chat" }));
	expect(screen.getByTestId("concept-chat-overlay")).toBeInTheDocument();
	expect(screen.queryByRole("separator")).not.toBeInTheDocument();
	expect(
		screen.getByRole("main").contains(screen.getByRole("dialog", { name: /Chat:/ })),
	).toBe(true);
});

it("restores chat opener focus after Escape closes Full Review concept chat", async () => {
	revisionData.mode = "full_review";
	mountRevision();
	const fab = await screen.findByTestId("revision-chat-fab");
	fab.focus();
	fireEvent.click(fab);
	const composer = await screen.findByRole("textbox", {
		name: "Ask a question about this concept",
	});
	await waitFor(() => expect(composer).toHaveFocus());
	fireEvent.keyDown(document, { key: "Escape" });
	await waitFor(() =>
		expect(screen.getByTestId("revision-chat-fab")).toHaveFocus(),
	);
});

it("keeps the chat opener mounted but unexposed while chat is open", async () => {
	mountRevision();
	const fab = await screen.findByTestId("revision-chat-fab");
	fab.focus();
	fireEvent.click(fab);
	await screen.findByRole("textbox", {
		name: "Ask a question about this concept",
	});
	expect(fab).toHaveAttribute("aria-hidden", "true");
	expect(fab).toHaveAttribute("tabindex", "-1");
	expect(
		screen.queryByRole("button", { name: "Open concept chat" }),
	).not.toBeInTheDocument();
	fireEvent.keyDown(document, { key: "Escape" });
	await waitFor(() =>
		expect(screen.getByTestId("revision-chat-fab")).toHaveFocus(),
	);
});

it("restores chat opener focus after Escape closes the mobile overlay chat", async () => {
	window.matchMedia = vi.fn().mockImplementation((media: string) => ({
		media,
		matches: false,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}));
	mountRevision();
	const fab = await screen.findByTestId("revision-chat-fab");
	fab.focus();
	fireEvent.click(fab);
	expect(screen.getByTestId("concept-chat-overlay")).toBeInTheDocument();
	await screen.findByRole("textbox", {
		name: "Ask a question about this concept",
	});
	fireEvent.keyDown(document, { key: "Escape" });
	await waitFor(() =>
		expect(screen.getByTestId("revision-chat-fab")).toHaveFocus(),
	);
});

it.each<RevisionMode>(["full_review", "quiz_only"])(
	"preserves %s inputs and previous feedback through a failed retry",
	async (mode) => {
		revisionData.mode = mode;
		revisionData.nodes[0].quiz_results = [saved({ id: "wrong", is_correct: false,
			score_percent: 0, selected_option_ids: ["opt-2"], correct_option_ids: [], explanation: "" })];
		mountRevision();
		await findResultHeader("Incorrect");
		fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
		fireEvent.click(screen.getByRole("radio", { name: /A node/ }));
		api.submitRevisionQuiz.mockRejectedValueOnce(new Error("offline"));
		fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
		await screen.findByText("Could not save this answer. Please try again.");
		expect(screen.getByRole("radio", { name: /A node/ })).toBeChecked();
		expect(screen.getByText("Previous saved feedback")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Quiz 1: incorrect" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Submit Answer" })).toBeEnabled();
		api.submitRevisionQuiz.mockResolvedValueOnce(saved({ id: "retry", attempt_number: 6, quiz_attempt_count: 2 }));
		fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
		await findResultHeader("Correct!");
	},
);

it("requires explicit Full Review reading and does not undo it after a wrong quiz", async () => {
	revisionData.mode = "full_review"; revisionData.nodes = [revisionData.nodes[0]];
	api.markNodeReviewed.mockRejectedValueOnce(new Error("offline"));
	const { client } = mountRevision();
	await screen.findByText("What is an entity?");
	fireEvent.click(screen.getByRole("button", { name: "Mark as Reviewed" }));
	await screen.findByText("Could not mark this topic as reviewed. Please try again.");
	expect(screen.getByText("0 / 1 topics reviewed")).toBeInTheDocument();
	api.markNodeReviewed.mockImplementationOnce(async () => {
		revisionData.nodes[0].content_reviewed_at = "2026-10-05T00:01:00Z";
		revisionData.nodes[0].status = "reviewed";
		revisionData.status = "completed"; revisionData.progress_percent = 100;
		revisionData.completed_at = "2026-10-05T00:01:00Z";
		return structuredClone(revisionData.nodes[0]);
	});
	fireEvent.click(screen.getByRole("button", { name: "Mark as Reviewed" }));
	await screen.findByText("1 / 1 topics reviewed");
	api.submitRevisionQuiz.mockImplementationOnce(async () => {
		const wrong = saved({ id: "wrong", attempt_number: 6, is_correct: false, score_percent: 0,
			selected_option_ids: ["opt-2"], correct_option_ids: [], explanation: "", revision_node_status: "reviewed" });
		revisionData.nodes[0].quiz_results = [wrong];
		return wrong;
	});
	fireEvent.click(screen.getByRole("radio", { name: /A line/ }));
	fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
	await findResultHeader("Incorrect");
	expect(screen.getByText("1 / 1 topics reviewed")).toBeInTheDocument();
	expect(
		client.getQueryData<RevisionSessionWithProgress>(
			revisionQueryKeys.session("rev-1"),
		)?.nodes[0].content_reviewed_at,
	).toBe("2026-10-05T00:01:00Z");
	expect(screen.queryByRole("dialog", { name: "Revision Summary" })).not.toBeInTheDocument();
});

it("keeps a new saved result visible while a slow aggregate query is pending", async () => {
	revisionData.mode = "quiz_only"; revisionData.nodes = [revisionData.nodes[0]];
	revisionData.nodes[0].quiz_count = 1;
	originalData.nodes[0].quiz = originalData.nodes[0].quiz_set?.quizzes[0] ?? null;
	originalData.nodes[0].quiz_set = null;
	const slow = deferred<RevisionSessionWithProgress>();
	const { client } = mountRevision();
	await screen.findByText("What is an entity?");
	// The aggregate refetch triggered by this write is the slow one, so it lands
	// after the saved result has already been patched into the cache.
	api.getRevisionSession.mockReturnValueOnce(slow.promise);
	api.submitRevisionQuiz.mockResolvedValueOnce(saved());
	fireEvent.click(screen.getByRole("radio", { name: /A node/ }));
	fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
	await findResultHeader("Correct!");
	expect(screen.getByTestId("revision-status-badge")).toHaveTextContent("Practice finished");
	// Apply the stale aggregate, marked so it is observable when it lands.
	await act(async () =>
		slow.resolve({ ...structuredClone(revisionData), progress_percent: 50 }),
	);
	await waitFor(() =>
		expect(
			client.getQueryData<RevisionSessionWithProgress>(
				revisionQueryKeys.session("rev-1"),
			)?.progress_percent,
		).toBe(50),
	);
	expect(screen.getByText("Correct!")).toBeInTheDocument();
	// The stale read carried no attempts, so the merged node status must still be
	// derived from the newer saved rows rather than resetting to pending.
	expect(screen.getByTestId("revision-status-badge")).toHaveTextContent("Practice finished");
});

it("surfaces summary fetch failure without hiding readable feedback", async () => {
	revisionData.status = "completed";
	revisionData.nodes.forEach((node) => { node.content_reviewed_at = "2026-10-05T00:01:00Z"; });
	revisionData.nodes[0].quiz_results = [saved()];
	api.getRevisionSummary.mockRejectedValueOnce(new Error("offline"));
	mountRevision();
	await findResultHeader("Correct!");
	fireEvent.click(screen.getByRole("button", { name: "View Summary" }));
	await screen.findByText(/Could not load the summary/);
	expect(screen.getByText("Correct!")).toBeInTheDocument();
	api.getRevisionSummary.mockResolvedValueOnce(summary({ mode: "full_review" }));
	fireEvent.click(screen.getByRole("button", { name: "Try loading summary again" }));
	await screen.findByRole("dialog", { name: "Revision Summary" });
});

it("patches only the old revision cache when a successful answer arrives after navigation", async () => {
	const pending = deferred<RevisionQuizResponse>();
	api.submitRevisionQuiz.mockReturnValueOnce(pending.promise);
	const { router, client } = mountRevision();
	await screen.findByText("What is an entity?");
	fireEvent.click(screen.getByRole("radio", { name: /A node/ }));
	fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
	await waitFor(() => expect(api.submitRevisionQuiz).toHaveBeenCalledTimes(1));
	await act(async () => {
		await router.navigate("/learn/session-1/revise/rev-2");
	});
	await screen.findByText("What is an entity?");
	await act(async () => pending.resolve(saved()));
	await waitFor(() =>
		expect(
			client.getQueryData<RevisionSessionWithProgress>(
				revisionQueryKeys.session("rev-1"),
			)?.nodes[0].quiz_results[0]?.id,
		).toBe("attempt-1"),
	);
	expect(
		client.getQueryData<RevisionSessionWithProgress>(
			revisionQueryKeys.session("rev-2"),
		)?.nodes[0].quiz_results,
	).toEqual([]);
	expect(screen.getByRole("radio", { name: /A node/ })).not.toBeChecked();
	expect(screen.queryByText("Updating...")).not.toBeInTheDocument();
	expect(screen.queryByRole("dialog", { name: "Revision Summary" })).not.toBeInTheDocument();
});

it("does not open an old requested summary on the destination revision", async () => {
	revisionData.status = "completed";
	revisionData.nodes.forEach((node) => { node.content_reviewed_at = "2026-10-05T00:01:00Z"; });
	const pending = deferred<RevisionSummary>();
	api.getRevisionSummary.mockReturnValueOnce(pending.promise);
	const { router } = mountRevision();
	await screen.findByRole("button", { name: "View Summary" });
	fireEvent.click(screen.getByRole("button", { name: "View Summary" }));
	await waitFor(() => expect(api.getRevisionSummary).toHaveBeenCalledTimes(1));
	await act(async () => {
		await router.navigate("/learn/session-1/revise/rev-2");
	});
	await screen.findByRole("button", { name: "View Summary" });
	await act(async () => pending.resolve(summary()));
	expect(screen.queryByRole("dialog", { name: "Revision Summary" })).not.toBeInTheDocument();
	expect(screen.queryByText("Loading summary...")).not.toBeInTheDocument();
});

it("scopes heading context to the explicit chat target rather than carousel topic", async () => {
	originalData.nodes[0].content_markdown = "## Entities\nBody.";
	originalData.nodes[1].content_markdown = "## Relations\nBody.";
	mountRevision();
	await screen.findByText("Entities");
	fireEvent.click(screen.getByRole("button", { name: 'Chat about "Entities"' }));
	expect(screen.getByText("1 heading selected")).toBeInTheDocument();
	topicNext();
	await screen.findByText("Relations");
	expect(screen.getByRole("heading", { name: "Chat: Knowledge Graphs 101" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: 'Chat about "Relations"' }));
	expect(screen.getByRole("heading", { name: "Chat: Second topic" })).toBeInTheDocument();
	expect(screen.getByText("1 heading selected")).toBeInTheDocument();
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Explain this section." } });
	fireEvent.click(screen.getByRole("button", { name: "Send message" }));
	await waitFor(() =>
		expect(chatApi.streamConceptChat).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: "session-1", nodeId: "node-2", selectedHeadingIds: ["h-2-relations"],
			}),
		),
	);
});
