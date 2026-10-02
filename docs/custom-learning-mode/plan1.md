# P1: Custom Learning Mode Contracts and Persistence Implementation Plan

> **For agentic workers:** Use the `executing-plans` skill to implement this
> plan task by task. Track the checkboxes and report the P1 exit gate to the
> orchestrator before downstream work starts.

**Goal:** Establish strict Custom count contracts and preserve the requested
count independently of generated node counts in SQLite and MongoDB.

**Architecture:** Extend existing TypeScript/Pydantic models and repository
signatures. Keep general outline validation separate from per-mode cardinality
validation. Add one nullable session column/document field through the existing
learning-table initializer, and update both job stores because they create
session shells directly.

**Tech stack:** TypeScript strict mode, Vitest, Pydantic v2, FastAPI, SQLite
`sqlite3`, synchronous PyMongo repositories, and stdlib `unittest`.

---

## Scope, references, and execution rules

Approved behavior comes from `docs/custom-learning-mode/goal.md`.
Technical evidence comes from `docs/custom-learning-mode/research.md`, sections
1-3 and 5-7. Ownership and the exit gate come from
`docs/custom-learning-mode/state.md`, P1 and AC3/AC4/AC6/AC7/AC8.
Follow `docs/ARCHITECTURE.md`, `docs/STACK.md`, `docs/STRUCTURE.md`,
`docs/CONVENTIONS.md`, and `docs/TESTING.md`; dual-store parity is the relevant
concern in `docs/CONCERNS.md`.

This plan implements **P1 only**. It does not change UI controls, request
transport, runtime forwarding, graph state, classification, planner prompts,
retries, research routing, or checkpoint resume execution. Those consumers
receive these contracts after P1 passes. No new production dependencies or
tables are needed.

