# Feature Landscape: Dynamic Quiz Generation

**Domain:** Adaptive Learning — Complexity-Based Multi-Quiz Assessment
**Researched:** 2026-02-17
**Overall confidence:** HIGH (codebase-verified + established pedagogical patterns)

## Table Stakes

Features users expect in a complexity-driven multi-quiz system. Missing = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Dependencies on Existing |
|---------|--------------|------------|--------------------------|
| **Planner assigns complexity per topic** | Without complexity labels, quiz_count has no rationale. Users (and the system) need to know *why* a topic gets more quizzes. Basic/Intermediate/Advanced is the minimum taxonomy. | Low | `TopicNode` schema needs 2 new fields (`complexity`, `quiz_count`). `PLANNER_SYSTEM_PROMPT` needs updated instructions. Planner already outputs `TopicNode` list via `CourseOutline`. |
| **Planner assigns quiz_count (1-5) per topic** | The core value proposition. Without variable quiz counts, there's no "dynamic" in dynamic quiz generation. Users see the same single quiz for every topic. | Low | Same schema change as complexity. `TopicNode` already has `index`, `title`, `summary_for_context`, `key_terms`. Adding `quiz_count: int = 1` is additive. |
| **Quizzer generates N quizzes per topic** | If planner says "3 quizzes" but quizzer only generates 1, the system is lying. Generation must match the plan. | Medium | `quizzer_agent.generate_quiz()` currently returns single `QuizCard`. Must loop/batch to produce `quiz_count` quizzes and return `QuizSet`. Existing `QuizSet` schema already supports 1-5 quizzes. |
| **Difficulty gradient across quiz chain** | Research-backed: Bloom's taxonomy progression (Recall → Application → Synthesis) is the standard for multi-quiz assessment. Without gradient, multiple quizzes feel like repetitive busywork instead of deepening assessment. | Medium | `QuizCard.difficulty` field already exists (`easy`/`medium`/`hard`). `QUIZZER_SYSTEM_PROMPT` already describes difficulty calibration. Must enforce *ordering* when `quiz_count > 1`. |
| **Orchestrator passes quiz_count to quizzer** | Orchestrator is the "traffic controller." If it doesn't read quiz_count from the plan and pass it to the quizzer, the pipeline is broken. | Low | `CourseOrchestrator._generate_concept_unit()` already calls `quizzer_agent.generate_quiz(topic, content)`. Must extract `topic.quiz_count` and pass it. Then use `create_concept_node` with `quiz_set=` instead of `quiz=`. |
| **Backend requires ALL quizzes passed for mastery** | `_check_multi_quiz_mastery()` already implements this — checks `DISTINCT quiz_index WHERE is_correct = 1` against total. But currently never triggered because quiz_count is always 1. Must verify it actually works when quizzer generates >1 quiz. | Low | `_check_multi_quiz_mastery()` exists in `learning_persistence.py:2352`. Logic is correct for multi-quiz. Just needs real multi-quiz data to exercise it. |
| **Sequential quiz progression within a set** | Users must complete quiz N before seeing quiz N+1. Random access through quiz chains breaks the difficulty gradient. Already partially implemented: `current_index` in `QuizSet`, `update_quiz_set_progress()` method exists. | Medium | `update_quiz_set_progress()` exists at `learning_persistence.py:2122`. Frontend `ConceptCard.tsx` reads `current_index` and renders `Quiz X of Y`. But the **server-side enforcement** (preventing skip to quiz N+1 before passing quiz N) needs verification/implementation. |
| **Frontend renders quiz chain with progress** | "Quiz X of Y" display logic already exists in `ConceptCard.tsx:274`. Must verify it works correctly when >1 quiz actually arrives from server. | Low | `QuizSetHidden` has `total_quizzes` field. `ConceptCard` already reads `current_index` and renders progress. `QuizFeedback` shows "Quiz {currentQuizIndex + 1} of {totalQuizzes}". Tests exist at `ConceptCard.test.tsx:180` confirming "Quiz 1 of 3" rendering. |

## Differentiators

Features that set this apart from typical quiz systems. Not expected by users, but valued when present.

