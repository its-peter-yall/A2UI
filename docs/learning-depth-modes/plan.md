# Learning Depth Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto/lite/full depth modes so course generation scales topic count (lite 3–10, full 10–30) via dropdown default auto, cheap LLM router, hard bounds, and persisted mode fields.

**Architecture:** Approach A — no graph topology change. Client sends `mode`; router resolves auto→lite|full via `depth_router` service (fail→lite); `CourseState` carries `mode` + `resolved_mode`; planner injects LITE/FULL template into base system prompt, validates topic count, replans once then raises → HTTP 422; session row stores both fields.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic v2, Instructor, SQLite (stdlib), LangGraph, React 19, TypeScript, Vitest, stdlib unittest.

---

## File Map

| File | Responsibility |
|------|----------------|
| `server/schemas/learning.py` | `LearningDepthMode` / `ResolvedDepthMode` types; `CourseOutline` min 3; `validate_topic_count_for_mode`; session response fields |
| `server/database/learning_persistence.py` | `mode` + `resolved_mode` columns, migration, create/get session |
| `server/services/depth_router.py` | Cheap classify `auto` → `lite`\|`full`; fail → lite |
| `server/utils/instructor_client.py` | `depth_router` role in `MODEL_CONFIGS` |
| `server/agents/planner.py` | `LITE_TEMPLATE` / `FULL_TEMPLATE`; `plan(mode=)`; replan once; bounds error |
| `server/graph/state.py` | `mode`, `resolved_mode` on `CourseState` |
| `server/graph/nodes.py` | `planner_node` passes mode; persists both fields |
| `server/routers/learning.py` | Request `mode`; resolve before graph; 422 on bounds fail |
| `client/src/types/learning.ts` | Mode types; request/session fields |
| `client/src/lib/learningApi.ts` | Pass-through `mode` (already posts full body) |
| `client/src/features/learning/TopicInput.tsx` | Dropdown Auto/Lite/Full default auto |
| `server/tests/test_depth_mode_schema.py` | Schema + bounds helper tests |
| `server/tests/test_depth_mode_persistence.py` | DB round-trip |
| `server/tests/test_depth_router.py` | Router classify + fail→lite |
| `server/tests/test_planner_mode.py` | Templates, replan, bounds |
| `server/tests/test_learning_graph_router.py` | Generate with mode API tests |

---

## Task 1: Schema Types, CourseOutline Min 3, Bounds Helper

**Files:**
- Modify: `server/schemas/learning.py` (after `FailedStep`; `CourseOutline`; `LearningSessionResponse`)
- Create: `server/tests/test_depth_mode_schema.py`

- [ ] **Step 1: Write failing schema tests**

Create `server/tests/test_depth_mode_schema.py`:

```python
"""
============================================================================
FILE: test_depth_mode_schema.py
LOCATION: server/tests/test_depth_mode_schema.py
============================================================================
PURPOSE:
    Contract tests for depth mode types, CourseOutline min topics,
    and validate_topic_count_for_mode bounds.
ROLE IN PROJECT:
    Locks learning depth mode API/schema contracts before wiring.
USAGE:
    python -m unittest server.tests.test_depth_mode_schema -v
============================================================================
"""
from __future__ import annotations

import unittest

from server.schemas.learning import (
    CourseOutline,
    LearningSessionResponse,
    TopicNode,
    validate_topic_count_for_mode,
)


def _topic(index: int) -> TopicNode:
    return TopicNode(
        index=index,
        title=f"Topic {index}",
        summary_for_context=f"Summary {index}",
        key_terms=["term-a", "term-b"],
        complexity="Basic",
        quiz_count=1,
    )


def _outline(n: int) -> CourseOutline:
    return CourseOutline(
        course_title="Test",
        topics=[_topic(i) for i in range(n)],
    )


class DepthModeSchemaTests(unittest.TestCase):
    def test_course_outline_allows_three_topics(self) -> None:
        outline = _outline(3)
        self.assertEqual(len(outline.topics), 3)

    def test_course_outline_rejects_two_topics(self) -> None:
        with self.assertRaises(Exception):
            _outline(2)

    def test_lite_bounds_accept_3_and_10(self) -> None:
        self.assertTrue(validate_topic_count_for_mode(_outline(3), "lite"))
        self.assertTrue(validate_topic_count_for_mode(_outline(10), "lite"))

    def test_full_bounds_accept_10_and_30(self) -> None:
        self.assertTrue(validate_topic_count_for_mode(_outline(10), "full"))
        self.assertTrue(validate_topic_count_for_mode(_outline(30), "full"))

    def test_lite_rejects_2_and_11(self) -> None:
        # 2 topics cannot construct CourseOutline; use raw count helper path
        self.assertFalse(
            validate_topic_count_for_mode(_outline(3), "lite") is False
        )
        self.assertFalse(validate_topic_count_for_mode(_outline(11), "lite"))

    def test_full_rejects_9_and_31(self) -> None:
        self.assertFalse(validate_topic_count_for_mode(_outline(9), "full"))
        # 31 topics: construct via model_construct to skip max if any
        outline = CourseOutline.model_construct(
            course_title="T",
            topics=[_topic(i) for i in range(31)],
        )
        self.assertFalse(validate_topic_count_for_mode(outline, "full"))

    def test_boundary_10_valid_both_modes(self) -> None:
        outline = _outline(10)
        self.assertTrue(validate_topic_count_for_mode(outline, "lite"))
        self.assertTrue(validate_topic_count_for_mode(outline, "full"))

    def test_session_response_accepts_mode_fields(self) -> None:
        session = LearningSessionResponse(
            id="s1",
            query="q",
            course_title="c",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
            mode="auto",
            resolved_mode="lite",
        )
        self.assertEqual(session.mode, "auto")
        self.assertEqual(session.resolved_mode, "lite")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test, expect FAIL**

Run (workdir `D:\Peter\A2UI\server`):

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_depth_mode_schema -v
```

Expected: `ImportError: cannot import name 'validate_topic_count_for_mode'` (or CourseOutline rejects 3 topics).

- [ ] **Step 3: Implement schema changes**

