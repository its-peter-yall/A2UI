/**
 * ============================================================================
 * FILE: learningApi.ts
 * LOCATION: client/src/lib/learningApi.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Provides typed API client functions for all learning feature endpoints,
 *    including session management, concept node operations, quiz submissions,
 *    and content regeneration.
 *
 * ROLE IN PROJECT:
 *    Single source of truth for all learning-related HTTP calls. Abstracts
 *    axios configuration (timeouts, interceptors) from feature components,
 *    and mirrors the backend router contract with typed request/response shapes.
 *
 * KEY COMPONENTS:
 *    - api: Standard axios instance (30s timeout)
 *    - learningApi: Extended axios instance (5min timeout for generation)
 *    - generateCourse, getLearningSession, transitionNode, submitQuiz, etc.
 *
 * DEPENDENCIES:
 *    - External: axios
 *    - Internal: ../types/learning
 *
 * USAGE:
 *    ```tsx
 *    const session = await generateCourse({ query: 'Quantum computing' });
 *    const result = await submitQuiz('node-uuid', 'option-uuid', 0);
 *    ```
 * ============================================================================
 */

// learningApi.ts
// API functions for retrieval-based learning features

import axios from 'axios';
import { getOpenRouterSettings } from './openrouterSettings';
import type {
  ConceptNode,
  ConceptNodeWithVisibility,
  GenerateCourseRequest,
  LearningSessionWithNodes,
  QuizAttemptHistory,
  RevisionCreateRequest,
  RevisionSessionResponse,
  RevisionSessionWithProgress,
  RevisionNodeProgressWithDetails,
  RevisionSummary,
  RevisionQuizResponse,
  RevisionListResponse,
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

// Request interceptor: attach OpenRouter headers when settings exist
api.interceptors.request.use((config) => {
  const settings = getOpenRouterSettings();
  if (settings.apiKey) {
    config.headers['X-OpenRouter-Key'] = settings.apiKey;
    if (settings.model) {
      config.headers['X-OpenRouter-Model'] = settings.model;
    }
    config.headers['HTTP-Referer'] = window.location.origin;
    config.headers['X-OpenRouter-Title'] = 'A2UI';
  }
  return config;
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

// Request interceptor: attach OpenRouter headers when settings exist
learningApi.interceptors.request.use((config) => {
  const settings = getOpenRouterSettings();
  if (settings.apiKey) {
    config.headers['X-OpenRouter-Key'] = settings.apiKey;
    if (settings.model) {
      config.headers['X-OpenRouter-Model'] = settings.model;
    }
    config.headers['HTTP-Referer'] = window.location.origin;
    config.headers['X-OpenRouter-Title'] = 'A2UI';
  }
  return config;
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

export const previousQuiz = async (nodeId: string): Promise<ConceptNode> => {
  const response = await api.post<ConceptNode>(
    `/learning/nodes/${nodeId}/previous-quiz`
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

// --- Revision Sessions ---

export const getRevisionSession = async (
  revisionId: string
): Promise<RevisionSessionWithProgress> => {
  const response = await api.get<RevisionSessionWithProgress>(
    `/learning/revisions/${revisionId}`
  );
  return response.data;
};

export const markNodeReviewed = async (
  revisionId: string,
  nodeId: string
): Promise<RevisionNodeProgressWithDetails> => {
  const response = await api.post<RevisionNodeProgressWithDetails>(
    `/learning/revisions/${revisionId}/nodes/${nodeId}/mark-reviewed`
  );
  return response.data;
};

export const submitRevisionQuiz = async (
  revisionId: string,
  nodeId: string,
  selectedOptionId: string,
  quizIndex?: number
): Promise<RevisionQuizResponse> => {
  const response = await api.post<RevisionQuizResponse>(
    `/learning/revisions/${revisionId}/nodes/${nodeId}/submit-quiz`,
    { selected_option_id: selectedOptionId, quiz_index: quizIndex ?? 0 }
  );
  return response.data;
};

export const getRevisionSummary = async (
  revisionId: string
): Promise<RevisionSummary> => {
  const response = await api.get<RevisionSummary>(
    `/learning/revisions/${revisionId}/summary`
  );
  return response.data;
};

export const getRevisionsList = async (
  sessionId: string,
  limit?: number,
  offset?: number
): Promise<RevisionListResponse> => {
  const response = await api.get<RevisionListResponse>(
    `/learning/sessions/${sessionId}/revisions`,
    { params: { limit, offset } }
  );
  return response.data;
};

// --- Delete Session ---

export const deleteSession = async (sessionId: string): Promise<void> => {
  await api.delete(`/learning/sessions/${sessionId}`);
};
