---
status: resolved
trigger: "When clicking 'In Progress' tab and there are no courses in progress, the page incorrectly shows the old 'Learn Anything' landing page instead of staying on the 'Your Courses' section with an appropriate empty state message."
created: 2026-02-17T12:00:00Z
updated: 2026-02-17T12:15:00Z
---

## Current Focus

hypothesis: FIXED - The issue was that `showDashboard` was based on filtered `totalCount`, which became 0 when filtering to a status with no matches
test: Component now fetches unfiltered count separately to determine dashboard visibility
expecting: Dashboard remains visible with empty state message when filter returns no results
next_action: Complete

## Symptoms

expected: "In Progress" tab should remain visible with an empty state message (e.g., "No courses in progress") when no courses match the filter
actual: The entire "Your Courses" section disappears and shows the old "Learn Anything" landing page (with "Enter a topic and master it..." heading and search box)
errors: No error messages visible
reproduction: 
1. Navigate to "Your Courses" section
2. Make sure there are no in-progress courses (all courses are completed or you have no courses)
3. Click the "In Progress" tab
4. Observe that the old landing page appears instead of the "Your Courses" section
started: Always broken (regression from adding tabs)

## Eliminated

- hypothesis: Server returns wrong total_count
  evidence: Server correctly filters total_count based on status parameter (learning_persistence.py line 462-476)
  timestamp: 2026-02-17T12:05:00Z

## Evidence

- **Evidence 1**: Lines 207-209 in LearningHome.tsx (OLD) showed:
  ```typescript
  const hasCourses = totalCount > 0;  // Based on FILTERED totalCount
  const showDashboard = hasCourses;    // Hides when filtered total = 0
  ```

- **Evidence 2**: Server-side `get_sessions_list` correctly applies status filter to both count query and data query (learning_persistence.py lines 462-476)

- **Evidence 3**: When filtering to "in_progress" with 0 matches:
  - Filtered API call returns: `total_count: 0`, `sessions: []`
  - `hasCourses = 0 > 0 = false`
  - `showDashboard = false`
  - Dashboard section hidden (line 280: `{showDashboard && (...)}`)

- **Evidence 4**: Empty filter state exists (lines 339-344) but was unreachable because dashboard was hidden first

## Resolution

root_cause: The `showDashboard` logic used filtered `totalCount` to determine whether to show the dashboard section. When filtering to a status with no matches (e.g., "In Progress" with 0 in-progress courses), `totalCount` became 0, causing the entire "Your Courses" section to hide and revealing the landing page instead of showing an empty state message.

fix: Added a separate query to fetch unfiltered course count (status='all', limit=1) to determine `showDashboard`. The dashboard now remains visible as long as the user has ANY courses (regardless of filter), and the existing `showEmptyFilterState` logic correctly displays the "No {status} courses found" message when filtered results are empty.

**Code Changes (LearningHome.tsx):**
1. Added second `useCourseList` query for unfiltered count (lines 103-109)
2. Changed `hasCourses` to `hasAnyCourses` using unfiltered count (line 215)
3. Added `hasFilteredCourses` using filtered count for empty state (line 216)
4. Updated `showDashboard` to use `hasAnyCourses` (line 218)
5. Updated `showEmptyFilterState` to use `!hasFilteredCourses` (lines 223-224)

verification: 
- All 25 LearningHome.test.tsx tests pass
- All 10 dashboard-e2e.test.tsx tests pass
- Test mocks updated to account for additional API call

files_changed:
- client/src/features/learning/LearningHome.tsx
- client/src/features/learning/__tests__/dashboard-e2e.test.tsx