In `server/schemas/learning.py`, after imports / near other Literal aliases (after `FailedStep` is fine), add:

```python
LearningDepthMode = Literal["auto", "lite", "full"]
ResolvedDepthMode = Literal["lite", "full"]

MODE_TOPIC_BOUNDS: dict[str, tuple[int, int]] = {
    "lite": (3, 10),
    "full": (10, 30),
}

MAX_COURSE_TOPICS = 30


def validate_topic_count_for_mode(
    outline: "CourseOutline",
    mode: ResolvedDepthMode,
) -> bool:
    """Return True if outline.topics length is within mode bounds.

    Args:
        outline: Generated course outline.
        mode: Resolved depth mode (lite or full).

    Returns:
        True when min <= len(topics) <= max for mode.
    """
    bounds = MODE_TOPIC_BOUNDS.get(mode)
    if bounds is None:
        return False
    min_topics, max_topics = bounds
    count = len(outline.topics)
    return min_topics <= count <= max_topics
```

Update `CourseOutline` (replace min_length=5 and validator):

```python
class CourseOutline(BaseModel):
    """Planner output model describing the course outline."""

    model_config = ConfigDict(from_attributes=True)

    course_title: str = Field(..., description="Title of the course", min_length=1)
    topics: List[TopicNode] = Field(
        ...,
        description=(
            "Ordered list of topic nodes (minimum 3; mode bounds "
            "enforced in planner)"
        ),
        min_length=3,
        max_length=MAX_COURSE_TOPICS,
    )

    @field_validator("topics")
    @classmethod
    def validate_topics(cls, topics: List[TopicNode]) -> List[TopicNode]:
        if len(topics) < 3:
            raise ValueError("CourseOutline requires at least 3 topics")
        if len(topics) > MAX_COURSE_TOPICS:
            raise ValueError(
                f"CourseOutline supports at most {MAX_COURSE_TOPICS} topics"
            )
        for i, topic in enumerate(topics):
            if topic.index != i:
                raise ValueError(
                    f"Topic at position {i} has index {topic.index}, "
                    f"expected {i}. Indices must be contiguous and "
                    "match list order."
                )
        return topics
```

Extend `LearningSessionResponse`:

```python
class LearningSessionResponse(ResponseBase, TimestampMixin, LearningSessionBase):
    """Response schema for learning sessions."""

    total_nodes: int = Field(default=0, description="Total nodes in the session")
    completed_nodes: int = Field(default=0, description="Number of completed nodes")
    last_active_node_id: Optional[str] = Field(
        default=None,
        description="ID of the last active node for resume",
    )
    mode: Optional[LearningDepthMode] = Field(
        default=None,
        description="User-selected depth mode (auto|lite|full)",
    )
    resolved_mode: Optional[ResolvedDepthMode] = Field(
        default=None,
        description="Effective depth mode after routing (lite|full)",
    )
```

Fix test `test_lite_rejects_2_and_11` — simplify to only 11:

```python
    def test_lite_rejects_11(self) -> None:
        self.assertFalse(validate_topic_count_for_mode(_outline(11), "lite"))
```

- [ ] **Step 4: Run test, expect PASS**

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_depth_mode_schema -v
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add server/schemas/learning.py server/tests/test_depth_mode_schema.py
git commit -m "feat(schema): depth mode types, CourseOutline min 3, bounds helper"
```

---

## Task 2: DB Migration + Session Persistence

**Files:**
- Modify: `server/database/learning_persistence.py`
  - CREATE TABLE `learning_sessions` (~86–93)
  - `create_learning_session` (~260–291)
  - `get_learning_session` SELECT + return (~293–329)
  - `_ensure_session_progress_columns` (~3008–3031)
- Create: `server/tests/test_depth_mode_persistence.py`

- [ ] **Step 1: Write failing persistence tests**

Create `server/tests/test_depth_mode_persistence.py`:

```python
"""
============================================================================
FILE: test_depth_mode_persistence.py
LOCATION: server/tests/test_depth_mode_persistence.py
============================================================================
PURPOSE:
    Verifies learning_sessions.mode and resolved_mode round-trip.
USAGE:
    python -m unittest server.tests.test_depth_mode_persistence -v
============================================================================
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from server.database.learning_persistence import LearningManager


class DepthModePersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.manager = LearningManager(db_path=Path(self.tmp.name) / "t.db")
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_create_session_persists_mode_fields(self) -> None:
        session = self.manager.create_learning_session(
            query="Placebo Effect",
            course_title="Placebo",
            mode="auto",
            resolved_mode="lite",
        )
        self.assertEqual(session["mode"], "auto")
        self.assertEqual(session["resolved_mode"], "lite")
        loaded = self.manager.get_learning_session(session["id"])
        self.assertIsNotNone(loaded)
        assert loaded is not None
        self.assertEqual(loaded["mode"], "auto")
        self.assertEqual(loaded["resolved_mode"], "lite")

    def test_create_session_defaults_mode_auto(self) -> None:
        session = self.manager.create_learning_session(
            query="q",
            course_title="c",
        )
        self.assertEqual(session["mode"], "auto")
        self.assertIsNone(session["resolved_mode"])

    def test_migration_adds_columns_on_existing_db(self) -> None:
        # Re-init on same path must be idempotent
        self.manager.init_learning_tables()
        session = self.manager.create_learning_session(
            query="q",
            course_title="c",
            mode="full",
            resolved_mode="full",
        )
        loaded = self.manager.get_learning_session(session["id"])
        assert loaded is not None
        self.assertEqual(loaded["mode"], "full")
        self.assertEqual(loaded["resolved_mode"], "full")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test, expect FAIL**

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_depth_mode_persistence -v
```

Expected: `TypeError: create_learning_session() got an unexpected keyword argument 'mode'`

- [ ] **Step 3: Add columns to CREATE TABLE**

In `init_learning_tables` CREATE TABLE `learning_sessions`, after `course_title TEXT NOT NULL,` add:

```sql
                    mode TEXT NOT NULL DEFAULT 'auto',
                    resolved_mode TEXT,
```

- [ ] **Step 4: Extend `_ensure_session_progress_columns`**

At end of `_ensure_session_progress_columns` (after `last_active_node_id` block):

```python
        if "mode" not in existing_columns:
            cursor.execute(
                "ALTER TABLE learning_sessions "
                "ADD COLUMN mode TEXT NOT NULL DEFAULT 'auto'"
            )
        if "resolved_mode" not in existing_columns:
            cursor.execute(
                "ALTER TABLE learning_sessions "
                "ADD COLUMN resolved_mode TEXT"
            )
```

- [ ] **Step 5: Update `create_learning_session`**

```python
    def create_learning_session(
        self,
        query: str,
        course_title: str,
        user_id: Optional[str] = None,
        mode: str = "auto",
        resolved_mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        conn = self._get_connection()
        try:
            session_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO learning_sessions (
                    id, user_id, query, course_title,
                    mode, resolved_mode, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    user_id,
                    query,
                    course_title,
                    mode,
                    resolved_mode,
                    now,
                    now,
                ),
            )
            conn.commit()
            logger.info(f"Created learning session: {session_id}")
            return {
                "id": session_id,
                "user_id": user_id,
                "query": query,
                "course_title": course_title,
                "mode": mode,
                "resolved_mode": resolved_mode,
                "created_at": now,
                "updated_at": now,
                "total_nodes": 0,
                "completed_nodes": 0,
            }
        except sqlite3.Error as e:
            logger.error(f"Error creating learning session: {e}")
            raise
        finally:
            conn.close()
```

- [ ] **Step 6: Update `get_learning_session` SELECT + dict**

Add `ls.mode, ls.resolved_mode` to SELECT list; add to return dict:

```python
                "mode": row["mode"] if "mode" in row.keys() else "auto",
                "resolved_mode": (
                    row["resolved_mode"]
                    if "resolved_mode" in row.keys()
                    else None
                ),
```

Prefer simpler after migration always present:

```python
                "mode": row["mode"],
                "resolved_mode": row["resolved_mode"],
```

- [ ] **Step 7: Run tests, expect PASS**

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_depth_mode_persistence -v
```

Expected: `OK`

- [ ] **Step 8: Commit**

```bash
git add server/database/learning_persistence.py server/tests/test_depth_mode_persistence.py
git commit -m "feat(db): persist learning session mode and resolved_mode"
```

---

## Task 3: Depth Router Service + MODEL_CONFIGS Role

**Files:**
- Modify: `server/utils/instructor_client.py` (`MODEL_CONFIGS`)
- Create: `server/services/depth_router.py`
- Create: `server/tests/test_depth_router.py`

- [ ] **Step 1: Write failing depth router tests**

Create `server/tests/test_depth_router.py`:

```python
"""
============================================================================
FILE: test_depth_router.py
LOCATION: server/tests/test_depth_router.py
============================================================================
PURPOSE:
    Unit tests for depth mode resolution and classify fallback.
