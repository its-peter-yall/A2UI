/**
 * ============================================================================
 * FILE: App.tsx
 * LOCATION: client/src/App.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Main application router component that defines client-side navigation
 *    routes for the AgUI learning platform.
 *
 * ROLE IN PROJECT:
 *    Top-level routing shell mounted by main.tsx inside QueryProvider.
 *    Maps URL paths to page-level components and handles unknown route
 *    fallback via redirect.
 *
 * KEY COMPONENTS:
 *    - BrowserRouter: Wraps entire app enabling client-side routing
 *    - Routes/Route: Defines route mappings for all application paths
 *    - Navigate: Redirects unknown routes to default learning home
 *
 * DEPENDENCIES:
 *    - External: react-router-dom
 *    - Internal: @/features/learning (LearningHome, LearningPage), @/features/learning/RevisionPage
 *
 * USAGE:
 *    ```tsx
 *    // Mounted in main.tsx within QueryProvider
 *    <QueryProvider>
 *      <App />
 *    </QueryProvider>
 *    ```
 * ============================================================================
 */

// App.tsx
// Application router and top-level page composition

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LearningHome, LearningPage } from '@/features/learning';
import { RevisionPage } from '@/features/learning/RevisionPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Learning routes - default */}
        <Route path="/" element={<LearningHome />} />
        <Route path="/learn" element={<LearningHome />} />
        <Route path="/learn/:sessionId" element={<LearningPage />} />
        <Route path="/learn/:sessionId/revise/:revisionId" element={<RevisionPage />} />

        {/* Fallback - redirect unknown routes to learn */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
