# Testing Patterns

**Analysis Date:** 2026-05-27

## Test Framework

**Client Runner:**
- Vitest 3.2.4
- Config: `client/vite.config.ts` (test section)
- Environment: `jsdom`
- Globals: `true` (describe/it/expect available without import)
- Setup: `client/vitest.setup.ts` imports `@testing-library/jest-dom`

**Client Assertion Library:**
- Vitest built-in (`expect`)
- `@testing-library/jest-dom` for DOM matchers (`toBeInTheDocument`, `toBeDisabled`, etc.)
- `@testing-library/react` for component rendering (`render`, `screen`, `fireEvent`, `waitFor`)

**Server Runner:**
- Python `unittest` (stdlib)
- No pytest — uses `unittest.TestCase`, `unittest.IsolatedAsyncioTestCase`
- Async tests via `IsolatedAsyncioTestCase` for `async def` test methods

**Run Commands:**
```bash
# Client
cd client
npm run test                          # Watch mode (vitest)
npm run test -- --run                 # Single run
npm run test -- src/lib/api.test.ts   # Single file
npm run test -- -t "QueryProvider"    # Test name filter
npm run test -- --coverage            # Coverage (@vitest/coverage-v8)

# Server
cd server
python -m unittest                                         # All tests
python -m unittest server.tests.test_learning_router       # Single module
python -m unittest server.tests.test_chat.ChatSessionTests.test_invalid_session_id_returns_404  # Single test
```

## Test File Organization

**Client Location:**
- Co-located with source: `src/features/learning/ConceptCard.test.tsx` beside `src/features/learning/ConceptCard.tsx`
- E2E tests in `__tests__/` subdirectory: `src/features/learning/__tests__/e2e.test.tsx`
- Hook tests co-located: `src/hooks/useTypewriter.test.ts`

**Server Location:**
- All tests in `server/tests/` directory
- Naming: `test_*.py` (e.g., `test_learning_router.py`, `test_course_orchestrator.py`)
- `server/tests/__init__.py` present for package recognition

**Client Test Files (30 total):**
- `src/features/settings/ModelPicker.test.tsx`
- `src/features/settings/ThinkingModeToggle.test.tsx`
- `src/features/settings/OpenRouterSettingsPanel.test.tsx`
- `src/features/settings/SettingsPage.test.tsx`
- `src/components/SettingsButton.test.tsx`
- `src/providers/QueryProvider.test.tsx`
- `src/hooks/useTypewriter.test.ts`
- `src/lib/providerSettings.test.ts`
- `src/lib/providerApi.test.ts`
- `src/features/learning/ConceptCard.test.tsx`
- `src/features/learning/LearningFlow.test.tsx`
- `src/features/learning/LearningHome.test.tsx`
- `src/features/learning/LearningPathContainer.test.tsx`
- `src/features/learning/LearningPage.test.tsx`
- `src/features/learning/useLearningMutations.test.tsx`
- `src/features/learning/useNodeState.test.ts`
- `src/features/learning/useCourseList.test.tsx`
- `src/features/learning/QuizFeedback.test.tsx`
- `src/features/learning/ErrorStates.test.tsx`
- `src/features/learning/CourseCard.test.tsx`
- `src/features/learning/CourseFilter.test.tsx`
- `src/features/learning/RevisionPage.test.tsx`
- `src/features/learning/RevisionConceptCard.test.tsx`
- `src/features/learning/RevisionSummaryModal.test.tsx`
- `src/features/learning/RevisionHistoryList.test.tsx`
- `src/features/learning/animations/index.test.ts`
- `src/features/learning/animations/MasteryCelebration.test.tsx`
- `src/features/learning/__tests__/e2e.test.tsx`
- `src/features/learning/__tests__/dashboard-e2e.test.tsx`
- `src/features/learning/__tests__/revision-e2e.test.tsx`

**Server Test Files (13 total):**
- `server/tests/test_learning_router.py`
- `server/tests/test_course_orchestrator.py`
- `server/tests/test_learning_persistence.py`
- `server/tests/test_learning_schemas.py`
- `server/tests/test_quiz_randomization.py`
- `server/tests/test_session_lifecycle.py`
- `server/tests/test_orchestrator_integration.py`
- `server/tests/test_planner_agent.py`
- `server/tests/test_generator_agent.py`
- `server/tests/test_quizzer_agent.py`
- `server/tests/test_base_agent.py`
- `server/tests/test_llm_router.py`
- `server/tests/test_thinking.py`

## Test Structure

