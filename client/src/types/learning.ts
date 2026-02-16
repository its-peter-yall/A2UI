/**
 * ============================================================================
 * FILE: learning.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Defines all TypeScript type interfaces and type aliases for the adaptive
 * learning feature. These types mirror the backend Pydantic schemas, ensuring
 * type safety across the API boundary. They power React Query cache typing,
 * component props, and maintain request/response payload alignment with the
 * API contracts.
 * 
 * KEY COMPONENTS:
 * - NodeStatus: Union type for node lifecycle states (LOCKED, VIEWING_EXPLANATION, etc.)
 * - QuizDifficulty: Quiz complexity levels (easy, medium, hard)
 * - QuizOption: Individual answer option with correctness and explanation
 * - QuizCard: Complete quiz question with all options and difficulty
 * - ConceptNode: Core learning unit with content, status, and optional quiz
 * - ConceptNodeWithVisibility: Node extended with content/quiz visibility flags
 * - LearningSession: Session metadata without node data
 * - LearningSessionWithNodes: Complete session including all concept nodes
 * - QuizAttempt: Single quiz submission with scoring and feedback
 * - QuizAttemptHistory: Aggregated quiz history for a node
 * - GenerateCourseRequest: Request payload for course generation
 * - QuizSubmitRequest/Response: Quiz answer submission types
 * - TransitionRequest: Status change request payload
 * 
 * DEPENDENCIES:
 * - No external dependencies - pure TypeScript type definitions
 * - Mirrors server/schemas/learning.py Pydantic models
 * 
 * USAGE PATTERN:
 * ```tsx
 * import type { 
 *   LearningSessionWithNodes, 
 *   ConceptNode, 
 *   NodeStatus,
 *   QuizSubmitResponse 
 * } from '@/types/learning';
 * 
 * // Typing a React Query result
 * const { data } = useQuery<LearningSessionWithNodes>({
 *   queryKey: ['learningSession', sessionId],
 *   queryFn: () => getLearningSession(sessionId)
 * });
 * 
 * // Status transition handling
 * const handleQuizComplete = (result: QuizSubmitResponse) => {
 *   if (result.node_status === 'COMPLETED') {
 *     // Mark node as done
 *   }
 * };
 * ```
 * 
 * ERROR HANDLING:
 * - TypeScript enforces exact string literals for NodeStatus - invalid values cause compile errors
 * - API responses are validated against these types at runtime by Pydantic
 * - Mismatched types indicate contract drift between frontend and backend
 * 
 * PERFORMANCE NOTES:
 * - All types are erased at runtime - zero runtime overhead
 * - Use 'type' keyword over 'interface' for union types for better inference
 * - Keep types in sync with backend to avoid runtime type coercion issues
 * 
 * RELATED FILES:
 * - server/schemas/learning.py: Backend Pydantic schemas (source of truth)
 * - server/routers/learning.py: API endpoints returning these types
 * - client/src/lib/learningApi.ts: API functions consuming these types
 * 
 * NOTES:
 * - NodeStatus values MUST match backend enum exactly for transitions to work
 * - content_visible and quiz_visible flags control UI rendering in LearningPage
 * - is_mastered flag indicates 80%+ score achieved (passing threshold)
 * - retry_available is false after passing or max attempts reached
 * ============================================================================
 */

// learning.ts
// TypeScript interfaces for retrieval-based learning features

export type NodeStatus =
  | 'LOCKED'
  | 'VIEWING_EXPLANATION'
  | 'IN_QUIZ'
  | 'SHOWING_FEEDBACK'
  | 'COMPLETED'
  | 'ERROR';

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

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
  quiz: QuizCard | null;
  quiz_set: QuizSet | null;
  quiz_hidden: QuizCardHidden | null;
  quiz_set_hidden: QuizSetHidden | null;
  created_at: string;
  updated_at: string | null;
}

export function getVisibleQuiz(node: ConceptNode): QuizCard | QuizCardHidden | QuizSet | QuizSetHidden | null {
  if (node.status === 'IN_QUIZ') {
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
  correct_option_id: string;
  selected_option_id: string;
  explanation: string;
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
  status: 'in_progress' | 'completed';
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

export type RevisionMode = 'full_review' | 'quiz_only';

export interface RevisionCreateRequest {
  mode: RevisionMode;
}

export interface RevisionSessionResponse {
  id: string;
  original_session_id: string;
  revision_number: number;
  mode: RevisionMode;
  status: 'in_progress' | 'completed';
  progress_percent: number;
  total_quiz_score_percent: number | null;
  started_at: string;
  completed_at: string | null;
}
