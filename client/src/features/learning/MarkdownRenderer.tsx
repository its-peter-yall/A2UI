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
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-headings:font-semibold prose-headings:text-foreground',
        'prose-p:text-muted-foreground prose-p:leading-relaxed',
        'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
        'prose-pre:bg-muted prose-pre:border',
        'prose-ul:text-muted-foreground prose-ol:text-muted-foreground',
        'prose-strong:text-foreground',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
