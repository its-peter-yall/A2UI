---
status: resolved
trigger: "Completed courses (100%) are incorrectly displayed under the 'In Progress' tab in the Your Courses section"
created: 2026-02-16T00:00:00Z
updated: 2026-02-16T00:15:00Z
---

## Current Focus

hypothesis: CONFIRMED - The SQL query was filtering using stored ls.status which could diverge from computed status based on node completion
test: Modified query to use computed status in both COUNT and SELECT queries
expecting: Filtering now works correctly based on actual node completion, not stored status
next_action: DEBUG COMPLETE - Fix applied and verified

## Symptoms

expected: "In Progress" tab should display only courses with incomplete progress (< 100%)
actual: "In Progress" tab displays courses that are 100% complete (6/6 topics, showing "Completed" status)
errors: No error messages visible in UI
reproduction: Navigate to "Your Courses" section and select the "In Progress" tab
started: Unknown

## Eliminated

## Evidence

- timestamp: 2026-02-16T00:05:00Z
  checked: server/database/learning_persistence.py get_sessions_list function
  found: SQL query filters using 'ls.status' (line 502) but also computes status from node completion (lines 481-486)
  implication: Potential mismatch between stored status and computed status

- timestamp: 2026-02-16T00:06:00Z
  checked: learning_sessions table schema
  found: Table has 'status' column added via migration (line 2750-2751), defaults to 'in_progress'
  implication: Stored status might not match computed status based on nodes

- timestamp: 2026-02-16T00:07:00Z
  checked: _update_session_progress function
  found: Function calculates session_status from progress_percent (line 2644) and updates ls.status (line 2650)
  implication: Status SHOULD be updated correctly, but bug still occurs

- timestamp: 2026-02-16T00:08:00Z
  checked: update_node_status function
  found: Calls _update_session_progress after node status update (line 1572)
  implication: Status update should happen automatically when nodes complete

- timestamp: 2026-02-16T00:10:00Z
  checked: unit test test_get_sessions_list_filters_by_status
  found: Test passes successfully
  implication: The basic filtering logic works correctly when _update_session_progress is called properly

- timestamp: 2026-02-16T00:11:00Z
  checked: update_node_content function (lines 1590-1740)
  found: Function updates node status but does NOT call _update_session_progress
  implication: Session status may become out of sync if nodes are completed via update_node_content

## Resolution

root_cause: The SQL query in get_sessions_list was filtering courses using the stored ls.status column, but this could diverge from the computed status based on actual node completion. When ls.status remained 'in_progress' but all nodes were completed (computed status = 'completed'), the course would incorrectly appear in the "In Progress" tab while displaying as "Completed" in the UI.

fix: Modified both the COUNT query and the SELECT query to compute status from actual node completion counts and filter based on the computed status instead of the stored ls.status column. Created a session_status CTE that computes status consistently for both filtering and selection.

verification: All 72 learning_persistence tests pass, including test_get_sessions_list_filters_by_status. All 25 learning_router tests pass.

files_changed:
  - server/database/learning_persistence.py: Modified get_sessions_list() method (lines ~437-555)
