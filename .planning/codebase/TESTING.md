# Testing Patterns

**Analysis Date:** 2026-02-16

## Overview

This codebase uses a dual testing strategy:
- **Client (React/TypeScript)**: Vitest + React Testing Library + jsdom
- **Server (Python/FastAPI)**: Python's built-in `unittest` + `unittest.mock`

Target coverage: >80% as specified in `conductor/workflow.md`.

---

## Client Testing (TypeScript/React)

### Test Framework

**Runner:**
- **Vitest** v3.2.4 - Vite-native test runner
- Config: `client/vite.config.ts` (test section)
- Setup: `client/vitest.setup.ts`

**Assertion Library:**
- **@testing-library/jest-dom** - DOM-specific matchers
- Vitest's built-in `expect` for general assertions

**Environment:**
- **jsdom** - Browser-like DOM environment
- **globals: true** - describe/it/expect available without import

### Run Commands

```bash
# Navigate to client directory
cd client

# Run all tests (watch mode)
npm run test

# Run single test file
npm run test -- src/hooks/useTypewriter.test.ts

# Run tests by name pattern
npm run test -- -t "useTypewriter"

# Run tests once (CI mode)
npm run test -- --run

# Run with coverage
npm run test -- --coverage

# Run coverage report (requires @vitest/coverage-v8)
npm run test -- --coverage --reporter=html
```

### Test File Organization

**Location:**
- **Co-located** with source files (same directory)
- Example: `CourseCard.tsx` + `CourseCard.test.tsx` in same folder

**Naming:**
- `*.test.ts` - Utility/hook tests
- `*.test.tsx` - Component tests

**Directory Structure:**
```
client/src/
├── features/learning/
│   ├── CourseCard.tsx           # Component
│   ├── CourseCard.test.tsx      # Component tests
│   ├── useLearningMutations.ts  # Hook
│   ├── useLearningMutations.test.tsx  # Hook tests
│   └── __tests__/               # E2E/integration tests
│       ├── e2e.test.tsx
│       ├── dashboard-e2e.test.tsx
│       └── revision-e2e.test.tsx
├── hooks/
│   ├── useTypewriter.ts
│   └── useTypewriter.test.ts
└── providers/
    ├── QueryProvider.tsx
    └── QueryProvider.test.tsx
```

### Test Structure

**Basic Pattern:**
```typescript
// ComponentName.test.tsx
// Tests for ComponentName

// Description of what is being tested

// @see: path/to/ComponentName.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ComponentName } from './ComponentName';

// Mock external dependencies
vi.mock('@/lib/api', () => ({
  fetchData: vi.fn(),
}));

describe('ComponentName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component correctly', () => {
    render(<ComponentName prop="value" />);
    
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const onClick = vi.fn();
    render(<ComponentName onClick={onClick} />);
    
    fireEvent.click(screen.getByRole('button'));
    
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

**Hook Test Pattern:**
```typescript
// useHookName.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHookName } from './useHookName';
import { vi } from 'vitest';

describe('useHookName', () => {
  it('should return initial state', () => {
    const { result } = renderHook(() => useHookName());
    
    expect(result.current.value).toBe('initial');
  });

  it('should update on interaction', async () => {
    const { result } = renderHook(() => useHookName());
    
    act(() => {
      result.current.updateValue('new');
    });
    
    expect(result.current.value).toBe('new');
  });
});
```

### Mocking Patterns

**Module Mocking with vi.mock():**
```typescript
// Mock an entire module
vi.mock('@/lib/learningApi', () => ({
  transitionNode: vi.fn(),
  submitQuiz: vi.fn(),
  retryQuiz: vi.fn(),
  regenerateNode: vi.fn(),
}));

// Import mocked module for assertions
import * as api from '@/lib/learningApi';

