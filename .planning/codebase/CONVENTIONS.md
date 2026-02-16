# Coding Conventions

**Analysis Date:** 2026-02-16

## Overview

This codebase follows **Google Style Guides** for TypeScript, Python, and HTML/CSS, documented in `conductor/code_styleguides/`. The codebase has a dual-stack architecture with a React 19/Vite frontend and FastAPI/Python backend.

## Language: TypeScript/React (Client)

### File Naming & Structure

**Files:**
- **Components**: `PascalCase.tsx` (e.g., `CourseCard.tsx`, `LearningPage.tsx`)
- **Hooks**: `camelCase.ts` with `use` prefix (e.g., `useTypewriter.ts`, `useLearningMutations.ts`)
- **Tests**: Co-located with source, suffix `.test.ts` or `.test.tsx` (e.g., `CourseCard.test.tsx`)
- **Utils/Lib**: `camelCase.ts` (e.g., `learningApi.ts`, `utils.ts`)
- **Styles**: Tailwind CSS via `cn()` utility, no separate CSS files for components

**Path Aliases:**
- `@/` maps to `client/src/` (configured in `vite.config.ts` and `tsconfig.app.json`)
- Example: `import { CourseCard } from '@/features/learning/CourseCard'`

### Naming Conventions

**Google TypeScript Style Guide (enforced):**
- **Variables**: `lowerCamelCase` - `const displayText = ''`
- **Functions**: `lowerCamelCase` - `function formatDate() {}`
- **Components**: `UpperCamelCase` - `export function CourseCard() {}`
- **Types/Interfaces**: `UpperCamelCase` - `interface CourseCardProps {}`
- **Constants**: `CONSTANT_CASE` for module-level constants
- **Hooks**: Must start with `use` - `useTypewriter()`, `useLearningMutations()`
- **No default exports** - Use named exports only: `export function CourseCard() {}`

**Forbidden:**
- `var` keyword - Use `const` by default, `let` only when reassignment needed
- Default exports - Always use named exports
- `#private` fields - Use TypeScript `private` modifier
- `_` prefix/suffix for private members
- `any` type - Prefer `unknown` or specific types

### Code Style

**TypeScript Configuration (`client/tsconfig.app.json`):**
- Strict mode enabled: `"strict": true`
- Unused locals/parameters are errors: `"noUnusedLocals": true`, `"noUnusedParameters": true`
- Module: ESNext with bundler resolution
- JSX: `react-jsx` (no React import needed)
- Path mapping: `"@/*": ["./src/*"]`

**Formatting:**
- **Single quotes** for strings
- **Explicit semicolons** required
- **2-space indentation** for HTML/CSS, follows file type conventions
- **Template literals** for interpolation: `` `Hello ${name}` ``

**Linting (`client/eslint.config.js`):**
- ESLint with TypeScript support (`typescript-eslint`)
- React Hooks rules (`eslint-plugin-react-hooks`)
- React Refresh validation (`eslint-plugin-react-refresh`)
- Command: `npm run lint` (in `client/` directory)

### Import Organization

**Order (enforced by Google Style):**
```typescript
// 1. Standard library imports
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';

// 2. Third-party imports
import { motion } from 'framer-motion';
import { renderHook } from '@testing-library/react';

// 3. Local application imports (using @ alias)
import { CourseCard } from '@/features/learning/CourseCard';
import type { LearningSessionSummary } from '@/types/learning';
import { cn } from '@/lib/utils';

// 4. Relative imports (if @ alias not applicable)
import './index.css';
```

**Type-only imports:**
```typescript
import type { Session } from '@/types/api';
```

### Function Design

**Arrow vs Function Declaration:**
- Named functions: Prefer function declarations
- Callbacks/anonymous: Use arrow functions

```typescript
// Good - named function
export function CourseCard({ session }: CourseCardProps) {
  // ...
}

// Good - arrow function for callback
const handleClick = (e: React.MouseEvent) => {
  // ...
};

// Good - short arrow for simple cases
const items = topics.map((t) => t.title);
```

**Parameters:**
- Use destructuring for props
- Optional params with `?` preferred over `| undefined`

```typescript
interface CourseCardProps {
  session: LearningSessionSummary;
  onResume: (sessionId: string) => void;
  onViewRevision?: (revisionId: string) => void;  // Optional with ?
}
```