USAGE:
    python -m unittest server.tests.test_depth_router -v
============================================================================
"""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from server.schemas.llm import LLMContext
from server.services.depth_router import (
    DepthRouteResult,
    classify_depth,
    resolve_depth_mode,
)


class DepthRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.llm = LLMContext(api_key="k", model="test/model")

    async def test_explicit_lite_skips_classify(self) -> None:
        with patch(
            "server.services.depth_router.classify_depth",
            new_callable=AsyncMock,
        ) as mock_classify:
            result = await resolve_depth_mode(
                query="Placebo Effect",
                mode="lite",
                llm_context=self.llm,
            )
            self.assertEqual(result, "lite")
            mock_classify.assert_not_awaited()

    async def test_explicit_full_skips_classify(self) -> None:
        with patch(
            "server.services.depth_router.classify_depth",
            new_callable=AsyncMock,
        ) as mock_classify:
            result = await resolve_depth_mode(
                query="ML from scratch",
                mode="full",
                llm_context=self.llm,
            )
            self.assertEqual(result, "full")
            mock_classify.assert_not_awaited()

    async def test_auto_uses_classify(self) -> None:
        with patch(
            "server.services.depth_router.classify_depth",
            new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.return_value = DepthRouteResult(
                mode="full",
                reason="multi-week domain",
            )
            result = await resolve_depth_mode(
                query="Machine learning from scratch",
                mode="auto",
                llm_context=self.llm,
            )
            self.assertEqual(result, "full")
            mock_classify.assert_awaited_once()

    async def test_auto_classify_failure_falls_back_lite(self) -> None:
        with patch(
            "server.services.depth_router.classify_depth",
            new_callable=AsyncMock,
        ) as mock_classify:
            mock_classify.side_effect = RuntimeError("timeout")
            result = await resolve_depth_mode(
                query="anything",
                mode="auto",
                llm_context=self.llm,
            )
            self.assertEqual(result, "lite")

    async def test_classify_depth_returns_structured_mode(self) -> None:
        with patch(
            "server.services.depth_router.instructor_client.create_structured",
            new_callable=AsyncMock,
        ) as mock_create:
            mock_create.return_value = DepthRouteResult(
                mode="lite",
                reason="single concept",
            )
            result = await classify_depth(
                query="Placebo Effect",
                llm_context=self.llm,
            )
            self.assertEqual(result.mode, "lite")
            mock_create.assert_awaited_once()
            kwargs = mock_create.call_args.kwargs
            self.assertEqual(kwargs["role"], "depth_router")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test, expect FAIL**

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_depth_router -v
```

Expected: `ModuleNotFoundError: No module named 'server.services.depth_router'`

- [ ] **Step 3: Add MODEL_CONFIGS role**

In `server/utils/instructor_client.py` `MODEL_CONFIGS`, add:

```python
    "depth_router": {
        "temperature": 0.0,
        "max_tokens": 256,
    },
```

- [ ] **Step 4: Implement `server/services/depth_router.py`**

```python
"""
============================================================================
FILE: depth_router.py
LOCATION: server/services/depth_router.py
============================================================================
PURPOSE:
    Cheap LLM classify of learning query depth into lite or full mode.
ROLE IN PROJECT:
    Resolves user mode=auto before planner runs; token-saving fallback
    to lite on any classify failure.
