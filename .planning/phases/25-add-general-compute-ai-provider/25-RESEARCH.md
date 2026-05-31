# Phase 25 Research: Add General Compute AI Provider to Settings Page

## Bottom line

This phase is not just a UI tweak. The current codebase is OpenRouter-specific end to end: settings storage, settings UI, request interceptors, backend request context, model catalog routing, and instructor client configuration all assume OpenRouter. Adding General Compute will require a small provider abstraction across both client and server, not only a second card in the settings page.

## What the current OpenRouter integration does

### Client-side storage and UI

- `client/src/lib/openrouterSettings.ts`
  - Stores one flat object in `localStorage` under `openrouter_settings`
  - Shape: `apiKey`, `model`, `modelTitle`
  - No provider field exists
  - No migration path exists for multiple providers
- `client/src/features/settings/SettingsPage.tsx`
  - Hardcoded to OpenRouter
  - Lets the user save, clear, and verify an OpenRouter key
  - Uses `OpenRouterModelPicker` to choose a model
  - Verification calls `getOpenRouterModels(apiKey)`
- `client/src/lib/learningApi.ts`
  - Duplicates OpenRouter header injection in two Axios instances
  - Sends `X-OpenRouter-Key`, optional `X-OpenRouter-Model`, `HTTP-Referer`, and `X-OpenRouter-Title`
- `client/src/features/learning/TopicInput.tsx`
  - Checks only `getOpenRouterSettings().apiKey` to decide whether learning can start

### Backend routing and provider assumptions

- `server/schemas/llm.py`
  - `LLMContext` only contains OpenRouter-style fields:
    - `api_key`
    - `model`
    - `http_referer`
    - `app_title`
  - `get_llm_context()` only reads OpenRouter headers
- `server/utils/instructor_client.py`
  - Uses a single global OpenRouter base URL from `server/config.py`
  - `MODEL_CONFIGS` is hardcoded to OpenRouter model slugs such as `google/gemini-2.5-pro`
  - Builds `AsyncOpenAI(base_url=settings.OPENROUTER_BASE_URL, api_key=api_key, ...)`
- `server/routers/llm.py`
  - Proxies model listing only for OpenRouter
  - Hardcodes `https://openrouter.ai/api/v1/models`
- `server/main.py`
  - Health check only reports OpenRouter as enabled

## What General Compute is, and how it differs from OpenRouter

General Compute is a direct OpenAI-compatible inference provider, not a router/aggregator.

### Key General Compute facts from official docs

- Official docs: https://docs.generalcompute.com/
- API key / base URL guide: https://docs.generalcompute.com/api-keys.md
- Quickstart: https://docs.generalcompute.com/quickstart.md
- Models list: https://docs.generalcompute.com/api-reference/endpoints/models-list.md

### Important integration differences

- **Base URL**
  - OpenAI-compatible client should use `https://api.generalcompute.com/v1`
  - The docs also describe the production base URL as `https://api.generalcompute.com`
- **Auth**
  - Uses a bearer API key
  - Docs show `Authorization: Bearer <key>` for API calls
  - Standard env var name is `GENERALCOMPUTE_API_KEY`
- **Model catalog**
  - Models list endpoint is `POST /v1/models/list`
  - Response is organization-scoped and returns active models for the key's org
  - Docs show fields like `id`, `object`, `created`, `owned_by`
- **Attribution headers**
  - General Compute docs do not describe OpenRouter-style app attribution headers
- **Model naming**
  - Example models include `minimax-m2.7`
  - Do not assume OpenRouter-style `provider/model` slugs

### Difference from OpenRouter

OpenRouter is a unified gateway to many providers and models. It supports model routing, rankings, and attribution headers. General Compute is a single provider with its own OpenAI-compatible API and its own org-scoped model list. So this phase is really about provider abstraction, not just adding another API key field.

## Existing patterns for provider-specific settings in this repo

There is no provider-agnostic settings system yet. The only pattern is the OpenRouter-specific one.

What exists today:

- One localStorage-backed settings module per provider concept: `openrouterSettings.ts`
- One settings page section that is hardcoded to that provider
- One OpenRouter-specific model picker and model catalog client
- One OpenRouter-specific backend proxy endpoint
- One OpenRouter-specific backend request context object

What does not exist yet:

- A provider enum or discriminated union
- A provider registry or provider config map
- Generic model picker types
- Generic AI provider request headers
- Per-provider base URL selection in the backend

