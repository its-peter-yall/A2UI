// api.ts
// Axios client configuration and typed fetch functions
// Mirrors AURA-CHAT client patterns

import axios from 'axios';
import type { 
    Session, 
    CreateSessionRequest, 
    SendMessageRequest, 
    SendMessageResponse 
} from '../types/api';

// Create Axios instance with default config
export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000, // 30s timeout
});

// Response interceptor for consistent error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Here we could handle global errors like 401
        console.error('API Request Failed:', error.config?.url, error.response?.data || error.message);
        return Promise.reject(error);
    }
);

// --- Session Management ---

export const getSessions = async (): Promise<Session[]> => {
    const response = await api.get<Session[]>('/sessions');
    return response.data;
};

export const getSession = async (sessionId: string): Promise<Session> => {
    const response = await api.get<Session>(`/sessions/${sessionId}`);
    return response.data;
};

export const createSession = async (data: CreateSessionRequest): Promise<Session> => {
    const response = await api.post<Session>('/sessions', data);
    return response.data;
};

export const deleteSession = async (sessionId: string): Promise<void> => {
    await api.delete(`/sessions/${sessionId}`);
};

export const updateSession = async (sessionId: string, title: string): Promise<Session> => {
    const response = await api.patch<Session>(`/sessions/${sessionId}`, { title });
    return response.data;
};

// --- Chat ---

export const sendMessage = async (data: SendMessageRequest): Promise<SendMessageResponse> => {
    const response = await api.post<SendMessageResponse>('/chat', data);
    return response.data;
};
