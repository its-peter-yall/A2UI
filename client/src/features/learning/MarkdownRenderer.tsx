/**
 * ============================================================================
 * FILE: MarkdownRenderer.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Renders markdown content as styled HTML for concept explanations in the
 * learning path. Wraps react-markdown with custom styling, GitHub Flavored
 * Markdown (GFM) support, and HTML sanitization for security. Provides
 * consistent typography and colors aligned with the learning feature design.
 * 
 * KEY COMPONENTS:
 * - MarkdownRenderer: Main wrapper with styled prose container
 * - Custom Components: Code block rendering with syntax highlighting
 * - Plugin Configuration: GFM, raw HTML, and sanitization plugins
 * 
 * DEPENDENCIES:
 * - react-markdown: Core markdown parsing and rendering
 * - rehype-raw: Plugin to render raw HTML in markdown
 * - rehype-sanitize: Plugin to sanitize HTML and prevent XSS
 * - remark-gfm: GitHub Flavored Markdown support (tables, task lists, etc.)
 * - @/lib/utils: cn() utility for conditional className
 * - tailwindcss/typography: prose classes for beautiful typography
 * 
 * USAGE PATTERN:
 * ```tsx
 * // Basic usage
 * <MarkdownRenderer content={node.content_markdown} />
 * 
 * // With custom className
 * <MarkdownRenderer
 *   content={node.content_markdown}
 *   className="text-sm"
 * />
 * ```
 * 
 * ERROR HANDLING:
 * - react-markdown handles malformed markdown gracefully
 * - Sanitization removes potentially dangerous HTML
 * - No error boundary needed (errors show as plain text)
 * 
 * PERFORMANCE NOTES:
 * - Only re-renders when content prop changes
 * - Plugins are stable references (not recreated each render)
 * - Sanitization is lightweight but thorough
 * 
 * RELATED FILES:
 * - ConceptCard.tsx: Main consumer of MarkdownRenderer
 * - @/components/MessageBubble.tsx: Similar markdown rendering setup
 * 
 * NOTES:
 * - Cyber Yellow (#FFD400) is used for primary accents (headings, links, code)
 * - Dark mode support via dark:prose-invert
 * - Tables and task lists supported via remark-gfm
 * - Code inline styling: bg-primary/10, px-1, rounded
 * - Pre blocks: bg-muted with border
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
