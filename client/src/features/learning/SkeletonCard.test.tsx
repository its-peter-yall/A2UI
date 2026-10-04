/**
 * ============================================================================
 * FILE: SkeletonCard.test.tsx
 * LOCATION: client/src/features/learning/SkeletonCard.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests titled skeleton card and live draft explanation hydration.
 *
 * ROLE IN PROJECT:
 *    Guards topic preview hydration and read-only preview boundaries.
 *
 * KEY COMPONENTS:
 *    - SkeletonCard
 * ============================================================================
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonCard } from './SkeletonCard';

describe('SkeletonCard', () => {
  it('renders titled skeleton bars when no draft text is provided', () => {
    render(<SkeletonCard title="Variables & Types" sequenceIndex={0} animated={true} />);
    expect(screen.getByText('Variables & Types')).toBeInTheDocument();
    expect(
      screen.getByText('Variables & Types').closest('[data-module-skeleton]'),
    ).toHaveAttribute('data-module-skeleton', 'generating');
  });

  it('hydrates with DraftMarkdownPreview when draft text is provided', () => {
    render(
      <SkeletonCard
        title="Variables & Types"
        sequenceIndex={0}
        animated={true}
        draftText="In JavaScript, variables store data values."
      />,
    );
    expect(screen.getByText('Variables & Types')).toBeInTheDocument();
    expect(screen.getByText(/in javascript, variables store data values/i)).toBeInTheDocument();
    expect(screen.getByText(/preview mode · generating explanation/i)).toBeInTheDocument();
  });

  it('indicates quiz generation when explanationReady is true', () => {
    render(
      <SkeletonCard
        title="Variables & Types"
        sequenceIndex={0}
        animated={true}
        draftText="Explanation complete."
        explanationReady={true}
      />,
    );
    expect(screen.getByText(/generating quizzes/i)).toBeInTheDocument();
    expect(screen.getByText(/quiz generation in progress/i)).toBeInTheDocument();
  });
});
