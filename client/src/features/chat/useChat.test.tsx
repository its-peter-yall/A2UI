import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChat } from './useChat';
import type { ReactNode } from 'react';
import * as api from '@/lib/api';
import type { LocalMessage, SendMessageResponse } from '@/types/api';

// Mock API
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual('@/lib/api');
    return {
        ...actual,
        sendMessage: vi.fn(),
        getSession: vi.fn(),
    };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false, // Disable retries for tests
            },
        },
    });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
};

describe('useChat', () => {
    it('should initialize with empty messages', () => {
        const { result } = renderHook(() => useChat('session-1'), { wrapper: createWrapper() });
        expect(result.current.messages).toEqual([]);
    });

    it('should handle sending message', async () => {
        const assistantMsg: LocalMessage = {
            id: '2',
            role: 'assistant',
            content: 'Hi there',
            session_id: 'session-1',
            timestamp: new Date().toISOString(),
        };
        const mockResponse: SendMessageResponse = {
            session_id: 'session-1',
            message: assistantMsg,
            thinking_content: undefined,
        };
        const userMsg: LocalMessage = {
            id: '1',
            role: 'user',
            content: 'Hello',
            session_id: 'session-1',
            timestamp: new Date().toISOString(),
        };
        
        let sessionMessages: LocalMessage[] = [];
        
        const getSessionMock = api.getSession as ReturnType<typeof vi.fn>;
        const sendMessageMock = api.sendMessage as ReturnType<typeof vi.fn>;
        
        getSessionMock.mockImplementation(async () => ({ messages: sessionMessages }));
        
        sendMessageMock.mockImplementation(async () => {
             // Simulate backend update (User msg + Assistant msg)
             sessionMessages = [userMsg, assistantMsg];
             return mockResponse;
        });

        const { result } = renderHook(() => useChat('session-1'), { wrapper: createWrapper() });

        // Initial check
        expect(result.current.messages).toEqual([]);

        // Send message
        await result.current.sendMessage('Hello');

        await waitFor(() => {
            // Should eventually have messages from "server"
            if (result.current.messages.length === 0) throw new Error("Messages not updated");
            expect(result.current.messages).toHaveLength(2);
            expect(result.current.messages[0].content).toBe('Hello');
            expect(result.current.messages[1].content).toBe('Hi there');
        });
    });
});
