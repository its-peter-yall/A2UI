// api.ts
// Type definitions for AgUI Client API
// Mirrors expected backend schemas for Session Management

export interface User {
    id: string;
    username: string;
    email?: string;
}

export interface Session {
    id: string;
    title: string;
    user_id: string;
    created_at: string;
    updated_at: string;
    messages?: Message[]; // Optional if fetched separately
}

export interface Message {
    id: string;
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at?: string; // or timestamp
    timestamp?: string; // support both for now or standardize
    thinking_content?: string; // for "Thinking" visualization
}

// UI-specific extension
export interface LocalMessage extends Message {
    isLoading?: boolean;
    error?: string;
    statusPhase?: 'thinking' | 'generating' | 'completed';
}

// API Request/Response Types

export interface CreateSessionRequest {
    title?: string;
    user_id: string;
}

export interface UpdateSessionRequest {
    title?: string;
}

export interface SendMessageRequest {
    content: string;
    session_id: string;
    model?: string; // Optional model selection
}

export interface SendMessageResponse {
    message: Message;
    response: Message; // The assistant response
}
