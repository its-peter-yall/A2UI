# Plan 11-02 Summary: Revision Progress Tracking & Quiz Re-attendance

## Objective
Implement revision progress tracking, revision quiz submission, and summary
metrics (including comparison against original attempts) with API endpoints and
tests.

## Tasks Completed
- Added persistence methods in `server/database/learning_persistence.py`:
  - `mark_revision_node_reviewed(revision_id, node_id)`
  - `submit_revision_quiz(revision_id, node_id, selected_option_id, quiz_index)`
  - `_update_revision_progress(revision_id)`
  - `get_revision_summary(revision_id)`
- Extended quiz attempt creation to support revision attribution:
  - `create_quiz_attempt(..., revision_session_id=None)`
- Added schemas in `server/schemas/learning.py`:
  - `RevisionComparison`
  - `RevisionSummary`
  - `RevisionQuizSubmissionResult`
- Added router endpoints in `server/routers/learning.py`:
  - `POST /learning/revisions/{revision_id}/nodes/{node_id}/mark-reviewed`
  - `POST /learning/revisions/{revision_id}/nodes/{node_id}/submit-quiz`
  - `GET /learning/revisions/{revision_id}/summary`
- Added comprehensive tests:
  - Persistence coverage for revision progress/summary in
    `server/tests/test_learning_persistence.py`
  - Router coverage for new revision endpoints in
    `server/tests/test_learning_router.py`
- Updated roadmap status for Phase 11 completion in `.planning/ROADMAP.md`.

## Files Modified
- `server/database/learning_persistence.py`
- `server/schemas/learning.py`
- `server/routers/learning.py`
- `server/tests/test_learning_persistence.py`
- `server/tests/test_learning_router.py`
- `.planning/ROADMAP.md`
- `.planning/phases/11-revision-api/11-02-SUMMARY.md`

## Verification Results
- `cd server && python -m unittest server.tests.test_learning_persistence -v`
  - FAIL in this environment (`ModuleNotFoundError: No module named 'server'`)
- Equivalent command from repo root:
  - `python -m unittest server.tests.test_learning_persistence -v` -> PASS
    (71 tests)
- Equivalent command from repo root:
  - `python -m unittest server.tests.test_learning_router -v` -> PASS
    (22 tests)
- Equivalent command from repo root:
  - `python -m unittest -v` -> PASS (220 tests, 1 skipped)

## Deviations
- The exact plan command sequence run from `cd server` does not resolve the
  `server` module in this environment.
- Equivalent commands were run from repository root, which preserves the same
  unittest targets and completed successfully.

## Commit Hash
- Pending commit execution (`feat(11-revision-api-11-02): ...`).
