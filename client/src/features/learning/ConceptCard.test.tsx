// ConceptCard.test.tsx
// Tests for ConceptCard component

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConceptCard } from './ConceptCard';
import type { ReactNode } from 'react';
import type { ConceptNode } from '@/types/learning';

const mockNode: ConceptNode = {
  id: 'node-1',
  learning_session_id: 'session-1',
  sequence_index: 0,
  title: 'Test Topic',
  content_markdown: '# Test Content\n\nThis is test content.',
  status: 'VIEWING_EXPLANATION',
  error_message: null,
  retry_available: false,
  quiz: {
    question_text: 'What is the answer?',
    options: [
      { id: 'A', text: 'Option A', is_correct: false, explanation: 'Wrong' },
      { id: 'B', text: 'Option B', is_correct: true, explanation: 'Correct!' },
      { id: 'C', text: 'Option C', is_correct: false, explanation: 'Wrong' },
      { id: 'D', text: 'Option D', is_correct: false, explanation: 'Wrong' },
    ],
    difficulty: 'medium',
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('ConceptCard', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  it('renders locked state correctly', () => {
    render(<ConceptCard node={{ ...mockNode, status: 'LOCKED' }} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText(/complete the previous topic/i)).toBeInTheDocument();
  });

  it('renders explanation with proceed button', () => {
    render(<ConceptCard node={mockNode} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText(/proceed to quiz/i)).toBeInTheDocument();
  });

  it('calls onProceedToQuiz when button clicked', () => {
    const onProceed = vi.fn();
    render(<ConceptCard node={mockNode} onProceedToQuiz={onProceed} />, {
      wrapper: createWrapper(),
    });
    fireEvent.click(screen.getByText(/proceed to quiz/i));
    expect(onProceed).toHaveBeenCalledWith('node-1');
  });

  it('renders quiz options in IN_QUIZ state', () => {
    render(<ConceptCard node={{ ...mockNode, status: 'IN_QUIZ' }} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.getByText('Submit Answer')).toBeInTheDocument();
  });

  it('renders completed state with review option', () => {
    render(<ConceptCard node={{ ...mockNode, status: 'COMPLETED' }} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText(/topic mastered/i)).toBeInTheDocument();
    expect(screen.getByText(/review explanation/i)).toBeInTheDocument();
  });

  it('renders error state with retry button and partial content', () => {
    const onRegenerate = vi.fn();
    render(
      <ConceptCard
        node={{ ...mockNode, status: 'ERROR' }}
        onRegenerate={onRegenerate}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/content generation failed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/show partial content/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(/retry generation/i));
    expect(onRegenerate).toHaveBeenCalledWith('node-1');
  });

  it('renders skip button when canSkip is true', () => {
    const onSkipNode = vi.fn();
    render(
      <ConceptCard
        node={{ ...mockNode, status: 'ERROR' }}
        onSkipNode={onSkipNode}
        canSkip
      />,
      { wrapper: createWrapper() }
    );
    fireEvent.click(screen.getByText(/skip for now/i));
    expect(onSkipNode).toHaveBeenCalledWith('node-1');
  });
});
