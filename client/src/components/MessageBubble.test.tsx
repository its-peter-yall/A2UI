import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble';
import type { LocalMessage } from '@/types/api';
import React from 'react';

describe('MessageBubble', () => {
    it('should render user message', () => {
        const msg: LocalMessage = {
            id: '1',
            session_id: 's1',
            role: 'user',
            content: 'Hello World',
        };
        render(<MessageBubble message={msg} />);
        expect(screen.getByText('Hello World')).toBeDefined();
    });

    it('should render thinking state', () => {
        const msg: LocalMessage = {
            id: '1',
            session_id: 's1',
            role: 'assistant',
            content: '',
            isLoading: true,
            statusPhase: 'thinking'
        };
        render(<MessageBubble message={msg} />);
        // Thinking... is rendered by typewriter, initial state is empty
        // But the container should be present
        const status = screen.getByText('', { selector: '.animate-shine' });
        expect(status).toBeDefined();
    });
});
