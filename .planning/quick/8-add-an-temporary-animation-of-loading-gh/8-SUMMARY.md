---
phase: quick-8
plan: 8
subsystem: frontend/learning
tags: [ux, loading-state, skeleton, react-query]
key-files:
  modified:
    - client/src/features/learning/LearningHome.tsx
decisions:
  - Use isAllCoursesLoading from allCoursesData query to drive skeleton visibility during backend startup
metrics:
  duration: "3 min"
  completed: "2026-03-08"
  tasks: 1
  files: 1
---

# Quick Task 8: Show Skeleton Cards During Backend Startup Summary

**One-liner:** Show 4 animated skeleton cards in "Your Courses" section while allCoursesData query is loading, eliminating manual refresh on backend startup.

## What Was Done

Destructured `isLoading` (as `isAllCoursesLoading`) from the existing `allCoursesData` query in `LearningHome.tsx`. Updated two derived state values:

- `showDashboard`: `hasAnyCourses || isAllCoursesLoading` — renders the dashboard section while backend is starting
- `isInitialLoad`: `(isLoading && offset === 0 && sessions.length === 0) || isAllCoursesLoading` — triggers the existing 4-skeleton grid

No new components needed. The existing `CourseCardSkeleton` grid was already in place.

## Commits

| Hash | Message |
|------|---------|
| 1f3bc99 | feat(quick-8): show skeleton cards while backend is starting up |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `client/src/features/learning/LearningHome.tsx` — modified ✓
- Commit `1f3bc99` — exists ✓
- TypeScript compile — clean ✓
