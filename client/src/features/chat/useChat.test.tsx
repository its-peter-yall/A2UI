import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChat } from './useChat';
import { QueryProvider } from '@/providers/QueryProvider';
import React, { ReactNode } from 'react';
import * as api from '@/lib/api';

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
        const mockResponse = {
            session_id: 'session-1',
            message: { id: '2', role: 'assistant', content: 'Hi there', session_id: 'session-1' },
            thinking_content: undefined
        };
        const userMsg = { id: '1', role: 'user', content: 'Hello', session_id: 'session-1' };
        
        let sessionMessages: any[] = [];
        
        (api.getSession as any).mockImplementation(async () => ({ messages: sessionMessages }));
        
        (api.sendMessage as any).mockImplementation(async () => {
             // Simulate backend update (User msg + Assistant msg)
             sessionMessages = [userMsg, mockResponse.message];
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
