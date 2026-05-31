---
phase: 9-openrouter-migration
plan: 04
type: execute
wave: 1
depends_on:
  - 9-01-PLAN.md
  - 9-02-PLAN.md
  - 9-03-PLAN.md
files_modified:
  - server/.env.example
  - README.md
  - conductor/product.md
  - conductor/tech-stack.md
  - .planning/codebase/STACK.md
  - .planning/codebase/INTEGRATIONS.md
  - .planning/codebase/ARCHITECTURE.md
  - .planning/codebase/STRUCTURE.md
  - .planning/codebase/CONCERNS.md
  - openrouter_problem_statement.md (optional: mark as implemented / move to .planning)
autonomous: true
must_haves:
  truths:
    - No Vertex-specific docs remain as current truth
    - Environment templates describe OpenRouter headers + client-key model
    - Repo search shows no google-cloud-aiplatform usage
---

<objective>
Finish the migration by updating docs, env templates, and performing a final cleanup sweep.

This phase prevents “half-migrated” confusion for future contributors.
</objective>

<context>
@.planning/codebase/STACK.md
@.planning/codebase/INTEGRATIONS.md
@README.md
@conductor/product.md
@conductor/tech-stack.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update server/.env.example to OpenRouter era</name>
  <files>server/.env.example</files>
  <action>
    Replace Vertex env variables with OpenRouter-related notes.

    Because the app is "user key only", server/.env.example should:
    - NOT require OPENROUTER_API_KEY for normal use
    - Optionally include OPENROUTER_BASE_URL for advanced users
    - Include a comment explaining required request headers from the frontend

    Example content (adjust as needed):
    - OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
    - # Frontend must send X-OpenRouter-Key on every request
  </action>
  <verify>
    - New dev can follow README + env example without touching GCP.
  </verify>
  <done>Env template matches the new architecture.</done>
</task>

<task type="auto">
  <name>Task 2: Update README.md install/run instructions</name>
  <files>README.md</files>
  <action>
    1. Replace references to Google Vertex AI with OpenRouter.
    2. Remove service-account setup steps.
    3. Add a short "OpenRouter setup" section:
       - Get an API key
       - Paste into UI settings panel
       - Pick a model
    4. Update limitation section:
       - Remove "Vertex AI Required" and replace with "OpenRouter key required".
  </action>
  <verify>
    - README is internally consistent and matches actual UI.
  </verify>
  <done>Docs reflect OpenRouter-only reality.</done>
</task>

<task type="auto">
  <name>Task 3: Update product + stack docs (conductor + .planning/codebase)</name>
  <files>
    conductor/product.md
    conductor/tech-stack.md
    .planning/codebase/STACK.md
    .planning/codebase/INTEGRATIONS.md
    .planning/codebase/ARCHITECTURE.md
    .planning/codebase/STRUCTURE.md
    .planning/codebase/CONCERNS.md
  </files>
  <action>
    1. Replace Vertex AI integration descriptions with OpenRouter:
       - Utility layer: InstructorClient uses OpenRouter via OpenAI SDK
       - Health check reports OpenRouter configuration

    2. Update integration list:
       - Remove google-cloud-aiplatform
       - Add openai (python SDK) used with base_url
       - Note required headers and client-provided key model

    3. Update concerns:
       - Replace "Vertex AI initialization chain" concern with:
         - "Per-request API key and header propagation" (risk: missing headers)
         - "Client-side key storage" security tradeoffs

  </action>
  <verify>
    - Repo docs do not contradict implementation.
  </verify>
  <done>Project documentation matches the new provider.</done>
</task>

<task type="auto">
  <name>Task 4: Final cleanup sweep (no Vertex left behind)</name>
  <files>Multiple</files>
  <action>
    1. Run these searches and fix remaining matches:
       - rg "google-cloud-aiplatform|aiplatform|vertex_ai|Vertex AI|GOOGLE_APPLICATION_CREDENTIALS|PROJECT_ID|VERTEX_CONFIG" -S

    2. Ensure server/utils/vertex_client.py is deleted.

    3. Ensure requirements.txt has no GCP dependencies.

    4. Ensure CI/test commands run.
  </action>
  <verify>
    - Searches return zero matches in source code.
    - Tests and builds still pass.
  </verify>
  <done>Complete removal of Vertex from the codebase and documentation.</done>
</task>

</tasks>

<verification>
- Server:
  - `cd server && python -m unittest`
- Client:
  - `cd client && npm run test -- --run`
  - `cd client && npm run build`
- Repo sweep:
  - `rg "google-cloud-aiplatform|vertex" -S` yields only historical archive docs (optional to keep) OR none if you choose to update archives too.
</verification>

<success_criteria>
- A new contributor can run the app without any GCP setup.
- All docs accurately describe OpenRouter-only usage.
- No Vertex SDK code remains.
</success_criteria>
