---
phase: 18-planner-complexity
plan: 02
subsystem: ai-agents
tags: [validation, planner, complexity, quiz-count, guardrail, post-generation]

# Dependency graph
requires:
  - phase: 18-planner-complexity/01
    provides: "PLANNER_SYSTEM_PROMPT with complexity assessment and quiz_count mapping"
  - phase: 16-schema-foundation
    provides: "TopicNode with complexity (Literal) and quiz_count (int, 1-5) fields"
provides:
  - "validate_complexity_distribution() function for post-generation guardrail"
  - "8 comprehensive tests covering error cases, warning cases, and happy path"
affects: [19-orchestrator-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-generation validation pattern: pure function validates LLM output, returns structured diagnostics"
    - "Validation result dict pattern: {valid, warnings, errors, distribution} for consumer decision-making"

key-files:
  created: []
  modified:
    - "server/agents/planner.py"
    - "server/tests/test_planner_agent.py"

key-decisions:
  - "Skew threshold set to >=80% (not strictly >80%) for boundary correctness"
  - "Pure function (not method) because it validates output, not generates it"
  - "Quiz count bands: Basic must be 1, Advanced must be 3-5, Intermediate is flexible"

patterns-established:
  - "Post-generation validation: pure function returns {valid, warnings, errors, metadata} dict for orchestrator to act on"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 18 Plan 02: Complexity Distribution Validation Summary

**Post-generation guardrail function that detects uniform complexity and quiz_count/complexity mismatches in PlannerAgent output, with 8 comprehensive tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T17:19:10Z
- **Completed:** 2026-02-17T17:22:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added validate_complexity_distribution() pure function that returns structured diagnostics
- Detects uniform complexity (all topics same rating) and quiz_count/complexity band mismatches as errors
- Warns on skewed distributions (>=80% same) and Intermediate topics with quiz_count=1 without blocking
- Added 8 comprehensive tests covering all error cases, warning cases, happy path, and distribution accuracy
- All 30 planner tests passing (22 existing + 8 new), 43 schema tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add validate_complexity_distribution() function** - `55fe427` (feat)
2. **Task 2: Add comprehensive tests for complexity distribution validation** - `58715f4` (test)

## Files Created/Modified
- `server/agents/planner.py` - Added validate_complexity_distribution() pure function after PlannerAgent class
- `server/tests/test_planner_agent.py` - Added TestComplexityDistribution class with 8 test methods + helper

## Decisions Made
- Skew threshold set to >=80% (not strictly >80%) for boundary correctness — 4/5 = 80% should trigger warning
- Pure function (not PlannerAgent method) because it validates output post-generation, not generates it
- Quiz count bands follow plan spec: Basic=1, Intermediate flexible (warns at 1), Advanced=3-5

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed skew threshold from >0.8 to >=0.8**
- **Found during:** Task 2 (test_skewed_distribution_warning)
- **Issue:** Plan specifies ">80%" but test fixture has 4/5=80% which should trigger warning. Strictly >0.8 missed the boundary.
- **Fix:** Changed threshold from `> 0.8` to `>= 0.8`
- **Files modified:** server/agents/planner.py
- **Verification:** test_skewed_distribution_warning passes
- **Committed in:** 58715f4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Boundary correctness fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 18 complete: both planner complexity plans done
- validate_complexity_distribution() ready for Phase 19 CourseOrchestrator integration
- Function is importable, documented, and fully tested
- Downstream consumer pattern: call after planner_agent.plan(), check result["valid"], retry if False

---
*Phase: 18-planner-complexity*
*Completed: 2026-02-17*

## Self-Check: PASSED
