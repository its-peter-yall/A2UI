import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryProvider } from './QueryProvider';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';

const ClientChecker = () => {
    try {
        const client = useQueryClient();
        return <div>Client exists: {client ? 'true' : 'false'}</div>;
    } catch (e) {
        return <div>Client exists: false</div>;
    }
};

describe('QueryProvider', () => {
    it('should provide QueryClient to children', () => {
        render(
            <QueryProvider>
                <ClientChecker />
            </QueryProvider>
        );
        expect(screen.getByText('Client exists: true')).toBeDefined();
    });
});
