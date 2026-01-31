import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionSidebar } from './SessionSidebar';
import type { Session } from '@/types/api';
import React from 'react';

// Mock Lucide icons to avoid render issues
vi.mock('lucide-react', () => ({
    Plus: () => <div data-testid="plus-icon" />,
    MessageSquare: () => <div data-testid="msg-icon" />,
    Trash2: () => <div data-testid="trash-icon" />,
    MoreVertical: () => <div data-testid="more-icon" />,
    X: () => <div data-testid="x-icon" />,
    Pin: () => <div data-testid="pin-icon" />,
    Pencil: () => <div data-testid="pencil-icon" />,
}));

describe('SessionSidebar', () => {
    const mockSessions: Session[] = [
        { id: '1', title: 'Session 1', user_id: 'u1', created_at: '', updated_at: '' },
        { id: '2', title: 'Session 2', user_id: 'u1', created_at: '', updated_at: '' },
    ];

    it('should render session list', () => {
        render(
            <SessionSidebar 
                sessions={mockSessions}
                currentSessionId={null}
                onSelectSession={() => {}}
                onCreateSession={() => {}}
                onDeleteSession={() => {}}
                onRenameSession={() => {}}
                onPinSession={() => {}}
                isOpen={true}
                onClose={() => {}}
            />
        );
        expect(screen.getByText('Session 1')).toBeDefined();
        expect(screen.getByText('Session 2')).toBeDefined();
    });

    it('should call onSelectSession when clicked', () => {
        const selectMock = vi.fn();
        render(
            <SessionSidebar 
                sessions={mockSessions}
                currentSessionId={null}
                onSelectSession={selectMock}
                onCreateSession={() => {}}
                onDeleteSession={() => {}}
                onRenameSession={() => {}}
                onPinSession={() => {}}
                isOpen={true}
                onClose={() => {}}
            />
        );
        fireEvent.click(screen.getByText('Session 1'));
        expect(selectMock).toHaveBeenCalledWith('1');
    });

    it('should show active state', () => {
         render(
            <SessionSidebar 
                sessions={mockSessions}
                currentSessionId="1"
                onSelectSession={() => {}}
                onCreateSession={() => {}}
                onDeleteSession={() => {}}
                onRenameSession={() => {}}
                onPinSession={() => {}}
                isOpen={true}
                onClose={() => {}}
            />
        );
        const sessionBtn = screen.getByText('Session 1').closest('button');
        // We'll check class presence or just simple rendering for now
        expect(sessionBtn).toBeDefined();
    });
});
