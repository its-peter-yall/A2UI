// LearningFlow.test.tsx
// Integration tests for the complete learning flow

// Tests the learning feature navigation, progress bar, completion celebration,
// and integration between components.

// @see: client/src/features/learning/LearningPage.tsx
// @see: client/src/features/learning/LearningHome.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LearningHome } from './LearningHome';
import { LearningPage } from './LearningPage';
import { ProgressBar } from './ProgressBar';
import { TopicInput } from './TopicInput';
import type { ConceptNode, LearningSessionWithNodes } from '@/types/learning';

// Mock the learning API
vi.mock('@/lib/learningApi', () => ({
  generateCourse: vi.fn(),
  getLearningSession: vi.fn(),
  transitionNode: vi.fn(),
  submitQuiz: vi.fn(),
  retryQuiz: vi.fn(),
  regenerateNode: vi.fn(),
  getQuizAttempts: vi.fn(),
}));

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import * as api from '@/lib/learningApi';

// Helper to render components with providers
function renderWithProviders(
  ui: React.ReactElement,
  { route = '/' } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/learn" element={<LearningHome />} />
          <Route path="/learn/:sessionId" element={<LearningPage />} />
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Helper to create mock nodes
function createMockNode(overrides: Partial<ConceptNode> = {}): ConceptNode {
  return {
    id: 'node-1',
    learning_session_id: 'session-1',
    sequence_index: 0,
    title: 'Test Topic',
    content_markdown: '# Test content',
    status: 'VIEWING_EXPLANATION',
    error_message: null,
    retry_available: false,
    quiz: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// Helper to create mock session
function createMockSession(
  nodes: ConceptNode[]
): LearningSessionWithNodes {
  return {
    id: 'session-1',
    user_id: null,
    query: 'Test topic',
    course_title: 'Test Course',
    total_nodes: nodes.length,
    completed_nodes: nodes.filter((n) => n.status === 'COMPLETED').length,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    nodes,
  };
}

describe('LearningHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders topic input on /learn', () => {
    renderWithProviders(<LearningHome />, { route: '/learn' });
    expect(
      screen.getByPlaceholderText(/what do you want to learn/i)
    ).toBeInTheDocument();
  });

  it('shows how it works steps', () => {
    renderWithProviders(<LearningHome />, { route: '/learn' });
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Quiz')).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.getByText('Master')).toBeInTheDocument();
  });

  it('shows feature cards', () => {
    renderWithProviders(<LearningHome />, { route: '/learn' });
    expect(screen.getByText('Sequential Learning')).toBeInTheDocument();
    expect(screen.getByText('Retrieval Practice')).toBeInTheDocument();
    expect(screen.getByText('Mastery Required')).toBeInTheDocument();
  });

  it('has navigation link to learn', () => {
    renderWithProviders(<LearningHome />, { route: '/learn' });
    expect(screen.getByRole('link', { name: /learn/i })).toHaveAttribute(
      'href',
      '/learn'
    );
  });
});

describe('TopicInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('renders input and submit button', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TopicInput />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(
      screen.getByPlaceholderText(/what do you want to learn/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start learning/i })).toBeInTheDocument();
  });

  it('clicking suggestion fills input', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TopicInput />
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText("Newton's Laws"));
    expect(screen.getByDisplayValue("Newton's Laws")).toBeInTheDocument();
  });

  it('submit button is disabled when input is empty', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TopicInput />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole('button', { name: /start learning/i })).toBeDisabled();
  });

  it('calls generateCourse on submit', async () => {
    const mockSession = createMockSession([createMockNode()]);
    (api.generateCourse as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession
    );

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TopicInput />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const input = screen.getByPlaceholderText(/what do you want to learn/i);
    fireEvent.change(input, { target: { value: 'React hooks' } });
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

    await waitFor(() => {
      expect(api.generateCourse).toHaveBeenCalled();
      const calls = (api.generateCourse as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toEqual({
        query: 'React hooks',
        user_id: undefined,
      });
    });
  });
});

