/**
 * ============================================================================
 * FILE: learning.ts
 * LOCATION: client/src/types/learning.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Defines all TypeScript type interfaces and type aliases for the adaptive
 *    learning feature, mirroring backend Pydantic schemas for type safety
 *    across the API boundary.
 *
 * ROLE IN PROJECT:
 *    Shared type contract between the learning feature's React components and
 *    the FastAPI backend. Powers React Query cache typing, component props,
 *    and request/response payload alignment with the learning API endpoints.
 *
 * KEY COMPONENTS:
 *    - NodeStatus: Union type for node lifecycle states (LOCKED, VIEWING_EXPLANATION, etc.)
 *    - ConceptNode: Core learning unit with content, status, and optional quiz
 *    - LearningSessionWithNodes: Complete session including all concept nodes
 *    - QuizSubmitRequest/Response: Quiz answer submission types
 *    - RevisionSessionResponse: Revision session state and progress
 *
 * DEPENDENCIES:
 *    - External: None - pure TypeScript type definitions
 *    - Internal: Mirrors server/schemas/learning.py Pydantic models
 *
 * USAGE:
 *    ```tsx
 *    import type {
 *      LearningSessionWithNodes,
 *      ConceptNode,
 *      NodeStatus,
 *      QuizSubmitResponse
 *    } from '@/types/learning';
 *
 *    const { data } = useQuery<LearningSessionWithNodes>({
 *      queryKey: ['learningSession', sessionId],
 *      queryFn: () => getLearningSession(sessionId)
 *    });
 *    ```
 * ============================================================================
 */

// learning.ts
// TypeScript interfaces for retrieval-based learning features

export type NodeStatus =
	| "LOCKED"
	| "VIEWING_EXPLANATION"
	| "IN_QUIZ"
	| "SHOWING_FEEDBACK"
	| "COMPLETED"
	| "ERROR";

export type QuizDifficulty = "easy" | "medium" | "hard";

export type Complexity = "Basic" | "Intermediate" | "Advanced";

export interface QuizOption {
	option_id: string;
	display_label: string;
	text: string;
	is_correct: boolean;
	explanation: string;
}

export interface QuizOptionHidden {
	option_id: string;
	display_label: string;
	text: string;
}

export interface QuizCard {
	question_text: string;
	options: QuizOption[];
	difficulty: QuizDifficulty;
}

export interface QuizCardHidden {
	question_text: string;
	options: QuizOptionHidden[];
	difficulty: QuizDifficulty;
}

export interface QuizSet {
	quizzes: QuizCard[];
	current_index: number;
	shuffle_seed: string | null;
}

export interface QuizSetHidden {
	quizzes: QuizCardHidden[];
	current_index: number;
	total_quizzes: number;
}

export interface ConceptNode {
	id: string;
	learning_session_id: string;
	sequence_index: number;
	title: string;
	content_markdown: string;
	status: NodeStatus;
	error_message: string | null;
	retry_available: boolean;
	complexity?: Complexity;
	quiz: QuizCard | null;
	quiz_set: QuizSet | null;
	quiz_hidden: QuizCardHidden | null;
	quiz_set_hidden: QuizSetHidden | null;
	created_at: string;
	updated_at: string | null;
}

export function getVisibleQuiz(
	node: ConceptNode,
): QuizCard | QuizCardHidden | QuizSet | QuizSetHidden | null {
	if (node.status === "IN_QUIZ") {
		if (node.quiz_set_hidden) return node.quiz_set_hidden;
		if (node.quiz_hidden) return node.quiz_hidden;
	}
	if (node.quiz_set) return node.quiz_set;
	if (node.quiz) return node.quiz;
	return null;
}

export interface ConceptNodeWithVisibility extends ConceptNode {
	content_visible: boolean;
	quiz_visible: boolean;
}

export interface LearningSession {
	id: string;
	user_id: string | null;
	query: string;
	course_title: string;
	total_nodes: number;
	completed_nodes: number;
	last_active_node_id: string | null;
	created_at: string;
	updated_at: string | null;
}