// Use in test
(api.transitionNode as ReturnType<typeof vi.fn>).mockResolvedValue({
  id: 'node-1',
  status: 'IN_QUIZ',
});
```

**Mocking Framer Motion (Animation Library):**
```typescript
vi.mock('framer-motion', () => ({
  motion: {
    article: ({ children, ...props }: Record<string, unknown>) => {
      const filtered: Record<string, unknown> = {};
      const motionKeys = ['variants', 'initial', 'animate', 'exit', 'custom',
        'transition', 'whileHover', 'whileTap', 'layout'];
      for (const [key, value] of Object.entries(props)) {
        if (!motionKeys.includes(key)) {
          filtered[key] = value;
        }
      }
      return <article {...filtered}>{children as ReactNode}</article>;
    },
    div: ({ children, ...props }: Record<string, unknown>) => {
      // Similar filtering
      return <div {...filtered}>{children as ReactNode}</div>;
    },
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
```

**Creating Promise Resolvers for Loading States:**
```typescript
it('sets isTransitioning to true during mutation', async () => {
  let resolveTransition: (value: unknown) => void;
  (api.transitionNode as ReturnType<typeof vi.fn>).mockImplementation(
    () => new Promise((resolve) => { resolveTransition = resolve; })
  );

  const { result } = renderHook(
    () => useLearningMutations({ sessionId: 'session-1' }),
    { wrapper: createWrapper() }
  );

  result.current.proceedToQuiz('node-1');

  await waitFor(() => {
    expect(result.current.isTransitioning).toBe(true);
  });

  resolveTransition!({ id: 'node-1', status: 'IN_QUIZ' });

  await waitFor(() => {
    expect(result.current.isTransitioning).toBe(false);
  });
});
```

### React Query Testing

**Wrapper Pattern:**
```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },  // Disable retries in tests
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// Usage in test
const { result } = renderHook(
  () => useLearningMutations({ sessionId: 'session-1' }),
  { wrapper: createWrapper() }
);
```

### DOM Assertions (jest-dom)

**Common Matchers:**
```typescript
// Presence
expect(screen.getByText('Hello')).toBeInTheDocument();
expect(screen.queryByText('Hidden')).not.toBeInTheDocument();

// Attributes
expect(screen.getByRole('button')).toBeDisabled();
expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');

// Classes
expect(screen.getByTestId('progress-bar-fill')).toHaveStyle({ width: '60%' });

// Accessibility
expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
```

### Async Testing

**waitFor Pattern:**
```typescript
import { waitFor } from '@testing-library/react';

it('fetches data asynchronously', async () => {
  render(<Component />);
  
  fireEvent.click(screen.getByText('Load'));
  
  await waitFor(() => {
    expect(api.getData).toHaveBeenCalledWith('param');
  });
  
  await waitFor(() => {
    expect(screen.getByTestId('data-row')).toBeInTheDocument();
  });
});
```

**Fake Timers:**
```typescript
it('should type out text over time', async () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTypewriter('Hi', true, 30));

  act(() => {
    vi.advanceTimersByTime(50);
  });
  expect(result.current).toContain('H');

  vi.useRealTimers();
});
```

### What to Mock

**Always Mock:**
- External API calls (axios/fetch)
- Animation libraries (framer-motion)
- Complex child components (when testing parent)
- Browser APIs not in jsdom (matchMedia, localStorage if needed)

**Don't Mock:**
- Simple utility functions being tested
- React hooks being tested (use the actual hook)
- Static data/constants

### Test Data Factories

**Inline Mock Data:**
```typescript
const mockInProgressSession: LearningSessionSummary = {
  id: 'session-1',
  query: 'Explain quantum computing basics',
  course_title: 'Quantum Computing Fundamentals',
  status: 'in_progress',
  progress_percent: 60,
  total_nodes: 5,
  completed_nodes: 3,
  last_active_node_title: "Newton's Third Law",
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-20T14:30:00Z',
  completed_at: null,
  revision_count: 0,
};
```

**Helper Functions:**
```typescript
function createMockSession(overrides?: Partial<LearningSessionSummary>): LearningSessionSummary {
  return {
    id: 'session-default',
    query: 'Test query',
    course_title: 'Test Course',
    status: 'in_progress',
    progress_percent: 0,
    total_nodes: 5,
    completed_nodes: 0,
    last_active_node_title: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    completed_at: null,
    revision_count: 0,
    ...overrides,
  };
}
```

---

## Server Testing (Python)

### Test Framework

**Runner:**
- **unittest** - Python's standard library testing framework
- No pytest configuration detected

**Location:**
- All tests in `server/tests/` directory
- Naming: `test_*.py`

**Key Features Used:**
- `unittest.TestCase` - Base test class
- `unittest.IsolatedAsyncioTestCase` - For async tests
- `unittest.mock` - Mocking (patch, MagicMock, AsyncMock)

### Run Commands

```bash
# Navigate to server directory and activate venv
cd server
.venv\Scripts\activate  # Windows

# Run all tests
python -m unittest

# Run specific test module
python -m unittest server.tests.test_course_orchestrator

# Run specific test class
python -m unittest server.tests.test_course_orchestrator.TestCourseOrchestratorGenerateCourse

# Run single test method
python -m unittest server.tests.test_course_orchestrator.TestCourseOrchestratorGenerateCourse.test_generate_course_scatter_gather_success

# Discover and run all tests
python -m unittest discover -s server/tests -p "test_*.py"
```

### Test File Organization

**Structure:**
```
server/tests/
├── test_base_agent.py
├── test_course_orchestrator.py
├── test_generator_agent.py
├── test_learning_persistence.py
├── test_learning_router.py
├── test_learning_schemas.py
├── test_orchestrator_integration.py
├── test_planner_agent.py
├── test_quiz_randomization.py
├── test_quizzer_agent.py
└── test_session_lifecycle.py
```

### Test Structure

**Standard Test Class:**
```python
"""
=============================================================================
FILE: test_module_name.py
=============================================================================

PURPOSE:
Description of what these tests cover.

KEY TESTS:
- test_something: What it tests
- test_something_else: What it tests

DEPENDENCIES:
- unittest: Framework
- module.under.test: System under test

@see: path/to/implementation.py
"""

import unittest
from unittest.mock import Mock, patch, MagicMock

from server.module import ClassUnderTest


class TestClassName(unittest.TestCase):
    """Tests for ClassName functionality."""

    def test_something_happens(self) -> None:
        """Description of what this test verifies."""
        # Arrange
        obj = ClassUnderTest()
        
        # Act
        result = obj.method()
        
        # Assert
        self.assertEqual(result, expected_value)
```

**Async Test Class:**
```python
import unittest
from unittest.mock import AsyncMock, patch


class TestAsyncFunctionality(unittest.IsolatedAsyncioTestCase):
    """Async tests for functionality requiring async/await."""

    async def test_async_method_success(self) -> None:
        """Test that async method works correctly."""
        orchestrator = CourseOrchestrator()
        
        with patch.object(
            module,
            'async_dependency',
            new_callable=AsyncMock,
            return_value=mock_value
        ) as mock:
            result = await orchestrator.async_method()
            
        self.assertEqual(result['key'], 'value')
        mock.assert_awaited_once()
```

### Mocking Patterns

**Patching Module-Level Dependencies:**
```python
from unittest.mock import patch, MagicMock

# Patch at module level
with patch('server.routers.learning.learning_manager') as mock_manager:
    mock_manager.get_session.return_value = {'id': 'session-1'}
    
    response = get_learning_session('session-1')
    
    self.assertEqual(response.id, 'session-1')
    mock_manager.get_session.assert_called_once_with('session-1')
```

**Patching Object Methods:**
```python
from unittest.mock import patch, AsyncMock

# Patch specific method with async
with patch.object(
    orchestrator_module.planner_agent,
    'plan',
    new_callable=AsyncMock,
) as mock_plan:
    mock_plan.return_value = outline
    
    result = await orchestrator.generate_course('query')
    
    mock_plan.assert_awaited_once_with('query')
```

**Creating Mock Objects:**
```python
from unittest.mock import MagicMock, Mock

# Simple mock
fake_manager = MagicMock()
fake_manager.get_session.return_value = {'id': 'session-1'}

# Mock with side effects
fake_manager.delete.side_effect = [True, False]  # First call True, second False

# Mock connection
fake_conn = MagicMock()
fake_manager._get_connection.return_value = fake_conn
```

**Mocking Pydantic Models:**
```python
from types import SimpleNamespace

# Create mock objects that behave like Pydantic models
content = SimpleNamespace(content_markdown="mock content")
quiz = Mock()
```

### Test Data Factories

**Helper Functions:**
```python
def _make_topics(count: int = 3) -> list[TopicNode]:
    """Create test topics."""
    return [
        TopicNode(
            index=i,
            title=f"Topic {i}",
            summary_for_context=f"Summary {i}",
            key_terms=[f"term-{i}a", f"term-{i}b"],
        )
        for i in range(count)
    ]


def _make_outline(count: int = 5) -> CourseOutline:
    """Create test course outline."""
    return CourseOutline(
        course_title="Mock Course",
        topics=_make_topics(count)
    )
```

**Enum Mocking:**
```python
class _FakeNodeStatus:
    """Mock enum for testing when actual enum unavailable."""
    UNLOCKED = _StatusValue("UNLOCKED")
    LOCKED = _StatusValue("LOCKED")
    COMPLETED = _StatusValue("COMPLETED")


class _StatusValue:
    def __init__(self, value: str) -> None:
        self.value = value
```

### Schema Validation Tests

**Pydantic Model Tests:**
```python
from pydantic import ValidationError

class TestQuizSchemas(unittest.TestCase):
    def test_quiz_card_requires_min_options(self) -> None:
        """QuizCard must have at least 4 options."""
        options = [
            _make_quiz_option("A", True),
            _make_quiz_option("B", False),
            _make_quiz_option("C", False),
        ]
        
        with self.assertRaises(ValidationError):
            QuizCard(question_text="Too few", options=options)

    def test_quiz_card_valid(self) -> None:
        """Valid QuizCard creation."""
        options = [
            _make_quiz_option("A", True),
            _make_quiz_option("B", False),
            _make_quiz_option("C", False),
            _make_quiz_option("D", False),
        ]
        
        card = QuizCard(
            question_text="What is the answer?",
            options=options,
            difficulty=QuizDifficulty.MEDIUM,
        )
        
        self.assertEqual(len(card.options), 4)
```

### Router/Integration Tests

**FastAPI TestClient:**
```python
from fastapi import FastAPI
from fastapi.testclient import TestClient
from server.routers.learning import router as learning_router

def _create_client() -> TestClient:
    app = FastAPI()
    app.include_router(learning_router)
    return TestClient(app)


class TestLearningRouter(unittest.TestCase):
    def test_endpoint_returns_200(self) -> None:
        fake_manager = MagicMock()
        fake_manager.get_data.return_value = {'id': 'test'}
        client = _create_client()

        with patch('server.routers.learning.learning_manager', fake_manager):
            response = client.get("/learning/sessions")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['id'], 'test')
