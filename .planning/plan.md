# Plan: Secure Quiz Randomization and Dynamic Quiz Sets

## Scope and Purpose
This plan upgrades the learning quiz system to support secure server-side
randomization of options and dynamic multi-quiz sets per concept node. It
targets both backend and frontend changes to preserve quiz integrity, avoid
answer leakage, and keep UI selection stable even when option order changes.

The executing agent should assume:
- The backend uses FastAPI + Pydantic v2 and stores quiz payloads in SQLite.
- The frontend is React + TypeScript with React Query, rendering quizzes in
  ConceptCard and feedback in QuizFeedback.
- The current quiz model expects 4 options with IDs A–D and a single quiz
  per node, so schema and UI changes are required to add stable IDs and
  multiple quiz support.
- The work must follow TDD per conductor/workflow.md and respect the
  existing tech stack and style guides.

Primary outcomes:
- Secure, unbiased server-side option shuffling with stable option identity.
- Persistent shuffle order stored server-side for consistent refresh behavior.
- No correctness or explanation data visible before quiz submission.
- Multi-quiz support per concept node with a predictable UI flow.

Non-goals:
- Introducing new databases or external services.
- Changing the learning sequence state machine.
- Adding new third-party libraries without explicit approval.

## Milestone: v1.0 — Secure Quiz Randomization and Multi-Quiz Flow

### Phase 01: Contract and Schema Design
**Status**: `completed`
**Directory**: `server/schemas/`, `client/src/types/`

Define the API and data model updates needed for stable option identity and
multi-quiz payloads while maintaining backward compatibility.

**Deliverables**:
- ✅ Stable option identity contract separate from display label.
- ✅ Quiz set schema supporting multiple quizzes per concept node.
- ✅ Updated Pydantic schemas for option labels and quiz sets.
- ✅ Updated TypeScript types to match backend quiz contracts.
- ✅ Backward compatibility notes for existing single-quiz payloads.

**Changes Made**:
1. **Server Schemas** (`server/schemas/learning.py`):
   - `QuizOption`: `option_id` (stable UUID) + `display_label` (A-D) fields
   - `QuizOptionHidden`: IN_QUIZ state variant without correctness/explanation
   - `QuizCardHidden`: IN_QUIZ state variant using QuizOptionHidden
   - `QuizSet`: Multi-quiz container (1-5 quizzes) with `shuffle_seed`
   - `QuizSetHidden`: IN_QUIZ state variant with `total_quizzes` for UI progress
   - `QuizSubmission`: Uses `option_id` (not A-D) + `quiz_index` for multi-quiz
   - Legacy conversion functions: `convert_legacy_quiz_option()`, `convert_legacy_quiz_card()`

2. **Router Updates** (`server/routers/learning.py`):
   - Updated `QuizSubmitRequest` to accept `option_id` (not A-D) + `quiz_index`
   - Updated `submit_quiz()` to pass `quiz_index` to persistence layer

3. **Persistence Updates** (`server/database/learning_persistence.py`):
   - Updated `create_quiz_attempt()` to accept `quiz_index` parameter

4. **Client Types** (`client/src/types/learning.ts`):
   - TypeScript types already matched backend schemas (no changes needed)
   - `QuizOption`, `QuizOptionHidden`, `QuizSet`, `QuizSetHidden` properly typed
   - `QuizSubmitRequest` includes `quiz_index` optional field

5. **Contract Documentation** (`conductor/contract-quiz-randomization.md`):
   - Complete API contract with secure option identity pattern
   - Visibility rules per node state
   - Backward compatibility conversion path
   - Validation rules and TypeScript reference

6. **Schema Tests** (`server/tests/test_learning_schemas.py`):
   - 29 tests covering all schema validations
   - `TestHiddenQuizSchemas`: IN_QUIZ state correctness hiding
   - `TestQuizSet`: Multi-quiz validation (1-5 quizzes, current_index bounds)
   - `TestQuizSubmission`: quiz_index support, negative index rejection
   - `TestBackwardCompatibility`: Legacy format conversion
   - `TestContractValidation`: Option identity contract, old/new payload compatibility

**Dependencies**: None

**Verification**:
- [x] Schemas validate both old and new payload shapes.
- [x] Option ID rules are explicit and testable.
- [x] Client types compile without errors.
- [x] All 29 schema tests pass.
- [x] All 23 persistence tests pass.

---

### Phase 02: Backend Randomization and Evaluation
**Status**: `completed`
**Directory**: `server/`

Implement secure shuffling, preserve stable IDs, and enforce visibility rules
so correctness is never leaked before submission.

**Deliverables**:
- ✅ Fisher–Yates shuffle using a CSPRNG for option order.
- ✅ Stable IDs preserved; display labels assigned post-shuffle.
- ✅ Shuffled order persisted before storage/return.
- ✅ Response filtering to hide correctness and explanations in IN_QUIZ.
- ✅ Submission evaluation based on stable option IDs.
- ✅ Unit tests for shuffle integrity and visibility rules.