The strict constraint belongs on the nullable integer field, not on the whole
model, preserving existing timestamp and other-field behavior. Use
`Field(strict=True, ge=1, le=MAX_COURSE_TOPICS)` and an after-model validator for
the mode/count relationship. This follows the official
[Pydantic strict-field documentation](https://docs.pydantic.dev/latest/concepts/strict_mode/)
and [model-validator documentation](https://docs.pydantic.dev/latest/concepts/validators/).
An ordinary lax integer rejects a fractional 2.5 already, but can accept a
boolean, a numeric string, or a whole-valued float; strictness must cover every
one of those cases.

All commands below run in PowerShell from `D:/Peter/A2UI` unless stated
otherwise. Use forward slashes in paths. Python runs through
`server/.venv/Scripts/python.exe -m`. Retain existing source headers and imports
outside the feature changes. No new source files are planned.

### Ownership map

| File | P1 responsibility |
| --- | --- |
| `client/src/types/learning.ts` | Selected/resolved mode unions; request/session count fields |
| `server/schemas/learning.py` | Mode literals, both outline minimum gates, count helper, session response field/validation |
| `server/routers/learning.py` | `GenerateCourseRequest` and its required imports only |
| `server/database/repositories/protocols.py` | Optional count on session and shell creation contracts |
| `server/database/learning_persistence.py` | Column creation/migration, create/read/list, resolved-mode update guard |
| `server/database/generation_jobs.py` | Atomic SQLite shell insert and returned shell count |
| `server/database/repositories/mongo_learning.py` | Session create/read/list field and resolved-mode update guard |
| `server/database/repositories/mongo_jobs.py` | Transactional Mongo shell insert and returned shell count |
| `client/src/types/learning.test.ts` | Compile-checked client contracts |
| `server/tests/test_depth_mode_schema.py` | Request/response, outline and cardinality validation |
| `server/tests/test_repository_contracts.py` | Protocol signature compatibility |
| `server/tests/test_depth_mode_persistence.py` | SQLite session, legacy migration and repeated initialization |
| `server/tests/test_generation_jobs.py` | SQLite shell and repeated startup round trips |
| `server/tests/test_mongo_learning.py` | Mocked Mongo session, legacy document and list round trips |
| `server/tests/test_mongo_jobs.py` | Mocked Mongo transaction/shell round trips |

`server/database/repositories/sqlite.py` needs no change: its
`_DelegatingRepository.__getattr__` already returns the underlying method.
Tasks 5/6 exercise real adapters with the new argument. Keep
`server/database/generation_migrations.py` unchanged; the learning initializer
owns `learning_sessions` columns. Tests may call the existing generation
migration function to verify startup order and idempotence.

### Shared-checkout preparation and safe commits

- [ ] Read the references above and capture your owned-path baseline before
      editing. The checkout contains approximately 283 existing modified paths,
      including owned files, primarily user header simplifications.

```powershell
$p1Base = git rev-parse HEAD
$p1Baseline = Join-Path $env:TEMP 'a2ui-custom-p1-baseline.diff'
git diff -- client/src/types/learning.ts client/src/types/learning.test.ts server/schemas/learning.py server/routers/learning.py server/database/learning_persistence.py server/database/generation_jobs.py server/database/repositories/protocols.py server/database/repositories/mongo_learning.py server/database/repositories/mongo_jobs.py server/tests/test_depth_mode_schema.py server/tests/test_depth_mode_persistence.py server/tests/test_generation_jobs.py server/tests/test_mongo_jobs.py server/tests/test_mongo_learning.py server/tests/test_repository_contracts.py | Set-Content -LiteralPath $p1Baseline -Encoding utf8
git diff --cached --name-only
```

Retain `$p1Base` and the baseline path for the final coverage/staging audit.
Do not alter other agents' edits. Coordinate the shared git index before each
commit. Every commit step below uses `git add -p` on exact owned paths: stage
only new feature hunks, excluding the recorded baseline. Split overlapping
hunks or coordinate a feature-only patch with the orchestrator. Do not stage
whole already-modified files or use broad directory staging. Commit only when
the staged-path list belongs to your current task; never unstage another
agent's work to achieve that. Check the staged diff, commit, then record the
hash and a git note after obtaining the index slot.

- [ ] Establish a focused baseline before writing failing tests.

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_mode_schema server.tests.test_depth_mode_persistence server.tests.test_generation_jobs server.tests.test_mongo_jobs server.tests.test_mongo_learning server.tests.test_repository_contracts -v
npm --prefix client run test -- --run src/types/learning.test.ts
client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit
```

Expected: current focused tests pass. Record unrelated compiler diagnostics if
present; do not suppress them. The original two-topic rejection test passes
at baseline and is deliberately rewritten in Task 2.

## Task 1: Extend compile-checked client contracts

**Files:**
- Modify: `client/src/types/learning.ts` (`LearningDepthMode`,
  `ResolvedDepthMode`, `GenerateCourseRequest`, `LearningSession`).
- Test: `client/src/types/learning.test.ts`.

- [ ] **Step 1: Add the exact typed tests.** Extend the existing type-only
      import with `GenerateCourseRequest`, `LearningDepthMode`,
      `LearningSession`, and `ResolvedDepthMode`. Append:

```typescript
describe('Custom learning contract', () => {
  it('accepts custom as selected and resolved mode with a count', () => {
    const mode: LearningDepthMode = 'custom';
    const resolvedMode: ResolvedDepthMode = 'custom';
    const request: GenerateCourseRequest = {
      query: 'Modern CSS',
      mode,
      custom_topic_count: 2,
    };
    const session: LearningSession = {
      id: 's1',
      user_id: null,
      query: request.query,
      course_title: 'CSS',
      total_nodes: 0,
      completed_nodes: 0,
      last_active_node_id: null,
      mode,
      resolved_mode: resolvedMode,
      custom_topic_count: request.custom_topic_count,
      created_at: '2026-10-02T00:00:00Z',
      updated_at: null,
    };
    expect(session.custom_topic_count).toBe(2);
    expect(session.total_nodes).toBe(0);
    expect(session.resolved_mode).toBe('custom');
  });

  it('keeps existing request and legacy session shapes assignable', () => {
    const requests: GenerateCourseRequest[] = [
      { query: 'CSS' },
      { query: 'CSS', mode: 'auto' },
      { query: 'CSS', mode: 'lite' },
      { query: 'CSS', mode: 'full' },
    ];
    const legacySession: LearningSession = {
      id: 's-old',
      user_id: null,
      query: 'CSS',
      course_title: 'CSS',
      total_nodes: 3,
      completed_nodes: 0,
      last_active_node_id: null,
      created_at: '2026-10-02T00:00:00Z',
      updated_at: null,
    };
    const nullCountSession: LearningSession = {
      ...legacySession,
      mode: 'auto',
      custom_topic_count: null,
    };
    for (const request of requests) {
      expect(request.custom_topic_count).toBeUndefined();
    }
    expect(legacySession.custom_topic_count).toBeUndefined();
    expect(nullCountSession.custom_topic_count).toBeNull();
  });
});
```

- [ ] **Step 2: Verify RED using the TypeScript compiler.** Vitest alone
      transpiles TypeScript and does not prove a type test failed.

```powershell
client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit
```

Expected: errors for `'custom'` assignments, unknown `custom_topic_count`
properties, and access to the missing property. Distinguish those from any
baseline diagnostics.

- [ ] **Step 3: Make only the minimal type changes.** Replace the two aliases:

```typescript
export type LearningDepthMode = 'auto' | 'lite' | 'full' | 'custom';

export type ResolvedDepthMode = 'lite' | 'full' | 'custom';
```

Add the following member next to mode fields in `LearningSession`:

```typescript
custom_topic_count?: number | null;
```

Add this member next to `mode` in `GenerateCourseRequest`:

```typescript
custom_topic_count?: number;
```

Preserve surrounding indentation; do not reformat the entire existing type
file. TypeScript models JSON numbers; strict integer/mode enforcement is the
server boundary, with the form boundary handled outside P1.

- [ ] **Step 4: Verify GREEN and changed-path lint.**

```powershell
client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit
npm --prefix client run test -- --run src/types/learning.test.ts
client/node_modules/.bin/eslint.cmd client/src/types/learning.ts client/src/types/learning.test.ts
```

Expected: the new type diagnostics disappear and the focused suite passes.

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- client/src/types/learning.ts client/src/types/learning.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached -- client/src/types/learning.ts client/src/types/learning.test.ts
git commit -m "feat(learning): add custom depth and count client contracts"
```

## Task 2: Support general 1-30-topic outlines and exact Custom cardinality

**Files:**
- Modify: `server/schemas/learning.py` (mode aliases, count helper,
  `CourseOutline.topics`, `CourseOutline.validate_topics`).
- Test: `server/tests/test_depth_mode_schema.py`.

- [ ] **Step 1: Rewrite the old minimum test and add focused cases.** Replace
      `test_course_outline_rejects_2_topics` with the first method below.
      Keep `_topic`, `_outline`, and all existing Lite/Full tests. Add the
      remaining methods to `DepthModeSchemaTests`:

```python
    def test_course_outline_allows_1_2_and_30_topics(self) -> None:
        for count in (1, 2, 30):
            with self.subTest(count=count):
                self.assertEqual(len(_outline(count).topics), count)

    def test_course_outline_rejects_0_and_31_topics(self) -> None:
        for count in (0, 31):
            with self.subTest(count=count):
                with self.assertRaises(ValidationError):
                    _outline(count)

    def test_explicit_topics_validator_accepts_1_and_2(self) -> None:
        for count in (1, 2):
            topics = [_topic(i) for i in range(count)]
            with self.subTest(count=count):
                self.assertEqual(
                    CourseOutline.validate_topics(topics), topics
                )

    def test_short_outline_still_requires_contiguous_indices(self) -> None:
        with self.assertRaises(ValidationError):
            CourseOutline(course_title="Test", topics=[_topic(1)])

    def test_validate_custom_requires_exact_requested_count(self) -> None:
        for count in (1, 2, 5, 30):
            outline = CourseOutline.model_construct(
                course_title="Test",
                topics=[_topic(i) for i in range(count)],
            )
            with self.subTest(count=count):
                self.assertTrue(
                    validate_topic_count_for_mode(
                        outline, "custom", custom_topic_count=count
                    )
                )
                different = 2 if count == 1 else 1
                self.assertFalse(
                    validate_topic_count_for_mode(
                        outline, "custom", custom_topic_count=different
                    )
                )

    def test_custom_count_helper_rejects_invalid_targets(self) -> None:
        outline = CourseOutline.model_construct(
            course_title="Test", topics=[_topic(0)]
        )
        for value in (None, True, False, 1.0, 2.5, "1", 0, -1, 31):
            with self.subTest(value=value):
                self.assertFalse(
                    validate_topic_count_for_mode(
                        outline, "custom", custom_topic_count=value
                    )
                )

    def test_lite_and_full_still_reject_short_outlines(self) -> None:
        for count in (1, 2):
            outline = CourseOutline.model_construct(
                course_title="Test",
                topics=[_topic(i) for i in range(count)],
            )
            for mode in ("lite", "full"):
                with self.subTest(count=count, mode=mode):
                    self.assertFalse(
                        validate_topic_count_for_mode(outline, mode)
                    )

    def test_non_custom_helper_rejects_custom_target(self) -> None:
        self.assertFalse(
            validate_topic_count_for_mode(
                _outline(3), "lite", custom_topic_count=3
            )
        )
```

The invalid helper test deliberately passes hostile Python values to prove
the boolean helper fails closed without relying on the request model.

- [ ] **Step 2: Verify RED.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_mode_schema.DepthModeSchemaTests -v
```

Expected: 1/2-topic outlines fail, the direct validator rejects them, and the
new helper argument raises `TypeError`. Existing Lite/Full bounds stay green.

- [ ] **Step 3: Extend mode aliases and replace the helper.**

```python
LearningDepthMode = Literal["auto", "lite", "full", "custom"]
ResolvedDepthMode = Literal["lite", "full", "custom"]
```

Keep `MODE_TOPIC_BOUNDS` exactly `{"lite": (3, 10), "full": (10, 30)}`;
Custom uses an exact request target, not a new static range entry. Replace
the existing helper with:

```python
def validate_topic_count_for_mode(
    outline: "CourseOutline",
    mode: ResolvedDepthMode,
    custom_topic_count: Optional[int] = None,
) -> bool:
    """Check outline cardinality against a resolved mode.

    Args:
        outline: Outline whose topics will be counted.
        mode: Resolved lite, full, or custom mode.
        custom_topic_count: Exact requested count for custom mode.

    Returns:
        Whether the outline satisfies the mode's cardinality contract.
    """
    count = len(outline.topics)
    if mode == "custom":
        if type(custom_topic_count) is not int:
            return False
        return (
            1 <= custom_topic_count <= MAX_COURSE_TOPICS
            and count == custom_topic_count
        )
    if custom_topic_count is not None:
        return False
    bounds = MODE_TOPIC_BOUNDS.get(mode)
    if bounds is None:
        return False
    min_topics, max_topics = bounds
    return min_topics <= count <= max_topics
```

- [ ] **Step 4: Relax BOTH outline minimum gates.** Replace the `topics`
      field block and the first guard in `validate_topics`:

```python
    topics: List[TopicNode] = Field(
        ...,
        description=(
            "Ordered list of topic nodes "
            f"(minimum 1, maximum {MAX_COURSE_TOPICS})"
        ),
        min_length=1,
        max_length=MAX_COURSE_TOPICS,
    )
```

```python
        if len(topics) < 1:
            raise ValueError("CourseOutline requires at least 1 topic")
```

Keep the maximum guard and contiguous-index loop unchanged. Changing only
`min_length` leaves the separate explicit validator blocking 1/2-topic Custom
courses. Do not move mode validation into `CourseOutline`; it has no mode or
requested-count field.

- [ ] **Step 5: Verify GREEN plus existing planner-contract regression.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_mode_schema server.tests.test_planner_mode -v
```

Expected: schema tests pass, the old two-topic rejection is gone, and existing
planner-mode tests pass without changing any planner implementation.

- [ ] **Step 6: Selectively stage and commit.**

```powershell
git add -p -- server/schemas/learning.py server/tests/test_depth_mode_schema.py
git diff --cached --name-only
git diff --cached --check
git diff --cached -- server/schemas/learning.py server/tests/test_depth_mode_schema.py
git commit -m "feat(learning): validate custom outline cardinality"
```

## Task 3: Enforce strict request and session response count contracts

**Files:**
- Modify: `server/routers/learning.py` (`GenerateCourseRequest` and imports).
- Modify: `server/schemas/learning.py` (`LearningSessionResponse`).
- Test: `server/tests/test_depth_mode_schema.py`.

- [ ] **Step 1: Add request and response tests.** Import `json`, `TypeAdapter`
      alongside `ValidationError`, `GenerateCourseRequest` from
      `server.routers.learning`, and both depth aliases from
      `server.schemas.learning`. Append this class before the existing main
      guard:

```python
class CustomDepthContractTests(unittest.TestCase):
    def test_depth_aliases_accept_custom(self) -> None:
        self.assertEqual(
            TypeAdapter(LearningDepthMode).validate_python("custom"),
            "custom",
        )
        self.assertEqual(
            TypeAdapter(ResolvedDepthMode).validate_python("custom"),
            "custom",
        )
        with self.assertRaises(ValidationError):
            TypeAdapter(ResolvedDepthMode).validate_python("auto")

    def test_requests_accept_exact_integer_boundaries(self) -> None:
        for count in (1, 2, 5, 30):
            data = {
                "query": "CSS",
                "mode": "custom",
                "custom_topic_count": count,
            }
            with self.subTest(count=count):
                request = GenerateCourseRequest.model_validate(data)
                from_json = GenerateCourseRequest.model_validate_json(
                    json.dumps(data)
                )
                self.assertEqual(request.mode, "custom")
                self.assertEqual(request.custom_topic_count, count)
                self.assertEqual(from_json.custom_topic_count, count)

    def test_custom_request_rejects_missing_count(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateCourseRequest.model_validate(
                {"query": "CSS", "mode": "custom"}
            )

    def test_custom_request_rejects_invalid_count_values(self) -> None:
        for value in (None, True, False, 2.5, 5.0, "5", 0, -1, 31):
            data = {
                "query": "CSS",
                "mode": "custom",
                "custom_topic_count": value,
            }
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    GenerateCourseRequest.model_validate(data)
                with self.assertRaises(ValidationError):
                    GenerateCourseRequest.model_validate_json(
                        json.dumps(data)
                    )

    def test_existing_requests_allow_missing_or_null_count(self) -> None:
        for mode in ("auto", "lite", "full"):
            for supplied in ({}, {"custom_topic_count": None}):
                with self.subTest(mode=mode, supplied=supplied):
                    request = GenerateCourseRequest.model_validate(
                        {"query": "CSS", "mode": mode, **supplied}
                    )
                    self.assertEqual(request.mode, mode)
                    self.assertIsNone(request.custom_topic_count)
        default = GenerateCourseRequest(query="CSS")
        self.assertEqual(default.mode, "auto")
        self.assertIsNone(default.custom_topic_count)

    def test_other_request_modes_reject_non_null_count(self) -> None:
        for mode in (None, "auto", "lite", "full"):
            data = {"query": "CSS", "custom_topic_count": 5}
            if mode is not None:
                data["mode"] = mode
            with self.subTest(mode=mode):
                with self.assertRaises(ValidationError):
                    GenerateCourseRequest.model_validate(data)

    def test_unknown_request_mode_remains_invalid(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateCourseRequest(query="CSS", mode="turbo")

    def test_custom_session_response_retains_requested_count(self) -> None:
        for count in (1, 2, 30):
            with self.subTest(count=count):
                response = LearningSessionResponse(
                    id="s1",
                    query="CSS",
                    course_title="CSS",
                    mode="custom",
                    resolved_mode="custom",
                    custom_topic_count=count,
                    total_nodes=0,
                )
                payload = response.model_dump(mode="json")
                self.assertEqual(payload["custom_topic_count"], count)
                self.assertEqual(payload["total_nodes"], 0)

    def test_custom_response_rejects_missing_or_invalid_count(self) -> None:
        base = {
            "id": "s1",
            "query": "CSS",
            "course_title": "CSS",
            "mode": "custom",
        }
        with self.assertRaises(ValidationError):
            LearningSessionResponse.model_validate(base)
        for value in (None, True, False, 2.5, 5.0, "5", 0, -1, 31):
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    LearningSessionResponse.model_validate(
                        {**base, "custom_topic_count": value}
                    )

    def test_legacy_responses_allow_missing_or_null_count(self) -> None:
        for mode in (None, "auto", "lite", "full"):
            for supplied in ({}, {"custom_topic_count": None}):
                with self.subTest(mode=mode, supplied=supplied):
                    response = LearningSessionResponse(
                        id="old",
                        query="CSS",
                        course_title="CSS",
                        mode=mode,
                        **supplied,
                    )
                    self.assertIsNone(response.custom_topic_count)

    def test_non_custom_responses_reject_non_null_count(self) -> None:
        for mode in (None, "auto", "lite", "full"):
            with self.subTest(mode=mode):
                with self.assertRaises(ValidationError):
                    LearningSessionResponse(
                        id="s1",
                        query="CSS",
                        course_title="CSS",
                        mode=mode,
                        custom_topic_count=5,
                    )
```

- [ ] **Step 2: Verify RED.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_mode_schema.CustomDepthContractTests -v
```

Expected: Custom requests are rejected as an unknown mode, and existing
models lack the count attribute or ignore it. Alias tests from Task 2 pass.
Some rejection tests pass before implementation because `custom` is invalid;
the positive tests and other-mode prohibition demonstrate the actual gap.

- [ ] **Step 3: Add the strict request field and conditional validator.**
      Add `model_validator` to the existing Pydantic import. Import
      `LearningDepthMode` and `MAX_COURSE_TOPICS` in the existing schema import
      group. Replace only `GenerateCourseRequest` with:

```python
class GenerateCourseRequest(BaseModel):
    """Request schema for generating a learning course."""

    query: str = Field(
        ...,
        description="Topic to learn about",
        min_length=1,
        max_length=500,
    )
    user_id: Optional[str] = Field(default=None, description="Optional user ID")
    mode: LearningDepthMode = Field(
        default="auto",
        description=(
            "Depth mode: auto routes; lite 3-10; full 10-30; custom exact"
        ),
    )
    custom_topic_count: Optional[int] = Field(
        default=None,
        strict=True,
        ge=1,
        le=MAX_COURSE_TOPICS,
        description="Exact Custom topic count; null for other modes",
    )

    @model_validator(mode="after")
    def validate_custom_topic_count(self) -> "GenerateCourseRequest":
        """Require a count only when Custom mode is selected."""
        if self.mode == "custom" and self.custom_topic_count is None:
            raise ValueError("custom mode requires custom_topic_count")
        if self.mode != "custom" and self.custom_topic_count is not None:
            raise ValueError("custom_topic_count is only valid for custom mode")
        return self
```

Do not edit route handlers, request-to-runtime calls, or router payload
mapping. The shared mode alias avoids another independently maintained union.

- [ ] **Step 4: Extend `LearningSessionResponse`.** Add this field adjacent
      to its mode fields; update the mode descriptions to mention Custom.
      The file already imports `model_validator`.

```python
    custom_topic_count: Optional[int] = Field(
        default=None,
        strict=True,
        ge=1,
        le=MAX_COURSE_TOPICS,
        description="Requested Custom count, independent of total_nodes",
    )

    @model_validator(mode="after")
    def validate_custom_topic_count(self) -> "LearningSessionResponse":
        """Require a count only when Custom mode is selected."""
        if self.mode == "custom" and self.custom_topic_count is None:
            raise ValueError("custom mode requires custom_topic_count")
        if self.mode != "custom" and self.custom_topic_count is not None:
            raise ValueError("custom_topic_count is only valid for custom mode")
        return self
```

Use these exact replacement descriptions:

```python
        description="User-selected depth mode (auto|lite|full|custom)",
```

```python
        description="Effective depth mode after routing (lite|full|custom)",
```

The response validator accepts legacy `mode=None` with no count. A Custom
shell may still have `resolved_mode=None` and `total_nodes=0`; only its selected
mode requires a requested count. Do not derive the field from `total_nodes`.

- [ ] **Step 5: Verify GREEN and existing generation contracts.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_mode_schema server.tests.test_generation_contracts server.tests.test_generation_api -v
```

Expected: request/response cases and existing Auto/Lite/Full generation API
contracts pass. FastAPI request validation uses the same request model; the
production Custom runtime wiring remains outside P1.

- [ ] **Step 6: Selectively stage and commit.**

```powershell
git add -p -- server/routers/learning.py server/schemas/learning.py server/tests/test_depth_mode_schema.py
git diff --cached --name-only
git diff --cached --check
git diff --cached -- server/routers/learning.py server/schemas/learning.py server/tests/test_depth_mode_schema.py
git commit -m "feat(learning): enforce strict custom count contracts"
```

## Task 4: Extend repository creation signatures compatibly

**Files:**
- Modify: `server/database/repositories/protocols.py`.
- Test: `server/tests/test_repository_contracts.py`.

- [ ] **Step 1: Add the signature test.** Add `import inspect` to the stdlib
      imports and this method to `RepositoryContractTests`:

```python
    def test_creation_ports_accept_optional_custom_topic_count(self) -> None:
        methods = (
            LearningRepository.create_learning_session,
            GenerationJobRepository.create_session_shell_and_job,
        )
        for method in methods:
            with self.subTest(method=method.__qualname__):
                parameters = inspect.signature(method).parameters
                self.assertIn("custom_topic_count", parameters)
                self.assertIsNone(
                    parameters["custom_topic_count"].default
                )
```

- [ ] **Step 2: Verify RED.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_repository_contracts.RepositoryContractTests.test_creation_ports_accept_optional_custom_topic_count -v
```

Expected: both protocol signatures lack `custom_topic_count`.

- [ ] **Step 3: Add only the optional parameter.** In `LearningRepository`,
      use this complete signature:

```python
    def create_learning_session(
        self,
        query: str,
        course_title: str,
        user_id: Optional[str] = None,
        mode: str = "auto",
        resolved_mode: Optional[str] = None,
        custom_topic_count: Optional[int] = None,
    ) -> dict[str, Any]: ...
```

In `GenerationJobRepository`, use:

```python
    def create_session_shell_and_job(
        self,
        *,
        query: str,
        user_id: Optional[str],
        mode: str,
        web_search_requested: bool,
        now: Optional[datetime] = None,
        custom_topic_count: Optional[int] = None,
    ) -> tuple[dict, GenerationJobRecord]: ...
```

Keeping the existing parameter order and adding a default preserves old
callers. This task establishes the port; Tasks 5-8 implement both adapters.
Keep the rest of the protocols unchanged.

- [ ] **Step 4: Verify GREEN.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_repository_contracts server.tests.test_sqlite_repositories server.tests.test_repository_facades -v
```

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- server/database/repositories/protocols.py server/tests/test_repository_contracts.py
git diff --cached --name-only
git diff --cached --check
git diff --cached -- server/database/repositories/protocols.py server/tests/test_repository_contracts.py
git commit -m "feat(storage): extend session creation ports with custom count"
```

## Task 5: Persist and migrate SQLite session counts

**Files:**
- Modify: `server/database/learning_persistence.py`.
- Test: `server/tests/test_depth_mode_persistence.py`.

- [ ] **Step 1: Add real database round-trip and migration tests.** Add
      `import sqlite3`, `SqliteLearningRepository` from
      `server.database.repositories.sqlite`, and `NodeStatus` from
      `server.schemas.learning`. Append these methods to
      `DepthModePersistenceTests`:

```python
    def test_custom_session_round_trip_keeps_requested_count(self) -> None:
        repository = SqliteLearningRepository(self.manager)
        for count in (1, 2, 5, 30):
            with self.subTest(count=count):
                session = repository.create_learning_session(
                    query="CSS",
                    course_title="CSS",
                    mode="custom",
                    resolved_mode="custom",
                    custom_topic_count=count,
                )
                self.assertEqual(session["custom_topic_count"], count)
                loaded = repository.get_learning_session(session["id"])
                assert loaded is not None
                self.assertEqual(loaded["custom_topic_count"], count)
                self.assertEqual(loaded["total_nodes"], 0)
                self.assertEqual(loaded["resolved_mode"], "custom")
                self.manager.create_concept_node(
                    session_id=session["id"],
                    sequence_index=0,
                    title="First",
                    content_markdown="Explanation",
                    status=NodeStatus.VIEWING_EXPLANATION,
                )
                loaded = repository.get_learning_session(session["id"])
                assert loaded is not None
                self.assertEqual(loaded["total_nodes"], 1)
                self.assertEqual(loaded["custom_topic_count"], count)
                listed, _ = repository.get_sessions_list()
                listed_session = next(
                    item for item in listed if item["id"] == session["id"]
                )
                self.assertEqual(
                    listed_session["custom_topic_count"], count
                )

    def test_old_modes_default_to_null_requested_count(self) -> None:
        for mode in ("auto", "lite", "full"):
            with self.subTest(mode=mode):
                session = self.manager.create_learning_session(
                    query="CSS", course_title="CSS", mode=mode
                )
                self.assertIsNone(session["custom_topic_count"])
                loaded = self.manager.get_learning_session(session["id"])
                assert loaded is not None
                self.assertIsNone(loaded["custom_topic_count"])

    def test_fresh_initialization_is_idempotent_with_count(self) -> None:
        session = self.manager.create_learning_session(
            query="CSS",
            course_title="CSS",
            mode="custom",
            custom_topic_count=2,
        )
        self.manager.init_learning_tables()
        self.manager.init_learning_tables()
        with sqlite3.connect(self.manager.db_path) as conn:
            columns = conn.execute(
                "PRAGMA table_info(learning_sessions)"
            ).fetchall()
        self.assertEqual(
            sum(column[1] == "custom_topic_count" for column in columns), 1
        )
        loaded = self.manager.get_learning_session(session["id"])
        assert loaded is not None
        self.assertEqual(loaded["custom_topic_count"], 2)

    def test_real_legacy_schema_migration_keeps_old_rows(self) -> None:
        legacy_path = Path(self.tmp.name) / "legacy.db"
        with sqlite3.connect(legacy_path) as conn:
            conn.execute(
                """
                CREATE TABLE learning_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    query TEXT NOT NULL,
                    course_title TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                "INSERT INTO learning_sessions (id, query, course_title)"
                " VALUES (?, ?, ?)",
                ("legacy", "Old query", "Old title"),
            )
            before = conn.execute(
                "PRAGMA table_info(learning_sessions)"
            ).fetchall()
        self.assertNotIn("custom_topic_count", [row[1] for row in before])
        manager = LearningManager(db_path=legacy_path)
        manager.init_learning_tables()
        manager.init_learning_tables()
        with sqlite3.connect(legacy_path) as conn:
            after = conn.execute(
                "PRAGMA table_info(learning_sessions)"
            ).fetchall()
        self.assertEqual(
            sum(row[1] == "custom_topic_count" for row in after), 1
        )
        loaded = manager.get_learning_session("legacy")
        assert loaded is not None
        self.assertEqual(loaded["query"], "Old query")
        self.assertEqual(loaded["course_title"], "Old title")
        self.assertEqual(loaded["mode"], "auto")
        self.assertIsNone(loaded["resolved_mode"])
        self.assertIsNone(loaded["custom_topic_count"])
        rows, total = manager.get_sessions_list()
        self.assertEqual(total, 1)
        self.assertIsNone(rows[0]["custom_topic_count"])

    def test_update_resolved_mode_accepts_custom(self) -> None:
        session = self.manager.create_learning_session(
            query="CSS", course_title="CSS", mode="custom",
            custom_topic_count=2,
        )
        self.manager.update_session_resolved_mode(session["id"], "custom")
        loaded = self.manager.get_learning_session(session["id"])
        assert loaded is not None
        self.assertEqual(loaded["resolved_mode"], "custom")
        self.assertEqual(loaded["custom_topic_count"], 2)
        with self.assertRaises(ValueError):
            self.manager.update_session_resolved_mode(session["id"], "turbo")
```

Keep existing tests. The old `test_migration_adds_columns_on_existing_db`
only initializes an already-current database; the new legacy fixture proves
a real missing-column migration.

- [ ] **Step 2: Verify RED.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_mode_persistence -v
```

Expected: the new keyword is unsupported; count keys/column are absent.

- [ ] **Step 3: Add the nullable column in fresh DDL and migration.** Insert
      this column after `resolved_mode TEXT` in the learning-session DDL:

```sql
                    custom_topic_count INTEGER,
```

In `_ensure_session_progress_columns`, add this guard after the existing
`resolved_mode` guard, using the same `existing_columns` snapshot:

```python
        if "custom_topic_count" not in existing_columns:
            cursor.execute(
                "ALTER TABLE learning_sessions "
                "ADD COLUMN custom_topic_count INTEGER"
            )
```

No default count: old rows migrate to SQL NULL. Do not infer requested count
from existing nodes or change the generation schema version.

- [ ] **Step 4: Extend SQLite session creation.** Append this parameter to
      `LearningManager.create_learning_session` after `resolved_mode`:

```python
        custom_topic_count: Optional[int] = None,
```

Replace its INSERT SQL with:

```sql
                INSERT INTO learning_sessions (
                    id, user_id, query, course_title, mode, resolved_mode,
                    custom_topic_count, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Replace its parameter tuple with:

```python
                (
                    session_id,
                    user_id,
                    query,
                    course_title,
                    mode,
                    resolved_mode,
                    custom_topic_count,
                    now,
                    now,
                ),
```

Add this entry beside mode fields in the returned session dictionary:

```python
                "custom_topic_count": custom_topic_count,
```

Keep transaction handling, logging, generated IDs, and node counts unchanged.
Repositories persist a validated request value; they do not duplicate the
request model's cross-field validation.

- [ ] **Step 5: Extend detail/list reads and resolved-mode updates.** In
      `get_learning_session` add to SELECT after `ls.resolved_mode`:

```sql
                    ls.custom_topic_count,
```

Add to its returned dictionary:

```python
                "custom_topic_count": row["custom_topic_count"],
```

In the **second**, paginated query of `get_sessions_list`, add this projection
inside its `session_status` CTE after `ls.course_title`:

```sql
                        ls.custom_topic_count,
```

Add to its outer SELECT after `ss.course_title`:

```sql
                    ss.custom_topic_count,
```

Add to each result dictionary after `course_title`:

```python
                    "custom_topic_count": row["custom_topic_count"],
```

The first count-only query needs no new projection. The public dashboard
summary schema is unchanged; this is the repository row contract.
In `update_session_resolved_mode`, replace the docstring and guard:

```python
        """Persist resolved depth mode (lite|full|custom) on a session."""
        if resolved_mode not in ("lite", "full", "custom"):
            raise ValueError(f"Invalid resolved_mode: {resolved_mode}")
```

- [ ] **Step 6: Verify GREEN.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_mode_persistence server.tests.test_generation_migrations server.tests.test_sqlite_repositories -v
```

Expected: fresh/legacy initialization is repeatable, pre-existing data is
readable, adapters accept the count, and generated node totals remain actual
counts. Existing generation migration tests pass with no migration edits.

- [ ] **Step 7: Selectively stage and commit.**

```powershell
git add -p -- server/database/learning_persistence.py server/tests/test_depth_mode_persistence.py
git diff --cached --name-only
git diff --cached --check
git diff --cached -- server/database/learning_persistence.py server/tests/test_depth_mode_persistence.py
git commit -m "feat(storage): persist and migrate sqlite custom session counts"
```

## Task 6: Preserve counts in atomic SQLite generation shells

**Files:**
- Modify: `server/database/generation_jobs.py`.
- Test: `server/tests/test_generation_jobs.py`.

- [ ] **Step 1: Add shell round-trip and repeated-startup tests.** Import
      `SqliteGenerationJobRepository` from
      `server.database.repositories.sqlite`. Add these methods to
      `GenerationJobStoreTests`:

```python
    def test_custom_shell_count_round_trips_independently(self) -> None:
        repository = SqliteGenerationJobRepository(self.store)
        learning = LearningManager(self.db_path)
        for count in (1, 2, 5, 30):
            with self.subTest(count=count):
                session, job = repository.create_session_shell_and_job(
                    query="CSS",
                    user_id=None,
                    mode="custom",
                    custom_topic_count=count,
                    web_search_requested=False,
                    now=self.now,
                )
                self.assertEqual(session["custom_topic_count"], count)
                self.assertEqual(session["mode"], "custom")
                self.assertIsNone(session["resolved_mode"])
                self.assertFalse(session["title_finalized"])
                loaded = learning.get_learning_session(session["id"])
                assert loaded is not None
                self.assertEqual(loaded["custom_topic_count"], count)
                self.assertEqual(loaded["total_nodes"], 0)
                self.assertEqual(job.session_id, session["id"])
                self.assertEqual(job.counts.topics_total, 0)

    def test_legacy_shell_calls_keep_null_count(self) -> None:
        learning = LearningManager(self.db_path)
        for mode in ("auto", "lite", "full"):
            with self.subTest(mode=mode):
                session, _ = self.store.create_session_shell_and_job(
                    query="CSS",
                    user_id=None,
                    mode=mode,
                    web_search_requested=False,
                    now=self.now,
                )
                self.assertIsNone(session["custom_topic_count"])
                loaded = learning.get_learning_session(session["id"])
                assert loaded is not None
                self.assertIsNone(loaded["custom_topic_count"])

    def test_repeated_startup_preserves_custom_shell_count(self) -> None:
        session, job = self.store.create_session_shell_and_job(
            query="CSS",
            user_id=None,
            mode="custom",
            custom_topic_count=2,
            web_search_requested=False,
            now=self.now,
        )
        learning = LearningManager(self.db_path)
        for _ in range(2):
            learning.init_learning_tables()
            initialize_generation_schema(self.db_path)
        loaded = learning.get_learning_session(session["id"])
        assert loaded is not None
        self.assertEqual(loaded["custom_topic_count"], 2)
        restored = self.store.get_by_session(session["id"])
        assert restored is not None
        self.assertEqual(restored.id, job.id)
        self.assertEqual(restored.stage, GenerationStage.INITIALIZING)
```

- [ ] **Step 2: Verify RED.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_generation_jobs -v
```

Expected: shell creation rejects the keyword, and old shell results lack the
explicit nullable count field.

- [ ] **Step 3: Extend only shell persistence.** Append this parameter after
      `now` in `GenerationJobStore.create_session_shell_and_job`:

```python
        custom_topic_count: Optional[int] = None,
```

Replace only its learning-session INSERT with:

```sql
                INSERT INTO learning_sessions (
                    id, user_id, query, course_title, mode, resolved_mode,
                    custom_topic_count, title_finalized, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
```

Use this bound tuple:

```python
                (
                    session_id,
                    user_id,
                    query,
                    query.strip(),
                    mode,
                    None,
                    custom_topic_count,
                    now_iso,
                    now_iso,
                ),
```

Add to the returned `session` dictionary beside mode fields:

```python
            "custom_topic_count": custom_topic_count,
```

Keep both INSERTs inside the existing transaction. Keep the job record,
`GenerationCounts`, locks, transitions, and generated totals unchanged. The
count belongs to the session request, not the job's actual progress counters.

- [ ] **Step 4: Verify GREEN with persistence integration regressions.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_generation_jobs server.tests.test_depth_mode_persistence server.tests.test_generation_persistence_integration -v
```

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- server/database/generation_jobs.py server/tests/test_generation_jobs.py
git diff --cached --name-only
git diff --cached --check
git diff --cached -- server/database/generation_jobs.py server/tests/test_generation_jobs.py
git commit -m "feat(storage): retain custom count in sqlite generation shells"
```

## Task 7: Match session count behavior on MongoDB

**Files:**
- Modify: `server/database/repositories/mongo_learning.py`.
- Test: `server/tests/test_mongo_learning.py`.

- [ ] **Step 1: Add mocked session round-trip and legacy-document tests.**
      Add these methods to `MongoLearningTests`. Existing collection mocks
      isolate each collection; no Atlas or new mocking package is needed.

```python
    def test_custom_session_count_round_trips_independently(self) -> None:
        sessions = self.database["learning_sessions"]
        nodes = self.database["concept_nodes"]
        for count in (1, 2, 5, 30):
            with self.subTest(count=count):
                result = self.repository.create_learning_session(
                    "CSS",
                    "CSS",
                    mode="custom",
                    resolved_mode="custom",
                    custom_topic_count=count,
                )
                inserted = sessions.insert_one.call_args.args[0]
                self.assertEqual(inserted["custom_topic_count"], count)
                self.assertEqual(result["custom_topic_count"], count)
                sessions.find_one.return_value = dict(inserted)
                for actual in (0, 1):
                    nodes.count_documents.side_effect = [actual, 0]
                    loaded = self.repository.get_learning_session(
                        result["id"]
                    )
                    assert loaded is not None
                    self.assertEqual(loaded["custom_topic_count"], count)
                    self.assertEqual(loaded["total_nodes"], actual)
                    self.assertEqual(loaded["mode"], "custom")
                    self.assertEqual(loaded["resolved_mode"], "custom")
                cursor = sessions.find.return_value
                chain = cursor.sort.return_value.skip.return_value
                chain.limit.return_value = [dict(inserted)]
                sessions.count_documents.return_value = 1
                nodes.count_documents.side_effect = [1, 0]
                revisions = self.database["revision_sessions"]
                revisions.count_documents.return_value = 0
                listed, total = self.repository.get_sessions_list(None)
                self.assertEqual(total, 1)
                self.assertEqual(listed[0]["custom_topic_count"], count)
                self.assertEqual(listed[0]["total_nodes"], 1)

    def test_existing_modes_create_null_count_documents(self) -> None:
        sessions = self.database["learning_sessions"]
        for mode in ("auto", "lite", "full"):
            with self.subTest(mode=mode):
                result = self.repository.create_learning_session(
                    "CSS", "CSS", mode=mode
                )
                inserted = sessions.insert_one.call_args.args[0]
                self.assertIsNone(inserted["custom_topic_count"])
                self.assertIsNone(result["custom_topic_count"])

    def test_legacy_document_reads_and_lists_null_count(self) -> None:
        sessions = self.database["learning_sessions"]
        document = {
            "_id": "old",
            "query": "Old query",
            "course_title": "Old title",
            "created_at": "2026-08-03T11:00:00Z",
            "updated_at": "2026-08-03T11:00:00Z",
        }
        sessions.find_one.return_value = dict(document)
        self.database["concept_nodes"].count_documents.return_value = 0
        for _ in range(2):
            loaded = self.repository.get_learning_session("old")
            assert loaded is not None
            self.assertEqual(loaded["query"], "Old query")
            self.assertIsNone(loaded["custom_topic_count"])
        cursor = sessions.find.return_value
        cursor.sort.return_value.skip.return_value.limit.return_value = [
            dict(document)
        ]
        sessions.count_documents.return_value = 1
        self.database["revision_sessions"].count_documents.return_value = 0
        listed, total = self.repository.get_sessions_list(None)
        self.assertEqual(total, 1)
        self.assertIsNone(listed[0]["custom_topic_count"])
        self.assertNotIn("custom_topic_count", document)

    def test_update_resolved_mode_accepts_custom(self) -> None:
        sessions = self.database["learning_sessions"]
        sessions.update_one.return_value.matched_count = 1
        self.repository.update_session_resolved_mode("s1", "custom")
        update = sessions.update_one.call_args.args[1]
        self.assertEqual(update["$set"]["resolved_mode"], "custom")
        self.assertNotIn("custom_topic_count", update["$set"])
        with self.assertRaises(ValueError):
            self.repository.update_session_resolved_mode("s1", "turbo")
```

- [ ] **Step 2: Verify RED.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_mongo_learning -v
```

Expected: unsupported keyword, missing legacy count key, and rejected Custom
resolved-mode update.

- [ ] **Step 3: Implement Mongo session field parity.** Append to
      `create_learning_session` after `resolved_mode`:

```python
        custom_topic_count: Optional[int] = None,
```

Add to its `document` beside mode fields:

```python
            "custom_topic_count": custom_topic_count,
```

In `get_learning_session`, immediately after `document_to_row`:

```python
        row.setdefault("custom_topic_count", None)
```

In `get_sessions_list`, immediately after `document_to_row(item)` inside the
loop:

```python
            row.setdefault("custom_topic_count", None)
```

Replace only the resolved-mode guard in `update_session_resolved_mode`:

```python
        if resolved_mode not in ("lite", "full", "custom"):
            raise ValueError(f"Invalid resolved_mode: {resolved_mode}")
```

Preserve node-count queries and existing document mapping. Mongo needs no
column migration; missing keys normalize to `None` on read, without rewriting
old documents. Do not change `mongo_common.py` or Mongo indexes.

- [ ] **Step 4: Verify GREEN and cross-store session tests.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_mongo_learning server.tests.test_depth_mode_persistence server.tests.test_repository_contracts -v
```

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- server/database/repositories/mongo_learning.py server/tests/test_mongo_learning.py
git diff --cached --name-only
git diff --cached --check
git diff --cached -- server/database/repositories/mongo_learning.py server/tests/test_mongo_learning.py
git commit -m "feat(storage): preserve custom session counts in mongo"
```

## Task 8: Match transactional generation shell counts on MongoDB

**Files:**
- Modify: `server/database/repositories/mongo_jobs.py`.
- Test: `server/tests/test_mongo_jobs.py`.

- [ ] **Step 1: Add shell tests with collection-specific mocks.** Import
      `MongoLearningRepository` from
      `server.database.repositories.mongo_learning`. Append this test class
      before the existing main guard. Keep `make_job_document` unchanged:

```python
class MongoCustomShellTests(unittest.TestCase):
    def setUp(self) -> None:
        self.database = MagicMock()
        self.collections: dict[str, MagicMock] = {}

        def collection(name: str) -> MagicMock:
            if name not in self.collections:
                self.collections[name] = MagicMock(name=name)
            return self.collections[name]

        self.database.__getitem__.side_effect = collection
        self.repository = MongoGenerationJobRepository(self.database)
        self.learning = MongoLearningRepository(self.database)
        self.now = datetime(2026, 8, 3, tzinfo=timezone.utc)
        self.transaction = MagicMock(name="transaction")
        session_context = self.database.client.start_session.return_value
        session_context.__enter__.return_value = self.transaction
        session_context.__exit__.return_value = False
        transaction_context = self.transaction.start_transaction.return_value
        transaction_context.__enter__.return_value = self.transaction
        transaction_context.__exit__.return_value = False

        def find_job(query: dict) -> dict:
            inserted = self.collections["generation_jobs"].insert_one
            document = make_job_document()
            document.update(inserted.call_args.args[0])
            self.assertEqual(query["session_id"], document["session_id"])
            return document

        self.collections["generation_jobs"].find_one.side_effect = find_job

    def test_custom_shell_round_trips_count_in_one_transaction(self) -> None:
        sessions = self.database["learning_sessions"]
        jobs = self.database["generation_jobs"]
        nodes = self.database["concept_nodes"]
        for count in (1, 2, 5, 30):
            with self.subTest(count=count):
                session, job = self.repository.create_session_shell_and_job(
                    query="CSS",
                    user_id=None,
                    mode="custom",
                    custom_topic_count=count,
                    web_search_requested=False,
                    now=self.now,
                )
                inserted = sessions.insert_one.call_args.args[0]
                self.assertEqual(inserted["custom_topic_count"], count)
                self.assertEqual(session["custom_topic_count"], count)
                self.assertEqual(session["mode"], "custom")
                self.assertIsNone(session["resolved_mode"])
                self.assertFalse(session["title_finalized"])
                self.assertEqual(job.session_id, session["id"])
                self.assertEqual(job.counts.topics_total, 0)
                self.assertIs(
                    sessions.insert_one.call_args.kwargs["session"],
                    self.transaction,
                )
                self.assertIs(
                    jobs.insert_one.call_args.kwargs["session"],
                    self.transaction,
                )
                sessions.find_one.return_value = dict(inserted)
                nodes.count_documents.return_value = 0
                loaded = self.learning.get_learning_session(session["id"])
                assert loaded is not None
                self.assertEqual(loaded["custom_topic_count"], count)
                self.assertEqual(loaded["total_nodes"], 0)
        self.assertEqual(self.transaction.start_transaction.call_count, 4)

    def test_existing_shell_calls_return_null_count(self) -> None:
        sessions = self.database["learning_sessions"]
        for mode in ("auto", "lite", "full"):
            with self.subTest(mode=mode):
                session, _ = self.repository.create_session_shell_and_job(
                    query="CSS",
                    user_id=None,
                    mode=mode,
                    web_search_requested=False,
                    now=self.now,
                )
                inserted = sessions.insert_one.call_args.args[0]
                self.assertIsNone(inserted["custom_topic_count"])
                self.assertIsNone(session["custom_topic_count"])
                sessions.find_one.return_value = dict(inserted)
                nodes = self.database["concept_nodes"]
                nodes.count_documents.return_value = 0
                loaded = self.learning.get_learning_session(session["id"])
                assert loaded is not None
                self.assertIsNone(loaded["custom_topic_count"])
```

These mocks return the actual inserted session/job documents through the
real repository readers. They test round trips instead of manufacturing an
expected count only in a `find_one.return_value`. Separate collection mocks
also prevent the job insert from overwriting session insert observations.

- [ ] **Step 2: Verify RED.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_mongo_jobs.MongoCustomShellTests -v
```

Expected: the shell method rejects the new keyword and old returned shells
lack `custom_topic_count`.

- [ ] **Step 3: Add the Mongo shell parameter and both projections.** Append
      to `MongoGenerationJobRepository.create_session_shell_and_job` after
      `now`:

```python
        custom_topic_count: Optional[int] = None,
```

Add the exact entry below to **both** `session_document` (persisted) and
`session_row` (returned), beside mode fields:

```python
            "custom_topic_count": custom_topic_count,
```

Keep both inserts inside the existing session transaction. Do not add the
request count to `job_document`, actual job topic counts, or secrets. No
Mongo generation job schema migration is necessary.

- [ ] **Step 4: Verify GREEN across both shell and session backends.**

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_mongo_jobs server.tests.test_mongo_learning server.tests.test_generation_jobs server.tests.test_depth_mode_persistence server.tests.test_repository_contracts -v
```

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- server/database/repositories/mongo_jobs.py server/tests/test_mongo_jobs.py
git diff --cached --name-only
git diff --cached --check
git diff --cached -- server/database/repositories/mongo_jobs.py server/tests/test_mongo_jobs.py
git commit -m "feat(storage): retain custom count in mongo generation shells"
```

## P1 exit verification and handoff

- [ ] Run all focused P1 tests together and relevant unchanged regressions:

```powershell
server/.venv/Scripts/python.exe -m unittest server.tests.test_depth_mode_schema server.tests.test_depth_mode_persistence server.tests.test_generation_jobs server.tests.test_mongo_jobs server.tests.test_mongo_learning server.tests.test_repository_contracts server.tests.test_sqlite_repositories server.tests.test_generation_migrations server.tests.test_generation_contracts server.tests.test_generation_api server.tests.test_generation_session_view server.tests.test_generation_persistence_integration server.tests.test_planner_mode -v
npm --prefix client run test -- --run src/types/learning.test.ts
npm --prefix client run build
client/node_modules/.bin/eslint.cmd client/src/types/learning.ts client/src/types/learning.test.ts
```

Expected: focused backend suite and client contract tests pass; build and
changed-file lint exit zero. Preserve exact outcomes, including pre-existing
warnings. Full application regression/build/lint remains the workflow's final
gate; do not execute or claim downstream Custom runtime acceptance in P1.

- [ ] Verify new Python line coverage without adding a dependency.
      `coverage.py` is not installed in `server/.venv` at planning time. Use
      the available standard-library tracer, with generated artifacts outside
      the checkout:

```powershell
$p1TraceDir = Join-Path $env:TEMP 'a2ui-custom-p1-trace'
New-Item -ItemType Directory -Force -Path $p1TraceDir | Out-Null
server/.venv/Scripts/python.exe -m trace --count --missing --summary --coverdir $p1TraceDir --ignore-dir server/.venv --module unittest server.tests.test_depth_mode_schema server.tests.test_depth_mode_persistence server.tests.test_generation_jobs server.tests.test_mongo_jobs server.tests.test_mongo_learning server.tests.test_repository_contracts
git diff --unified=0 $p1Base HEAD -- server/schemas/learning.py server/routers/learning.py server/database/learning_persistence.py server/database/generation_jobs.py server/database/repositories/protocols.py server/database/repositories/mongo_learning.py server/database/repositories/mongo_jobs.py
```

Compare added executable lines from the feature commits with the `.cover`
reports under `$p1TraceDir`. Count executed added lines divided by all added
executable lines; require **greater than 80%** and record numerator/denominator.
Use only P1 feature commit hunks if other agents have committed since
`$p1Base`. Ignore comments, type-only Protocol stubs and erased TypeScript
declarations. Whole-module coverage for existing 1,000-3,000-line files is
not new-code coverage. The helper's unknown-mode branch and old duplicate
outline bound guards are existing behavior; cover all newly added paths,
including strict request rejection, custom mode validation, migration present
and absent branches, and legacy Mongo normalization. `trace` provides line
coverage, not a branch-coverage percentage; report that limitation honestly.
The client changes are erased types and are verified by `tsc`, not a V8
runtime coverage percentage. Do not add unrelated `getVisibleQuiz` tests to
inflate a type-change coverage number.

- [ ] Run whitespace and bytecode diagnostics on exact production paths:

```powershell
git diff --check -- client/src/types/learning.ts client/src/types/learning.test.ts server/schemas/learning.py server/routers/learning.py server/database/learning_persistence.py server/database/generation_jobs.py server/database/repositories/protocols.py server/database/repositories/mongo_learning.py server/database/repositories/mongo_jobs.py server/tests/test_depth_mode_schema.py server/tests/test_depth_mode_persistence.py server/tests/test_generation_jobs.py server/tests/test_mongo_jobs.py server/tests/test_mongo_learning.py server/tests/test_repository_contracts.py
server/.venv/Scripts/python.exe -m compileall -q server/schemas/learning.py server/routers/learning.py server/database/learning_persistence.py server/database/generation_jobs.py server/database/repositories/protocols.py server/database/repositories/mongo_learning.py server/database/repositories/mongo_jobs.py
```

No new diagnostics should be introduced. Do not restore user baseline hunks
to make a broader check pass. Compare the working tree and committed feature
diffs with the recorded baseline before the handoff.

- [ ] Record completion using the existing git-notes workflow after acquiring
      the git mutation slot:

```powershell
git notes append -m "P1 complete: strict Custom contracts; 1-30 outlines with retained Lite/Full bounds; independent SQLite/Mongo requested counts; idempotent legacy migration and shell/session parity verified."
```

Report the eight implementation commit hashes, precise RED/GREEN commands and
results, build/lint diagnostics, measured new-line coverage, and preservation
of user changes. The orchestrator owns updates to workflow state documents;
do not edit them as part of this implementation plan.

### Acceptance proof matrix

| Required P1 proof | Exact planned test(s) |
| --- | --- |
| Selected/resolved Custom unions | Task 1 compiler-checked objects; Task 3 `test_depth_aliases_accept_custom` |
| Strict integer 1/2/intermediate/30 accepted | Task 3 `test_requests_accept_exact_integer_boundaries` |
| bool, float, numeric string, null, missing, 0, negative, 31 rejected | Task 3 request Python/JSON cases and response invalid cases |
| Other modes reject non-null count; old requests work | Task 3 old-mode/default and non-custom rejection cases |
| BOTH minimum gates accept 1/2/30 and reject 0/31 | Task 2 outline construction and direct field-validator cases |
| Lite 3-10 / Full 10-30 preserved; Custom exact | Existing schema bounds tests plus Task 2 short-mode/helper tests |
| Count distinct from actual nodes/progress | Task 1 zero-node session; Tasks 3/5/6/7/8 zero/one actual nodes and zero job topics |
| Repository creation contract default compatibility | Task 4 signature test; Tasks 5/6 real SQLite adapters |
| SQLite session and shell create/read/list parity | Tasks 5/6 counts 1/2/5/30 |
| Mongo session and shell create/read/list parity | Tasks 7/8 counts 1/2/5/30, actual inserted-document readers |
| Legacy row/document readable with null count | Task 5 real pre-column database; Task 7 missing-field document |
| Initialization and migration idempotent | Task 5 fresh/legacy repeated init; Task 6 repeated learning/generation startup |
| Persisted resolved Custom mode update | Tasks 5/7 update guard tests, preserving requested count |
| TDD, diagnostics, build, preservation, coverage evidence | RED/GREEN per task and the exit commands above |

### Risks and boundaries for the handoff

1. P1 expands the request contract before runtime/planner consumers support
   Custom. Do not present P1 as a deployable end-to-end feature; downstream
   implementation must forward the requested count, preserve it through
   runtime responses, and use the exact-count helper.
2. Both persistence update methods currently whitelist only Lite/Full.
   Tasks 5/7 extend those guards; otherwise graph initialization would fail
   when saving resolved Custom even though create/read tests pass.
3. SQLite initialization must run `LearningManager.init_learning_tables()`
   before generation shells are written. The new nullable column belongs to
   that initializer, which still runs on databases whose generation migration
   version is already current. Keep the versioned generation migration file
   unchanged.
4. Mongo tests mock transport and transactions; they prove repository data
   contracts without live Atlas. They do not claim distributed transaction
   integration against an external cluster.
5. Request and response models both enforce the approved count relationship.
   Legacy Auto/Lite/Full or unspecified-mode sessions remain readable; any
   newly produced Custom response must contain its persisted requested count.
6. Shared files already contain user edits. The listed selective-staging
   audit is required on every task; an exact-path `git add` alone could still
   accidentally include unrelated baseline header changes.

### Planner verification (2026-10-02)

The planner reran the six-module focused backend baseline: **30 tests passed**.
The existing client type suite: **8 tests passed**. The exact TypeScript
compiler command in Task 1 exited **0** before new tests were added.
All 34 Python snippets were syntax-parsed, wrapping dictionary-entry fragments
as dictionary literals; all referenced repository file paths exist. Python
code snippets respect the 80-character limit. The plan has eight scoped tasks
and an explicit proof
for every P1 exit criterion. This is plan validation, not a claim that the
proposed implementation or its future RED/GREEN tests have run.
