// MarkdownRenderer.tsx
// Renders markdown content for concept explanations

// Simple wrapper around markdown rendering with consistent styling.
// Handles code blocks, lists, headings, and inline formatting.

// @see: Uses prose classes from Tailwind Typography plugin
// @note: Sanitizes HTML by default for security

import ReactMarkdown from 'react-markdown';
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
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
