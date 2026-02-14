/**
 * ============================================================================
 * FILE: MasteryCelebration.test.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Unit tests for MasteryCelebration component. Validates celebration
 * rendering with topic mastery and course completion messages, plus
 * callback triggering after animation duration.
 * 
 * KEY TESTS:
 * - Shows "Topic Mastered!" with topic title
 * - Shows "Course Complete!" when isCourseComplete
 * - Calls onComplete after animation (2500ms)
 * - Does not render when inactive (active=false)
 * 
 * DEPENDENCIES:
 * - vitest: Testing framework
 * - @testing-library/react: Component testing
 * - client/src/features/learning/animations/MasteryCelebration: Component
 * - client/src/features/learning/animations/Confetti: Confetti effect (mocked)
 * 
 * USAGE PATTERN:
 * ```bash
 * # Run mastery celebration tests
 * npm run test -- src/features/learning/animations/MasteryCelebration.test.tsx
 * ```
 * 
 * TEST SETUP:
 * - Mocks Confetti component to avoid canvas warnings
 * - Uses waitFor with extended timeout for animation timing
 * - Tests both topic-level and course-level celebrations
 * 
 * RELATED FILES:
 * - client/src/features/learning/animations/MasteryCelebration.tsx
 * - client/src/features/learning/animations/Confetti.tsx
 * 
 * NOTES:
 * - Staggered reveal: 200ms delay before message
 * - Auto-dismiss after 2500ms total
 * - Confetti canvas effect for visual celebration
 * ============================================================================
 */

// client/src/features/learning/animations/MasteryCelebration.test.tsx
// Tests for mastery celebration component

// Verifies that the celebration component renders the correct messages
// and triggers callbacks after the expected durations.
// Uses fake timers to test animation sequences.

// @see: client/src/features/learning/animations/MasteryCelebration.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MasteryCelebration } from './MasteryCelebration';

// Mock Confetti to avoid canvas warnings
vi.mock('./Confetti', () => ({
  Confetti: () => <div data-testid="mock-confetti" />
}));

describe('MasteryCelebration', () => {
  it('shows topic mastered message when active', async () => {
    render(
      <MasteryCelebration
        active={true}
        topicTitle="Newton's Laws"
      />
    );

    // Wait for staggered message reveal (200ms delay in component)
    await waitFor(() => {
      expect(screen.getByText('Topic Mastered!')).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByText("Newton's Laws")).toBeInTheDocument();
  });

  it('shows course complete message when isCourseComplete', async () => {
    render(
      <MasteryCelebration
        active={true}
        isCourseComplete={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Course Complete!')).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByText("You've mastered all topics!")).toBeInTheDocument();
  });

  it('calls onComplete after animation', async () => {
    const onComplete = vi.fn();
    render(
      <MasteryCelebration
        active={true}
        onComplete={onComplete}
      />
    );

    // Wait for full animation and auto-dismiss (2500ms in component)
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    }, { timeout: 5000 });
  });

  it('does not render message when inactive', () => {
    render(
      <MasteryCelebration
        active={false}
        topicTitle="Test"
      />
    );

    expect(screen.queryByText('Topic Mastered!')).not.toBeInTheDocument();
  });
});
