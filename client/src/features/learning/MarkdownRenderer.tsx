/**
 * ============================================================================
 * FILE: MarkdownRenderer.tsx
 * LOCATION: client/src/features/learning/MarkdownRenderer.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Renders markdown content as styled HTML for concept explanations in the
 *    learning path. Wraps react-markdown with custom styling, GitHub Flavored
 *    Markdown (GFM) support, and HTML sanitization for security.
 *
 * ROLE IN PROJECT:
 *    Shared rendering utility within the learning feature. Consumed by
 *    ConceptCard to display AI-generated explanations with consistent
 *    typography and Cyber Yellow accent colors aligned with the design system.
 *
 * KEY COMPONENTS:
 *    - MarkdownRenderer: Main wrapper with styled prose container
 *    - Custom Components: Code block rendering with syntax highlighting
 *    - Plugin Configuration: GFM, raw HTML, and sanitization plugins
 *
 * DEPENDENCIES:
 *    - External: react-markdown, rehype-raw, rehype-sanitize, remark-gfm,
 *                react, tailwindcss/typography
 *    - Internal: @/lib/utils (cn utility)
 *
 * USAGE:
 *    ```tsx
 *    <MarkdownRenderer content={node.content_markdown} />
 *
 *    <MarkdownRenderer content={node.content_markdown} className="text-sm" />
 *    ```
 * ============================================================================
 */

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