| Feature | Value Proposition | Complexity | Dependencies on Existing |
|---------|-------------------|------------|--------------------------|
| **Complexity-aware difficulty calibration** | Most quiz systems use uniform difficulty. Having the *planner* decide complexity and the *quizzer* calibrate accordingly means "Introduction to Variables" gets 1 easy recall quiz while "Quantum Entanglement" gets 3-5 quizzes spanning recall→synthesis. This is pedagogically superior and feels intelligent. | Low | Prompt engineering in `QUIZZER_SYSTEM_PROMPT`. The quizzer already has difficulty calibration instructions (easy/medium/hard). Adding complexity context from the planner enriches question quality. |
| **Inter-quiz context injection** | Quiz 2 references Quiz 1's concept. Quiz 3 synthesizes both. This creates a "narrative" through the quiz chain rather than isolated questions. Standard in IRT (Item Response Theory) assessments but rare in AI-generated quizzes. | Medium | Requires the quizzer to receive context about previously generated quizzes in the chain. Could pass quiz N's question_text as context for quiz N+1. Not implemented yet — current `generate_quiz()` has no chain awareness. |
| **Difficulty label visible to learner** | Showing "Easy", "Medium", "Hard" badges on each quiz in the chain gives learners metacognitive awareness — they understand why the assessment is getting harder and can calibrate expectations. | Low | `QuizCard.difficulty` is already in the schema. `QuizCardHidden.difficulty` is also exposed to client. Frontend just needs to render it (not currently displayed in `ConceptCard.tsx` quiz section). |
| **Per-quiz feedback with misconception targeting** | Each quiz in the chain has its own set of misconception-targeting distractors. A 3-quiz chain diagnoses 3x more misconceptions than a single quiz. The explanation engine already supports per-option explanations. | Low | Already implemented at option level. `QuizOption.explanation` exists. `QuizFeedback.tsx` renders explanations per option. Multi-quiz just means this happens N times. |
| **Complexity badge on topic cards** | Showing "Basic" / "Intermediate" / "Advanced" labels on topic cards gives learners an overview of the course's difficulty landscape before diving in. Sets expectations. | Low | `TopicNode` will get `complexity` field. Frontend `ConceptNode` type needs matching field. `ConceptCard` or the course overview needs to render it. |
| **Adaptive quiz_count override** | Allow the system to adjust quiz_count based on learner performance mid-course. If a learner aces early Advanced topics, reduce quiz counts for later ones. If they struggle with Basic topics, increase them. | High | Requires real-time learner modeling. Not in scope for v1.2. Would need a feedback loop from quiz results back to the orchestrator, plus re-generation capabilities. Defer to future milestone. |
| **Quiz chain retry granularity** | When a learner fails quiz 3 of 5, they should only need to retry quiz 3, not the entire chain. Current `_check_multi_quiz_mastery` already tracks per-index correctness, so this is partially supported. | Low | `quiz_index` is tracked per attempt. The retry mechanism in `ConceptCard` needs to re-enter `IN_QUIZ` state at the failed quiz index, not reset to quiz 0. `update_quiz_set_progress()` can set `current_index` back to the failed quiz. |

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Dynamic question banks (multiple questions per difficulty level)** | Massive scope increase. Generating 3-5 alternate questions per difficulty level means 15-25 questions per topic. LLM cost, latency, and storage explode. The value of "fresh questions on retry" doesn't justify the cost for v1.2. | Generate exactly `quiz_count` questions. On retry, the learner retries the same question (options reshuffled via existing CSPRNG shuffle). This is pedagogically valid — retrieval practice with the same question is effective. |
| **Timed quizzes** | Adds anxiety, accessibility concerns, and implementation complexity (WebSocket timers, server-side time tracking, timezone handling). No pedagogical benefit for mastery-based learning. | Let learners take their time. The mastery gate (must pass all quizzes) is sufficient quality control. |
| **Partial credit / multi-select questions** | Each quiz is 4-option single-correct. Changing to multi-select requires schema changes, scoring logic changes, and UI changes across the entire quiz pipeline. Massive blast radius for marginal benefit. | Keep single-correct-answer format. The difficulty gradient (easy→hard) already provides assessment depth without partial credit. |
| **Learner-chosen difficulty** | Defeats the purpose of AI-driven complexity assessment. If learners choose "easy" for every topic, the system can't validate deep understanding. | Planner assigns complexity. Learner sees the result but can't override it. The system is the expert on curriculum design. |
| **Question type variety (fill-in-blank, matching, free-text)** | Each question type requires its own schema, rendering component, evaluation logic, and prompt design. Scope explosion for v1.2. | Stick with 4-option MCQ. It's the format the entire pipeline is built around (`QuizCard` schema, `QuizOption` validation, `evaluate_quiz_answer`, `ConceptCard` radio buttons). |
| **Analytics dashboard for quiz performance** | Out of scope for the quiz generation milestone. Would require new tables, aggregation queries, chart components. | Existing `QuizAttemptHistory` and `RevisionSummary` schemas provide basic tracking. Analytics can be a separate milestone. |
| **Cross-topic synthesis quizzes** | A final "capstone quiz" that tests connections across all 5-7 topics is pedagogically interesting but architecturally different — it requires all topics to be generated before the quiz can reference them. Breaks the scatter-gather parallelism. | The Advanced-level quizzes within individual topics already test connections to previous topics (via `summary_for_context`). True cross-topic synthesis is better suited for the existing Revision system. |

