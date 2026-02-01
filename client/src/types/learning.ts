// learning.ts
// TypeScript interfaces for retrieval-based learning features

// Longer description (2-4 lines):
// - Mirrors backend Pydantic schemas for sessions, nodes, and quizzes.
// - Powers React Query cache typing and component props.
// - Keeps request/response payloads aligned with API contracts.

// @see: server/schemas/learning.py - Backend schema definitions
// @note: NodeStatus values must match backend enum exactly

export type NodeStatus =
  | 'LOCKED'
  | 'VIEWING_EXPLANATION'
  | 'IN_QUIZ'
  | 'SHOWING_FEEDBACK'
  | 'COMPLETED'
  | 'ERROR';

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface QuizOption {
  id: string; // A, B, C, or D
  text: string;
  is_correct: boolean;
  explanation: string;
}

export interface QuizCard {
  question_text: string;
  options: QuizOption[];
  difficulty: QuizDifficulty;
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
  created_at: string;
  updated_at: string | null;
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
