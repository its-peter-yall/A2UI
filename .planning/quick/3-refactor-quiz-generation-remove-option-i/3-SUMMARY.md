---
phase: 3-refactor-quiz-generation-remove-option-i
plan: "01"
subsystem: learning
executed_by: gsd-executor
dependency_graph:
  requires: []
  provides:
    - LLM-specific quiz schemas (no option_id)
    - Backend UUID generation
  affects:
    - server/schemas/learning.py
    - server/agents/quizzer.py
    - server/tests/test_quizzer_agent.py
tech_stack:
  added: []
  patterns:
    - LLM/schema separation pattern
    - Backend UUID generation
    - Conversion functions for schema transformation
key_files:
  created: []
  modified:
    - server/schemas/learning.py
    - server/agents/quizzer.py
    - server/tests/test_quizzer_agent.py
decisions:
  - Removed _fix_option_ids methods - no longer needed since backend generates UUIDs
  - LLM uses LLMQuizCard/LLMQuizSet, returns QuizCard/QuizSet after conversion
  - Conversion functions handle all UUID generation ensuring uniqueness
  - Backward compatibility preserved via existing legacy conversion functions
metrics:
  duration_minutes: 25
  completed_date: "2026-02-17"
  tasks_completed: 3
  tests_passing: 49
---

# Phase 3 Plan 01: Refactor Quiz Generation - Remove option_id from LLM Output

## Summary

Refactored quiz generation architecture to remove `option_id` from LLM output schemas. The LLM now generates quiz content using `LLMQuizOption`, `LLMQuizCard`, and `LLMQuizSet` schemas that exclude the `option_id` field. The backend generates UUIDs after receiving the LLM response and converts to storage schemas (`QuizOption`, `QuizCard`, `QuizSet`) for persistence.

## What Was Changed

### 1. New LLM-Specific Schemas (server/schemas/learning.py)

Created three new schemas for LLM output:

- **LLMQuizOption**: Same as QuizOption except no `option_id` field
  - `display_label`: str (A/B/C/D) with validation
  - `text`: str
  - `is_correct`: bool
  - `explanation`: str

- **LLMQuizCard**: Same as QuizCard but uses `LLMQuizOption`
  - Validates exactly 4 options, exactly 1 correct
  - Validates display_labels are A, B, C, D

- **LLMQuizSet**: Same as QuizSet but uses `LLMQuizCard`
  - Validates 1-5 quizzes

### 2. Conversion Functions (server/schemas/learning.py)

Added conversion functions that generate UUIDs:

- `convert_llm_to_quiz_option(llm_option, option_id)` → QuizOption
- `convert_llm_to_quiz_card(llm_card)` → QuizCard (generates UUIDs for all options)
- `convert_llm_to_quiz_set(llm_set)` → QuizSet (generates unique UUIDs across all quizzes)

### 3. Updated Quizzer Agent (server/agents/quizzer.py)

- Updated imports to include LLM schemas and conversion functions
- Modified system prompt to use `display_label` instead of `id`
- `generate_quiz()`: Uses `LLMQuizCard` for LLM call, converts to `QuizCard`
- `generate_quiz_set()`: Uses `LLMQuizSet` for LLM call, converts to `QuizSet`
- Removed `_fix_option_ids()` and `_fix_quiz_set_option_ids()` methods (no longer needed)

### 4. Updated Tests (server/tests/test_quizzer_agent.py)

- Added helper functions: `_make_mock_llm_option()`, `_make_mock_llm_quiz_card()`, `_make_mock_llm_quiz_set()`
- Updated all test mocks to use LLM schemas
- Added new test class `TestLLMToStorageConversion` with 3 tests:
  - `test_convert_llm_to_quiz_card_generates_uuids`
  - `test_convert_llm_to_quiz_set_generates_unique_uuids`
  - `test_conversion_preserves_all_other_fields`
- Updated existing tests to verify conversion to storage schemas
- Removed tests for `_fix_option_ids` workaround

## Verification Results

All verification checks passed:

```
[PASS] Schema separation verified (LLM schemas lack option_id, storage schemas have it)
[PASS] Backward compatibility preserved (legacy conversion functions work)
[PASS] All 49 tests passing
```

## Architecture Impact

**Before:**
- LLM had to generate valid UUIDs or letter IDs (A/B/C/D)
- Backend needed `_fix_option_ids()` to convert letters/fake UUIDs to real UUIDs
- Architectural inconsistency: LLM generating data it shouldn't

**After:**
- LLM generates only content fields (text, explanation, is_correct, display_label)
- Backend has full control over UUID generation
- Cleaner separation: LLM schemas for generation, storage schemas for persistence
- No need for post-processing workarounds

## Deviations from Plan

None - plan executed exactly as written.

## Key Design Decisions

1. **Separate schemas for LLM vs storage**: Clean separation of concerns
2. **Backend UUID generation**: Ensures valid, unique UUIDs without relying on LLM
3. **Preserved backward compatibility**: Legacy conversion functions still work for stored quizzes
4. **Removed _fix_option_ids**: No longer needed since backend generates all UUIDs

## Test Coverage

- 49 tests passing (100%)
- New conversion function tests added
- All existing tests updated and passing
- No regressions

## Files Modified

1. `server/schemas/learning.py` - Added LLM schemas and conversion functions
2. `server/agents/quizzer.py` - Updated to use LLM schemas
3. `server/tests/test_quizzer_agent.py` - Updated tests for new architecture

## Commits

- `dc9a06e`: Create LLM-specific quiz schemas without option_id
- `a5a3318`: Update quizzer agent to use LLM schemas
- `92740bb`: Update tests for new quiz generation architecture
