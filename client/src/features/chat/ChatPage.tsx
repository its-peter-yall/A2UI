import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useChat } from './useChat';
import { InputArea } from './InputArea';
import { SessionSidebar } from '@/components/SessionSidebar';
import { MessageBubble } from '@/components/MessageBubble';
import { SessionNameModal } from '@/components/SessionNameModal';
import { Menu, MessageSquarePlus, GraduationCap } from 'lucide-react';
import * as api from '@/lib/api';
import type { Session } from '@/types/api';

export function ChatPage() {
    const queryClient = useQueryClient();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [sessionToRename, setSessionToRename] = useState<Session | null>(null);
    const [isCreatingSession, setIsCreatingSession] = useState(false);

    // Chat Logic
    const { messages, sendMessage, isSending } = useChat(currentSessionId);

    const { data: sessions = [] } = useQuery({
        queryKey: ['sessions'],
        queryFn: api.getSessions,
    });

    // Handlers
    const handleCreateSessionClick = () => {
        setIsCreatingSession(true);
        setSessionToRename(null);
        setIsRenameModalOpen(true);
    };

    const handleCreateSessionWithName = async (title: string) => {
        try {
            const newSession = await api.createSession({ title, user_id: 'user' });
            queryClient.setQueryData<Session[]>(['sessions'], (prev = []) => [
                newSession,
                ...prev,
            ]);
            setCurrentSessionId(newSession.id);
            setIsRenameModalOpen(false);
            setIsCreatingSession(false);
        } catch (err) {
            console.error("Failed to create session", err);
        }
    };

    const handleDeleteSession = async (id: string) => {
        try {
            await api.deleteSession(id);
            queryClient.setQueryData<Session[]>(['sessions'], (prev = []) =>
                prev.filter((session) => session.id !== id)
            );
            if (currentSessionId === id) {
                setCurrentSessionId(null);
            }
        } catch (err) {
            console.error("Failed to delete session", err);
        }
    };

    const handleRenameSession = async (title: string) => {
        if (isCreatingSession) {
            await handleCreateSessionWithName(title);
            return;
        }
        if (!sessionToRename) return;
        try {
            const updated = await api.updateSession(sessionToRename.id, title);
            queryClient.setQueryData<Session[]>(['sessions'], (prev = []) =>
                prev.map((session) => (session.id === updated.id ? updated : session))
            );
            setIsRenameModalOpen(false);
            setSessionToRename(null);
        } catch (err) {
            console.error("Failed to rename session", err);
        }
    };

    const handlePinSession = async (sessionId: string, isPinned: boolean) => {
        try {
            const updated = await api.pinSession(sessionId, isPinned);
            queryClient.setQueryData<Session[]>(['sessions'], (prev = []) =>
                prev.map((session) => (session.id === updated.id ? updated : session))
            );
        } catch (err) {
            console.error("Failed to pin session", err);
        }
    };

    const openRenameModal = (session: Session) => {
        setSessionToRename(session);
        setIsRenameModalOpen(true);
    };

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
            {/* Mobile Sidebar Toggle (Floating when closed) */}
            {!sidebarOpen && (
                <button 
                    className="fixed left-4 top-4 z-50 md:hidden p-2 bg-secondary rounded-md shadow-md border border-border"
                    onClick={() => setSidebarOpen(true)}
                >
                    <Menu className="h-5 w-5" />
                </button>
            )}

            {/* Sidebar */}
            <SessionSidebar
                sessions={sessions}
                currentSessionId={currentSessionId}
                onSelectSession={setCurrentSessionId}
                onCreateSession={handleCreateSessionClick}
                onDeleteSession={handleDeleteSession}
                onRenameSession={openRenameModal}
                onPinSession={handlePinSession}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />

            {/* Main Content */}
            <div className="flex flex-1 flex-col h-full w-full relative overflow-hidden">
                {/* Header / Top Bar (Optional) */}
                <div className="h-14 border-b border-border flex items-center px-4 justify-between bg-background/50 backdrop-blur-sm sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 hover:bg-muted rounded-md transition-colors"
                        >
                            <Menu className="h-5 w-5 text-muted-foreground" />
                        </button>
                        <span className="font-medium text-sm">
                            {sessions.find(s => s.id === currentSessionId)?.title || "New Chat"}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            to="/learn"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                        >
                            <GraduationCap className="h-4 w-4" />
                            Learn
                        </Link>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
                    {!currentSessionId ? (
                         <div className="min-h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                            <div className="bg-muted p-4 rounded-full">
                                <MessageSquarePlus className="h-8 w-8" />
                            </div>
                            <p>Select a chat or start a new one</p>
                            <button 
                                onClick={handleCreateSessionClick}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                Start New Chat
                            </button>
                         </div>
                    ) : messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    ) : (
                        <div className="mx-auto max-w-3xl flex flex-col gap-6 pb-4">
                            {messages.map((msg) => (
                                <MessageBubble 
                                    key={msg.id} 
                                    message={msg} 
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Input Area */}
                {currentSessionId && (
                    <InputArea 
                        onSend={sendMessage} 
                        isLoading={isSending}
                        disabled={!currentSessionId}
                    />
                )}
            </div>

            {/* Modals */}
            <SessionNameModal
                isOpen={isRenameModalOpen}
                onClose={() => {
                    setIsRenameModalOpen(false);
                    setIsCreatingSession(false);
                    setSessionToRename(null);
                }}
                onSave={handleRenameSession}
                initialName={sessionToRename?.title || ""}
                title={isCreatingSession ? "Create New Session" : "Rename Session"}
                submitLabel={isCreatingSession ? "Create Session" : "Save Changes"}
            />
        </div>
    );
}
