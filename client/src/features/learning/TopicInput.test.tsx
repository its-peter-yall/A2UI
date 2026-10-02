/**
 * ============================================================================
 * FILE: TopicInput.test.tsx
 * LOCATION: client/src/features/learning/TopicInput.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests per-course search opt-in and immediate accepted-shell navigation.
 *
 * ROLE IN PROJECT:
 *    Guards hidden capability and explicit OFF-by-default course behavior.
 *
 * KEY COMPONENTS:
 *    - TopicInput web-search interaction tests
 *
 * DEPENDENCIES:
 *    - External: React Query, Testing Library, Vitest
 *    - Internal: TopicInput, learningApi, providerSettings
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/TopicInput.test.tsx
 * ============================================================================
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TopicInput } from './TopicInput';

const mocks = vi.hoisted(() => ({
  generateCourse: vi.fn(),
  navigate: vi.fn(),
  capability: true,
  agentsReady: true,
}));

vi.mock('@/lib/learningApi', () => ({
  generateCourse: mocks.generateCourse,
}));

vi.mock('@/lib/providerSettings', () => ({
  getProviderSettings: () => ({
    activeProvider: 'openrouter',
    agentModels: mocks.agentsReady
      ? {
          researcher: { modelId: 'r' },
          planner: { modelId: 'p' },
          generator: { modelId: 'g' },
          quizzer: { modelId: 'q' },
        }
      : undefined,
    providers: {
      openrouter: {
        apiKey: 'llm-key',
        model: 'test/model',
        modelTitle: 'Test',
      },
      generalcompute: { apiKey: '', model: '', modelTitle: '' },
    },
  }),
  areAgentModelsConfigured: () => mocks.agentsReady,
  hasWebSearchCapability: () => mocks.capability,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => mocks.navigate };
});

function renderInput() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TopicInput />
    </QueryClientProvider>,
  );
  return client;
}

describe('TopicInput web search', () => {
  beforeEach(() => {
    mocks.generateCourse.mockReset();
    mocks.navigate.mockReset();
    mocks.capability = true;
    mocks.agentsReady = true;
  });

  it('disables Learn when agent models incomplete', () => {
    mocks.agentsReady = false;
    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Modern CSS' },
    });
    expect(
      screen.getByRole('button', { name: /start learning/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent(/Researcher, Planner, Generator, and Quizzer/i);
  });

  it('enables Learn when key and all four agent models set', () => {
    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Modern CSS' },
    });
    expect(
      screen.getByRole('button', { name: /start learning/i }),
    ).not.toBeDisabled();
  });

  it('hides search icon when capability is unavailable', () => {
    mocks.capability = false;
    renderInput();
    expect(
      screen.queryByRole('button', { name: /use web search/i }),
    ).not.toBeInTheDocument();
  });

  it('shows search icon unselected for every new input mount', () => {
    const first = renderInput();
    expect(
      screen.getByRole('button', { name: /use web search/i }),
    ).toHaveAttribute('aria-pressed', 'false');
    first.clear();
  });

  it('submits selected search state and navigates from 202 shell', async () => {
    mocks.generateCourse.mockResolvedValue({
      session: {
        id: 'session-1',
        query: 'Modern CSS',
        course_title: 'Modern CSS',
        title_finalized: false,
        nodes: [],
      },
      generation: { id: 'job-1', stage: 'INITIALIZING', last_event_id: 1 },
    });
    const client = renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Modern CSS' },
    });
    fireEvent.click(screen.getByRole('button', { name: /use web search/i }));
    expect(
      screen.getByRole('button', { name: /use web search/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    await waitFor(() => {
      expect(mocks.generateCourse).toHaveBeenCalledWith(
        { query: 'Modern CSS', user_id: undefined, mode: 'auto' },
        { webSearchEnabled: true },
      );
    });
    expect(
      client.getQueryData(['learningSession', 'session-1']),
    ).toMatchObject({ id: 'session-1', generation: { id: 'job-1' } });
    expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-1');
  });
});

describe('TopicInput custom mode controls', () => {
  beforeEach(() => {
    mocks.generateCourse.mockReset();
    mocks.navigate.mockReset();
    mocks.capability = true;
    mocks.agentsReady = true;
  });

  function openModePicker() {
    fireEvent.click(screen.getByRole('button', { name: /learning depth mode/i }));
  }

  function selectMode(label: 'Auto' | 'Lite' | 'Full' | 'Custom') {
    openModePicker();
    fireEvent.click(screen.getByRole('option', { name: label }));
  }

  it('renders four depth mode options in the listbox: Auto, Lite, Full, and Custom', () => {
    renderInput();
    openModePicker();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options.map((opt) => opt.textContent)).toEqual([
      'Auto',
      'Lite',
      'Full',
      'Custom',
    ]);
  });

  it('shows custom settings row only when Custom mode is selected', () => {
    renderInput();
    expect(screen.queryByLabelText(/number of concepts/i)).not.toBeInTheDocument();

    selectMode('Custom');

    expect(screen.getByLabelText(/number of concepts/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /research/i })).toBeInTheDocument();

    // Switching back to Auto hides the settings row
    selectMode('Auto');
    expect(screen.queryByLabelText(/number of concepts/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /research/i })).not.toBeInTheDocument();
  });

  it('initializes the concept count field as empty', () => {
    renderInput();
    selectMode('Custom');

    const countInput = screen.getByLabelText(/number of concepts/i) as HTMLInputElement;
    expect(countInput.value).toBe('');
  });

  it('synchronizes research state between the globe icon and the Custom research switch', () => {
    renderInput();
    selectMode('Custom');

    const globeButton = screen.getByRole('button', {
      name: /use web search for this course/i,
    });
    const researchSwitch = screen.getByRole('switch', { name: /research/i });

    expect(globeButton).toHaveAttribute('aria-pressed', 'false');
    expect(researchSwitch).toHaveAttribute('aria-checked', 'false');

    // Toggle switch ON -> globe updates to true
    fireEvent.click(researchSwitch);
    expect(researchSwitch).toHaveAttribute('aria-checked', 'true');
    expect(globeButton).toHaveAttribute('aria-pressed', 'true');

    // Toggle globe OFF -> switch updates to false
    fireEvent.click(globeButton);
    expect(globeButton).toHaveAttribute('aria-pressed', 'false');
    expect(researchSwitch).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps research switch visible but disabled with guidance when search capability is unavailable', () => {
    mocks.capability = false;
    renderInput();
    selectMode('Custom');

    // Globe button is hidden from input bar
    expect(
      screen.queryByRole('button', { name: /use web search/i }),
    ).not.toBeInTheDocument();

    // Research switch remains VISIBLE but DISABLED
    const researchSwitch = screen.getByRole('switch', { name: /research/i });
    expect(researchSwitch).toBeInTheDocument();
    expect(researchSwitch).toBeDisabled();

    // Guidance text is shown
    expect(
      screen.getByText(/configure web search provider in settings/i),
    ).toBeInTheDocument();
  });

  it('allows custom generation with research off when capability is unavailable', async () => {
    mocks.capability = false;
    mocks.generateCourse.mockResolvedValue({
      session: {
        id: 'session-noresearch',
        query: 'Compilers',
        course_title: 'Compilers',
        nodes: [],
      },
      generation: { id: 'job-nr', stage: 'INITIALIZING', last_event_id: 1 },
    });

    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Compilers' },
    });
    selectMode('Custom');
    fireEvent.change(screen.getByLabelText(/number of concepts/i), {
      target: { value: '4' },
    });

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

    await waitFor(() => {
      expect(mocks.generateCourse).toHaveBeenCalledTimes(1);
    });
    expect(mocks.generateCourse.mock.calls[0][1]).toEqual({
      webSearchEnabled: false,
    });
  });

  it('retains entered concept count when switching between modes during form lifetime', () => {
    renderInput();
    selectMode('Custom');

    const countInput = screen.getByLabelText(/number of concepts/i);
    fireEvent.change(countInput, { target: { value: '12' } });
    expect((countInput as HTMLInputElement).value).toBe('12');

    // Switch to Lite
    selectMode('Lite');
    expect(screen.queryByLabelText(/number of concepts/i)).not.toBeInTheDocument();

    // Switch back to Custom -> retained
    selectMode('Custom');
    const restoredInput = screen.getByLabelText(/number of concepts/i);
    expect((restoredInput as HTMLInputElement).value).toBe('12');
  });

  it('blocks submission and displays accessible validation feedback when count is empty in Custom mode', () => {
    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Distributed Systems' },
    });
    selectMode('Custom');

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

    expect(mocks.generateCourse).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/between 1 and 30/i);
    expect(screen.getByLabelText(/number of concepts/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it.each([
    ['0', '0'],
    ['-5', '-5'],
    ['31', '31'],
    ['100', '100'],
    ['2.5', '2.5'],
    ['abc', 'abc'],
  ])(
    'blocks submission and shows accessible validation feedback for invalid count %s (%s)',
    (_label, invalidValue) => {
      renderInput();
      fireEvent.change(screen.getByRole('searchbox'), {
        target: { value: 'Distributed Systems' },
      });
      selectMode('Custom');

      const countInput = screen.getByLabelText(/number of concepts/i);
      fireEvent.change(countInput, { target: { value: invalidValue } });

      fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

      expect(mocks.generateCourse).not.toHaveBeenCalled();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/between 1 and 30/i);
      expect(countInput).toHaveAttribute('aria-invalid', 'true');
    },
  );

  it.each([
    ['1'],
    ['30'],
    ['7'],
  ])('accepts valid whole-number count %s for submission', async (validValue) => {
    mocks.generateCourse.mockResolvedValue({
      session: {
        id: 'session-valid',
        query: 'Distributed Systems',
        course_title: 'Distributed Systems',
        nodes: [],
      },
      generation: { id: 'job-valid', stage: 'INITIALIZING', last_event_id: 1 },
    });

    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Distributed Systems' },
    });
    selectMode('Custom');
    fireEvent.change(screen.getByLabelText(/number of concepts/i), {
      target: { value: validValue },
    });

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

    await waitFor(() => {
      expect(mocks.generateCourse).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears validation error when user types a new count value', () => {
    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Distributed Systems' },
    });
    selectMode('Custom');

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const countInput = screen.getByLabelText(/number of concepts/i);
    fireEvent.change(countInput, { target: { value: '5' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears a stale validation error when leaving Custom mode', () => {
    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Distributed Systems' },
    });
    selectMode('Custom');

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    selectMode('Lite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    selectMode('Custom');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
