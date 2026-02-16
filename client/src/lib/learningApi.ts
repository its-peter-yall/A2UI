/**
 * ============================================================================
 * FILE: learningApi.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Provides typed API client functions for all learning feature endpoints,
 * including session management, concept node operations, quiz submissions,
 * and content regeneration. Uses axios with configured interceptors for
 * consistent error handling and timeout behavior across all learning requests.
 * 
 * KEY COMPONENTS:
 * - api: Standard axios instance with 30-second timeout for quick operations
 * - learningApi: Extended axios instance with 5-minute timeout for course generation
 * - generateCourse(): Creates new learning session with AI-generated content
 * - getLearningSession(): Retrieves session with all concept nodes
 * - getConceptNode(): Gets single node with visibility flags
 * - transitionNode(): Moves node to new status (VIEWING -> QUIZ -> COMPLETED)
 * - submitQuiz(): Submits quiz answer and returns feedback/scoring
 * - retryQuiz(): Resets quiz for another attempt
 * - getQuizAttempts(): Retrieves quiz attempt history for a node
 * - regenerateNode(): Regenerates content for a failed/error node
 * 
 * DEPENDENCIES:
 * - axios: HTTP client for API requests with interceptors
 * - ../types/learning: TypeScript interfaces mirroring backend Pydantic schemas
 * - VITE_API_URL: Environment variable for backend base URL
 * 
 * USAGE PATTERN:
 * ```tsx
 * import { 
 *   generateCourse, 
 *   getLearningSession, 
 *   submitQuiz 
 * } from '@/lib/learningApi';
 * 
 * // Create new learning session
 * const session = await generateCourse({ 
 *   query: 'Explain quantum computing basics',
 *   userId: 'user-123'
 * });
 * 
 * // Fetch existing session
 * const session = await getLearningSession('session-uuid');
 * 
 * // Submit quiz answer (uses stable option_id, not display_label)
 * const result = await submitQuiz('node-uuid', {
 *   selected_option_id: 'uuid-of-option-c'  // Use option_id (UUID), not 'C'
 * });
 * ```
 * 
 * ERROR HANDLING:
 * - Response interceptors log all API errors with URL and response data
 * - Returns rejected promises to let calling components handle UI states
 * - Network errors bubble up with axios error message
 * - Backend returns 404 for invalid session IDs
 * 
 * PERFORMANCE NOTES:
 * - Standard API uses 30s timeout; suitable for quick reads/writes
 * - learningApi uses 5-minute timeout for course generation (can be slow)
 * - React Query recommended for caching GET requests (5-minute stale time)
 * 
 * RELATED FILES:
 * - client/src/types/learning.ts: All TypeScript type definitions used here
 * - server/routers/learning.py: Backend router with all endpoint definitions
 * - server/schemas/learning.py: Pydantic schemas this client expects
 * 
 * NOTES:
 * - All endpoints require backend server running on port 8000 (or VITE_API_URL)
 * - NodeStatus values must match backend enum exactly (LOCKED, VIEWING_EXPLANATION, etc.)
 * - Course generation can take 30-60 seconds; uses dedicated longer-timeout client
 * - Interceptors provide consistent console logging for debugging API issues
 * ============================================================================
 */

// learningApi.ts
// API functions for retrieval-based learning features

import axios from 'axios';
import type {
  ConceptNode,
  ConceptNodeWithVisibility,
  GenerateCourseRequest,
  LearningSessionWithNodes,
  QuizAttemptHistory,
  RevisionCreateRequest,
  RevisionSessionResponse,
  QuizSubmitRequest,
  QuizSubmitResponse,
  SessionListResponse,
  TransitionRequest,
  NodeStatus,
} from '../types/learning';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Standard API client
const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30s timeout
});

// Response interceptor for consistent error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Request Failed:', error.config?.url, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Create a longer timeout client for course generation (can take 30-60s)
const learningApi = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5 minutes for course generation
});

// Response interceptor for learning API
learningApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Learning API Request Failed:', error.config?.url, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// --- Learning Session ---

export const generateCourse = async (
  data: GenerateCourseRequest
): Promise<LearningSessionWithNodes> => {
  const response = await learningApi.post<LearningSessionWithNodes>(
    '/learning/generate',
    data
  );
  return response.data;
};

export const getLearningSession = async (
  sessionId: string
): Promise<LearningSessionWithNodes> => {
  const response = await api.get<LearningSessionWithNodes>(
    `/learning/sessions/${sessionId}`
  );
  return response.data;
};

export const createRevisionSession = async (
  sessionId: string,
  data: RevisionCreateRequest
): Promise<RevisionSessionResponse> => {
  const response = await api.post<RevisionSessionResponse>(
    `/learning/sessions/${sessionId}/revisions`,
    data
  );
  return response.data;
};

// --- Concept Nodes ---

export const getConceptNode = async (
  nodeId: string
): Promise<ConceptNodeWithVisibility> => {
  const response = await api.get<ConceptNodeWithVisibility>(
    `/learning/nodes/${nodeId}`
  );
  return response.data;
};

export const transitionNode = async (
  nodeId: string,
  targetStatus: NodeStatus
): Promise<ConceptNode> => {
  const response = await api.post<ConceptNode>(
    `/learning/nodes/${nodeId}/transition`,
    { target_status: targetStatus } as TransitionRequest
  );
  return response.data;
};

// --- Quiz ---

export const submitQuiz = async (
  nodeId: string,
  selectedOptionId: string,
  quizIndex?: number
): Promise<QuizSubmitResponse> => {
  const data: QuizSubmitRequest = {
    selected_option_id: selectedOptionId,
    quiz_index: quizIndex ?? 0,  // Default to 0 for single quizzes
  };
  const response = await api.post<QuizSubmitResponse>(
    `/learning/nodes/${nodeId}/submit-quiz`,
    data
  );
  return response.data;
};

export const retryQuiz = async (nodeId: string): Promise<ConceptNode> => {
  const response = await api.post<ConceptNode>(
    `/learning/nodes/${nodeId}/retry-quiz`
  );
  return response.data;
};

export const getQuizAttempts = async (
  nodeId: string
): Promise<QuizAttemptHistory> => {
  const response = await api.get<QuizAttemptHistory>(
    `/learning/nodes/${nodeId}/attempts`
  );
  return response.data;
};

// --- Regenerate ---

export const regenerateNode = async (
  nodeId: string
): Promise<ConceptNode> => {
  const response = await api.post<ConceptNode>(
    `/learning/nodes/${nodeId}/regenerate`
  );
  return response.data;
};

// --- Last Active Node ---

export const updateLastActiveNode = async (
  sessionId: string,
  nodeId: string
): Promise<void> => {
  await api.patch(`/learning/sessions/${sessionId}/last-active`, {
    node_id: nodeId,
  });
};

// --- Session Listing ---

export interface SessionListParams {
  status?: string;
  sort_by?: string;
  sort_order?: string;
  limit?: number;
  offset?: number;
}

export const getSessionsList = async (
  params?: SessionListParams
): Promise<SessionListResponse> => {
  const response = await api.get<SessionListResponse>(
    '/learning/sessions',
    { params }
  );
  return response.data;
};