KEY COMPONENTS:
    - DepthRouteResult: Structured classify output
    - classify_depth: Instructor call with depth_router role
    - resolve_depth_mode: Explicit pass-through or auto classify
DEPENDENCIES:
    - External: pydantic
    - Internal: server.utils.instructor_client, server.schemas.llm
USAGE:
    resolved = await resolve_depth_mode(query, mode, llm_context)
============================================================================
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from pydantic import BaseModel, Field

from server.schemas.llm import LLMContext
from server.utils.instructor_client import instructor_client

logger = logging.getLogger(__name__)

DEPTH_ROUTER_SYSTEM_PROMPT = """You classify learning queries for curriculum length only.

Return mode "lite" or "full" plus a short reason.

lite cues:
- single concept, trivia, short explainer
- named effect, method, or phenomenon
- can be taught thoroughly in a short path

full cues:
- multi-system domain or field of study
- "from scratch", architecture, multi-week mastery
- many prerequisites and subdomains

Do not write a curriculum. Only classify depth.
"""


class DepthRouteResult(BaseModel):
    """Structured result of depth classification."""

    mode: Literal["lite", "full"] = Field(
        ...,
        description="Resolved depth mode for course planning",
    )
    reason: str = Field(
        ...,
        description="Short reason for the classification",
        min_length=1,
    )


async def classify_depth(
    query: str,
    llm_context: LLMContext,
) -> DepthRouteResult:
    """Classify query depth via structured instructor call.

    Args:
        query: User learning query.
        llm_context: Provider key and model from request.

    Returns:
        DepthRouteResult with mode lite|full.
    """
    user_message = (
        "Classify curriculum depth for this learning query:\n\n"
        f"{query}"
    )
    return await instructor_client.create_structured(
        role="depth_router",
        response_model=DepthRouteResult,
        messages=[{"role": "user", "content": user_message}],
        api_key=llm_context.api_key,
        model_override=llm_context.model,
        attribution_headers=llm_context.get_attribution_headers(),
        system_prompt=DEPTH_ROUTER_SYSTEM_PROMPT,
        provider=llm_context.provider,
        reasoning_params=llm_context.get_reasoning_params(),
        max_completion_tokens=llm_context.max_completion_tokens,
    )


async def resolve_depth_mode(
    query: str,
    mode: str,
    llm_context: Optional[LLMContext] = None,
) -> Literal["lite", "full"]:
    """Resolve user depth mode to lite or full.

    Args:
        query: Learning query (used only for auto).
        mode: User selection auto|lite|full.
        llm_context: Required when mode is auto.

    Returns:
        Resolved mode lite or full. Auto failures → lite.
    """
    if mode in ("lite", "full"):
        return mode  # type: ignore[return-value]

    if mode != "auto":
        logger.warning("Unknown depth mode %r; falling back to lite", mode)
        return "lite"

    if llm_context is None or not llm_context.api_key:
        logger.warning("Depth router missing llm_context; fallback lite")
        return "lite"

    try:
        result = await classify_depth(query, llm_context)
        if result.mode not in ("lite", "full"):
            logger.warning(
                "Depth router invalid mode %r; fallback lite",
                result.mode,
            )
            return "lite"
        logger.info(
            "Depth router classified mode=%s reason=%s",
            result.mode,
            result.reason,
        )
        return result.mode
    except Exception as exc:
        logger.warning(
            "Depth router failed (%s); fallback lite",
            exc,
        )
        return "lite"
```

- [ ] **Step 5: Run tests, expect PASS**

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_depth_router -v
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add server/services/depth_router.py server/utils/instructor_client.py server/tests/test_depth_router.py
git commit -m "feat(depth-router): classify auto mode with lite fallback"
```

---

## Task 4: Planner Templates + plan(mode=) + Replan Once

**Files:**
- Modify: `server/agents/planner.py`
- Create: `server/tests/test_planner_mode.py`

- [ ] **Step 1: Write failing planner mode tests**

Create `server/tests/test_planner_mode.py`:

```python
"""
============================================================================
FILE: test_planner_mode.py
LOCATION: server/tests/test_planner_mode.py
============================================================================
PURPOSE:
    Tests planner mode template injection, bounds validation, and replan.
USAGE:
    python -m unittest server.tests.test_planner_mode -v
============================================================================
"""
from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from server.agents.planner import (
    FULL_TEMPLATE,
    LITE_TEMPLATE,
    OutlineTopicCountError,
    PlannerAgent,
    build_planner_system_prompt,
)
from server.schemas.learning import CourseOutline, TopicNode
from server.schemas.llm import LLMContext


def _topics(n: int) -> list[TopicNode]:
    return [
        TopicNode(
            index=i,
            title=f"Topic {i}",
            summary_for_context=f"Sum {i}",
            key_terms=["a", "b"],
            complexity="Basic",
            quiz_count=1,
        )
        for i in range(n)
    ]


def _outline(n: int) -> CourseOutline:
    return CourseOutline(course_title="C", topics=_topics(n))


class PlannerModeTests(unittest.IsolatedAsyncioTestCase):
    def test_build_prompt_injects_lite_template(self) -> None:
        prompt = build_planner_system_prompt("lite")
        self.assertIn("LITE mode", prompt)
        self.assertIn("3 and 10", prompt)
        self.assertNotIn("FULL mode", prompt)

    def test_build_prompt_injects_full_template(self) -> None:
        prompt = build_planner_system_prompt("full")
        self.assertIn("FULL mode", prompt)
        self.assertIn("10 and 30", prompt)
        self.assertNotIn("LITE mode", prompt)

    def test_templates_are_non_empty(self) -> None:
        self.assertTrue(LITE_TEMPLATE.strip())
        self.assertTrue(FULL_TEMPLATE.strip())

    async def test_plan_accepts_valid_lite_outline(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.return_value = _outline(5)
            result = await agent.plan("Placebo", mode="lite", llm_context=llm)
            self.assertEqual(len(result.topics), 5)
            mock_gen.assert_awaited_once()

    async def test_plan_replans_once_then_succeeds(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = [_outline(15), _outline(6)]
            result = await agent.plan("x", mode="lite", llm_context=llm)
            self.assertEqual(len(result.topics), 6)
            self.assertEqual(mock_gen.await_count, 2)

    async def test_plan_raises_after_two_invalid(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = [_outline(15), _outline(12)]
            with self.assertRaises(OutlineTopicCountError):
                await agent.plan("x", mode="lite", llm_context=llm)
            self.assertEqual(mock_gen.await_count, 2)

    async def test_plan_full_rejects_too_few(self) -> None:
        agent = PlannerAgent()
        llm = LLMContext(api_key="k", model="m")
        with patch.object(
            agent, "generate", new_callable=AsyncMock
        ) as mock_gen:
            mock_gen.side_effect = [_outline(5), _outline(5)]
            with self.assertRaises(OutlineTopicCountError):
                await agent.plan("x", mode="full", llm_context=llm)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test, expect FAIL**

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_planner_mode -v
```

