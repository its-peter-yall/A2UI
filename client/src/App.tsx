// App.tsx
// Application router and top-level page composition

// Routes learning pages with client-side navigation.
// Keeps app-level routing concerns isolated from feature modules.
// Uses React Router to coordinate page-level transitions.

// @see: client/src/main.tsx - App bootstrap and providers
// @note: QueryProvider is applied at the root in main.tsx

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
