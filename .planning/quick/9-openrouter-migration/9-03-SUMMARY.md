---
phase: 9-openrouter-migration
plan: 9-03
subsystem: frontend
tags: [openrouter, settings, model-picker, frontend, react-query, localStorage]
dependency_graph:
  requires: [9-02-backend-models-endpoint]
  provides: [openrouter-frontend-settings, openrouter-model-picker]
  affects: [learning-api-calls, learning-home-ui]
tech_stack:
  added: []
  patterns: [localStorage-settings, react-query-caching, axios-interceptors]
key_files:
  created:
    - client/src/lib/openrouterSettings.ts
    - client/src/lib/openrouterSettings.test.ts
    - client/src/lib/openrouterApi.ts
    - client/src/lib/openrouterApi.test.ts
    - client/src/types/openrouter.ts
    - client/src/features/settings/OpenRouterSettingsPanel.tsx
    - client/src/features/settings/OpenRouterSettingsPanel.test.tsx
    - client/src/features/settings/OpenRouterModelPicker.tsx
    - client/src/features/settings/OpenRouterModelPicker.test.tsx
  modified:
    - client/src/features/learning/LearningHome.tsx
    - client/src/lib/learningApi.ts
decisions:
  - localStorage for settings persistence (simple, no backend dependency)
  - React Query with 24h staleTime for model catalog caching
  - axios.isAxiosError() instead of instanceof AxiosError for mock compatibility
  - Both api and learningApi instances get interceptors for full coverage
metrics:
  duration: ~30m
  completed: "2026-05-20"
  tasks_completed: 4
  tasks_total: 4
  tests_added: 28
---

# Phase 9 Plan 03: Frontend OpenRouter Settings Summary

Frontend settings panel for OpenRouter API key entry, model catalog browsing, and automatic header injection on all learning API calls.

## What Was Built

### 1. Settings Storage Module (`openrouterSettings.ts`)
- Typed `OpenRouterSettings` interface with apiKey, model, modelTitle fields
- `getOpenRouterSettings()` reads from localStorage safely with type checking
- `setOpenRouterSettings()` partially updates settings (merges with existing)
- `clearOpenRouterSettings()` removes all settings
- `maskApiKey()` helper shows "sk-or-...abcd" for safe display
- 12 unit tests covering read/write/clear/mask behavior

### 2. API Client and Types (`openrouterApi.ts`, `types/openrouter.ts`)
- `OpenRouterModel` and `OpenRouterModelList` types matching backend Pydantic schema
- `getOpenRouterModels()` fetches catalog via `/llm/models` proxy with auth headers
- `OpenRouterApiError` with typed status codes (401, 5xx, 0)
- Uses `axios.isAxiosError()` for proper mock compatibility
- 4 unit tests covering success, 401, 502, and network failure

### 3. Settings UI Components
- **OpenRouterSettingsPanel**: Collapsible card with API key input (password field with show/hide toggle), masked key display, save/clear actions, validation errors, Cyber Yellow save button
- **OpenRouterModelPicker**: Searchable dropdown fetching model catalog via React Query (24h staleTime), search filtering by name/id, context length display, 401 error handling in dropdown
- Both components use glassmorphism styling matching product guidelines
- Integrated into LearningHome between TopicInput and Course Dashboard
- 12 unit tests across both components

### 4. Axios Interceptors (`learningApi.ts`)
- Request interceptors on both `api` (30s) and `learningApi` (5min) instances
- When OpenRouter settings exist, attaches:
  - `X-OpenRouter-Key`: API key from settings
  - `X-OpenRouter-Model`: selected model ID
  - `HTTP-Referer`: current window origin
  - `X-OpenRouter-Title`: "A2UI"
- Headers only added when apiKey is set; no-op when unconfigured

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed axios mock compatibility in API client**
- **Found during:** Task 2 test execution
- **Issue:** `error instanceof AxiosError` fails with vi.mock() because mock objects aren't real AxiosError instances
- **Fix:** Changed to `axios.isAxiosError(error)` which handles both real instances and mock objects with `isAxiosError: true` flag
- **Files modified:** client/src/lib/openrouterApi.ts, client/src/lib/openrouterApi.test.ts
- **Commit:** 8329aa5

**2. [Rule 1 - Bug] Fixed label-input accessibility in settings panel**
- **Found during:** Task 3 test execution
- **Issue:** `<label>` not associated with `<input>` (no `htmlFor`/`id` linkage)
- **Fix:** Added `htmlFor="openrouter-api-key"` to label and `id="openrouter-api-key"` to input
- **Files modified:** client/src/features/settings/OpenRouterSettingsPanel.tsx
- **Commit:** ad6d72d

**3. [Rule 1 - Bug] Fixed TypeScript errors in test files**
- **Found during:** Task 4 build verification
- **Issue:** Mock type mismatches (`ReturnType<typeof vi.spyOn>` too narrow, `maskApiKey` parameter type mismatch)
- **Fix:** Used `any` type for spy variable, cast mock calls to proper types, updated mock implementation parameter types
- **Files modified:** client/src/lib/openrouterApi.test.ts, client/src/features/settings/OpenRouterSettingsPanel.test.tsx
- **Commit:** 43afef3

## Known Issues

- 5 pre-existing test failures in LearningHome test suite (unrelated to this plan - tests don't properly mock `useCourseList` for "no courses" case)

## Verification

- [x] `cd client && npm run build` passes
- [x] All 28 new tests pass
- [x] Settings persist across component remounts (localStorage)
- [x] Model picker fetches and displays catalog
- [x] Interceptors attach headers when settings exist
- [x] No secrets logged to console
