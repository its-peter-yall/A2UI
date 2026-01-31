// LearningPathContainer.test.tsx
// Tests for LearningPathContainer component

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LearningPathContainer } from './LearningPathContainer';

// Mock the API module
vi.mock('@/lib/learningApi', () => ({
  generateCourse: vi.fn(),
  getLearningSession: vi.fn(),
  getConceptNode: vi.fn(),
  transitionNode: vi.fn(),
  submitQuiz: vi.fn(),
  retryQuiz: vi.fn(),
  getQuizAttempts: vi.fn(),
  regenerateNode: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('LearningPathContainer', () => {
  it('renders loading state when fetching session', () => {
    render(
      <LearningPathContainer sessionId="test-session" />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/loading session/i)).toBeInTheDocument();
  });

  it('renders loading state when generating course', () => {
    render(
      <LearningPathContainer query="test query" />,
      { wrapper: createWrapper() }
    );
    expect(
      screen.getByText(/generating your learning path/i)
    ).toBeInTheDocument();
  });
});
