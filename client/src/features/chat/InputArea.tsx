import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface InputAreaProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    isLoading?: boolean;
    placeholder?: string;
}

export function InputArea({ 
    onSend, 
    disabled = false, 
    isLoading = false,
    placeholder = "Type a message..." 
}: InputAreaProps) {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'inherit';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [input]);

    const handleSend = () => {
        if (!input.trim() || disabled || isLoading) return;
        onSend(input);
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="border-t border-border bg-background p-4">
            <div className="mx-auto max-w-3xl relative flex items-end gap-2 rounded-xl border border-input bg-background p-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled || isLoading}
                    className="min-h-[44px] max-h-[200px] w-full resize-none border-0 bg-transparent py-3 focus:ring-0 focus-visible:ring-0 text-sm"
                    rows={1}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || disabled || isLoading}
                    className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4" />
                    )}
                    <span className="sr-only">Send</span>
                </button>
            </div>
            <div className="mx-auto max-w-3xl mt-2 text-center text-xs text-muted-foreground">
                Gemini can make mistakes. Check important info.
            </div>
        </div>
    );
}
