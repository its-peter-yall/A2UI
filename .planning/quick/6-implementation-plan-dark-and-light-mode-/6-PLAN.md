---
phase: quick
plan: 6
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/index.css
  - client/src/providers/ThemeProvider.tsx
  - client/src/main.tsx
  - client/src/components/ThemeToggle.tsx
  - client/src/features/learning/LearningHome.tsx
  - client/src/features/learning/LearningPage.tsx
  - client/src/features/learning/RevisionPage.tsx
autonomous: false
requirements: [QUICK-06]
must_haves:
  truths:
    - User can switch between Light, Dark, and System themes.
    - Theme preference persists across page reloads.
    - System theme respects OS preference.
  artifacts:
    - path: client/src/providers/ThemeProvider.tsx
      provides: ThemeContext and ThemeProvider
    - path: client/src/components/ThemeToggle.tsx
      provides: Theme toggle button UI
  key_links:
    - from: client/src/main.tsx
      to: client/src/providers/ThemeProvider.tsx
      via: wraps App with ThemeProvider
---

<objective>
Implement a dark/light mode toggle for the A2UI project, allowing users to switch between a light theme, a dark theme, and a system-default theme. The preference will be persisted in localStorage.

Purpose: Provide a comfortable viewing experience for users in different lighting conditions while ensuring the Cyber Yellow accent remains accessible.
Output: Working theme toggle across the application with persistent preference and correct system theme synchronization.
</objective>

<execution_context>
@./.gemini/get-shit-done/workflows/execute-plan.md
@./.gemini/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@client/src/index.css
@client/src/main.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor Global CSS and Create Theme Provider</name>
  <files>client/src/index.css, client/src/providers/ThemeProvider.tsx, client/src/main.tsx</files>
  <action>
    1. Refactor `client/src/index.css`: Move the existing dark mode variables (currently in `:root`) into a `.dark` class selector inside `@layer base`. Define a new set of equivalent light mode variables inside `:root`. Update typography overrides to ensure `.prose-invert` only applies in dark mode or replace with Tailwind's `dark:` variants if preferred.
    2. Create `client/src/providers/ThemeProvider.tsx`: Implement a React Context (`ThemeContext`) and Provider (`ThemeProvider`). The provider must support `light`, `dark`, and `system` states, persisting the choice in `localStorage`. Use a `useEffect` hook to apply/remove the `dark` class on `window.document.documentElement` based on the active theme, and listen for system preference changes (`window.matchMedia('(prefers-color-scheme: dark)')`) when set to system.
    3. Update `client/src/main.tsx`: Import the `ThemeProvider` and wrap the `<App />` component (likely inside or alongside the Query provider).
  </action>
  <verify>Check that `ThemeProvider` is exported properly and `main.tsx` successfully compiles without errors.</verify>
  <done>CSS has distinct light/dark variables, ThemeProvider correctly manages theme state, and main.tsx is updated.</done>
</task>

<task type="auto">
  <name>Task 2: Create Theme Toggle and Integrate into UI</name>
  <files>client/src/components/ThemeToggle.tsx, client/src/features/learning/LearningHome.tsx, client/src/features/learning/LearningPage.tsx, client/src/features/learning/RevisionPage.tsx</files>
  <action>
    1. Create `client/src/components/ThemeToggle.tsx`: Build an accessible button component using `lucide-react` icons (Sun and Moon). The toggle should select between Light, Dark, and System states (e.g., using a dropdown or a simple cycle toggle). It must consume the context from `ThemeProvider`.
    2. Update UI components: Inject `ThemeToggle` into the `<header>` sections of `client/src/features/learning/LearningHome.tsx`, `client/src/features/learning/LearningPage.tsx`, and `client/src/features/learning/RevisionPage.tsx`. Place it logically in the top right corner next to other actions. Ensure existing layout remains stable.
  </action>
  <verify>Verify that `ThemeToggle` component compiles and is present in the headers of all three main page components.</verify>
  <done>ThemeToggle is fully integrated and correctly triggers theme changes.</done>
</task>

<task type="checkpoint:human-verify">
  <what-built>Dark/Light mode toggle with system preference sync and persistence</what-built>
  <how-to-verify>
    1. Start the frontend development server (`cd client && npm run dev`).
    2. Open the application and toggle the theme from Light to Dark.
    3. Verify that the CSS variables and UI instantly switch.
    4. Select "System" and change your OS theme to ensure the app reacts dynamically.
    5. Refresh the page to confirm `localStorage` persistence.
    6. Review the dashboard, learning path, and concept cards to ensure Cyber Yellow accent contrast is maintained in both modes.
  </how-to-verify>
  <resume-signal>Type "approved" or describe visual issues.</resume-signal>
</task>

</tasks>

<verification>
- `ThemeProvider` successfully adds/removes `.dark` from `<html>` tag.
- LocalStorage properly persists theme preference.
- All main routes display the theme toggle component.
- Light mode default variables contrast correctly with the accent color.
</verification>

<success_criteria>
- Users can toggle themes (Light, Dark, System).
- Preference persists on reload.
- UI maintains readability and aesthetic quality in both modes.
</success_criteria>

<output>
After completion, create `.planning/quick/6-implementation-plan-dark-and-light-mode-/SUMMARY.md`
</output>
