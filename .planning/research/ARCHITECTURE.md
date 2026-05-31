# Architecture Research: Dynamic Quiz Generation Integration

**Domain:** Adaptive learning — multi-quiz generation with complexity-driven difficulty gradients
**Researched:** 2026-02-17
**Confidence:** HIGH

## System Overview

### Current Architecture (Before Changes)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         API Layer (FastAPI)                              │
│  POST /learning/generate  →  CourseOrchestrator                         │
├─────────────────────────────────────────────────────────────────────────┤
│                    Agent Layer (Scatter-Gather)                          │
│                                                                         │
│  ┌──────────────┐     SERIAL      ┌─────────────────────────────────┐  │
│  │ PlannerAgent  │ ──────────────→ │   CourseOrchestrator            │  │
│  │ (Gemini Pro)  │  CourseOutline  │   _generate_concept_unit()      │  │
│  │ → 5-7 Topics  │  (TopicNodes)   │   per topic (parallel scatter)  │  │
│  └──────────────┘                  │                                 │  │
│                                    │  ┌──────────┐  ┌──────────┐    │  │
│                                    │  │Generator │  │ Quizzer  │    │  │
│                                    │  │ Agent    │  │ Agent    │    │  │
│                                    │  │→ Markdown│  │→ 1 Quiz  │◄── BOTTLENECK
│                                    │  └──────────┘  └──────────┘    │  │
│                                    └─────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                     Persistence Layer (SQLAlchemy)                       │
│  ┌───────────────┐  ┌────────────┐  ┌──────────────────┐               │
│  │ concept_nodes │  │ quiz_data  │  │ learning_sessions │               │
│  │               │  │ (JSON)     │  │                  │               │
│  └───────────────┘  └────────────┘  └──────────────────┘               │
├─────────────────────────────────────────────────────────────────────────┤
│                        Frontend (React 19)                              │
│  ┌──────────────┐  ┌──────────┐  ┌────────────┐                       │
│  │ LearningPage │  │ConceptCard│  │ QuizModal  │                       │
│  │              │  │(QuizSet   │  │            │                       │
│  │              │  │ rendering │  │            │                       │
│  │              │  │ READY)    │  │            │                       │
│  └──────────────┘  └──────────┘  └────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### After Changes (Integration Points Highlighted)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         API Layer (no changes)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                    Agent Layer (Scatter-Gather)                          │
│                                                                         │
│  ┌──────────────────┐  SERIAL   ┌─────────────────────────────────────┐│
│  │ PlannerAgent      │ ────────→ │  CourseOrchestrator                 ││
│  │ (Gemini Pro)      │           │  _generate_concept_unit()           ││
│  │ → 5-7 Topics      │           │                                     ││
│  │ + complexity  ◄─── MODIFIED   │  Reads topic.quiz_count  ◄─── MOD  ││
│  │ + quiz_count  ◄─── MODIFIED   │  Passes to quizzer       ◄─── MOD  ││
│  └──────────────────┘            │  Stores QuizSet (not QuizCard) MOD  ││
│                                  │                                     ││
│                                  │  ┌──────────┐  ┌───────────────┐   ││
│                                  │  │Generator │  │ Quizzer Agent │   ││
│                                  │  │ (no chg) │  │ generate_     │   ││
│                                  │  │          │  │ quiz_set() ◄── MOD││
│                                  │  │          │  │ N quizzes     │   ││
│                                  │  │          │  │ + gradient ◄── NEW││
│                                  │  └──────────┘  └───────────────┘   ││
│                                  └─────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────┤
│              Persistence Layer (minimal changes — infra exists)         │
│  quiz_data already stores QuizSet JSON (format_version=1)              │
│  _check_multi_quiz_mastery() already exists                            │
│  check_mastery() already branches single vs multi                      │
├─────────────────────────────────────────────────────────────────────────┤
│                  Frontend (no changes — QuizSet UI exists)              │
│  ConceptCard.tsx already renders "Quiz X of Y"                         │
│  getVisibleQuiz() already handles QuizSet/QuizSetHidden                │
│  useNodeState.ts state machine already supports multi-quiz flow        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Current Responsibility | Change Required |
|-----------|----------------------|-----------------|
| `TopicNode` (schema) | Defines topic structure: index, title, summary, key_terms | **ADD** `complexity` + `quiz_count` fields |
| `PlannerAgent` | Generates 5-7 topic roadmap from user prompt | **MODIFY** system prompt to assign complexity/quiz_count |
| `QuizzerAgent` | Generates 1 QuizCard per topic | **MODIFY** to generate N QuizCards as QuizSet with difficulty gradient |
| `CourseOrchestrator` | Coordinates plan → scatter(generate+quiz) → gather | **MODIFY** to pass quiz_count to quizzer, store QuizSet |
| `LearningManager` | Persistence: create nodes, track progress, check mastery | **NO CHANGE** — already handles QuizSet storage + multi-quiz mastery |
| `ConceptCard` (frontend) | Renders topic card with quiz UI | **NO CHANGE** — already renders QuizSet with "Quiz X of Y" |
| `useNodeState` (frontend) | Manages state transitions (LOCKED → ... → COMPLETED) | **NO CHANGE** — state machine already supports multi-quiz |

