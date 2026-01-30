import { QueryProvider } from '@/providers/QueryProvider';
import { ChatPage } from '@/features/chat/ChatPage';

function App() {
  return (
    <QueryProvider>
       <ChatPage />
    </QueryProvider>
  );
}

export default App;