Expected: import errors for `build_planner_system_prompt` / templates / `OutlineTopicCountError`.

- [ ] **Step 3: Implement planner mode support**

In `server/agents/planner.py`:

1. Update imports:

```python
from typing import Literal, Optional

from server.schemas.learning import (
    CourseOutline,
    MODE_TOPIC_BOUNDS,
    validate_topic_count_for_mode,
)
```

2. Replace Adaptive Topic Scaling section in `PLANNER_SYSTEM_PROMPT` with Mode Constraints placeholder. Change the block starting at `4. **Adaptive Topic Scaling**` through the "when in doubt" paragraph to:

```
4. **Mode Constraints** (authoritative for topic count):
{mode_template}

5. **Summary for Context**: ...
```

Renumber subsequent items (Key Terms becomes 6, etc.) OR keep numbers and only replace adaptive scaling with:

```
4. **Mode Constraints** (authoritative for topic count — override any other count guidance):
{mode_template}
```

Also change Output Requirements line `topics: ... (minimum 5)` to:

```
- `topics`: An ordered list of TopicNode objects (count MUST follow Mode Constraints)
```

3. Add after the prompt constant:

```python
LITE_TEMPLATE = """
You are in LITE mode.
- Produce between 3 and 10 topics (inclusive).
- Prefer 3–7 for very small concepts; use up to 10 only if needed for clarity.
- Favor Basic/Intermediate complexity; Advanced only if essential.
- Prefer quiz_count 1–2.
- Goal: complete coverage of a narrow subject without over-expansion.
"""

FULL_TEMPLATE = """
You are in FULL mode.
- Produce between 10 and 30 topics (inclusive).
- Prefer atomic, granular topics for complete mastery.
- Use varied complexity (Basic → Intermediate → Advanced).
- Map quiz_count to complexity as in base rules.
- Goal: thorough near-expert path with no foundational gaps.
"""

MODE_TEMPLATES: dict[str, str] = {
    "lite": LITE_TEMPLATE.strip(),
    "full": FULL_TEMPLATE.strip(),
}


class OutlineTopicCountError(ValueError):
    """Raised when course outline topic count is outside mode bounds."""

    def __init__(
        self,
        mode: str,
        count: int,
        min_topics: int,
        max_topics: int,
    ) -> None:
        self.mode = mode
        self.count = count
        self.min_topics = min_topics
        self.max_topics = max_topics
        super().__init__(
            f"Course outline has {count} topics; {mode} mode requires "
            f"{min_topics}-{max_topics} topics"
        )


def build_planner_system_prompt(mode: Literal["lite", "full"]) -> str:
    """Return base planner prompt with mode template injected."""
    template = MODE_TEMPLATES[mode]
    return PLANNER_SYSTEM_PROMPT.format(mode_template=template)
```

**Critical:** Escape any existing `{` `}` in `PLANNER_SYSTEM_PROMPT` that are not the `mode_template` placeholder, OR inject via replace:

Prefer safer injection without `.format` on whole prompt:

```python
def build_planner_system_prompt(mode: Literal["lite", "full"]) -> str:
    """Return base planner prompt with mode template injected."""
    template = MODE_TEMPLATES[mode]
    marker = "{mode_template}"
    if marker not in PLANNER_SYSTEM_PROMPT:
        # Fallback: append mode section if marker missing during edit
        return (
            f"{PLANNER_SYSTEM_PROMPT}\n\n## Mode Constraints\n{template}"
        )
    return PLANNER_SYSTEM_PROMPT.replace(marker, template)
```

Insert in the Adaptive Topic Scaling area the literal string `{mode_template}` (or replace that whole subsection with Mode Constraints containing `{mode_template}`).

4. Update `PlannerAgent.system_prompt` property to still return base (tests use `build_planner_system_prompt`). Property can remain `PLANNER_SYSTEM_PROMPT` for compatibility, but `plan()` must not use unformatted prompt.

5. Replace `plan()` method:

