/**
 * ============================================================================
 * FILE: DraftMarkdownPreview.tsx
 * LOCATION: client/src/features/learning/DraftMarkdownPreview.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Safe read-only markdown preview for partial live generation drafts.
 *
 * ROLE IN PROJECT:
 *    Renders streaming research, outline, and topic text without unlocking
 *    quiz answers, executing Mermaid, or interpreting raw HTML.
 *
 * KEY COMPONENTS:
 *    - sanitizePartialMarkdown: Strips unclosed tags from truncated streams
 *    - DraftMarkdownPreview: ReactMarkdown preview with protocol-safe links
 *
 * DEPENDENCIES:
 *    - External: react, react-markdown, remark-gfm, remark-math
 *    - Internal: @/lib/utils
 *
 * USAGE:
 *    <DraftMarkdownPreview content={draft.text} isTruncated textOffset={50} />
 * ============================================================================
 */

import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { cn } from '@/lib/utils';

export interface DraftMarkdownPreviewProps {
  content: string;
  isTruncated?: boolean;
  textOffset?: number;
  className?: string;
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizePartialMarkdown(content: string): string {
  const withoutScripts = content.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    '',
  );
  const withoutHtml = withoutScripts.replace(/<[^>]*>/g, '');
  return withoutHtml.replace(/<[^>]*$/g, '');
}

function isMermaidLanguage(className: string | undefined): boolean {
  if (!className) {
    return false;
  }
  return /(?:^|\s)language-mermaid(?:\s|$)/.test(className);
}

const markdownComponents: Components = {
  a({ href, children }) {
    if (!href || !isSafeHttpUrl(href)) {
      return <span>{children}</span>;
    }
    return (
      <a href={href} rel="noreferrer noopener" target="_blank">
        {children}
      </a>
    );
  },
  code({ className, children, ...props }) {
    if (isMermaidLanguage(className)) {
      return (
        <div
          className="my-3 rounded-lg border border-dashed border-[#ffb74d] bg-[#ffb74d]/10 px-3 py-2 font-lexend text-sm text-[#ffb74d]"
          role="status"
        >
          Diagram generation in progress...
        </div>
      );
    }
    const isBlock = Boolean(className);
    if (!isBlock) {
      return (
        <code className={cn('font-fira', className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <pre className="overflow-x-auto rounded-lg bg-muted p-3">
        <code className={cn('font-fira', className)} {...props}>
          {children}
        </code>
      </pre>
    );
  },
};

export function DraftMarkdownPreview({
  content,
  isTruncated = false,
  textOffset = 0,
  className,
}: DraftMarkdownPreviewProps) {
  const sanitized = sanitizePartialMarkdown(content);

  return (
    <div
      className={cn(
        'font-lexend text-sm leading-relaxed text-foreground',
        className,
      )}
    >
      {isTruncated ? (
        <p role="note" className="mb-2 text-xs text-muted-foreground">
          Preview truncated; showing text from offset {textOffset}.
        </p>
      ) : null}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        components={markdownComponents}
      >
        {sanitized}
      </ReactMarkdown>
    </div>
  );
}
