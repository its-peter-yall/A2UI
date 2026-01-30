import React, { useState, useEffect } from 'react';
import { useChat } from './useChat';
import { InputArea } from './InputArea';
import { SessionSidebar } from '@/components/SessionSidebar';
import { MessageBubble } from '@/components/MessageBubble';
import { SessionNameModal } from '@/components/SessionNameModal';
import { Menu, MessageSquarePlus } from 'lucide-react';
import * as api from '@/lib/api';
import type { Session } from '@/types/api';

export function ChatPage() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [sessionToRename, setSessionToRename] = useState<Session | null>(null);

    // Chat Logic
    const { messages, isLoading: isChatLoading, sendMessage, isSending } = useChat(currentSessionId);

    // Fetch Sessions (Simple approach for now, could be React Query)
    const loadSessions = async () => {
        try {
            const data = await api.getSessions();
            setSessions(data);
            if (!currentSessionId && data.length > 0) {
                // setCurrentSessionId(data[0].id); // Optional: Auto-select first
            }
        } catch (err) {
            console.error("Failed to load sessions", err);
        }
    };

    useEffect(() => {
        loadSessions();
    }, []);

    // Handlers
    const handleCreateSession = async () => {
        try {
            const newSession = await api.createSession({ title: "New Chat" });
            setSessions([newSession, ...sessions]);
            setCurrentSessionId(newSession.id);
        } catch (err) {
            console.error("Failed to create session", err);
        }
    };

    const handleDeleteSession = async (id: string) => {
        try {
            await api.deleteSession(id);
            setSessions(sessions.filter(s => s.id !== id));
            if (currentSessionId === id) {
                setCurrentSessionId(null);
            }
        } catch (err) {
            console.error("Failed to delete session", err);
        }
    };

    const handleRenameSession = async (title: string) => {
        if (!sessionToRename) return;
        try {
            const updated = await api.updateSession(sessionToRename.id, title);
            setSessions(sessions.map(s => s.id === updated.id ? updated : s));
            setIsRenameModalOpen(false);
            setSessionToRename(null);
        } catch (err) {
            console.error("Failed to rename session", err);
        }
    };

    const openRenameModal = (session: Session) => {
        setSessionToRename(session);
        setIsRenameModalOpen(true);
    };

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
            {/* Mobile Sidebar Overlay */}
            {!sidebarOpen && (
                <button 
                    className="fixed left-4 top-4 z-50 md:hidden p-2 bg-secondary rounded-md"
                    onClick={() => setSidebarOpen(true)}
                >
                    <Menu className="h-5 w-5" />
                </button>
            )}

            {/* Sidebar */}
            <div className={`${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-0'} fixed md:relative z-40 h-full transition-all duration-300 ease-in-out border-r border-border bg-muted/30`}>
                <SessionSidebar
                    sessions={sessions}
                    currentSessionId={currentSessionId}
                    onSelectSession={setCurrentSessionId}
                    onCreateSession={handleCreateSession}
                    onDeleteSession={handleDeleteSession}
                    onRenameSession={openRenameModal}
                    onClose={() => setSidebarOpen(false)}
                />
            </div>

            {/* Main Content */}
            <div className="flex flex-1 flex-col h-full w-full relative">
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
                    <div>
                         {/* Controls like Model Selector could go here */}
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
                    {!currentSessionId ? (
                         <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                            <div className="bg-muted p-4 rounded-full">
                                <MessageSquarePlus className="h-8 w-8" />
                            </div>
                            <p>Select a chat or start a new one</p>
                            <button 
                                onClick={handleCreateSession}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
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
                onClose={() => setIsRenameModalOpen(false)}
                onSave={handleRenameSession}
                initialName={sessionToRename?.title || ""}
            />
        </div>
    );
}
