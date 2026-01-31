// MessageBubble.tsx
// Ported from AURA-CHAT, simplified for AgUI
// Removes citation logic but keeps Markdown and Thinking UI

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTypewriter } from '@/hooks/useTypewriter';
import type { Message, LocalMessage } from '@/types/api';

interface MessageBubbleProps {
    message: LocalMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);

    // Status messages for each phase
    const statusMessages: Record<'thinking' | 'generating' | 'completed', string> = {
        thinking: 'Thinking...',
        generating: 'Generating response...',
        completed: '',
    };

    const statusPhase = message.statusPhase || 'generating';
    const statusText = message.isLoading ? statusMessages[statusPhase] : '';
    const displayText = useTypewriter(statusText, !!message.isLoading);

    if (message.isLoading) {
        return (
            <div className="flex justify-start">
                <div className="px-4 py-3 max-w-[85%] rounded-2xl rounded-tl-none bg-card/50 border border-border/50" aria-live="polite">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(255,212,0,0.5)]" />
                        <span className="text-xs font-mono uppercase tracking-widest animate-shine min-h-[1.5em]">
                            {displayText}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
            <div
                className={cn(
                    "px-4 py-3 max-w-[85%] rounded-2xl shadow-sm transition-all",
                    isUser
                        ? "bg-primary text-primary-foreground rounded-tr-none shadow-[0_4px_15px_rgba(255,212,0,0.1)]"
                        : "bg-card/50 text-foreground rounded-tl-none border border-border/50"
                )}
            >
                {message.error && (
                    <div className="flex items-center gap-2 text-destructive mb-2 bg-destructive/10 p-2 rounded border border-destructive/20">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-black uppercase tracking-tighter">System Error</span>
                    </div>
                )}

                {/* Thinking Section */}
                {!isUser && message.thinking_content && (
                    <div className="mb-4">
                        <button
                            onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                            className="group flex items-center gap-1.5 text-primary/70 hover:text-primary transition-colors duration-200"
                        >
                            <span className="text-sm font-semibold tracking-wide">
                                {isThinkingExpanded ? 'Hide thinking' : 'Show thinking'}
                            </span>
                            <ChevronDown className={cn(
                                "w-4 h-4 transition-transform duration-200 group-hover:text-primary",
                                isThinkingExpanded && "rotate-180"
                            )} />
                        </button>

                        <div className={cn(
                            "overflow-hidden transition-all duration-300 ease-out",
                            isThinkingExpanded ? "max-h-[500px] opacity-100 mt-3" : "max-h-0 opacity-0"
                        )}>
                            <div className="relative">
                                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-linear-to-b from-primary via-primary/50 to-transparent rounded-full" />
                                <div className="text-sm text-muted-foreground leading-relaxed italic pl-4 py-2">
                                    {message.thinking_content}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className={cn(
                    "prose max-w-none text-[15px] leading-relaxed font-medium break-words",
                    isUser
                        ? "prose-neutral prose-p:text-primary-foreground prose-headings:text-primary-foreground prose-strong:text-primary-foreground"
                        : "prose-invert prose-p:text-foreground prose-headings:text-primary prose-strong:text-primary prose-a:text-primary hover:prose-a:text-primary/80 prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none"
                )}>
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );
}