## Feature Dependencies

```
TopicNode schema (complexity + quiz_count)
  ├── Planner prompt update (assigns complexity/quiz_count)
  │     └── Orchestrator reads quiz_count from TopicNode
  │           └── Quizzer generates N quizzes (returns QuizSet)
  │                 └── Orchestrator passes QuizSet to create_concept_node
  │                       └── Backend progression logic (already exists)
  │                             └── Frontend verification (already exists)
  │
  └── Frontend complexity badge (optional, low priority)
        └── ConceptNode type update (add complexity field)

Difficulty gradient enforcement
  └── Quizzer prompt update (ordered difficulty per quiz_count)
        └── Depends on: quiz_count passed to quizzer

Inter-quiz context injection (differentiator)
  └── Quizzer receives previous quiz context
        └── Depends on: sequential quiz generation within quizzer
```

**Critical path:** TopicNode schema → Planner prompt → Orchestrator wiring → Quizzer generation → Frontend verification

**Non-blocking:** Complexity badges, difficulty labels, inter-quiz context can be added in parallel or deferred.

## MVP Recommendation

### Must Have (blocks progression)

1. **TopicNode schema update** — Add `complexity: Literal["Basic", "Intermediate", "Advanced"]` and `quiz_count: int` (1-5) to `TopicNode` in `server/schemas/learning.py`. Both with defaults for backward compatibility (`complexity="Intermediate"`, `quiz_count=1`).

2. **Planner prompt update** — Enhance `PLANNER_SYSTEM_PROMPT` with instructions to assess topic complexity and assign quiz_count. This is the brain of the feature — the planner's judgment determines the entire downstream behavior.