export interface LearningSessionWithNodes extends LearningSession {
	nodes: ConceptNode[];
}

export interface QuizAttempt {
	id: string;
	node_id: string;
	attempt_number: number;
	selected_option_id: string;
	is_correct: boolean;
	score_percent: number;
	correct_option_id: string;
	explanation: string;
	is_mastered: boolean;
	created_at: string;
	updated_at: string | null;
}

export interface QuizAttemptHistory {
	node_id: string;
	total_attempts: number;
	is_mastered: boolean;
	best_score: number;
	attempts: QuizAttempt[];
}

// API Request/Response types

export interface GenerateCourseRequest {
	query: string;
	user_id?: string;
}

export interface QuizSubmitRequest {
	selected_option_id: string;
	quiz_index?: number;
}

export interface QuizSubmitResponse {
	node_id: string;
	attempt_number: number;
	is_correct: boolean;
	score_percent: number;
	correct_option_id: string | null; // null when answer is incorrect (not revealed)
	selected_option_id: string;
	explanation: string; // Explanation for the correct answer (empty when answer is incorrect)
	selected_explanation?: string; // Explanation for the selected answer (only when incorrect)
	quiz_index?: number; // Index of quiz in set (for multi-quiz nodes)
	is_mastered: boolean;
	next_node_unlocked: boolean;
	node_status: NodeStatus;
}

export interface TransitionRequest {
	target_status: NodeStatus;
}

// Session listing types for course dashboard

export interface LearningSessionSummary {
	id: string;
	query: string;
	course_title: string;
	status: "in_progress" | "completed";
	progress_percent: number;
	total_nodes: number;
	completed_nodes: number;
	last_active_node_title: string | null;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
	revision_count: number;
}

export interface SessionListResponse {
	sessions: LearningSessionSummary[];
	total_count: number;
	has_more: boolean;
}

export type RevisionMode = "full_review" | "quiz_only";

export interface RevisionCreateRequest {
	mode: RevisionMode;
}

export interface RevisionSessionResponse {
	id: string;
	original_session_id: string;
	revision_number: number;
	mode: RevisionMode;
	status: "in_progress" | "completed";
	progress_percent: number;
	total_quiz_score_percent: number | null;
	started_at: string;
	completed_at: string | null;
}

export type RevisionNodeStatus =
	| "pending"
	| "reviewed"
	| "quiz_passed"
	| "quiz_failed";

export interface RevisionNodeProgressWithDetails {
	id: string;
	node_id: string;
	node_title: string;
	sequence_index: number;
	status: RevisionNodeStatus;
	reviewed_at: string | null;
}

export interface RevisionSessionWithProgress extends RevisionSessionResponse {
	nodes: RevisionNodeProgressWithDetails[];
}

export interface RevisionSummary {
	revision_id: string;
	mode: RevisionMode;
	progress_percent: number;
	total_quiz_score_percent: number | null;
	nodes_reviewed: number;
	nodes_total: number;
	quizzes_passed: number;
	quizzes_failed: number;
	quizzes_total: number;
	time_spent_seconds: number | null;
	comparison: {
		original_quiz_score_percent: number;
		improvement_percent: number;
	} | null;
}

export interface RevisionQuizResponse {
	id: string;
	node_id: string;
	attempt_number: number;
	selected_option_id: string;
	is_correct: boolean;
	score_percent: number;
	correct_option_id: string;
	explanation: string; // Explanation for the correct answer
	selected_explanation?: string; // Explanation for the selected answer (only when incorrect)
	revision_node_status: RevisionNodeStatus;
}

export interface RevisionListResponse {
	revisions: RevisionSessionResponse[];
	total_count: number;
}

// --- Concept Chat types ---

export type ConceptChatRole = "user" | "assistant";

export interface ConceptChatMessage {
	role: ConceptChatRole;
	content: string;
}

export interface ConceptChatRequest {
	message: string;
	history: ConceptChatMessage[];
	selectedHeadingIds: string[];
}

export interface ConceptChatStreamChunk {
	delta?: string;
	error?: string;
}