**Implementation Details**:

1. **Quiz Randomization Service** (`server/services/quiz_randomization.py`):
   - `shuffle_quiz_options()`: Fisher-Yates shuffle using `secrets.randbelow()` for CSPRNG
   - `shuffle_quiz_options_with_seed()`: Deterministic shuffle with SHA-256 hashed seed
   - `shuffle_quiz_set()` / `shuffle_quiz_set_with_seed()`: Multi-quiz shuffling
   - `hide_quiz_card()` / `hide_quiz_set()`: Transform to hidden schemas (removes is_correct/explanation)
   - `evaluate_quiz_answer()`: Evaluate using stable option_id
   - `get_or_create_shuffle_order()`: Persist shuffle state with seed priority (existing > quiz_set > new)

2. **CSPRNG Security**:
   - Uses Python's `secrets` module (not `random`) for cryptographic security
   - `secrets.randbelow()` ensures unpredictable shuffle order
   - `secrets.token_hex()` generates new shuffle seeds

3. **Stable Identity Pattern**:
   - `option_id`: Stable UUID that persists across shuffles (for submissions)
   - `display_label`: A-D label changes position after shuffle (for UI)
   - Correctness evaluation uses stable `option_id`, not display label

4. **Visibility Rules**:
   - `QuizCard` -> `QuizCardHidden`: Removes `is_correct` and `explanation` fields
   - `QuizOption` -> `QuizOptionHidden`: Only exposes `option_id`, `display_label`, `text`
   - Correctness data never serialized in hidden responses

**Changes Made**:
- Created `server/services/quiz_randomization.py` with 8 public functions
- Updated `server/services/__init__.py` to export new functions
- Created `server/tests/test_quiz_randomization.py` with 24 comprehensive tests

**Dependencies**: Phase 01

**Verification**:
- [x] Shuffles are unbiased and deterministic per stored payload.
- [x] Correctness is never present in quiz fetch responses.
- [x] Submissions evaluate correctly with shuffled labels.
- [x] All 24 new tests pass.
- [x] Total 144 tests run (143 passed, 1 skipped).

**Fixes Applied**:
- Fixed `test_generate_quiz_returns_valid_card` in `test_quizzer_agent.py`: Changed assertion from `QuizDifficulty` enum to string validation (matching `QuizCard.difficulty: str` schema)
- The skipped integration test is intentional (requires `RUN_INTEGRATION_TESTS=1` and live Vertex AI credentials)

---

### Phase 03: Persistence and Data Migration
**Status**: `completed`
**Directory**: `server/database/`

Extend storage for multiple quizzes per node and migrate existing data safely.

**Deliverables**:
- ✅ Persistence updates to store and retrieve quiz sets.
- ✅ DB payload structure changes for multiple quizzes.
- ✅ Backfill/migration path for existing single-quiz nodes.
- ✅ Tests for migration and multi-quiz retrieval ordering.

**Implementation Details**:

1. **Database Schema Updates** (`server/database/learning_persistence.py`):
   - Added `format_version` column to track data format (0=legacy, 1=QuizSet)
   - Added `shuffle_seed` column for deterministic shuffling
   - Added `current_index` column for multi-quiz progress tracking
   - Added `updated_at` column for change tracking
   - Added `quiz_index` column to quiz_attempts for multi-quiz tracking
   - Migration methods: `_ensure_quiz_data_columns()`, `_ensure_quiz_attempts_columns()`

2. **QuizSet Persistence Methods**:
   - `create_quiz_set()`: Store QuizSet with format_version=1
   - `get_quiz_set_for_node()`: Retrieve QuizSet with auto-conversion of legacy data
   - `update_quiz_set_progress()`: Update current quiz index
   - Updated `get_quiz_for_node()`: Uses database current_index column

3. **Legacy Migration**:
   - Automatic detection via `format_version` column
   - Legacy quizzes (format_version=0) wrapped in QuizSet on retrieval
   - Backward compatible: existing single-quiz nodes continue to work
   - `convert_legacy_to_quiz_set()` helper available in schemas

4. **Multi-Quiz Mastery**:
   - Single quiz: any correct answer = mastered
   - Multi-quiz: all quizzes must be answered correctly
   - `_check_multi_quiz_mastery()` helper for multi-quiz validation

5. **Tests** (`server/tests/test_learning_persistence.py`):
   - `TestQuizSetPersistence`: 11 tests for QuizSet CRUD and progress
   - `TestLegacyQuizMigration`: 4 tests for backward compatibility
   - All 35 persistence tests pass, 156 total server tests pass

**Dependencies**: Phase 02

**Verification**:
- [x] Existing sessions load without errors.
- [x] Multi-quiz payloads store and retrieve consistently.
- [x] Ordering remains stable across refreshes.
- [x] All 35 persistence tests pass.
- [x] All 156 server tests pass (1 skipped).

---

### Phase 04: Frontend Flow and UI Support
**Status**: `completed`
**Directory**: `client/src/features/learning/`

