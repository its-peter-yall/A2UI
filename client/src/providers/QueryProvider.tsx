/**
 * ============================================================================
 * FILE: QueryProvider.tsx
 * LOCATION: client/src/providers/QueryProvider.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Wraps the React application with QueryClientProvider from TanStack Query,
 *    providing centralized data fetching, caching, and state management for
 *    all API calls with sensible default configuration.
 *
 * ROLE IN PROJECT:
 *    App-level provider that enables useQuery and useMutation hooks throughout
 *    the component tree. Configured with 5-minute stale time and disabled
 *    window-focus refetching to reduce unnecessary network requests.
 *
 * KEY COMPONENTS:
 *    - queryClient: Singleton QueryClient with default options
 *    - QueryProvider: Named export wrapper for use in main.tsx
 *
 * DEPENDENCIES:
 *    - External: react, @tanstack/react-query
 *    - Internal: (none)
 *
 * USAGE:
 *    ```tsx
 *    // In main.tsx
 *    <QueryProvider><App /></QueryProvider>
 *    ```
 * ============================================================================
 */

// QueryProvider.tsx
// React Query client provider wrapper

import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

export const QueryProvider = ({ children }: { children: ReactNode }) => {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};
