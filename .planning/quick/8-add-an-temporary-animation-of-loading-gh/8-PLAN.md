---
phase: quick-8
plan: 8
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/features/learning/LearningHome.tsx
autonomous: true
must_haves:
  truths:
    - "On page load while backend is starting, 'Your Courses' section shows skeleton cards instead of disappearing"
    - "Once backend responds, skeletons are replaced by real course cards (or hero-only if no courses)"
  artifacts:
    - path: "client/src/features/learning/LearningHome.tsx"
      provides: "Updated showDashboard and isInitialLoad logic"
  key_links:
    - from: "LearningHome.tsx"
      to: "useCourseList (allCoursesData query)"
      via: "isLoading flag from allCoursesData query"
      pattern: "allCoursesData.*isLoading"
---

<objective>
Show skeleton ghost cards in the "Your Courses" section while the backend is starting up, instead of hiding the section entirely.

Purpose: Eliminates the need for manual page refresh — users see a loading state and the UI resolves automatically once the backend is ready.
Output: Updated LearningHome.tsx with skeleton-during-startup behavior.
</objective>

<execution_context>
@client/src/features/learning/LearningHome.tsx
@client/src/features/learning/CourseCardSkeleton.tsx
@client/src/features/learning/useCourseList.ts
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Show skeleton cards while backend is starting up</name>
  <files>client/src/features/learning/LearningHome.tsx</files>
  <action>
    In LearningHome.tsx, destructure `isLoading` from the `allCoursesData` query (rename to avoid collision):

    ```ts
    const { data: allCoursesData, isLoading: isAllCoursesLoading } = useCourseList({
      status: 'all',
      limit: 1,
      offset: 0,
    });
    ```

    Update `showDashboard` to also be true while the all-courses query is loading:

    ```ts
    const showDashboard = hasAnyCourses || isAllCoursesLoading;
    ```

    Update `isInitialLoad` to include the all-courses loading state:

    ```ts
    const isInitialLoad = (isLoading && offset === 0 && sessions.length === 0) || isAllCoursesLoading;
    ```

    This means: while the backend is starting up (allCoursesData query is loading/retrying), the dashboard section renders with the existing 4-skeleton grid. Once the backend responds:
    - If courses exist → real cards replace skeletons
    - If no courses → `showDashboard` becomes false, hero-only view shown

    No new components needed — `CourseCardSkeleton` and the skeleton grid are already in place.
  </action>
  <verify>
    1. Stop the backend server
    2. Load the app in browser — "Your Courses" section should appear with 4 animated skeleton cards
    3. Start the backend — skeletons should be replaced by real course cards (or section hides if no courses)
    4. `npm run dev` (client) compiles without TypeScript errors
  </verify>
  <done>
    Backend-down state shows skeleton cards in "Your Courses" section. Backend-up state shows real cards or hides section. No manual refresh needed.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles cleanly
- Skeleton cards visible when backend is unreachable on page load
- Section auto-resolves to real content once backend responds (React Query retry handles this)
</verification>

<success_criteria>
User loads the page while backend is starting → sees animated skeleton cards → backend comes up → cards populate automatically.
</success_criteria>

<output>
No SUMMARY.md needed for quick tasks. Update STATE.md quick tasks table with entry for task 8.
</output>
