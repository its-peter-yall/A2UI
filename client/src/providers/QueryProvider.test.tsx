/**
 * ============================================================================
 * FILE: QueryProvider.test.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Unit tests for QueryProvider React Query wrapper. Validates that
 * QueryProvider correctly initializes and provides a QueryClient
 * to child components via React Context.
 * 
 * KEY TESTS:
 * - Provides QueryClient to children: Client exists and is accessible
 * 
 * DEPENDENCIES:
 * - vitest: Testing framework
 * - @testing-library/react: Component testing
 * - @tanstack/react-query: QueryClient, useQueryClient
 * - client/src/providers/QueryProvider: Component under test
 * 
 * USAGE PATTERN:
 * ```bash
 * # Run QueryProvider tests
 * npm run test -- src/providers/QueryProvider.test.tsx
 * ```
 * 
 * TEST SETUP:
 * - Uses useQueryClient hook to verify client availability
 * - Wraps child in QueryProvider
 * - Catches errors if client not available
 * 
 * RELATED FILES:
 * - client/src/providers/QueryProvider.tsx
 * 
 * NOTES:
 * - QueryProvider wraps entire app in main.tsx
 * - Provides default QueryClient with staleTime configuration
 * - Enables React Query caching throughout app
 * ============================================================================
 */

// QueryProvider.test.tsx
// Tests for the QueryProvider React Query wrapper

// Verifies that QueryProvider correctly initializes and provides
// a QueryClient to child components.

// @see: client/src/providers/QueryProvider.tsx

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryProvider } from './QueryProvider';
import { useQueryClient } from '@tanstack/react-query';

const ClientChecker = () => {
    try {
        const client = useQueryClient();
        return <div>Client exists: {client ? 'true' : 'false'}</div>;
    } catch {
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