```python
    async def plan(
        self,
        query: str,
        context: Optional[dict] = None,
        llm_context: Optional[LLMContext] = None,
        mode: Literal["lite", "full"] = "full",
    ) -> CourseOutline:
        """Generate CourseOutline for query under resolved depth mode.

        Args:
            query: User learning query.
            context: Optional prompt context.
            llm_context: OpenRouter/provider context.
            mode: Resolved depth mode (lite or full). Never auto.

        Returns:
            Valid CourseOutline within mode topic bounds.

        Raises:
            OutlineTopicCountError: After one replan still out of bounds.
            Exception: Upstream generation failures.
        """
        if mode not in MODE_TEMPLATES:
            raise ValueError(f"Invalid planner mode: {mode}")

        system_prompt = build_planner_system_prompt(mode)
        user_message = (
            "Create a structured learning path for the following topic:\n\n"
            f"{query}\n\n"
            f"Mode: {mode}. Follow Mode Constraints for topic count."
        )

        logger.info(
            "PlannerAgent generating curriculum for: %s (mode=%s)",
            query,
            mode,
        )

        outline = await self._generate_outline(
            system_prompt=system_prompt,
            user_message=user_message,
            context=context,
            llm_context=llm_context,
        )

        if validate_topic_count_for_mode(outline, mode):
            logger.info(
                "PlannerAgent created outline: '%s' with %s topics",
                outline.course_title,
                len(outline.topics),
            )
            return outline

        min_t, max_t = MODE_TOPIC_BOUNDS[mode]
        count = len(outline.topics)
        logger.warning(
            "Outline topic count %s out of bounds for %s (%s-%s); replan",
            count,
            mode,
            min_t,
            max_t,
        )
        replan_message = (
            f"{user_message}\n\n"
            f"STRICT MODE CONSTRAINTS: You previously produced {count} "
            f"topics. You MUST produce between {min_t} and {max_t} "
            f"topics inclusive for {mode} mode. No fewer, no more."
        )
        outline = await self._generate_outline(
            system_prompt=system_prompt,
            user_message=replan_message,
            context=context,
            llm_context=llm_context,
        )

        if validate_topic_count_for_mode(outline, mode):
            logger.info(
                "PlannerAgent replan ok: '%s' with %s topics",
                outline.course_title,
                len(outline.topics),
            )
            return outline

        final_count = len(outline.topics)
        raise OutlineTopicCountError(mode, final_count, min_t, max_t)

    async def _generate_outline(
        self,
        system_prompt: str,
        user_message: str,
        context: Optional[dict],
        llm_context: Optional[LLMContext],
    ) -> CourseOutline:
        """Generate outline using an explicit system prompt override."""
        # Temporarily monkey via generate kwargs path:
        # BaseAgent.generate uses self.system_prompt via _build_system_prompt.
        # Use generate with patched system_prompt property via context injection
        # is fragile. Prefer calling instructor through generate after
        # overriding _build_system_prompt for this call.
        original_build = self._build_system_prompt

        def _build_override(
            ctx: Optional[dict] = None,
        ) -> str:
            base = system_prompt
            if ctx:
                return f"{base}\n\n{self._format_context(ctx)}"
            return base

        self._build_system_prompt = _build_override  # type: ignore[method-assign]
        try:
            return await self.generate(
                response_model=CourseOutline,
                user_message=user_message,
                context=context,
                llm_context=llm_context,
            )
        finally:
            self._build_system_prompt = original_build  # type: ignore[method-assign]
```

(Alternative cleaner approach if preferred: add optional `system_prompt_override` to `BaseAgent.generate` — only if you keep change small. Override patch above is self-contained in planner.)

