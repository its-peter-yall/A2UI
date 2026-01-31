import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from '@/providers/QueryProvider';
import { ChatPage } from '@/features/chat/ChatPage';
import { LearningHome, LearningPage } from '@/features/learning';

function App() {
  return (
    <QueryProvider>
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
    </QueryProvider>
  );
}

export default App;