## Integration Architecture

### What Exists (No Changes Needed)

The prior milestone (v1.0/v1.1) already built significant QuizSet infrastructure that this feature will leverage:

1. **Schema layer** (`server/schemas/learning.py`):
   - `QuizSet`: Container for 1-5 `QuizCard`s with `current_index` and `shuffle_seed`
   - `QuizSetHidden`: Conceals correct answers during `IN_QUIZ` state
   - `QuizCard`: Individual quiz with 4 options, difficulty field (easy/medium/hard)
   - Max 5 quizzes per set enforced by validator

2. **Persistence layer** (`server/database/learning_persistence.py`):
   - `create_concept_node()` accepts both `quiz: QuizCard` and `quiz_set: QuizSet` params
   - `quiz_data` table stores payload as JSON with `format_version` (0=legacy single, 1=QuizSet)
   - `_check_multi_quiz_mastery()` verifies all quiz indices have correct attempts
   - `check_mastery()` branches on single vs multi-quiz automatically
   - State machine: LOCKED → VIEWING_EXPLANATION → IN_QUIZ → SHOWING_FEEDBACK → COMPLETED

3. **Frontend** (`client/src/features/learning/`):
   - `ConceptCard.tsx` renders `QuizSetHidden` with "Quiz X of Y" progress indicator
   - `getVisibleQuiz()` in `types/learning.ts` handles QuizSet/QuizSetHidden type narrowing
   - `useNodeState.ts` manages state transitions including multi-quiz retry flow

### What Needs to Change (4 Files, All Backend)

| File | Change Type | Scope | Risk |
|------|-------------|-------|------|
| `server/schemas/learning.py` | ADD fields | `TopicNode` gets `complexity` + `quiz_count` | LOW — additive, with defaults |
| `server/agents/planner.py` | MODIFY prompt | `PLANNER_SYSTEM_PROMPT` updated with complexity assignment instructions | LOW — prompt-only change |
| `server/agents/quizzer.py` | MODIFY method | `generate_quiz()` → `generate_quiz_set()`, new difficulty gradient prompt | MEDIUM — core logic change |
| `server/services/course_orchestrator.py` | MODIFY wiring | `_generate_concept_unit()` reads quiz_count, passes to quizzer, stores QuizSet | MEDIUM — integration point |

## Data Flow

### Current Flow (Single Quiz)

