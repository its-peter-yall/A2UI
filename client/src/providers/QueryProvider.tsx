/**
 * ============================================================================
 * FILE: QueryProvider.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Wraps the React application with QueryClientProvider from React Query (TanStack Query),
 * providing centralized data fetching, caching, and state management for all API calls.
 * Configures sensible defaults for stale times, retry behavior, and focus refetching
 * to optimize performance and reduce unnecessary network requests.
 * 
 * KEY COMPONENTS:
 * - QueryClient: Central cache instance with configured default options
 * - QueryClientProvider: React context provider enabling useQuery/useMutation hooks
 * - QueryProvider: Named export wrapper component for app integration
 * 
 * DEPENDENCIES:
 * - react: ReactNode type for children prop typing
 * - @tanstack/react-query: QueryClient, QueryClientProvider, useQuery types
 * 
 * USAGE PATTERN:
 * ```tsx
 * // In main.tsx - wraps the entire app
 * import { QueryProvider } from './providers/QueryProvider';
 * import App from './App';
 * 
 * createRoot(document.getElementById('root')!).render(
 *   <StrictMode>
 *     <QueryProvider>
 *       <App />
 *     </QueryProvider>
 *   </StrictMode>
 * );
 * 
 * // In any component - useQuery hook automatically uses this provider
 * const { data, isLoading, error } = useQuery({
 *   queryKey: ['session', sessionId],
 *   queryFn: () => getLearningSession(sessionId)
 * });
 * ```
 * 
 * ERROR HANDLING:
 * - Query errors display in component UI via error state from useQuery
 * - Failed queries automatically retry once (retry: 1 configured)
 * - Stale queries don't show loading states on immediate re-render
 * 
 * PERFORMANCE NOTES:
 * - staleTime of 5 minutes (1000 * 60 * 5) prevents unnecessary refetches
 * - refetchOnWindowFocus: false prevents jarring refetches when user returns to tab
 * - retry: 1 provides one automatic retry for transient network failures
 * - React Query deduplicates identical concurrent queries automatically
 * 
 * RELATED FILES:
 * - client/src/main.tsx: Where QueryProvider wraps the App component
 * - client/src/lib/learningApi.ts: API functions used with useQuery/useMutation
 * - client/src/features/learning/*: Components using React Query hooks
 * 
 * NOTES:
 * - Default options apply to ALL queries in the application
 * - Can be overridden per-query with query-specific options
 * - Query key structure ['feature', id] enables easy cache invalidation
 * - Consider increasing staleTime for rarely-changing data (user profiles, etc.)
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