- [ ] **Step 4: Run tests, expect PASS**

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_planner_mode -v
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add server/agents/planner.py server/tests/test_planner_mode.py
git commit -m "feat(planner): inject lite/full templates, validate bounds, replan once"
```

---

## Task 5: CourseState + planner_node + Resolve in Generate Path

**Files:**
- Modify: `server/graph/state.py`
- Modify: `server/graph/nodes.py` (`planner_node`)
- Modify: `server/routers/learning.py` (`GenerateCourseRequest`, `_generate_course_with_graph`, `generate_course`)
- Modify: `server/tests/test_learning_graph_router.py`
- Possibly update: `server/tests/test_graph.py` mocks if they assert plan() kwargs

- [ ] **Step 1: Write failing API/generate tests**

Append to `server/tests/test_learning_graph_router.py` (or create methods on existing class):

```python
    @patch("server.routers.learning.learning_manager.get_session_nodes")
    @patch(
        "server.routers.learning.resolve_depth_mode",
        new_callable=AsyncMock,
    )
    def test_generate_default_mode_auto_resolves(
        self,
        mock_resolve: AsyncMock,
        mock_get_nodes: MagicMock,
    ) -> None:
        mock_resolve.return_value = "lite"
        result = _result()
        result["session"]["mode"] = "auto"
        result["session"]["resolved_mode"] = "lite"
        mock_get_nodes.return_value = result["nodes"]
        client = _client()
        graph = AsyncMock()
        graph.ainvoke.return_value = result
        client.app.state.course_graph = graph

        response = client.post(
            "/learning/generate",
            json={"query": "Placebo Effect"},
        )
        self.assertEqual(response.status_code, 201)
        mock_resolve.assert_awaited_once()
        self.assertEqual(mock_resolve.call_args.kwargs.get("mode") or mock_resolve.call_args[0][1], "auto")
        invoked_state = graph.ainvoke.call_args[0][0]
        self.assertEqual(invoked_state["mode"], "auto")
        self.assertEqual(invoked_state["resolved_mode"], "lite")
        body = response.json()
        self.assertEqual(body["mode"], "auto")
        self.assertEqual(body["resolved_mode"], "lite")

    @patch("server.routers.learning.learning_manager.get_session_nodes")
    @patch(
        "server.routers.learning.resolve_depth_mode",
        new_callable=AsyncMock,
    )
    def test_generate_explicit_full_mode(
        self,
        mock_resolve: AsyncMock,
        mock_get_nodes: MagicMock,
    ) -> None:
        mock_resolve.return_value = "full"
        result = _result()
        result["session"]["mode"] = "full"
        result["session"]["resolved_mode"] = "full"
        mock_get_nodes.return_value = result["nodes"]
        client = _client()
        graph = AsyncMock()
        graph.ainvoke.return_value = result
        client.app.state.course_graph = graph

        response = client.post(
            "/learning/generate",
            json={"query": "ML from scratch", "mode": "full"},
        )
        self.assertEqual(response.status_code, 201)
        mock_resolve.assert_awaited_once()
        body = response.json()
        self.assertEqual(body["mode"], "full")
        self.assertEqual(body["resolved_mode"], "full")

    def test_generate_invalid_mode_returns_422(self) -> None:
        client = _client()
        response = client.post(
            "/learning/generate",
            json={"query": "q", "mode": "turbo"},
        )
        self.assertEqual(response.status_code, 422)

    @patch("server.routers.learning.learning_manager.get_session_nodes")
    @patch(
        "server.routers.learning.resolve_depth_mode",
        new_callable=AsyncMock,
    )
    def test_generate_outline_bounds_error_returns_422(
        self,
        mock_resolve: AsyncMock,
        mock_get_nodes: MagicMock,
    ) -> None:
        from server.agents.planner import OutlineTopicCountError

        mock_resolve.return_value = "lite"
        client = _client()
        graph = AsyncMock()
        graph.ainvoke.side_effect = OutlineTopicCountError(
            "lite", 15, 3, 10
        )
        client.app.state.course_graph = graph

        response = client.post(
            "/learning/generate",
            json={"query": "q", "mode": "lite"},
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("topics", response.json()["detail"].lower())
```

Also add unit test for planner_node (in `test_graph.py` or new file) if existing tests mock `planner_agent.plan` — update mock to accept `mode=` and assert `create_learning_session` got mode kwargs.

- [ ] **Step 2: Run targeted tests, expect FAIL**

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_learning_graph_router -v
```

Expected: failures on mode fields / resolve not called.

- [ ] **Step 3: Update `CourseState`**

In `server/graph/state.py` add to `CourseState`:

```python
    mode: NotRequired[str]  # auto|lite|full
    resolved_mode: NotRequired[str]  # lite|full
```

- [ ] **Step 4: Update `planner_node`**

In `server/graph/nodes.py`:

```python
    resolved_mode = state.get("resolved_mode") or "lite"
    if resolved_mode not in ("lite", "full"):
        resolved_mode = "lite"
    user_mode = state.get("mode") or "auto"

    planner_start = time.perf_counter()
    outline: CourseOutline = await planner_agent.plan(
        state["query"],
        llm_context=llm_context,
        mode=resolved_mode,  # type: ignore[arg-type]
    )
    ...
    session = learning_manager.create_learning_session(
        query=state["query"],
        course_title=outline.course_title,
        user_id=state.get("user_id"),
        mode=user_mode,
        resolved_mode=resolved_mode,
    )
```

- [ ] **Step 5: Update router request + generate path**

`GenerateCourseRequest`:

```python
from typing import List, Literal, Optional

class GenerateCourseRequest(BaseModel):
    """Request schema for generating a learning course."""

    query: str = Field(..., description="Topic to learn about", min_length=1)
    user_id: Optional[str] = Field(default=None, description="Optional user ID")
    mode: Literal["auto", "lite", "full"] = Field(
        default="auto",
        description="Depth mode: auto routes; lite 3-10; full 10-30 topics",
    )
```

Imports:

```python
from server.services.depth_router import resolve_depth_mode
from server.agents.planner import OutlineTopicCountError
```

`_generate_course_with_graph`:

```python
async def _generate_course_with_graph(
    request_body: GenerateCourseRequest,
    request: Request,
    llm_context: LLMContext,
) -> dict:
    """Generate a learning course using LangGraph."""
    graph = get_graph(request.app.state)
    session_ref: dict[str, str] = {}
    resolved_mode = await resolve_depth_mode(
        query=request_body.query,
        mode=request_body.mode,
        llm_context=llm_context,
    )
    input_state = {
        "query": request_body.query,
        "user_id": request_body.user_id,
        "mode": request_body.mode,
        "resolved_mode": resolved_mode,
        "topic_results": [],
        "total_start_time": time.perf_counter(),
    }
    ...
```

`generate_course` exception handler:

```python
    try:
        result = await _generate_course_with_graph(...)
        ...
        return LearningSessionWithNodes(**session, nodes=nodes)
    except HTTPException:
        raise
    except OutlineTopicCountError as e:
        logger.warning("Outline bounds failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        ...
```

Note: if `OutlineTopicCountError` is raised inside `graph.ainvoke`, it surfaces as the task exception — the handler above catches it after await.

- [ ] **Step 6: Fix existing graph tests**

Any mock of `planner_agent.plan` must allow `mode=` kwarg. Any assertion of `create_learning_session` call should allow new kwargs or assert them.

Update `_result()` session dict in router tests to include optional mode fields so response validation passes when LearningSessionWithNodes requires them (fields are Optional — OK).

- [ ] **Step 7: Run tests, expect PASS**

```powershell
.\.venv\Scripts\python -m unittest server.tests.test_learning_graph_router server.tests.test_graph server.tests.test_planner_mode -v
```

Expected: `OK`

- [ ] **Step 8: Commit**

```bash
git add server/graph/state.py server/graph/nodes.py server/routers/learning.py server/tests/test_learning_graph_router.py server/tests/test_graph.py
git commit -m "feat(learning): wire depth mode resolve through graph and API"
```

---

## Task 6: Client Types + TopicInput Dropdown

**Files:**
- Modify: `client/src/types/learning.ts`
- Modify: `client/src/features/learning/TopicInput.tsx`
- Optional: `client/src/features/learning/TopicInput.test.tsx` if vitest patterns exist nearby

- [ ] **Step 1: Update types**

In `client/src/types/learning.ts` add near other type aliases:

```typescript
export type LearningDepthMode = 'auto' | 'lite' | 'full';
export type ResolvedDepthMode = 'lite' | 'full';
```

Update:

```typescript
export interface LearningSession {
	id: string;
	user_id: string | null;
	query: string;
	course_title: string;
	total_nodes: number;
	completed_nodes: number;
	last_active_node_id: string | null;
	created_at: string;
	updated_at: string | null;
	mode?: LearningDepthMode | null;
	resolved_mode?: ResolvedDepthMode | null;
}

export interface GenerateCourseRequest {
	query: string;
	user_id?: string;
	mode?: LearningDepthMode;
}
```

`generateCourse` already posts `data` body — no API change required beyond types.

- [ ] **Step 2: Update TopicInput**

Add state + dropdown left of Learn button:

```tsx
import type { GenerateCourseRequest, LearningDepthMode } from '@/types/learning';

// inside component:
const [mode, setMode] = useState<LearningDepthMode>('auto');
const modeId = useId();

// handleSubmit mutate:
generateMutation.mutate({
  query: query.trim(),
  user_id: userId,
  mode,
});
```

UI: place a `<select>` inside the form, absolutely positioned left of the Learn button (adjust input `pr-24` → `pr-40` or use flex layout). Minimal pattern:

```tsx
<form onSubmit={handleSubmit} className="relative" role="search">
  <label htmlFor={inputId} className="sr-only">
    Enter a topic to learn
  </label>
  <input
    id={inputId}
    ...
    className={cn(
      'w-full px-4 py-3 pr-44 text-lg rounded-lg border',
      ...
    )}
  />
  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
    <label htmlFor={modeId} className="sr-only">
      Learning depth mode
    </label>
    <select
      id={modeId}
      value={mode}
      onChange={(e) => setMode(e.target.value as LearningDepthMode)}
      disabled={isLoading || !hasApiKey}
      aria-label="Learning depth mode"
      className={cn(
        'h-8 rounded-md border bg-background px-2 text-sm',
        'text-foreground',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus:outline-none focus:ring-2 focus:ring-primary'
      )}
    >
      <option value="auto">Auto</option>
      <option value="lite">Lite</option>
      <option value="full">Full</option>
    </select>
    <button
      type={isLoading ? 'button' : 'submit'}
      ...
    >
      {isLoading ? 'Stop' : 'Learn'}
    </button>
  </div>
</form>
```

Named export only — keep `export function TopicInput`.

- [ ] **Step 3: Client unit test (if vitest co-located pattern)**

If no existing TopicInput test, manual verify is enough; optional vitest:

```tsx
// client/src/features/learning/TopicInput.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Mock router + query + generateCourse — follow nearest feature test patterns.
```

If `@testing-library/user-event` not installed, skip automated UI test; document manual checks in Task 8.

- [ ] **Step 4: Lint / typecheck**

```powershell
cd D:\Peter\A2UI\client; npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add client/src/types/learning.ts client/src/features/learning/TopicInput.tsx
git commit -m "feat(client): depth mode dropdown default auto on TopicInput"
```

---

## Task 7: Integration Hardening + Fixture Updates

**Files:**
- Any tests constructing `CourseOutline` with fewer than 3 topics (should be rare)
- Docstrings in planner mentioning "minimum 5"

- [ ] **Step 1: Grep for obsolete min-5 assumptions**

```powershell
rg -n "minimum 5|min_length=5|at least 5 topics" server client
```

Update remaining strings that claim hard min 5 for CourseOutline (soft docs only).

- [ ] **Step 2: Run full server suite**

```powershell
cd D:\Peter\A2UI\server; .\.venv\Scripts\python -m unittest
```

Expected: all green. Fix any regressions from CourseOutline min change or plan() signature.

- [ ] **Step 3: Client build**

```powershell
cd D:\Peter\A2UI\client; npm run build
```

- [ ] **Step 4: Commit fixes if any**

```bash
git add -u
git commit -m "test: align fixtures with depth mode bounds"
```

---

## Task 8: Manual Smoke Checklist

- [ ] **Step 1: Start stack**

```powershell
# server
cd D:\Peter\A2UI\server; .\.venv\Scripts\python -m uvicorn server.main:app --reload --port 8000
# client
cd D:\Peter\A2UI\client; npm run dev
```

- [ ] **Step 2: Manual cases**

| Case | Action | Expect |
|------|--------|--------|
| Default auto | Leave Auto, query "Placebo Effect" | Session mode=auto, resolved_mode lite or full; topic count in bounds |
| Explicit lite | Mode Lite, "Placebo Effect" | ≤10 nodes, mode=lite, resolved_mode=lite |
| Explicit full | Mode Full, "Machine learning from scratch" | ≥10 nodes, mode=full |
| Invalid mode API | POST mode=turbo | 422 |
| Existing flow | Generate multi-topic course | First 3 sync + background remainder still works |

- [ ] **Step 3: Git notes (optional)**

```bash
git notes add -m "Learning depth modes: auto/lite/full dropdown, depth_router, planner templates, hard bounds + replan, session.mode/resolved_mode"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|------------------|------|
| Dropdown Auto/Lite/Full, default auto | Task 6 |
| POST mode optional default auto | Task 5 |
| Auto cheap LLM classify | Task 3 |
| Router fail → lite | Task 3 |
| Base prompt + LITE/FULL inject | Task 4 |
| Hard bounds lite 3–10, full 10–30, 10 both OK | Task 1 + 4 |
| Out-of-bounds: replan once then 422 | Task 4 + 5 |
| Persist mode + resolved_mode | Task 2 + 5 |
| CourseState mode fields, no topology change | Task 5 |
| CourseOutline global min 3 | Task 1 |
| depth_router MODEL_CONFIGS | Task 3 |
| Client payload mode | Task 6 |
| Tests unit/API | Tasks 1–5, 7 |

### Placeholder scan

No TBD/TODO. All steps include concrete code or exact commands.

### Type/name consistency

| Name | Usage |
|------|--------|
| `LearningDepthMode` | `auto\|lite\|full` client + server Literal |
| `ResolvedDepthMode` | `lite\|full` |
| `mode` / `resolved_mode` | request, state, DB, response |
| `resolve_depth_mode` | service entry |
| `classify_depth` | instructor call |
| `DepthRouteResult` | structured classify |
| `validate_topic_count_for_mode` | schemas helper |
| `MODE_TOPIC_BOUNDS` | (3,10)/(10,30) |
| `OutlineTopicCountError` | planner → 422 |
| `build_planner_system_prompt` | inject templates |
| `LITE_TEMPLATE` / `FULL_TEMPLATE` | planner |
| `depth_router` | MODEL_CONFIGS role |

### Open risks

| Risk | Mitigation in plan |
|------|--------------------|
| PLANNER_SYSTEM_PROMPT braces break `.format` | Use `.replace("{mode_template}", ...)` |
| Existing tests assume min 5 topics | Task 7 grep + suite |
| Dirty local planner.py edits | Implementer must not mix unrelated prompt tweaks |
| Router latency on auto | low max_tokens, fail→lite |
| Legacy sessions null mode | DEFAULT 'auto', null resolved_mode OK |

---

## Execution Handoff

Plan complete and saved to:
- `docs/superpowers/plans/2026-07-17-learning-depth-modes.md`
- `docs/learning-depth-modes/plan.md` (MAW copy)

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — executing-plans skill, batch with checkpoints  

Which approach?