3. **Quizzer multi-quiz generation** — Modify `QuizzerAgent.generate_quiz()` to accept `quiz_count`, loop to generate N quizzes with difficulty gradient. Return `QuizSet` instead of `QuizCard`. Key design decision: generate sequentially (quiz N informs quiz N+1's prompt) or in parallel (faster, but no inter-quiz awareness). Recommend sequential for quality.

4. **Orchestrator wiring** — Update `CourseOrchestrator._generate_concept_unit()` to read `topic.quiz_count`, pass to quizzer, receive `QuizSet`, and call `create_concept_node(quiz_set=quiz_set)` instead of `create_concept_node(quiz=quiz)`.

5. **Backend progression verification** — The multi-quiz mastery logic exists but is untested with real multi-quiz data. Must verify: (a) `_check_multi_quiz_mastery` works correctly, (b) `update_quiz_set_progress` advances `current_index` on correct answers, (c) node transitions from `IN_QUIZ` → `SHOWING_FEEDBACK` → back to `IN_QUIZ` for next quiz work correctly, (d) only marks `COMPLETED` when all quizzes passed.

6. **Frontend verification** — Existing "Quiz X of Y" and `QuizFeedback` with `onNextQuiz` handler exist but may need fixes for the actual multi-quiz flow (the `onNextQuiz` handler in ConceptCard is currently a no-op empty function).

### Should Have (improves quality)

7. **Difficulty gradient enforcement** — Not just suggesting difficulty in the prompt, but validating that generated quizzes actually follow easy→medium→hard ordering. Could be a `@field_validator` on `QuizSet` or post-generation validation in the orchestrator.

8. **Complexity badge rendering** — Show Basic/Intermediate/Advanced on topic cards. Small UI change with high information value.

### Defer

9. **Inter-quiz context injection** — Valuable but not blocking. Can be added as prompt enhancement later.
10. **Adaptive quiz_count override** — Too complex for v1.2. Needs learner modeling.
11. **Analytics dashboard** — Separate milestone.

## Existing Infrastructure Inventory

### Already Built (use as-is)

| Component | Location | What It Does | Status |
|-----------|----------|-------------|--------|
| `QuizSet` schema | `server/schemas/learning.py:264` | Container for 1-5 quizzes with `current_index` | Working, validated |
| `QuizSetHidden` schema | `server/schemas/learning.py:310` | Hidden version for IN_QUIZ state | Working |
| `QuizDifficulty` enum | `server/schemas/learning.py:104` | easy/medium/hard values | Working |
| `hide_quiz_set()` | `server/services/quiz_randomization.py:232` | Converts QuizSet → QuizSetHidden | Working |
| `shuffle_quiz_set()` | `server/services/quiz_randomization.py:312` | Shuffles options in each quiz | Working |
| `shuffle_quiz_set_with_seed()` | `server/services/quiz_randomization.py:338` | Deterministic shuffle per quiz | Working |
| `_check_multi_quiz_mastery()` | `server/database/learning_persistence.py:2352` | Checks all quiz indices have correct attempt | Working (untested with real data) |
| `update_quiz_set_progress()` | `server/database/learning_persistence.py:2122` | Updates current_index in quiz_data table | Working |
| `create_quiz_attempt(quiz_index=)` | `server/database/learning_persistence.py:2191` | Records attempt with quiz_index | Working |
| `create_concept_node(quiz_set=)` | `server/database/learning_persistence.py:1372` | Stores QuizSet in quiz_data table | Working |
| Frontend "Quiz X of Y" | `client/src/features/learning/ConceptCard.tsx:274` | Displays quiz chain progress | Working |
| Frontend QuizFeedback multi-quiz | `client/src/features/learning/QuizFeedback.tsx:153` | Shows quiz set progress in feedback | Working |
| Frontend QuizSet types | `client/src/types/learning.ts:117` | TypeScript types for QuizSet/QuizSetHidden | Working |
| QuizSubmission.quiz_index | `server/schemas/learning.py:726` | Submission includes quiz_index field | Working |

### Needs Modification

| Component | Location | What Changes | Effort |
|-----------|----------|-------------|--------|
| `TopicNode` schema | `server/schemas/learning.py:333` | Add `complexity` and `quiz_count` fields | Small |
| `PLANNER_SYSTEM_PROMPT` | `server/agents/planner.py:74` | Add complexity assessment instructions | Medium (prompt engineering) |
| `QUIZZER_SYSTEM_PROMPT` | `server/agents/quizzer.py:89` | Add multi-quiz and difficulty gradient instructions | Medium (prompt engineering) |
| `QuizzerAgent.generate_quiz()` | `server/agents/quizzer.py:261` | Accept quiz_count, loop generation, return QuizSet | Medium |
| `CourseOrchestrator._generate_concept_unit()` | `server/services/course_orchestrator.py:259` | Read quiz_count, pass to quizzer, use QuizSet | Small |
| `ConceptCard onNextQuiz handler` | `client/src/features/learning/ConceptCard.tsx:342` | Currently empty no-op. Must actually advance quiz state. | Medium |
| Frontend `TopicNode` / `ConceptNode` types | `client/src/types/learning.ts` | Add complexity field for badge rendering | Small |

### Needs Verification (exists but untested path)

| Component | Concern | Verification Needed |
|-----------|---------|-------------------|
| Multi-quiz mastery gate | Never exercised with real >1 quiz data | Integration test with 3-quiz QuizSet |
| Quiz set progress advancement | `update_quiz_set_progress` never called in actual flow | Verify router calls it on correct answer when more quizzes remain |
| IN_QUIZ → SHOWING_FEEDBACK → IN_QUIZ loop | State machine supports this? Or does SHOWING_FEEDBACK only go to COMPLETED? | Check valid transitions in `_valid_transitions` dict |
| Regeneration with QuizSet | `regenerate_node()` creates single QuizCard | Must update to generate QuizSet when node had quiz_count > 1 |

## Pedagogical Research Context

### Bloom's Taxonomy Alignment (HIGH confidence — established framework)

The difficulty gradient maps directly to Bloom's revised taxonomy:

| Quiz Position | Bloom's Level | Question Pattern | Example |
|---------------|--------------|-----------------|---------|
| Quiz 1 (Easy) | Remember/Understand | "What is X?" / "Which defines Y?" | Terminology recall, definition matching |
| Quiz 2 (Medium) | Apply/Analyze | "What happens when...?" / "Which example shows...?" | Scenario application, cause-effect |
| Quiz 3+ (Hard) | Analyze/Evaluate/Create | "Why does X lead to Y?" / "How do A and B relate?" | Synthesis across concepts, multi-step reasoning |

This is the standard framework used by Khan Academy, Coursera, and Duolingo for progressive assessment.

### Testing Effect Research (HIGH confidence — well-established)

Retrieval practice (testing) improves long-term retention more than re-study. Multiple retrieval events at increasing difficulty compound the effect:

- **Spacing**: Quiz 1 immediately after reading, Quiz 2 requires recall without content, Quiz 3 requires synthesis
- **Desirable difficulty**: Each subsequent quiz should be slightly harder than the learner expects, forcing deeper processing
- **Interleaving**: Hard quizzes that reference previous topics create interleaved practice, known to improve transfer

### Mastery Learning Model (HIGH confidence — Bloom 1968)

The "all quizzes must pass" gate implements Bloom's mastery learning model:

- Learner demonstrates competence at each level before advancing
- No partial credit or averaging across quiz chain
- Retry is at the individual quiz level, not the entire chain
- This matches the existing `_check_multi_quiz_mastery()` implementation exactly

### Complexity Heuristics for AI-Planned Curricula (MEDIUM confidence — training data)

Recommended heuristics for the planner to assign complexity:

| Quiz Count | When to Assign | Examples |
|------------|---------------|---------|
| 1 quiz | Definitions, introductions, simple facts, vocabulary | "What is a Variable?", "HTTP Methods Overview" |
| 2 quizzes | Processes, comparisons, cause-and-effect | "How DNS Resolution Works", "Stack vs Queue" |
| 3 quizzes | Multi-step concepts, counterintuitive ideas | "Recursion", "Supply and Demand Equilibrium" |
| 4-5 quizzes | Deep synthesis, mathematical reasoning, paradigm shifts | "Quantum Superposition", "General Relativity", "Monads" |

## Sources

- **Codebase analysis:** Direct inspection of `server/schemas/learning.py`, `server/agents/quizzer.py`, `server/agents/planner.py`, `server/services/course_orchestrator.py`, `server/database/learning_persistence.py`, `server/services/quiz_randomization.py`, `client/src/features/learning/ConceptCard.tsx`, `client/src/features/learning/QuizFeedback.tsx`, `client/src/types/learning.ts`
- **Internal spec:** `.planning/codebase/features/dynamic-quiz-generation.md` (existing strategy document)
- **Bloom's Revised Taxonomy:** Anderson & Krathwohl (2001) — standard pedagogical framework
- **Testing Effect:** Roediger & Karpicke (2006) — retrieval practice research
- **Mastery Learning:** Bloom (1968) — mastery-based progression model
- **Pydantic v2:** Context7 `/pydantic/pydantic` — Literal types, field_validator, model_validator patterns confirmed
