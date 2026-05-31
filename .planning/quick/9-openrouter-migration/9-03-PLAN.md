---
phase: 9-openrouter-migration
plan: 03
type: execute
wave: 1
depends_on:
  - 9-01-PLAN.md
files_modified:
  - client/src/lib/learningApi.ts
  - client/src/features/learning/LearningHome.tsx
  - client/src/(new) features/settings/*
  - client/src/(new) lib/openrouterSettings.ts
  - client/src/(new) lib/openrouterApi.ts
  - client/src/(new) types/openrouter.ts
  - client/src/**/*.test.ts(x)
autonomous: true
must_haves:
  truths:
    - User can paste OpenRouter key once and it persists locally
    - User can browse/search full OpenRouter model catalog and select a model
    - All learning API calls include X-OpenRouter-Key + X-OpenRouter-Model headers
    - UI handles invalid key (401) with a clear error message
  artifacts:
    - path: client/src/features/settings/OpenRouterSettingsPanel.tsx
      provides: API key + model settings UI
    - path: client/src/features/settings/OpenRouterModelPicker.tsx
      provides: Searchable model picker backed by /llm/models
---

<objective>
Add frontend settings for:
1) OpenRouter API key (stored locally)
2) Full OpenRouter model picker (catalog) — ONE global model for all agents

Then wire those settings into the existing Axios clients so every request to the backend includes the required headers.
</objective>

<context>
@conductor/product-guidelines.md
@.planning/codebase/CONVENTIONS.md
@client/src/lib/learningApi.ts
@client/src/features/learning/LearningHome.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create a small settings storage module (localStorage)</name>
  <files>
    client/src/lib/openrouterSettings.ts (new)
  </files>
  <action>
    1. Create a new module that defines:
       - A typed settings object (apiKey, model, title)
       - getOpenRouterSettings(): reads from localStorage safely
       - setOpenRouterSettings(partial): writes to localStorage
       - clearOpenRouterSettings(): deletes settings

    2. Requirements:
       - No secrets printed to console.
       - Provide helper to mask key for display (e.g., "sk-...abcd").
       - Use named exports only.
       - Add mandatory file header comment.
  </action>
  <verify>
    - Unit test: read/write/clear behaves correctly in jsdom.
  </verify>
  <done>Settings can be persisted and read in a single place.</done>
</task>

<task type="auto">
  <name>Task 2: Add OpenRouter API client for /llm/models</name>
  <files>
    client/src/lib/openrouterApi.ts (new)
    client/src/types/openrouter.ts (new)
  </files>
  <action>
    1. Add TS types for model list response.
       - Keep it minimal + robust: id, name?, contextLength?, pricing?

    2. Implement getOpenRouterModels():
       - Calls backend GET /llm/models
       - Attaches headers (X-OpenRouter-Key, HTTP-Referer, X-OpenRouter-Title)

    3. Handle errors:
       - 401 → surface as "Invalid or missing OpenRouter key"
       - 5xx → show "Backend/OpenRouter unavailable"

    4. Add tests that mock axios and assert headers are attached.
  </action>
  <verify>
    - `cd client && npm run test -- --run` passes (after adding tests)
  </verify>
  <done>Frontend can fetch the OpenRouter model catalog via backend.</done>
</task>

<task type="auto">
  <name>Task 3: Add settings UI panel and model picker components</name>
  <files>
    client/src/features/settings/OpenRouterSettingsPanel.tsx (new)
    client/src/features/settings/OpenRouterModelPicker.tsx (new)
    client/src/features/learning/LearningHome.tsx
  </files>
  <action>
    1. Create OpenRouterSettingsPanel:
       - Input: API key (password type)
       - Button: Save
       - Button: Clear
       - Shows masked key when saved

    2. Create OpenRouterModelPicker:
       - Fetch models list using React Query
         - Recommended: staleTime = 24h (model catalog changes rarely)
       - Search input filters by id/name
       - Select sets chosen model slug in settings

    3. Place the panel in LearningHome (top-right near ThemeToggle is a good spot).

    4. UX requirements:
       - Clear explanation text: "Your key is stored only in your browser"
       - Validation: disallow empty key on save
       - Loading state while fetching models
       - Error state when 401 occurs (invalid key)

    5. Styling:
       - Match existing glassmorphism cards
       - Cyber Yellow (#FFD400) for primary actions
       - Keep it compact (do not dominate page)

    6. Add tests:
       - Panel renders
       - Save updates localStorage
       - Clear wipes localStorage
       - Picker filters list
  </action>
  <verify>
    - Manual: open page, save key, refresh, key still present (masked)
    - Manual: model list loads after saving key
  </verify>
  <done>User can set key and pick model from full catalog.</done>
</task>

<task type="auto">
  <name>Task 4: Attach OpenRouter headers to all Axios learning API calls</name>
  <files>client/src/lib/learningApi.ts</files>
  <action>
    1. Add a request interceptor to BOTH axios instances (api + learningApi):
       - Read settings via getOpenRouterSettings()
       - If apiKey present, set request headers:
         - X-OpenRouter-Key
         - X-OpenRouter-Model (if chosen)
         - HTTP-Referer: window.location.origin (client-provided)
         - X-OpenRouter-Title: a stable app name (e.g., "AgUI")

    2. Ensure this does not violate TypeScript strictness.

    3. Add a very small behavior change:
       - If no apiKey configured, generation calls will fail with 401.
       - Frontend should catch 401 and show UI guidance: "Set OpenRouter key".

    4. Tests:
       - Mock getOpenRouterSettings to return a key and assert axios called
         with headers.
  </action>
  <verify>
    - `cd client && npm run build` passes.
    - Manual: course generation works after setting key + model.
  </verify>
  <done>All learning API calls carry the required OpenRouter context.</done>
</task>

</tasks>

<verification>
- `cd client && npm run test -- --run`
- `cd client && npm run build`
- Manual flow:
  1) Set key
  2) Pick model
  3) Generate course
</verification>

<success_criteria>
- Intern can demo a full end-to-end run using ONLY an OpenRouter key.
- No Vertex credentials are needed on the developer machine.
</success_criteria>
