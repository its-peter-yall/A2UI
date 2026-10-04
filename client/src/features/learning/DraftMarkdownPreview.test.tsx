/**
 * ============================================================================
 * FILE: DraftMarkdownPreview.test.tsx
 * LOCATION: client/src/features/learning/DraftMarkdownPreview.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests streaming markdown preview sanitization and Mermaid suppression.
 *
 * ROLE IN PROJECT:
 *    Guards XSS safety, link safety, and graceful streaming diagram rendering.
 *
 * KEY COMPONENTS:
 *    - DraftMarkdownPreview
 * ============================================================================
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DraftMarkdownPreview } from './DraftMarkdownPreview';

describe('DraftMarkdownPreview', () => {
  it('renders basic markdown content safely', () => {
    render(<DraftMarkdownPreview content="## Concept Overview\n\nThis is a streaming preview." />);
    expect(screen.getByRole('heading', { level: 2, name: /concept overview/i })).toBeInTheDocument();
    expect(screen.getByText(/this is a streaming preview/i)).toBeInTheDocument();
  });

  it('escapes and sanitizes raw HTML without executing scripts', () => {
    const malicious = 'Hello <script>alert(1)</script> <img src="x" onerror="alert(2)" /> world';
    const { container } = render(<DraftMarkdownPreview content={malicious} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img[onerror]')).toBeNull();
  });

  it('suppresses eager Mermaid rendering and displays paused diagram box', () => {
    const mermaidContent = 'Here is a diagram:\n\n```mermaid\ngraph TD\n  A-->B\n```';
    render(<DraftMarkdownPreview content={mermaidContent} />);
    expect(screen.getByText(/diagram generation in progress/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mermaid-diagram')).not.toBeInTheDocument();
  });

  it('sanitizes unsafe link URLs', () => {
    const markdown = '[Safe Link](https://example.com) and [Unsafe Link](javascript:alert(1))';
    render(<DraftMarkdownPreview content={markdown} />);
    const safeLink = screen.getByRole('link', { name: /safe link/i });
    expect(safeLink).toHaveAttribute('href', 'https://example.com');
    expect(screen.queryByRole('link', { name: /unsafe link/i })).toBeNull();
  });

  it('displays truncation offset notice when isTruncated is true', () => {
    render(
      <DraftMarkdownPreview
        content="Remaining tail of text"
        isTruncated={true}
        textOffset={1200}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/offset 1200/i);
  });
});