describe('ProgressBar', () => {
  it('shows completion count and percentage', () => {
    const nodes = [
      createMockNode({ id: 'n1', status: 'COMPLETED', sequence_index: 0 }),
      createMockNode({ id: 'n2', status: 'IN_QUIZ', sequence_index: 1 }),
      createMockNode({ id: 'n3', status: 'LOCKED', sequence_index: 2 }),
    ];

    render(<ProgressBar nodes={nodes} />);
    expect(screen.getByText('1 / 3 mastered')).toBeInTheDocument();
  });

  it('renders step indicators for each node', () => {
    const nodes = [
      createMockNode({ id: 'n1', title: 'Topic 1', status: 'COMPLETED' }),
      createMockNode({ id: 'n2', title: 'Topic 2', status: 'IN_QUIZ' }),
    ];

    render(<ProgressBar nodes={nodes} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });

  it('calls onNodeClick when non-locked step is clicked', () => {
    const onNodeClick = vi.fn();
    const nodes = [
      createMockNode({ id: 'n1', status: 'COMPLETED' }),
      createMockNode({ id: 'n2', status: 'IN_QUIZ' }),
    ];

    render(<ProgressBar nodes={nodes} onNodeClick={onNodeClick} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(onNodeClick).toHaveBeenCalledWith('n1');
  });

  it('does not call onNodeClick for locked steps', () => {
    const onNodeClick = vi.fn();
    const nodes = [
      createMockNode({ id: 'n1', status: 'COMPLETED' }),
      createMockNode({ id: 'n2', status: 'LOCKED' }),
    ];

    render(<ProgressBar nodes={nodes} onNodeClick={onNodeClick} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]); // Click locked step

    expect(onNodeClick).not.toHaveBeenCalled();
  });

  it('highlights current node with aria-current', () => {
    const nodes = [
      createMockNode({ id: 'n1', status: 'COMPLETED' }),
      createMockNode({ id: 'n2', status: 'IN_QUIZ' }),
    ];

    render(<ProgressBar nodes={nodes} currentNodeId="n2" />);
    const buttons = screen.getAllByRole('button');

    expect(buttons[1]).toHaveAttribute('aria-current', 'step');
    expect(buttons[0]).not.toHaveAttribute('aria-current');
  });

  it('has accessible progress bar role and values', () => {
    const nodes = [
      createMockNode({ id: 'n1', status: 'COMPLETED' }),
      createMockNode({ id: 'n2', status: 'LOCKED' }),
    ];

    render(<ProgressBar nodes={nodes} />);
    const progressbar = screen.getByRole('progressbar');

    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });
});

describe('LearningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows progress bar with session data', async () => {
    const mockSession = createMockSession([
      createMockNode({ id: 'n1', title: 'Topic 1', status: 'COMPLETED' }),
      createMockNode({ id: 'n2', title: 'Topic 2', status: 'IN_QUIZ' }),
      createMockNode({ id: 'n3', title: 'Topic 3', status: 'LOCKED' }),
    ]);
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession
    );

    renderWithProviders(<LearningPage />, { route: '/learn/session-1' });

    await waitFor(() => {
      expect(screen.getAllByText('1 / 3 mastered').length).toBeGreaterThan(0);
    });
  });

  it('shows completion celebration when all nodes completed', async () => {
    const mockSession = createMockSession([
      createMockNode({ id: 'n1', title: 'Topic 1', status: 'COMPLETED' }),
      createMockNode({ id: 'n2', title: 'Topic 2', status: 'COMPLETED' }),
    ]);
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession
    );

    renderWithProviders(<LearningPage />, { route: '/learn/session-1' });

    await waitFor(() => {
      expect(screen.getByText('Course Complete!')).toBeInTheDocument();
    });
  });

  it('completion modal can be dismissed', async () => {
    const mockSession = createMockSession([
      createMockNode({ id: 'n1', status: 'COMPLETED' }),
      createMockNode({ id: 'n2', status: 'COMPLETED' }),
    ]);
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession
    );

    renderWithProviders(<LearningPage />, { route: '/learn/session-1' });

    await waitFor(() => {
      expect(screen.getByText('Course Complete!')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Review Topics'));

    await waitFor(() => {
      expect(screen.queryByText('Course Complete!')).not.toBeInTheDocument();
    });
  });

  it('has navigation links', async () => {
    const mockSession = createMockSession([createMockNode()]);
    (api.getLearningSession as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockSession
    );

    renderWithProviders(<LearningPage />, { route: '/learn/session-1' });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /new topic/i })).toHaveAttribute(
        'href',
        '/learn'
      );
    });
  });

  it('shows error state for missing session ID', () => {
    // Render without session ID
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/learn/']}>
          <Routes>
            <Route path="/learn/" element={<LearningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('No session ID provided')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start learning/i })).toHaveAttribute(
      'href',
      '/learn'
    );
  });
});

describe('Accessibility', () => {
  it('TopicInput has accessible form structure', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TopicInput />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const form = screen.getByRole('search');
    expect(form).toBeInTheDocument();
  });

  it('ProgressBar has accessible navigation structure', () => {
    const nodes = [createMockNode()];
    render(<ProgressBar nodes={nodes} />);

    expect(screen.getByRole('navigation', { name: /learning path progress/i })).toBeInTheDocument();
  });

  it('LearningHome has proper heading hierarchy', () => {
    renderWithProviders(<LearningHome />, { route: '/learn' });

    expect(screen.getByRole('heading', { level: 1, name: /learn anything/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /how it works/i })).toBeInTheDocument();
  });
});
