# Phase 19: Orchestrator Integration & Backend Progression - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the full backend pipeline so that Planner output (complexity + quiz_count) flows through the Orchestrator to QuizzerAgent (generating QuizSets), into Persistence (storing multi-quiz data), and enforce multi-quiz mastery gating end-to-end. The orchestrator currently calls `generate_quiz()` (single quiz) — it must call `generate_quiz_set()` and pass `quiz_set=` to persistence.

</domain>

<decisions>
## Implementation Decisions

### Orchestrator wiring (generate path)
- In `_generate_concept_unit()` (~line 299): replace `quizzer_agent.generate_quiz(topic, content)` with `quizzer_agent.generate_quiz_set(topic, content, topic.quiz_count)`
- Pass `quiz_set=quiz_set` (not `quiz=quiz`) to `learning_manager.create_concept_node()` — this triggers format_version=1 storage
- For quiz_count=1: `generate_quiz_set()` already delegates internally to `generate_quiz()` and wraps in QuizSet — no special-casing needed in orchestrator
- Backward compatibility is handled by QuizzerAgent's internal delegation, not the orchestrator

### Orchestrator wiring (regeneration path)
- In `regenerate_node()` (~line 574): same change — call `generate_quiz_set()` with the node's original quiz_count
- Must read quiz_count from the existing node data (stored in concept_nodes table via TopicNode)
- If original node has no quiz_count (legacy data), default to 1 — consistent with TopicNode schema default
- Regeneration produces a fresh QuizSet with new questions; existing quiz_attempts for that node are not deleted (historical record preserved) but mastery resets via new quiz_data row

### Mastery gate behavior
- Existing `_check_multi_quiz_mastery()` in learning_persistence.py handles this correctly: all quiz indices 0..N-1 must have at least one correct attempt
- A quiz is "passed" when the user selects the correct option (binary pass/fail per quiz, no score threshold)
- Sequential enforcement: the frontend already gates via `current_index` in quiz_data — user sees quiz at current_index only
- `update_quiz_set_progress()` increments current_index only on correct answer — this IS the sequential enforcement
- No changes needed to mastery logic — it already works for multi-quiz; it just never receives multi-quiz data because the orchestrator doesn't produce it yet

### Retry semantics
- User retries the exact same quiz (same questions, re-shuffled options via shuffle_seed) — not a regenerated quiz
- No retry limit — user can attempt a quiz as many times as needed
- On retry, only the specific failed quiz is retried (current_index doesn't change on failure)
- New quiz_attempt row is created for each attempt (full history preserved)
- These behaviors are already implemented in the persistence layer; no changes needed

### Error handling during generation
- If `generate_quiz_set()` raises an exception, the entire concept unit generation fails — consistent with existing single-quiz behavior
- No partial QuizSet recovery (if LLM returns fewer quizzes than requested, QuizzerAgent's `_enforce_quiz_count` already handles this by padding/trimming)
- The orchestrator should log the quiz_count used for debugging but does not need custom error handling beyond what exists

### Complexity distribution validation
- Optionally call `validate_complexity_distribution()` after planner step as a warning (log, don't block)
- This validates the planner produced varied complexity ratings, not all-same
- If distribution is skewed (>=80% same complexity), log a warning but proceed — the planner prompt engineering from Phase 18 should prevent this in practice

### Claude's Discretion
- Exact logging format and verbosity for multi-quiz generation
- Whether to add integration-level tests vs relying on unit tests from Phases 17-18
- Import organization and any minor refactoring within the orchestrator file
- Test structure and naming conventions

</decisions>

<specifics>
## Specific Ideas

- The gap is surgical: two call sites in course_orchestrator.py need updating (generate path ~line 299, regeneration path ~line 574)
- All downstream infrastructure (QuizzerAgent.generate_quiz_set, persistence QuizSet storage, mastery checking, frontend QuizSet display) is already built and tested in Phases 16-18
- The orchestrator is the last piece connecting the pipeline — once wired, the entire multi-quiz flow is functional end-to-end
- format_version=0 (legacy single quiz) vs format_version=1 (QuizSet) distinction is handled by persistence layer based on whether `quiz=` or `quiz_set=` is passed

</specifics>

<deferred>
## Deferred Ideas

- onNextQuiz handler implementation in frontend — Phase 20
- Complexity/difficulty badge display — Phase 20
- Frontend verification of "Quiz X of Y" UI — Phase 20

</deferred>

---

*Phase: 19-orchestrator-integration-backend-progression*
*Context gathered: 2026-02-17*