```
User submits topic
    ↓
PlannerAgent.generate_outline(prompt)
    ↓
CourseOutline { topics: TopicNode[] }     ← no complexity/quiz_count
    ↓
for each topic (parallel via asyncio.gather):
    ├── GeneratorAgent.generate_content(topic) → markdown
    └── QuizzerAgent.generate_quiz(topic)      → QuizCard (single)
    ↓
CourseOrchestrator._generate_concept_unit()
    ↓
learning_manager.create_concept_node(quiz=single_card)   ← stores format_version=0
    ↓
Frontend renders single quiz
```

### New Flow (Multi-Quiz with Difficulty Gradient)

```
User submits topic
    ↓
PlannerAgent.generate_outline(prompt)
    ↓
CourseOutline { topics: TopicNode[] }
    │  topic.complexity = "Basic" | "Intermediate" | "Advanced"
    │  topic.quiz_count = 1-5 (driven by complexity)
    ↓
for each topic (parallel via asyncio.gather):
    ├── GeneratorAgent.generate_content(topic) → markdown (unchanged)
    └── QuizzerAgent.generate_quiz_set(topic, quiz_count=N)
    │       ↓
    │   If quiz_count == 1:
    │       → single QuizCard (easy, wrapped in QuizSet)
    │   If quiz_count > 1:
    │       → QuizSet with difficulty gradient:
    │           Q1: easy   (recall/terminology)
    │           Q2: medium (application/scenario)
    │           Q3+: hard  (synthesis/analysis)
    ↓
CourseOrchestrator._generate_concept_unit()
    ↓
learning_manager.create_concept_node(quiz_set=quiz_set)  ← stores format_version=1
    ↓
Frontend renders "Quiz 1 of N" (already supported)
    ↓
User progresses: Q1 correct → Q2 → ... → QN correct → COMPLETED
    (mastery checked by existing _check_multi_quiz_mastery)
```

### Key Data Transformations

1. **Planner → Orchestrator**: `TopicNode` now carries `complexity` and `quiz_count` metadata. Orchestrator reads these to parameterize quizzer calls.

2. **Orchestrator → Quizzer**: Currently passes topic context only. Will additionally pass `quiz_count: int` and `complexity: str` to inform gradient generation.

3. **Quizzer → Persistence**: Currently returns `QuizCard`. Will return `QuizSet`. The `create_concept_node()` method already accepts `quiz_set` parameter — no persistence changes needed.

4. **Persistence → Frontend**: Already emits `QuizSet`/`QuizSetHidden` depending on state. No changes needed.

## Architectural Patterns

### Pattern 1: Additive Schema Evolution with Defaults

**What:** Add new optional fields with sensible defaults so existing data remains valid.
**When to use:** Extending schemas that existing data already conforms to.
**Trade-offs:** Safe backward compatibility, but requires careful default selection.

```python
# server/schemas/learning.py — TopicNode
class TopicNode(BaseModel):
    index: int
    title: str
    summary_for_context: str
    key_terms: list[str]
    # NEW — optional with defaults for backward compat
    complexity: Literal["Basic", "Intermediate", "Advanced"] = "Intermediate"
    quiz_count: int = Field(default=1, ge=1, le=5)
```

**Rationale:** Existing `CourseOutline` validation (5-7 topics, contiguous indices) continues working unchanged. Old Planner outputs without these fields still parse correctly.

### Pattern 2: Method Signature Extension (Not Replacement)

**What:** Add parameters to existing methods rather than creating parallel codepaths.
**When to use:** When behavior needs to vary by input but the overall flow is the same.
**Trade-offs:** Clean single codepath, but method signatures grow.

```python
# server/agents/quizzer.py
async def generate_quiz_set(
    self,
    topic: TopicNode,
    content_summary: str,
    quiz_count: int = 1,          # NEW param
    complexity: str = "Intermediate"  # NEW param
) -> QuizSet:
    """Generate N quizzes with difficulty gradient."""
    if quiz_count == 1:
        card = await self._generate_single_quiz(topic, content_summary, "easy")
        return QuizSet(quizzes=[card], current_index=0)
    
    difficulties = self._compute_gradient(quiz_count)
    cards = []
    for i, difficulty in enumerate(difficulties):
        card = await self._generate_single_quiz(
            topic, content_summary, difficulty,
            quiz_position=i+1, total_quizzes=quiz_count
        )
        cards.append(card)
    return QuizSet(quizzes=cards, current_index=0)
```