### Error Handling

**API Error Pattern (`client/src/lib/learningApi.ts`):**
```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Request Failed:', error.config?.url, error.response?.data || error.message);
    return Promise.reject(error);
  }
);
```

**Component Error Handling:**
- Log errors with context (URL, response data)
- Reject promises to let calling components handle UI states
- Never use empty catch blocks: `catch(e) {}` is forbidden

### Type System

**Array Types:**
- `T[]` for simple types: `const items: string[] = []`
- `Array<T>` for unions: `Array<string | number>`

**Avoid:**
- `{}` type - Use `Record<string, unknown>` or `object`
- Type assertions (`as`) - Only when necessary with justification
- Non-null assertions (`!`) - Avoid

**Interface/Type Pattern:**
```typescript
export interface CourseCardProps {
  session: LearningSessionSummary;
  onResume: (sessionId: string) => void;
}
```

### React Patterns

**Component Structure:**
```typescript
// File header (MANDATORY for all files)
// CourseCard.tsx
// Card component displaying a single learning course

// Description block
// Renders a course summary card for the dashboard with two visual states:
// - In-progress: Shows progress bar, "Resume Course" button
// - Completed: Shows green checkmark, revision buttons

// @see: client/src/types/learning.ts
// @note: onRevise accepts a mode param

import { motion } from 'framer-motion';
import type { LearningSessionSummary } from '@/types/learning';

export interface CourseCardProps {
  session: LearningSessionSummary;
  onResume: (sessionId: string) => void;
}

export function CourseCard({ session, onResume }: CourseCardProps) {
  // Implementation
}
```

**Styled Components with Tailwind:**
```typescript
import { cn } from '@/lib/utils';

// Use cn() for conditional classes
className={cn(
  'rounded-xl border border-white/10 p-5',
  'bg-card/80 backdrop-blur-sm',
  isActive && 'ring-2 ring-primary',
  isDisabled && 'opacity-50 cursor-not-allowed'
)}
```

---

## Language: Python (Server)

### File Naming & Structure

**Files:**
- **Modules**: `snake_case.py` (e.g., `course_orchestrator.py`, `learning_persistence.py`)
- **Tests**: `test_*.py` in `server/tests/` directory (e.g., `test_course_orchestrator.py`)
- **Schemas**: Grouped by feature (e.g., `learning.py` contains all learning schemas)

### Naming Conventions

**Google Python Style Guide (enforced):**
- **Modules**: `snake_case` - `course_orchestrator.py`
- **Functions**: `snake_case` - `def generate_course():`
- **Variables**: `snake_case` - `session_id = '...'`
- **Classes**: `PascalCase` - `class CourseOrchestrator:`
- **Constants**: `ALL_CAPS_WITH_UNDERSCORES` - `MAX_RETRY_COUNT = 3`
- **Internal**: Single leading underscore `_internal_var`

### Code Style

**Line Length:**
- Maximum **80 characters** per line
- Break lines at logical points

**Indentation:**
- **4 spaces** per level
- Never use tabs

**Blank Lines:**
- Two blank lines between top-level definitions (classes, functions)
- One blank line between method definitions

**Import Organization:**
```python
# 1. Standard library
import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

# 2. Third-party
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

# 3. Local application (server.*)
from server.agents import generator_agent, planner_agent
from server.database.learning_persistence import learning_manager
from server.schemas.learning import CourseOutline, NodeStatus
```

### Docstrings

**Format (Google Style):**
```python
def generate_course(self, query: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    """Generate a complete learning course from user query.

    Args:
        query: The user's learning request/topic.
        user_id: Optional user identifier for tracking.

    Returns:
        Dictionary containing session, nodes, and metrics.

    Raises:
        ValueError: If query is empty or invalid.
    """
```

### Type Hints

**Required for public APIs:**
```python
from typing import Optional, List

def get_session(self, session_id: str) -> Optional[LearningSession]:
    """Retrieve session by ID."""
    ...

def create_nodes(self, nodes: List[ConceptNodeCreate]) -> List[ConceptNode]:
    """Create multiple concept nodes."""
    ...
```

### Error Handling

**Pattern (FastAPI routers):**
```python
from fastapi import HTTPException, status

@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    try:
        result = await learning_manager.get_session(session_id)
        if not result:
            raise HTTPException(status_code=404, detail="Session not found")
        return result
    except HTTPException:
        raise  # Re-raise FastAPI exceptions as-is
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
```

