// App.tsx
// Application router and top-level page composition

// Routes chat and learning pages with client-side navigation.
// Keeps app-level routing concerns isolated from feature modules.
// Uses React Router to coordinate page-level transitions.

// @see: client/src/main.tsx - App bootstrap and providers
// @note: QueryProvider is applied at the root in main.tsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChatPage } from '@/features/chat/ChatPage';
import { LearningHome, LearningPage } from '@/features/learning';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Chat routes */}
        <Route path="/" element={<ChatPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />

        {/* Learning routes */}
        <Route path="/learn" element={<LearningHome />} />
        <Route path="/learn/:sessionId" element={<LearningPage />} />

        {/* Fallback - redirect unknown routes to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