### Pattern 3: Difficulty Gradient Computation

**What:** Map quiz_count to a sequence of difficulty levels (easy → medium → hard).
**When to use:** When generating ordered sequences where later items should be harder.
**Trade-offs:** Deterministic and predictable, but may feel formulaic for very high quiz counts.

```python
def _compute_gradient(self, quiz_count: int) -> list[str]:
    """Map quiz_count to difficulty sequence.
    
    1 quiz:  ["easy"]
    2 quizzes: ["easy", "hard"]
    3 quizzes: ["easy", "medium", "hard"]
    4 quizzes: ["easy", "medium", "medium", "hard"]
    5 quizzes: ["easy", "easy", "medium", "hard", "hard"]
    """
    if quiz_count == 1:
        return ["easy"]
    if quiz_count == 2:
        return ["easy", "hard"]
    
    gradient = ["easy"]
    middle_count = quiz_count - 2
    gradient.extend(["medium"] * middle_count)
    gradient.append("hard")
    return gradient
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Parallel Independent LLM Calls for Quiz Set

**What people do:** Call the LLM N times in parallel to generate N independent quizzes.
**Why it's wrong:** Each quiz is generated without context of the others, leading to duplicate questions, overlapping difficulty, and no coherent progression.
**Do this instead:** Either (a) generate the entire QuizSet in a single LLM call using a structured output schema, or (b) generate sequentially with prior quiz context passed to each subsequent call. Option (a) is strongly preferred for cost and latency.

### Anti-Pattern 2: Modifying Persistence Layer for This Feature

**What people do:** Add new columns, new tables, or modify mastery-checking logic.
**Why it's wrong:** The persistence layer ALREADY supports QuizSet storage (`format_version=1`), multi-quiz mastery checking (`_check_multi_quiz_mastery`), and QuizSet state transitions. Modifying it creates unnecessary risk.
**Do this instead:** Use the existing `quiz_set` parameter in `create_concept_node()` and trust the existing mastery logic. The only change needed is in the _generation_ layer, not the _storage_ layer.

### Anti-Pattern 3: Breaking Backward Compatibility in TopicNode

**What people do:** Make `complexity` and `quiz_count` required fields.
**Why it's wrong:** Existing course outlines and cached data won't have these fields. Required fields break deserialization of existing data.
**Do this instead:** Use optional fields with defaults (`complexity="Intermediate"`, `quiz_count=1`). This way existing single-quiz topics still work perfectly.

### Anti-Pattern 4: Frontend Changes for This Feature

**What people do:** Add new frontend components or modify QuizSet rendering.
**Why it's wrong:** The frontend already handles QuizSet rendering including "Quiz X of Y" display, multi-quiz state transitions, and mastery checking. Changes here are unnecessary scope creep.
**Do this instead:** Verify the existing frontend works with multi-quiz sets (integration test). Only change frontend if a real bug surfaces.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Change Required |
|----------|---------------|-----------------|
| Planner → Orchestrator | `CourseOutline` (Pydantic model) | TopicNode gains 2 fields (backward compatible) |
| Orchestrator → Quizzer | Direct method call | Pass `quiz_count` and `complexity` params |
| Quizzer → Orchestrator | Returns `QuizSet` (was `QuizCard`) | Return type change — **key integration point** |
| Orchestrator → Persistence | `create_concept_node(quiz_set=...)` | Use existing `quiz_set` param instead of `quiz` param |
| Persistence → Frontend | JSON over REST (QuizSet/QuizSetHidden) | No change — already works |

### External Services

| Service | Integration Pattern | Impact |
|---------|---------------------|--------|
| Vertex AI (Gemini Pro) | Via InstructorClient for structured output | Quizzer prompt changes; response_model may become `QuizSet` instead of `QuizCard` |
| SQLite | Via SQLAlchemy | No schema migration needed — quiz_data is JSON |

### Critical Integration Point: Quizzer Return Type

The **single most important** integration change is the Quizzer's return type shifting from `QuizCard` to `QuizSet`. This ripples to the Orchestrator's `_generate_concept_unit()` method which currently expects a `QuizCard` and passes it to `create_concept_node(quiz=card)`. After the change, it must pass `create_concept_node(quiz_set=quiz_set)`.

```python
# BEFORE (course_orchestrator.py, _generate_concept_unit):
quiz_card = await self.quizzer_agent.generate_quiz(topic, content_summary)
node = await self.learning_manager.create_concept_node(
    ..., quiz=quiz_card
)

