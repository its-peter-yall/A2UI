// MarkdownRenderer.tsx
// Renders markdown content for concept explanations

// Longer description (2-4 lines):
// - Wraps react-markdown with shared styling for learning content.
// - Enables GFM features like tables and task lists.
// - Sanitizes HTML to prevent unsafe rendering.

// @see: client/src/components/MessageBubble.tsx - Markdown rendering setup
// @note: Only allow raw HTML when sanitized

import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import React from 'react';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        'prose max-w-none text-[15px] leading-relaxed font-medium',
        'dark:prose-invert',
        // Body Text
        'prose-p:text-foreground',
        // Headings: Cyber Yellow (Primary)
        'prose-headings:text-primary',
        // Strong / Bold: Cyber Yellow (Primary)
        'prose-strong:text-primary',
        // Links: Cyber Yellow (Primary)
        'prose-a:text-primary hover:prose-a:text-primary/80',
        // Code
        'prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none',
        // Lists
        'prose-ul:text-muted-foreground prose-ol:text-muted-foreground',
        // Pre / Block Code
        'prose-pre:bg-muted prose-pre:border prose-pre:border-border',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
            code({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
                return (
                    <code className={className} {...props}>
                        {children}
                    </code>
                );
            }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
