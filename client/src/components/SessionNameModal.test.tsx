import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionNameModal } from './SessionNameModal';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    X: () => <div data-testid="x-icon" />,
}));

describe('SessionNameModal', () => {
    it('should not render when not open', () => {
        render(
            <SessionNameModal 
                isOpen={false} 
                onSave={() => {}} 
                onClose={() => {}} 
            />
        );
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('should render when open', () => {
        render(
            <SessionNameModal 
                isOpen={true} 
                onSave={() => {}} 
                onClose={() => {}} 
            />
        );
        expect(screen.getByText('Create New Session')).toBeDefined();
    });

    it('should call onSave with input value', () => {
        const saveMock = vi.fn();
        render(
            <SessionNameModal 
                isOpen={true} 
                onSave={saveMock} 
                onClose={() => {}} 
            />
        );
        const input = screen.getByPlaceholderText('Enter session name...');
        fireEvent.change(input, { target: { value: 'New Chat' } });
        fireEvent.click(screen.getByText('Create Session'));
        expect(saveMock).toHaveBeenCalledWith('New Chat');
    });
});
