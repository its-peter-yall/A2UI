/**
 * ============================================================================
 * FILE: QueryProvider.test.tsx
 * LOCATION: client/src/providers/QueryProvider.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for QueryProvider React Query wrapper. Validates that
 *    QueryProvider correctly initializes and provides a QueryClient
 *    to child components via React Context.
 *
 * ROLE IN PROJECT:
 *    Ensures the app-level React Query provider is correctly configured so
 *    all useQuery/useMutation hooks have access to a QueryClient instance.
 *    Catches regressions in provider setup that would break data fetching.
 *
 * KEY COMPONENTS:
 *    - QueryClient availability test: Client exists and is accessible to children
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query
 *    - Internal: ./QueryProvider
 *
 * USAGE:
 *    ```bash
 *    npm run test -- src/providers/QueryProvider.test.tsx
 *    ```
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
