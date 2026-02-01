// learningApi.ts
// API functions for retrieval-based learning features

// Provides typed API calls for learning sessions, nodes, quizzes,
// and state transitions. Uses shared axios instance from api.ts.

// @see: client/src/types/learning.ts - Type definitions
// @note: All endpoints require backend server running on port 8000

import axios from 'axios';
import { api } from './api';
import type {
  ConceptNode,
  ConceptNodeWithVisibility,
  GenerateCourseRequest,
  LearningSessionWithNodes,
  QuizAttemptHistory,
  QuizSubmitRequest,
  QuizSubmitResponse,
  TransitionRequest,
  NodeStatus,
} from '../types/learning';

// Create a longer timeout client for course generation (can take 30-60s)
const learningApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 2 minutes for course generation
});

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
  data: QuizSubmitRequest
): Promise<QuizSubmitResponse> => {
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