**Logging:**
```python
import logging

logger = logging.getLogger(__name__)

# Usage
logger.info("Course generated", extra={"session_id": session_id})
logger.error("Generation failed", exc_info=True)
```

### Pydantic Schemas

**Pattern:**
```python
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum

class NodeStatus(str, Enum):
    LOCKED = "LOCKED"
    VIEWING_EXPLANATION = "VIEWING_EXPLANATION"
    IN_QUIZ = "IN_QUIZ"
    COMPLETED = "COMPLETED"

class ConceptNodeCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    learning_session_id: str
    sequence_index: int = Field(ge=0)
    title: str = Field(min_length=1, max_length=200)
    content_markdown: str
    status: NodeStatus = NodeStatus.LOCKED
```

**Validation Rules:**
- Use `Field()` for constraints (min_length, ge, le)
- `ConfigDict(from_attributes=True)` for ORM compatibility
- Enums for status fields

### Main Function Pattern

**Executable files must have main():**
```python
def main() -> None:
    """Entry point for CLI execution."""
    parser = argparse.ArgumentParser()
    # ...

if __name__ == "__main__":
    main()
```

---

## HTML/CSS Conventions

### Tailwind CSS Usage

**Primary styling method** - Tailwind CSS v4 with custom utility `cn()`:

```tsx
import { cn } from '@/lib/utils';

// Conditional classes with cn()
<div className={cn(
  'rounded-xl border border-white/10 p-5',
  'bg-card/80 backdrop-blur-sm',
  'flex flex-col gap-3',
  isActive && 'ring-2 ring-primary',
  isDisabled && 'opacity-50'
)} />
```

### Class Naming

**When custom classes needed (rare):**
- Use kebab-case: `.course-card`, `.progress-bar-fill`
- Meaningful names: `.revision-history-list` not `.rhl`
- Avoid ID selectors for styling

### CSS Properties (if writing raw CSS)

**Google CSS Style:**
- Alphabetize declarations within rules
- Use shorthand properties
- Omit units for 0 values: `margin: 0;` not `margin: 0px;`
- Leading 0 for decimals: `0.8em` not `.8em`
- 3-char hex when possible: `#fff` not `#ffffff`

---

## File Headers (MANDATORY)

**All source files must have header comments:**

```typescript
// CourseCard.tsx
// Card component displaying a single learning course

// Renders a course summary card with progress and actions.
// Supports in-progress and completed states with different actions.

// @see: client/src/types/learning.ts
// @note: onRevise accepts mode param ('full_review' | 'quiz_only')
```

```python
"""
=============================================================================
FILE: course_orchestrator.py
=============================================================================

PURPOSE:
Coordinates course generation using Scatter-Gather pattern.

KEY COMPONENTS:
- CourseOrchestrator: Main orchestrator class
- generate_course(): Entry point for course generation

@see: server/agents/planner_agent.py
@note: Partial failures handled via SkeletonCard creation
"""
```

---

## Comment Style

**When to Comment:**
- Complex business logic
- Non-obvious workarounds
- Performance considerations
- API contract notes

**JSDoc/TSDoc:**
- Use for public functions and components
- Don't repeat type info (TypeScript already provides it)
- Add value beyond code:

```typescript
// BAD - redundant
/** Returns the session ID (string) */
function getSessionId(): string { }

// GOOD - adds context
/** Returns stable session ID for analytics correlation.
 *  Format: UUID v4 without dashes.
 */
function getSessionId(): string { }
```

---

## Key Principles Summary

| Aspect | TypeScript/React | Python |
|--------|------------------|---------|
| Naming | `UpperCamelCase` components, `lowerCamelCase` functions | `snake_case` functions, `PascalCase` classes |
| Exports | Named only, no default | Named only |
| Line length | ~100 soft limit | 80 characters hard limit |
| Indentation | 2 spaces | 4 spaces |
| Quotes | Single for code, double for HTML attrs | Consistent single or double |
| Type safety | Strict mode, no `any` | Type hints for public APIs |
| Error handling | Reject promises, log context | Try/except → log → HTTPException |
| Documentation | File headers + JSDoc for public APIs | Docstrings with Args/Returns/Raises |

---

*Convention analysis: 2026-02-16*
