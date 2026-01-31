// SessionSidebar.tsx
// Simplified from AURA-CHAT
// Removes "Module" logic, keeps basic Session CRUD

import { Plus, MessageSquare, Trash2, MoreVertical, X, Pin, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Session } from '@/types/api';
import { useState, useCallback, useMemo } from 'react';

interface SessionSidebarProps {
    sessions: Session[];
    currentSessionId: string | null;
    onSelectSession: (id: string) => void;
    onCreateSession: () => void;
    onDeleteSession: (id: string) => void;
    onRenameSession: (session: Session) => void;
    onPinSession: (sessionId: string, isPinned: boolean) => void;
    isOpen: boolean;
    onClose: () => void;
}

export function SessionSidebar({
    sessions,
    currentSessionId,
    onSelectSession,
    onCreateSession,
    onDeleteSession,
    onRenameSession,
    onPinSession,
    isOpen,
    onClose,
}: SessionSidebarProps) {
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const sortedSessions = useMemo(() => {
        return [...sessions].sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
    }, [sessions]);

    const handleDeleteClick = useCallback((e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (pendingDeleteId === sessionId) {
            onDeleteSession(sessionId);
            setPendingDeleteId(null);
        } else {
            setPendingDeleteId(sessionId);
            setTimeout(() => setPendingDeleteId(null), 2000);
        }
    }, [pendingDeleteId, onDeleteSession]);
    return (
        <>
            {/* Mobile Overlay */}
            <div
                className={cn(
                    "fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden transition-opacity",
                    isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Sidebar Container */}
            <aside
                className={cn(
                    "fixed md:relative inset-y-0 left-0 z-50 h-full bg-card border-r border-border transform transition-all duration-300 ease-in-out",
                    isOpen ? "w-72 translate-x-0" : "w-0 -translate-x-full md:translate-x-0"
                )}
            >
                <div className={cn(
                    "flex flex-col h-full w-72 transition-opacity duration-300",
                    isOpen ? "opacity-100" : "opacity-0 pointer-events-none md:w-0"
                )}>
                    {/* Header */}
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <h2 className="font-semibold text-lg tracking-tight">Sessions</h2>
                        <button
                            onClick={onClose}
                            className="md:hidden p-1 hover:bg-muted rounded-md"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* New Session Button */}
                    <div className="p-4 pb-2">
                        <button
                            onClick={onCreateSession}
                            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 px-4 rounded-lg font-medium hover:opacity-90 transition-all shadow-sm active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            <span>New Chat</span>
                        </button>
                    </div>

                    {/* Session List */}
                    <div className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
                        {sortedSessions.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                <p>No active sessions</p>
                                <p className="text-xs opacity-70 mt-1">Start a new chat to begin</p>
                            </div>
                        ) : (
                            sortedSessions.map((session) => (
                                <div
                                    key={session.id}
                                    className={cn(
                                        "group flex items-center gap-3 w-full p-3 rounded-lg text-sm transition-colors cursor-pointer relative",
                                        currentSessionId === session.id
                                            ? "bg-secondary text-secondary-foreground font-medium"
                                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                        session.is_pinned && "border-l-2 border-l-primary"
                                    )}
                                    onClick={() => onSelectSession(session.id)}
                                >
                                    <MessageSquare className="w-4 h-4 shrink-0" />
                                    <div className="flex-1 truncate text-left">
                                        {session.title || 'Untitled Session'}
                                    </div>
                                    
                                    {/* Action Buttons (visible on hover or active) */}
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {/* Pin Button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPinSession(session.id, !session.is_pinned);
                                            }}
                                            className={cn(
                                                "p-1.5 rounded transition-all",
                                                session.is_pinned
                                                    ? "text-primary hover:bg-primary/10"
                                                    : "hover:bg-muted hover:text-foreground"
                                            )}
                                            title={session.is_pinned ? "Unpin session" : "Pin session"}
                                        >
                                            <Pin className={cn("w-3.5 h-3.5", session.is_pinned && "fill-current")} />
                                        </button>

                                        {/* Rename Button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRenameSession(session);
                                            }}
                                            className="p-1.5 hover:bg-muted hover:text-foreground rounded transition-all"
                                            title="Rename session"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>

                                        {/* Delete Action */}
                                        <button
                                            onClick={(e) => handleDeleteClick(e, session.id)}
                                            className={cn(
                                                "p-1.5 rounded transition-all",
                                                pendingDeleteId === session.id
                                                    ? "bg-destructive text-destructive-foreground animate-pulse"
                                                    : "hover:bg-destructive/10 hover:text-destructive"
                                            )}
                                            title={pendingDeleteId === session.id ? "Click again to confirm" : "Double-click to delete"}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer (User Profile Placeholder) */}
                    <div className="p-4 border-t border-border mt-auto">
                        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                                U
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="text-sm font-medium truncate">Demo User</p>
                                <p className="text-xs text-muted-foreground truncate">user@example.com</p>
                            </div>
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
