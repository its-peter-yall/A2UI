// SessionSidebar.tsx
// Simplified from AURA-CHAT
// Removes "Module" logic, keeps basic Session CRUD

import { Plus, MessageSquare, Trash2, MoreVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Session } from '@/types/api';

interface SessionSidebarProps {
    sessions: Session[];
    currentSessionId: string | null;
    onSelectSession: (id: string) => void;
    onCreateSession: () => void;
    onDeleteSession: (id: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

export function SessionSidebar({
    sessions,
    currentSessionId,
    onSelectSession,
    onCreateSession,
    onDeleteSession,
    isOpen,
    onClose,
}: SessionSidebarProps) {
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
                    "fixed md:relative inset-y-0 left-0 z-50 w-72 bg-card border-r border-border transform transition-transform duration-300 ease-in-out md:translate-x-0",
                    isOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="flex flex-col h-full">
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
                        {sessions.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                <p>No active sessions</p>
                                <p className="text-xs opacity-70 mt-1">Start a new chat to begin</p>
                            </div>
                        ) : (
                            sessions.map((session) => (
                                <div
                                    key={session.id}
                                    className={cn(
                                        "group flex items-center gap-3 w-full p-3 rounded-lg text-sm transition-colors cursor-pointer relative",
                                        currentSessionId === session.id
                                            ? "bg-secondary text-secondary-foreground font-medium"
                                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                    )}
                                    onClick={() => onSelectSession(session.id)}
                                >
                                    <MessageSquare className="w-4 h-4 shrink-0" />
                                    <div className="flex-1 truncate text-left">
                                        {session.title || 'Untitled Session'}
                                    </div>
                                    
                                    {/* Delete Action (visible on hover or active) */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('Delete this session?')) {
                                                onDeleteSession(session.id);
                                            }
                                        }}
                                        className={cn(
                                            "opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded transition-all",
                                            currentSessionId === session.id && "opacity-100" // Always show on active
                                        )}
                                        title="Delete Session"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
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
