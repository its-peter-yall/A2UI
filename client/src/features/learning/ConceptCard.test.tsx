// ConceptCard.test.tsx
// Tests for ConceptCard component

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConceptCard } from './ConceptCard';
import type { ConceptNode } from '@/types/learning';

const mockNode: ConceptNode = {
  id: 'node-1',
  learning_session_id: 'session-1',
  sequence_index: 0,
  title: 'Test Topic',
  content_markdown: '# Test Content\n\nThis is test content.',
  status: 'VIEWING_EXPLANATION',
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
  it('renders locked state correctly', () => {
    render(<ConceptCard node={{ ...mockNode, status: 'LOCKED' }} />);
    expect(screen.getByText(/complete the previous topic/i)).toBeInTheDocument();
  });

  it('renders explanation with proceed button', () => {
    render(<ConceptCard node={mockNode} />);
    expect(screen.getByText(/proceed to quiz/i)).toBeInTheDocument();
  });

  it('calls onProceedToQuiz when button clicked', () => {
    const onProceed = vi.fn();
    render(<ConceptCard node={mockNode} onProceedToQuiz={onProceed} />);
    fireEvent.click(screen.getByText(/proceed to quiz/i));
    expect(onProceed).toHaveBeenCalledWith('node-1');
  });

  it('renders quiz options in IN_QUIZ state', () => {
    render(<ConceptCard node={{ ...mockNode, status: 'IN_QUIZ' }} />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.getByText('Submit Answer')).toBeInTheDocument();
  });

  it('renders completed state with review option', () => {
    render(<ConceptCard node={{ ...mockNode, status: 'COMPLETED' }} />);
    expect(screen.getByText(/topic mastered/i)).toBeInTheDocument();
    expect(screen.getByText(/review explanation/i)).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    const onRegenerate = vi.fn();
    render(
      <ConceptCard
        node={{ ...mockNode, status: 'ERROR' }}
        onRegenerate={onRegenerate}
      />
    );
    expect(screen.getByText(/failed to generate/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/retry generation/i));
    expect(onRegenerate).toHaveBeenCalledWith('node-1');
  });
});