## Planning implications for Phase 25

### 1) You will need a provider abstraction

Because both providers need different auth, model catalogs, and backend routing, the safest plan is to introduce a provider-aware settings model instead of bolting General Compute onto the OpenRouter module.

Likely shape:

- selected provider: `openrouter` or `generalcompute`
- per-provider config objects with `apiKey`, `model`, and maybe `modelTitle`
- migration from the existing `openrouter_settings` key

### 2) The backend must know which provider to use

The backend cannot infer provider choice from `localStorage`; it only sees HTTP requests. So the selected provider must travel with each learning/model-list request.

That means planning for:

- a provider field in request context
- provider-aware header parsing in `get_llm_context()`
- provider-aware routing in `InstructorClient`

### 3) Model selection UI should become provider-aware

Current model picker assumptions are OpenRouter-specific:

- query key is `['openrouter-models', apiKey]`
- model list shape uses `name` and `context_length`
- verification uses `getOpenRouterModels()`

General Compute’s model list shape is different, so the picker should either use a generic normalized model type or use provider-specific adapters that normalize into the same UI shape.

### 4) OpenRouter and General Compute need different upstream calls

- OpenRouter upstream fetch: `GET https://openrouter.ai/api/v1/models`
- General Compute upstream fetch: `POST https://api.generalcompute.com/v1/models/list`

So the backend proxy should not remain a single hardcoded OpenRouter call.

### 5) The instructor client needs per-provider base URL selection

`server/utils/instructor_client.py` currently assumes one global OpenRouter base URL. For Phase 25, this should choose the correct provider at request time:

- OpenRouter base URL plus OpenRouter headers
- General Compute base URL plus bearer auth

The agent logic itself can probably stay unchanged if the client abstraction is clean.

### 6) Existing user data should not be broken

Users may already have OpenRouter settings stored locally. A good plan should include:

- backwards-compatible loading of `openrouter_settings`
- a migration path into the new provider-aware storage shape
- a default provider when no choice has been saved yet

## Files most likely to change during implementation

Client:

- `client/src/lib/openrouterSettings.ts` or a replacement generic settings module
- `client/src/features/settings/SettingsPage.tsx`
- `client/src/lib/learningApi.ts`
- `client/src/lib/openrouterApi.ts` or a generic provider API client
- `client/src/features/settings/OpenRouterModelPicker.tsx` or a generic picker
- `client/src/features/learning/TopicInput.tsx`
- related tests

Server:

- `server/schemas/llm.py`
- `server/routers/llm.py`
- `server/utils/instructor_client.py`
- `server/config.py`
- possibly `server/main.py` health reporting
- related tests

## Planning risks and decisions to settle before coding

1. **Header contract**
   - Keep OpenRouter-specific headers and add General Compute-specific ones, or
   - Move to a provider-neutral header contract

2. **Settings storage shape**
   - Keep the existing single-provider flat object, or
   - Move to a provider registry with migration support

3. **Model picker UX**
   - Separate picker per provider, or
   - Shared picker with provider-specific adapters

4. **Backend model-list endpoint strategy**
   - One `/llm/models` endpoint that branches by provider, or
   - Separate provider-specific endpoints

5. **Default model behavior**
   - Use provider defaults, or
   - Require the user to pick a model before saving

## Recommended planning direction

If you want the lowest-risk implementation plan, start by designing a single provider-aware settings contract and then wire the rest of the app through it.

That gives you one source of truth for:

- selected provider
- API key
- selected model
- provider-specific verification and model listing
- request headers for backend calls

That is the main thing to know before Phase 25 begins.

## Sources

- `.planning/STATE.md`
- `.planning/ROADMAP.md` (Phase 25)
- `.planning/codebase/INTEGRATIONS.md`
- `client/src/lib/openrouterSettings.ts`
- `client/src/features/settings/SettingsPage.tsx`
- `client/src/lib/learningApi.ts`
- `server/utils/instructor_client.py`
- OpenRouter docs: https://openrouter.ai/docs/quickstart, https://openrouter.ai/docs/app-attribution, https://openrouter.ai/docs/api/api-reference/models/get-models
- General Compute docs: https://docs.generalcompute.com/, https://docs.generalcompute.com/api-keys.md, https://docs.generalcompute.com/quickstart.md, https://docs.generalcompute.com/api-reference/endpoints/models-list.md

## RESEARCH COMPLETE
