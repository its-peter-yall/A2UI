/**
 * ============================================================================
 * FILE: customLearningMode.test.tsx
 * LOCATION: client/src/features/learning/__tests__/customLearningMode.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Verify Custom controls through real API serialization and accepted cache.
 *
 * ROLE IN PROJECT:
 *    Provides P4 client acceptance at the HTTP transport boundary.
 *    Keeps React Query, request builders, and form behavior real.
 *
 * KEY COMPONENTS:
 *    - Custom mode transport and cache workflows
 *
 * USAGE:
 *    npm test -- --run src/features/learning/__tests__/customLearningMode.test.tsx
 * ============================================================================
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TopicInput } from '@/features/learning/TopicInput';
import type {
  GenerateCourseAcceptedResponse,
  GenerateCourseRequest,
  LearningDepthMode,
  LearningSessionWithNodes,
} from '@/types/learning';

const mocks = vi.hoisted(() => {
  let accepted: GenerateCourseAcceptedResponse | undefined;
  let lastConfig: InternalAxiosRequestConfig | undefined;
  const post = vi.fn(async (
    _url: string,
    _data?: GenerateCourseRequest,
    config?: InternalAxiosRequestConfig,
  ) => {
    lastConfig = config;
    if (!accepted) throw new Error('Set accepted response before submitting');
    return { data: accepted };
  });
  return {
    post,
    navigate: vi.fn(),
    capability: true,
    setAccepted(value: GenerateCourseAcceptedResponse) { accepted = value; },
    lastRequestConfig: () => lastConfig,
    reset() { accepted = undefined; lastConfig = undefined; },
    instance: {
      post,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  };
});

vi.mock('axios', () => ({
  default: { create: () => mocks.instance, isAxiosError: () => false },
}));

vi.mock('@/lib/providerSettings', () => ({
  getProviderSettings: () => ({
    activeProvider: 'openrouter',
    agentModels: {
      researcher: { modelId: 'r-model' },
      planner: { modelId: 'p-model' },
      generator: { modelId: 'g-model' },
      quizzer: { modelId: 'q-model' },
    },
    providers: {
      openrouter: {
        apiKey: 'llm-secret', model: 'm', modelTitle: 'M',
        thinking: { enabled: false, effort: 'high' },
      },
      generalcompute: { apiKey: '', model: '', modelTitle: '' },
    },
  }),
  areAgentModelsConfigured: () => true,
  hasWebSearchCapability: () => mocks.capability,
  getWebSearchSettings: () => ({
    masterEnabled: mocks.capability,
    providers: {
      tavily: { apiKey: mocks.capability ? 'search-secret' : '', enabled: true },
      exa: { apiKey: '', enabled: false },
      brave: { apiKey: '', enabled: false },
      serpapi: { apiKey: '', enabled: false },
    },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual, useNavigate: () => mocks.navigate };
});

const clients: QueryClient[] = [];

function renderInput(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TopicInput />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'Modern CSS' },
  });
  return client;
}

function selectMode(label: string): void {
  fireEvent.click(screen.getByRole('button', { name: /learning depth mode/i }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

function acceptedShell(
  mode: LearningDepthMode,
  count?: number,
  research = false,
): GenerateCourseAcceptedResponse {
  return {
    session: {
      id: 'session-1', user_id: null, query: 'Modern CSS',
      course_title: 'Modern CSS', mode, resolved_mode: null,
      custom_topic_count: mode === 'custom' ? count : null,
      title_finalized: false, total_nodes: 0, completed_nodes: 0,
      last_active_node_id: null, nodes: [],
      created_at: '2026-10-02T00:00:00Z', updated_at: null,
    },
    generation: {
      id: 'job-1', session_id: 'session-1', stage: 'INITIALIZING',
      web_search_requested: research,
      grounding_status: research ? 'PENDING' : 'DISABLED',
      counts: {
        topics_total: 0, briefs_ready: 0, topics_ready: 0,
        topics_failed: 0, research_sections: 0, sources: 0,
      },
      warnings: [], cancel_requested: false,
      can_cancel: true, can_resume: false, last_event_id: 1,
      created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reset();
  mocks.capability = true;
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('Custom learning mode transport acceptance', () => {
  const cases = [1, 2, 5, 30].flatMap((count) => [
    { count, research: false },
    { count, research: true },
  ]);

  it.each(cases)('submits $count concepts with research=$research', async ({ count, research }) => {
    mocks.setAccepted(acceptedShell('custom', count, research));
    const client = renderInput();
    fireEvent.click(screen.getByRole('button', { name: /learning depth mode/i }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Auto', 'Lite', 'Full', 'Custom',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /number of concepts/i }), {
      target: { value: String(count) },
    });
    if (research) {
      fireEvent.click(screen.getByRole('switch', { name: 'Research' }));
    }
    expect(screen.getByRole('button', { name: /use web search/i })).toHaveAttribute(
      'aria-pressed', String(research),
    );
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-1'));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('/learning/generate', {
      query: 'Modern CSS', mode: 'custom', custom_topic_count: count,
    }, expect.any(Object));
    const headers = mocks.lastRequestConfig()?.headers;
    expect(headers).toMatchObject({
      'X-OpenRouter-Key': 'llm-secret',
      'X-Web-Search': String(research),
      'X-Planner-Model': 'p-model',
    });
    if (research) {
      expect(headers).toMatchObject({
        'X-Web-Search-Providers': 'tavily', 'X-Tavily-Key': 'search-secret',
      });
    } else {
      expect(headers).not.toHaveProperty('X-Tavily-Key');
      expect(headers).not.toHaveProperty('X-Web-Search-Providers');
    }
    const requestBody = mocks.post.mock.calls[0]?.[1];
    expect(JSON.stringify(requestBody)).not.toMatch(/llm-secret|search-secret/);
    expect(client.getQueryData<LearningSessionWithNodes>([
      'learningSession', 'session-1',
    ])).toMatchObject({
      mode: 'custom', custom_topic_count: count, total_nodes: 0, nodes: [],
      generation: { web_search_requested: research },
    });
  });

  it('blocks invalid drafts before transport, then submits a corrected count', async () => {
    mocks.setAccepted(acceptedShell('custom', 2));
    renderInput();
    selectMode('Custom');
    const input = screen.getByRole('spinbutton', { name: /number of concepts/i });
    for (const value of ['', '2.5', '0', '-1', '31']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(/whole number between 1 and 30/i);
      expect(mocks.post).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();
    }
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-1'));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0]?.[1]).toEqual({
      query: 'Modern CSS', mode: 'custom', custom_topic_count: 2,
    });
  });

  it.each([
    { label: 'Auto', mode: 'auto' },
    { label: 'Lite', mode: 'lite' },
    { label: 'Full', mode: 'full' },
  ] satisfies { label: string; mode: LearningDepthMode }[])(
    'omits retained count when switched to $label and keeps research headers',
    async ({ label, mode }) => {
      mocks.setAccepted(acceptedShell(mode, undefined, true));
      const client = renderInput();
      selectMode('Custom');
      fireEvent.change(screen.getByRole('spinbutton', { name: /number of concepts/i }), {
        target: { value: '5' },
      });
      fireEvent.click(screen.getByRole('switch', { name: 'Research' }));
      selectMode(label);
      fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
      await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-1'));
      expect(mocks.post.mock.calls[0]?.[1]).toEqual({ query: 'Modern CSS', mode });
      expect(mocks.lastRequestConfig()?.headers).toMatchObject({
        'X-Web-Search': 'true', 'X-Tavily-Key': 'search-secret',
      });
      expect(client.getQueryData<LearningSessionWithNodes>([
        'learningSession', 'session-1',
      ])).toMatchObject({ mode, custom_topic_count: null });
    },
  );

  it('still transports a Custom request with no configured research provider', async () => {
    mocks.capability = false;
    mocks.setAccepted(acceptedShell('custom', 1));
    renderInput();
    selectMode('Custom');
    expect(screen.getByRole('switch', { name: 'Research' })).toBeDisabled();
    expect(screen.getByText(/configure web search provider in settings/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: /number of concepts/i }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-1'));
    expect(mocks.post.mock.calls[0]?.[1]).toEqual({
      query: 'Modern CSS', mode: 'custom', custom_topic_count: 1,
    });
    expect(mocks.lastRequestConfig()?.headers).toMatchObject({ 'X-Web-Search': 'false' });
    expect(mocks.lastRequestConfig()?.headers).not.toHaveProperty('X-Tavily-Key');
  });
});