```

---

## Coverage Requirements

**Target:** >80% code coverage for new code (per `conductor/workflow.md`)

### Client Coverage

```bash
cd client
npm run test -- --coverage
```

Coverage reported for:
- Statements
- Branches
- Functions
- Lines

### Server Coverage

Python's unittest doesn't include built-in coverage. Use coverage.py:

```bash
cd server
pip install coverage
coverage run -m unittest discover -s tests -p "test_*.py"
coverage report
```

---

## Testing Best Practices

### Test-Driven Development (TDD)

**Workflow from `conductor/workflow.md`:**

1. **Red Phase:** Write failing tests first
   - Define expected behavior
   - Verify tests fail before implementation

2. **Green Phase:** Implement minimal code to pass
   - Focus on functionality, not perfection
   - All tests must pass

3. **Refactor Phase:** Improve code quality
   - Maintain all passing tests
   - No behavior changes

### Test Naming

**Descriptive names that explain behavior:**
```typescript
// Good
test('sets isTransitioning to true during mutation', async () => {});
test('revision history section hidden when revision_count is 0', () => {});

// Python
async def test_generate_concept_unit_failure_returns_skeleton(self) -> None:
    """Failed generation should return skeleton card with error."""
```

### Arrange-Act-Assert Pattern

```typescript
it('handles user interaction', () => {
  // Arrange
  const onClick = vi.fn();
  render(<Button onClick={onClick} />);
  
  // Act
  fireEvent.click(screen.getByRole('button'));
  
  // Assert
  expect(onClick).toHaveBeenCalledTimes(1);
});
```

### Testing Async Operations

**Client:**
```typescript
// Use waitFor for async assertions
await waitFor(() => {
  expect(api.getData).toHaveBeenCalled();
});
```

**Server:**
```python
# Use IsolatedAsyncioTestCase for async methods
class TestAsync(unittest.IsolatedAsyncioTestCase):
    async def test_async_operation(self) -> None:
        result = await async_function()
        self.assertIsNotNone(result)
```

---

## Summary Table

| Aspect | Client (TypeScript) | Server (Python) |
|--------|---------------------|-----------------|
| Framework | Vitest | unittest |
| Assertion | jest-dom + Vitest | unittest.TestCase |
| Async Support | Native | IsolatedAsyncioTestCase |
| Mocking | vi.mock(), vi.fn() | unittest.mock |
| Test Location | Co-located (`*.test.ts`) | `server/tests/` |
| Coverage Tool | @vitest/coverage-v8 | coverage.py |
| DOM Testing | @testing-library/react | N/A |
| Run Command | `npm run test` | `python -m unittest` |

---

*Testing analysis: 2026-02-16*