**Client Suite Organization:**
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('ComponentName', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  it('renders correctly', () => {
    render(<Component />, { wrapper: createWrapper() });
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('handles user interaction', () => {
    const handler = vi.fn();
    render(<Component onAction={handler} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledWith(expectedArg);
  });
});
```

**Server Suite Organization:**
```python
import unittest
from unittest.mock import MagicMock, AsyncMock, patch

class TestFeatureName(unittest.TestCase):
    """Tests for feature behavior."""

    def test_specific_behavior(self) -> None:
        """Docstring describing the test case."""
        # Arrange
        fake_manager = MagicMock()
        fake_manager.method.return_value = {...}

        # Act + Assert
        with patch("server.module.dependency", fake_manager):
            result = function_under_test("arg")

        self.assertEqual(result.field, expected)
        fake_manager.method.assert_called_once_with(...)


class TestAsyncFeature(unittest.IsolatedAsyncioTestCase):
    """Tests for async behavior."""

    async def test_async_behavior(self) -> None:
        orchestrator = CourseOrchestrator()
        with patch.object(
            module, "dependency", new_callable=AsyncMock, return_value=value
        ):
            result = await orchestrator.async_method("arg")
        self.assertEqual(result, expected)
```

## Mocking

**Client Framework:** `vi.mock()` and `vi.fn()` from Vitest

**Client Mocking Patterns:**
```tsx
// Module mock — top level
vi.mock('@/lib/learningApi', () => ({
  generateCourse: vi.fn(),
  getLearningSession: vi.fn(),
  submitQuiz: vi.fn(),
}));

// Provider settings mock
vi.mock('@/lib/providerSettings', () => ({
  getProviderSettings: vi.fn(() => ({
    activeProvider: 'openrouter',
    providers: {
      openrouter: { apiKey: 'test-key', model: 'google/gemini-2.5-flash' },
    },
  })),
}));

// Router mock
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Per-test mock return value
(api.getQuizAttempts as ReturnType<typeof vi.fn>).mockResolvedValue(data);
(api.getQuizAttempts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

// Inline mock
const handler = vi.fn();
handler.mockReturnValue(value);
handler.mockImplementation(() => { throw new Error(); });
```

**Server Framework:** `unittest.mock` — `MagicMock`, `AsyncMock`, `patch`

**Server Mocking Patterns:**
```python
# Context manager patching
with patch("server.routers.learning.learning_manager", fake_manager):
    result = function_under_test("arg")

# Object-level patching with AsyncMock
with patch.object(
    orchestrator_module.generator_agent,
    "generate_explanation",
    new_callable=AsyncMock,
    return_value=content,
) as mock_generate:
    result = await orchestrator._generate_concept_unit(...)

# Multiple patches in one context
with (
    patch.object(module, "planner_agent", new_callable=AsyncMock) as mock_plan,
    patch.object(module, "learning_manager", return_value=payload) as mock_create,
):
    mock_plan.return_value = outline
    result = await orchestrator.generate_course(...)

# Fake manager pattern
fake_manager = MagicMock()
fake_manager._get_connection.return_value = fake_conn
fake_manager._get_node_by_id.return_value = node_dict
fake_manager.create_quiz_attempt.return_value = attempt_dict

# Fake connection pattern
fake_conn = MagicMock()
fake_manager._get_connection.return_value = fake_conn
```

**What to Mock:**
- External API calls (OpenRouter, LLM agents)
- Database persistence (`learning_manager` methods)
- Provider settings (API keys, model selection)
- React Router navigation (`useNavigate`)
- Browser APIs (`localStorage`, `window.matchMedia`)

**What NOT to Mock:**
- Pure utility functions (`cn`, `isValidTransition`, `getNextStatus`)
- Pydantic schema validation (test with real data)
- Component rendering logic (test via Testing Library)
- State machine logic in hooks (`useNodeState`)

## Fixtures and Factories

**Client Test Data:**
```tsx
// Factory function for mock nodes
const mockNode = (status: NodeStatus): ConceptNode => ({
  id: 'node-1',
  learning_session_id: 'session-1',
  sequence_index: 0,
  title: 'Test Node',
  content_markdown: '# Test Content\n\nThis is test content.',
  status,
  error_message: null,
  retry_available: false,
  quiz: {
    question_text: 'Test question?',
    options: [
      { option_id: 'opt-a-uuid', display_label: 'A', text: 'Option A', is_correct: false, explanation: 'Wrong' },
      { option_id: 'opt-b-uuid', display_label: 'B', text: 'Option B', is_correct: true, explanation: 'Correct' },
      { option_id: 'opt-c-uuid', display_label: 'C', text: 'Option C', is_correct: false, explanation: 'Wrong' },
      { option_id: 'opt-d-uuid', display_label: 'D', text: 'Option D', is_correct: false, explanation: 'Wrong' },
    ],
    difficulty: 'medium',
  },
  quiz_set: null,
  quiz_hidden: null,
  quiz_set_hidden: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
});

// Inline mock data
const mockQuizSetHiddenNode: ConceptNode = {
  ...mockNode('IN_QUIZ'),
  id: 'node-quizset',
  quiz: null,
  quiz_set_hidden: {
    quizzes: [...],
    current_index: 0,
    total_quizzes: 3,
  },
};
```

**Server Test Data:**
```python
# Factory functions
def _make_quiz_card() -> QuizCard:
    return QuizCard(
        question_text="What is 2 + 2?",
        options=[
            QuizOption(option_id="opt-a", display_label="A", text="4", is_correct=True, explanation="Correct."),
            QuizOption(option_id="opt-b", display_label="B", text="3", is_correct=False, explanation="Incorrect."),
            QuizOption(option_id="opt-c", display_label="C", text="5", is_correct=False, explanation="Incorrect."),
            QuizOption(option_id="opt-d", display_label="D", text="6", is_correct=False, explanation="Incorrect."),
        ],
        difficulty="easy",
    )

def _make_topics(count: int = 3) -> list[TopicNode]:
    return [
        TopicNode(index=i, title=f"Topic {i}", summary_for_context=f"Summary {i}",
                  key_terms=[f"term-{i}a", f"term-{i}b"])
        for i in range(count)
    ]

def _make_outline(count: int = 5) -> CourseOutline:
    return CourseOutline(course_title="Mock Course", topics=_make_topics(count))

def _make_test_llm_context() -> LLMContext:
    return LLMContext(api_key="test-openrouter-key", model=None, http_referer=None, app_title=None)

# Node response factory
def _make_node_response(status: str) -> dict:
    return {
        "id": "node-1", "learning_session_id": "session-1", "sequence_index": 0,
        "title": "Node", "content_markdown": "Content", "status": status,
        "error_message": None, "retry_available": False,
        "created_at": "2026-02-15T00:00:00+00:00", "updated_at": "2026-02-15T00:00:00+00:00",
        "quiz": None, "quiz_set": None, "quiz_hidden": None, "quiz_set_hidden": None,
    }
```

**Location:**
- Client: inline in test files (no shared fixtures directory)
- Server: factory functions at top of test files or in test helper modules

## Coverage

**Requirements:** >80% code coverage target (per AGENTS.md)

**Client Coverage:**
```bash
cd client
npm run test -- --coverage
```
- Requires `@vitest/coverage-v8` package (installed as devDependency)
- Coverage provider: `v8`

**Server Coverage:** No explicit coverage configuration detected. Target >80% per project guidelines.

## Test Types

**Unit Tests (Client):**
- Component rendering: verify DOM output for each state
- Hook behavior: test pure logic and state transitions
- Utility functions: test `cn`, `isValidTransition`, `getNextStatus`
- API module: test request building (mock axios)

**Unit Tests (Server):**
- Router endpoints: test request → response with mocked persistence
- Schema validation: test Pydantic model constraints
- Service logic: test orchestrator flow with mocked agents
- Agent behavior: test planner/generator/quizzer with mocked LLM

**Integration Tests (Client):**
- Full learning flow: `LearningFlow.test.tsx` tests navigation + state across components
- E2E tests in `__tests__/`: `e2e.test.tsx`, `dashboard-e2e.test.tsx`, `revision-e2e.test.tsx`
- Uses `MemoryRouter` + `Routes` for navigation testing

**Integration Tests (Server):**
- `test_orchestrator_integration.py`: tests full orchestration flow
- `test_session_lifecycle.py`: tests session creation → completion lifecycle
- Uses `TestClient` from FastAPI for HTTP-level testing

**E2E Tests:**
- Client-side E2E in `src/features/learning/__tests__/`
- Uses mocked API but full component tree
- Tests: `e2e.test.tsx`, `dashboard-e2e.test.tsx`, `revision-e2e.test.tsx`

## Common Patterns

**Async Testing (Client):**
```tsx
// waitFor for async state changes
await waitFor(() => {
  expect(screen.getByText(/loading quiz feedback/i)).toBeInTheDocument();
});

// Mock async API
(api.getQuizAttempts as ReturnType<typeof vi.fn>).mockImplementation(
  () => new Promise(() => {})  // Never resolves = loading state
);

// Mock resolved value
(api.getQuizAttempts as ReturnType<typeof vi.fn>).mockResolvedValue(data);

// Mock rejected value
(api.getQuizAttempts as ReturnType<typeof vi.fn>).mockRejectedValue(
  new Error('Failed to load attempts')
);
```

**Async Testing (Server):**
```python
# IsolatedAsyncioTestCase for async tests
class TestOrchestrator(unittest.IsolatedAsyncioTestCase):
    async def test_generate_course(self) -> None:
        orchestrator = CourseOrchestrator()
        with patch.object(module, "agent", new_callable=AsyncMock) as mock:
            mock.return_value = outline
            result = await orchestrator.generate_course("query")
        self.assertEqual(result["session"]["id"], "session-1")

# AsyncMock for awaitable calls
mock_plan = AsyncMock(return_value=outline)
mock_generate = AsyncMock(side_effect=[result1, result2])
```

**Error Testing (Client):**
```tsx
// Test error state rendering
it('shows error state when API fails', async () => {
  (api.getQuizAttempts as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error('Failed to load attempts')
  );
  render(<Component node={mockNode} />, { wrapper: createWrapper() });
  await waitFor(() => {
    expect(screen.getByText(/unable to load feedback/i)).toBeInTheDocument();
  });
});
```

**Error Testing (Server):**
```python
# Test HTTP error codes
def test_returns_404_for_missing_session(self) -> None:
    fake_manager = MagicMock()
    fake_manager.get_session.return_value = None
    with patch("server.routers.learning.learning_manager", fake_manager):
        response = client.get("/learning/sessions/missing")
    self.assertEqual(response.status_code, 404)

# Test exception propagation
def test_returns_400_for_invalid_input(self) -> None:
    fake_manager = MagicMock()
    fake_manager.method.side_effect = ValueError("Invalid")
    with patch("server.module.manager", fake_manager):
        response = client.post("/endpoint", json={...})
    self.assertEqual(response.status_code, 400)
```

**State Machine Testing (Client):**
```tsx
// Test all states of a node
describe('useNodeState', () => {
  describe('LOCKED state', () => {
    it('returns locked view with no actions', () => {
      const result = useNodeState(mockNode('LOCKED'));
      expect(result.currentView).toBe('locked');
      expect(result.actions.canSubmitQuiz).toBe(false);
    });
  });

  describe('IN_QUIZ state', () => {
    it('allows submitting quiz only', () => {
      const result = useNodeState(mockNode('IN_QUIZ'));
      expect(result.actions.canSubmitQuiz).toBe(true);
      expect(result.actions.canViewExplanation).toBe(false);
    });
  });
});

// Test transitions
describe('isValidTransition', () => {
  it('allows LOCKED to VIEWING_EXPLANATION', () => {
    expect(isValidTransition('LOCKED', 'VIEWING_EXPLANATION')).toBe(true);
  });
  it('denies LOCKED to COMPLETED', () => {
    expect(isValidTransition('LOCKED', 'COMPLETED')).toBe(false);
  });
});
```

**Provider Wrapper Pattern (Client):**
```tsx
// Create wrapper for components needing QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Usage
render(<Component />, { wrapper: createWrapper() });
```

**FastAPI TestClient Pattern (Server):**
```python
def _create_client() -> TestClient:
    app = FastAPI()
    app.include_router(learning_router)
    from server.schemas.llm import LLMContext
    app.dependency_overrides[get_llm_context] = lambda: LLMContext(
        api_key="mock-key-for-tests"
    )
    return TestClient(app)

# Usage
client = _create_client()
response = client.get("/learning/sessions")
self.assertEqual(response.status_code, 200)
```

## Test Data Conventions

**Timestamps in test fixtures:**
- Client: `'2024-01-01T00:00:00Z'`
- Server: `'2026-02-15T00:00:00+00:00'` or `'2026-01-01T00:00:00Z'`

**ID patterns in test fixtures:**
- Nodes: `'node-1'`, `'node-2'`
- Sessions: `'session-1'`
- Options: `'opt-a-uuid'`, `'opt-b-uuid'` or `'option-1'`
- Revisions: `'revision-1'`

**Quiz option structure:**
```python
QuizOption(option_id="opt-a", display_label="A", text="4", is_correct=True, explanation="Correct.")
```
```typescript
{ option_id: 'opt-a-uuid', display_label: 'A', text: 'Option A', is_correct: false, explanation: 'Wrong' }
```

---

*Testing analysis: 2026-05-27*
