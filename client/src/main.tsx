/**
 * ============================================================================
 * FILE: main.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * React application entry point that bootstraps the entire AgUI application.
 * Initializes the React DOM tree, applies development checks via StrictMode,
 * and wraps the root App component with required providers for React Query
 * functionality.
 * 
 * KEY COMPONENTS:
 * - createRoot: Creates React 18+ concurrent root for DOM mounting
 * - StrictMode: Enables development-only checks for deprecated patterns
 * - QueryProvider: Wraps app with React Query client for data fetching
 * - App: Root application component containing routing logic
 * 
 * DEPENDENCIES:
 * - react: Core React library with StrictMode and ReactNode types
 * - react-dom/client: ReactDOM.createRoot for concurrent rendering
 * - @tanstack/react-query: QueryClientProvider wrapper for data caching
 * - ./index.css: Global Tailwind CSS styles and base application styles
 * 
 * USAGE PATTERN:
 * ```tsx
 * // Standard React 18+ bootstrap pattern
 * const rootElement = document.getElementById('root')!;
 * 
 * createRoot(rootElement).render(
 *   <StrictMode>
 *     <QueryProvider>
 *       <App />
 *     </QueryProvider>
 *   </StrictMode>
 * );
 * ```
 * 
 * ERROR HANDLING:
 * - Falls back to non-null assertion on root element (assumes index.html has #root)
 * - QueryProvider errors bubble up; React Query shows error states in components
 * 
 * PERFORMANCE NOTES:
 * - StrictMode double-invokes effects in development to detect side effects
 * - React Query caches queries for 5 minutes (configured in QueryProvider)
 * - CSS is loaded synchronously before render to prevent FOUC
 * 
 * RELATED FILES:
 * - client/src/App.tsx: Main application component with routing logic
 * - client/src/providers/QueryProvider.tsx: React Query configuration
 * - client/index.html: HTML template with #root div element
 * 
 * NOTES:
 * - VITE_API_URL environment variable controls backend base URL (defaults to http://localhost:8000)
 * - Production builds should set VITE_API_URL to production backend
 * - StrictMode does NOT run in production builds
 * ============================================================================
 */

// main.tsx
// React application entry point and bootstrap

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { QueryProvider } from './providers/QueryProvider'
import { ThemeProvider } from './providers/ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="agui-theme">
      <QueryProvider>
        <App />
      </QueryProvider>
    </ThemeProvider>
  </StrictMode>,
)