Update UI to handle shuffled labels and multi-quiz progression per node.

**Deliverables**:
- Updated learning API client for quiz set payloads.
- Render labels independent of stable IDs.
- Multi-quiz flow in ConceptCard with progress state.
- QuizFeedback support for multiple quizzes and label rendering.
- UI tests for shuffled options and multi-quiz navigation.

**Dependencies**: Phase 03

**Implementation Details**:
1. **API Client Updates** (`client/src/lib/learningApi.ts`):
   - Updated `submitQuiz` signature to accept `quizIndex` parameter
   - Quiz submission now includes `quiz_index: quizIndex ?? 0`

2. **Mutation Hook Updates** (`client/src/features/learning/useLearningMutations.ts`):
   - Updated `submitQuizMutation` to pass `quizIndex` to API
   - Updated `submitAnswer` convenience function with `quizIndex` parameter

3. **ConceptCard Updates** (`client/src/features/learning/ConceptCard.tsx`):
   - Added `getVisibleQuiz` helper usage for QuizSet support
   - Added quiz progress indicator for QuizSet ("Quiz X of Y")
   - Updated `onQuizSubmit` callback signature to include `quizIndex`
   - Handles both single quiz and QuizSet rendering

4. **QuizFeedback Updates** (`client/src/features/learning/QuizFeedback.tsx`):
   - Updated props to accept `QuizCard | QuizSet`
   - Added `currentQuizIndex` prop for QuizSet navigation
   - Added "Next Quiz" button for multi-quiz flow
   - Added quiz progress indicator

**Changes Made**:
- `client/src/lib/learningApi.ts`
- `client/src/features/learning/useLearningMutations.ts`
- `client/src/features/learning/useLearningMutations.test.tsx`
- `client/src/features/learning/ConceptCard.tsx`
- `client/src/features/learning/ConceptCard.test.tsx`
- `client/src/features/learning/QuizFeedback.tsx`
- `client/src/features/learning/QuizFeedback.test.tsx`
- `client/src/features/learning/__tests__/e2e.test.tsx`

**Verification**:
- [x] Option labels render correctly after shuffle.
- [x] Quiz selection uses stable IDs and submits correctly.
- [x] Multi-quiz flow progresses and completes as expected.

**Verification Results**:
- ✅ 132 tests passing (12 test files)
- ✅ ESLint passes with no errors
- ✅ TypeScript build succeeds
- ✅ Production build succeeds

---

### Phase 05: Verification and Quality Gates
**Status**: `completed`
**Directory**: `client/`, `server/`

Run required checks and validate the end-to-end learning flow.

**Deliverables**:
- ✅ Server tests: `python -m unittest` - 156 tests passed (1 skipped)
- ✅ Client tests: `npm run test -- --run` - 132 tests passed
- ✅ Client lint/build: `npm run lint`, `npm run build` - Both successful
- ✅ Manual verification checklist for shuffled and multi-quiz flows

**Dependencies**: Phase 04

**Implementation Details**:

1. **Server Test Results** (156 tests passed, 1 skipped):
   - `test_learning_schemas.py`: 29 tests - schema validations, hidden quiz schemas, QuizSet
   - `test_quiz_randomization.py`: 24 tests - Fisher-Yates shuffle, CSPRNG, option ID evaluation
   - `test_learning_persistence.py`: 35 tests - QuizSet persistence, legacy migration
   - `test_chat.py`, `test_sessions.py`, `test_planner_agent.py`, `test_quizzer_agent.py`, `test_orchestrator_integration.py`: Remaining tests
   - 1 integration test skipped (requires `RUN_INTEGRATION_TESTS=1` and live Vertex AI)

2. **Client Test Results** (132 tests passed):
   - `ConceptCard.test.tsx`: 12 tests - quiz submission with quiz_index
   - `QuizFeedback.test.tsx`: 17 tests - multi-quiz flow, navigation
   - `useLearningMutations.test.tsx`: 15 tests - mutation hooks
   - `e2e.test.tsx`: 6 tests - full learning flow integration
   - All other feature and unit tests passing

3. **Lint and Build Results**:
   - ESLint: No errors
   - TypeScript compilation: Successful
   - Production build: 830KB JS, 47KB CSS, gzip-compressed

4. **Manual Verification Checklist**:
   - ✅ Secure server-side option shuffling with stable `option_id`
   - ✅ Fisher-Yates shuffle using CSPRNG (`secrets.randbelow()`)
   - ✅ Persistent shuffle order via `shuffle_seed` column
   - ✅ No correctness/explanation data in IN_QUIZ state (QuizCardHidden/QuizOptionHidden)
   - ✅ Multi-quiz support with QuizSet (1-5 quizzes per node)
   - ✅ Quiz progress tracking via `current_index` column
   - ✅ Option ID-based evaluation (not display labels A-D)
   - ✅ Backward compatibility with legacy single-quiz nodes

**Verification**:
- [x] All automated tests pass.
- [x] Lint and build succeed.
- [x] Manual flow validates shuffle and multi-quiz UX.