# AFTER:
quiz_set = await self.quizzer_agent.generate_quiz_set(
    topic, content_summary,
    quiz_count=topic.quiz_count,
    complexity=topic.complexity
)
node = await self.learning_manager.create_concept_node(
    ..., quiz_set=quiz_set
)
```

## Suggested Build Order

The build order respects data flow dependencies (upstream changes before downstream consumers):

| Order | Component | File | Why This Order |
|-------|-----------|------|----------------|
| 1 | Schema: TopicNode fields | `server/schemas/learning.py` | Foundation — everything else reads from TopicNode |
| 2 | Planner: prompt update | `server/agents/planner.py` | Produces TopicNodes with new fields — must exist before orchestrator reads them |
| 3 | Quizzer: generate_quiz_set | `server/agents/quizzer.py` | Core logic — must exist before orchestrator calls it |
| 4 | Orchestrator: wiring | `server/services/course_orchestrator.py` | Final integration — reads new fields, calls new method, stores result |
| 5 | Verification | Frontend + E2E | Confirm existing frontend handles the new multi-quiz data correctly |

**Phase boundaries:** Steps 1-2 can be a single commit (schema + prompt). Step 3 is the meatiest change (new method + gradient logic + tests). Step 4 is pure wiring. Step 5 is verification only.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (single user) | Single LLM call per QuizSet generation — fine |
| 10-50 concurrent users | Gemini API rate limits become relevant; existing retry logic (tenacity) handles transient failures |
| 100+ concurrent users | Consider caching common topic QuizSets; batch LLM calls; but this is far beyond current scope |

### First Bottleneck: LLM Latency for Large Quiz Sets

Generating 5 quizzes in a single LLM call takes ~2-4x longer than generating 1. Since the scatter-gather pattern already runs generator + quizzer in parallel per topic, the quizzer becoming slower doesn't block the generator. However, the overall course generation time increases proportionally to max(quiz_count) across topics.

**Mitigation:** The existing SkeletonCard pattern handles partial failures gracefully. If a 5-quiz generation times out, the topic gets a skeleton card and the user can retry.

## Sources

- `server/schemas/learning.py` — Direct code analysis (874 lines, HIGH confidence)
- `server/agents/quizzer.py` — Direct code analysis (393 lines, HIGH confidence)
- `server/agents/planner.py` — Direct code analysis (239 lines, HIGH confidence)
- `server/services/course_orchestrator.py` — Direct code analysis (606 lines, HIGH confidence)
- `server/database/learning_persistence.py` — Direct code analysis (2770+ lines, HIGH confidence)
- `client/src/features/learning/ConceptCard.tsx` — Direct code analysis (454 lines, HIGH confidence)
- `client/src/types/learning.ts` — Direct code analysis (320 lines, HIGH confidence)
- `client/src/features/learning/useNodeState.ts` — Direct code analysis (278 lines, HIGH confidence)
- `.planning/codebase/features/dynamic-quiz-generation.md` — Feature specification (HIGH confidence)

---
*Architecture research for: Dynamic Quiz Generation in A2UI Adaptive Learning*
*Researched: 2026-02-17*
