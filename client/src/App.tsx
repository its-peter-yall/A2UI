/**
 * ============================================================================
 * FILE: App.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Main application router component that defines client-side navigation routes
 * for the AgUI learning platform. Uses React Router to coordinate page-level
 * transitions between the learning home and active learning sessions.
 * 
 * KEY COMPONENTS:
 * - BrowserRouter: Wraps entire app enabling client-side routing
 * - Routes: Defines route mappings for all application paths
 * - Route (LearningHome): Default landing page at "/" and "/learn"
 * - Route (LearningPage): Active session view at "/learn/:sessionId"
 * - Navigate: Redirects unknown routes to default learning home
 * 
 * DEPENDENCIES:
 * - react-router-dom: Client-side routing and navigation
 * - @/features/learning: LearningHome and LearningPage components
 * 
 * USAGE PATTERN:
 * ```tsx
 * // App is mounted in main.tsx within QueryProvider
 * // Routes are matched in this order:
 * <BrowserRouter>
 *   <Routes>
 *     <Route path="/" element={<LearningHome />} />
 *     <Route path="/learn" element={<LearningHome />} />
 *     <Route path="/learn/:sessionId" element={<LearningPage />} />
 *     <Route path="*" element={<Navigate to="/" replace />} />
 *   </Routes>
 * </BrowserRouter>
 * ```
 * 
 * ERROR HANDLING:
 * - Unknown routes fallback to "/" via Navigate component with replace flag
 * - 404 page not explicitly shown; users are redirected to learning home
 * 
 * PERFORMANCE NOTES:
 * - Route matching uses first-match-wins; specific routes should precede catch-all
 * - React Router v6+ uses optimistic UI updates for navigation
 * 
 * RELATED FILES:
 * - client/src/main.tsx: App bootstrap where QueryProvider wraps this component
 * - client/src/features/learning/index.tsx: LearningHome and LearningPage exports
 * 
 * NOTES:
 * - QueryProvider is applied at root level in main.tsx, not here
 * - VITE_API_URL environment variable controls backend API location
 * - Session IDs in URL enable direct linking to specific learning sessions
 * ============================================================================
 */

// App.tsx
// Application router and top-level page composition

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LearningHome, LearningPage } from '@/features/learning';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Learning routes - default */}
        <Route path="/" element={<LearningHome />} />
        <Route path="/learn" element={<LearningHome />} />
        <Route path="/learn/:sessionId" element={<LearningPage />} />

        {/* Fallback - redirect unknown routes to learn */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
