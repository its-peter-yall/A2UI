import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InputArea } from './InputArea';
import { ChatPage } from './ChatPage';
import { QueryProvider } from '@/providers/QueryProvider';
import React from 'react';
import * as api from '@/lib/api';

// Mocks
vi.mock('@/lib/api', async () => {
    return {
        getSessions: vi.fn().mockResolvedValue([
            { id: '1', title: 'Test Session', created_at: '2023-01-01' }
        ]),
        createSession: vi.fn(),
        deleteSession: vi.fn(),
        updateSession: vi.fn(),
        sendMessage: vi.fn(),
        getSession: vi.fn()
    };
});

// Mock ResizeObserver for InputArea
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryProvider>{children}</QueryProvider>
);

describe('InputArea', () => {
    it('should render input and button', () => {
        render(<InputArea onSend={vi.fn()} />);
        expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('should call onSend when button clicked', () => {
        const handleSend = vi.fn();
        render(<InputArea onSend={handleSend} />);
        
        const input = screen.getByPlaceholderText('Type a message...');
        fireEvent.change(input, { target: { value: 'Hello' } });
        
        const button = screen.getByRole('button', { name: /send/i });
        fireEvent.click(button);

        expect(handleSend).toHaveBeenCalledWith('Hello');
    });

    it('should disable button when empty', () => {
        render(<InputArea onSend={vi.fn()} />);
        const button = screen.getByRole('button', { name: /send/i });
        expect(button).toBeDisabled();
    });
});

describe('ChatPage', () => {
    it('should render layout components', async () => {
        render(<ChatPage />, { wrapper });
        
        // Check for Sidebar elements (implied by "Sessions")
        expect(screen.getAllByText('New Chat')[0]).toBeInTheDocument(); // From header or sidebar
        
        // Wait for sessions to load
        await waitFor(() => {
            expect(api.getSessions).toHaveBeenCalled();
        });
    });

    it('should show "Select a chat" state initially', async () => {
        render(<ChatPage />, { wrapper });
        expect(screen.getByText('Select a chat or start a new one')).toBeInTheDocument();
    });
});
