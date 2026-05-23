---
phase: 25
plan: 1
type: implementation
wave: 1-6
depends_on: []
files_modified:
  # Wave 1: Shared types & config
  - client/src/types/provider.ts
  - server/config.py
  - server/.env.example
  # Wave 2: Client settings abstraction
  - client/src/lib/providerSettings.ts
  - client/src/lib/providerSettings.test.ts
  # Wave 3: Server provider abstraction
  - server/schemas/llm.py
  - server/routers/llm.py
  - server/utils/instructor_client.py
  - server/tests/test_llm_router.py
  # Wave 4: Client API abstraction
  - client/src/lib/providerApi.ts
  - client/src/lib/providerApi.test.ts
  - client/src/lib/learningApi.ts
  # Wave 5: Settings UI
  - client/src/features/settings/SettingsPage.tsx
  - client/src/features/settings/ModelPicker.tsx
  - client/src/features/settings/ModelPicker.test.tsx
  - client/src/features/settings/SettingsPage.test.tsx
  # Wave 6: Integration & cleanup
  - client/src/features/learning/TopicInput.tsx
  - server/main.py
  - .planning/codebase/INTEGRATIONS.md
autonomous: true
requirements:
  - User can configure OpenRouter as AI provider in settings
  - User can configure General Compute as AI provider in settings
  - Settings page shows both provider options with appropriate configuration fields
  - API calls route to selected provider correctly
  - Existing OpenRouter-only settings are migrated seamlessly
---

# Phase 25: Add General Compute AI Provider to Settings Page

## Goal

Add General Compute as an AI provider option alongside OpenRouter in the settings page, with full end-to-end provider routing from client settings → HTTP headers → backend provider dispatch.

## Background

The current codebase is OpenRouter-specific end-to-end. This phase introduces a provider abstraction that allows users to choose between OpenRouter and General Compute, with each provider having its own API key, model selection, and backend routing.

**Key finding**: General Compute is 100% OpenAI-compatible. It uses the same base URL pattern (`/v1`), same `Authorization: Bearer` auth, same chat completions format, and `GET /v1/models` returns standard OpenAI model list format. This makes the backend integration straightforward — the primary difference is the base URL and the absence of OpenRouter-specific attribution headers.

---

## Architecture Decision Records

### ADR-1: Provider-neutral header contract

**Decision**: Introduce a new header `X-AI-Provider` (`openrouter` | `generalcompute`) alongside the existing `X-OpenRouter-Key`. Add a new header `X-GeneralCompute-Key` for General Compute API keys. The backend reads `X-AI-Provider` to determine routing.

**Rationale**: This keeps the existing OpenRouter flow backward-compatible (defaults to `openrouter` if header is missing) while cleanly separating provider concerns.

### ADR-2: Settings storage — provider-aware wrapper with migration

**Decision**: Create a new `providerSettings.ts` module with a provider-aware storage shape. The old `openrouter_settings` localStorage key is read during migration and transparently upgraded.

**Rationale**: Preserves existing user data while enabling multi-provider support.

### ADR-3: Model picker — single generic component

**Decision**: Create a generic `ModelPicker` component that accepts a `fetchModels` function prop, allowing it to work with any provider's model catalog.

**Rationale**: Both providers return models with `id` and `name` fields. A generic picker avoids code duplication while supporting provider-specific fetch logic.

### ADR-4: Backend model-list endpoint — single endpoint with provider routing

**Decision**: Keep one `GET /llm/models` endpoint that branches by `X-AI-Provider` header. OpenRouter calls `GET https://openrouter.ai/api/v1/models`, General Compute calls `POST https://api.generalcompute.com/v1/models/list`.

**Rationale**: Simpler client code (one endpoint, provider determined by headers).

---

## Wave 1: Shared Types & Config

### Task 1.1: Create provider type definitions

<read_first>
- client/src/types/openrouter.ts (existing model types)
- .planning/codebase/CONVENTIONS.md (TypeScript conventions)
</read_first>

<action>
Create `client/src/types/provider.ts` with:

```typescript
/** Provider identifiers */
export type AIProvider = 'openrouter' | 'generalcompute';

/** Normalized model entry usable across all providers */
export interface ProviderModel {
  id: string;
  name?: string;
  context_length?: number;
}

/** Response shape from GET /llm/models */
export type ProviderModelList = ProviderModel[];

/** Provider display metadata */
export interface ProviderInfo {
  id: AIProvider;
  label: string;
  description: string;
  keyPlaceholder: string;
  docsUrl: string;
}

/** Registry of known providers */
export const PROVIDERS: Record<AIProvider, ProviderInfo> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Unified gateway to hundreds of AI models',
    keyPlaceholder: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/docs',
  },
  generalcompute: {
    id: 'generalcompute',
    label: 'General Compute',
    description: 'Ultra-fast ASIC-native inference',
    keyPlaceholder: 'gc-...',
    docsUrl: 'https://docs.generalcompute.com',
  },
};
```

Keep `client/src/types/openrouter.ts` unchanged for backward compatibility — existing code can continue importing from it until fully migrated.
</action>

<acceptance_criteria>
- File `client/src/types/provider.ts` exists with `AIProvider`, `ProviderModel`, `ProviderModelList`, `ProviderInfo`, and `PROVIDERS` exports
- `npm run build` in `client/` succeeds with no type errors
- Existing `openrouter.ts` types still importable without errors
</acceptance_criteria>

---

### Task 1.2: Add General Compute config to server

<read_first>
- server/config.py (current Settings class)
- server/.env.example (current env vars)
</read_first>

<action>
Update `server/config.py` to add General Compute configuration:

```python
class Settings:
    OPENROUTER_BASE_URL = os.getenv(
        "OPENROUTER_BASE_URL",
        "https://openrouter.ai/api/v1",
    )
    OPENROUTER_TIMEOUT_SECONDS = float(
        os.getenv("OPENROUTER_TIMEOUT_SECONDS", "60.0")
    )
    GENERALCOMPUTE_BASE_URL = os.getenv(
        "GENERALCOMPUTE_BASE_URL",
        "https://api.generalcompute.com/v1",
    )
    GENERALCOMPUTE_TIMEOUT_SECONDS = float(
        os.getenv("GENERALCOMPUTE_TIMEOUT_SECONDS", "60.0")
    )
```

Update `server/.env.example` to document the new vars.
</action>

<acceptance_criteria>
- `server/config.py` exposes `GENERALCOMPUTE_BASE_URL` and `GENERALCOMPUTE_TIMEOUT_SECONDS`
- `server/.env.example` documents both OpenRouter and General Compute env vars
- `from server.config import settings; settings.GENERALCOMPUTE_BASE_URL` works in Python REPL
</acceptance_criteria>

---

## Wave 2: Client Settings Abstraction

### Task 2.1: Create provider-aware settings module

<read_first>
- client/src/lib/openrouterSettings.ts (current module)
- client/src/lib/openrouterSettings.test.ts (existing tests)
- client/src/types/provider.ts (from Task 1.1)
</read_first>

<action>
Create `client/src/lib/providerSettings.ts` with:

```typescript
import type { AIProvider } from '@/types/provider';

const STORAGE_KEY = 'ai_provider_settings';
const LEGACY_STORAGE_KEY = 'openrouter_settings';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  modelTitle: string;
}

export interface AIProviderSettings {
  activeProvider: AIProvider;
  providers: Record<AIProvider, ProviderConfig>;
}

const EMPTY_CONFIG: ProviderConfig = {
  apiKey: '',
  model: '',
  modelTitle: '',
};

const EMPTY_SETTINGS: AIProviderSettings = {
  activeProvider: 'openrouter',
  providers: {
    openrouter: { ...EMPTY_CONFIG },
    generalcompute: { ...EMPTY_CONFIG },
  },
};
```

Functions to implement:
- `getProviderSettings(): AIProviderSettings` — reads from localStorage, migrates legacy `openrouter_settings` if present
- `setProviderSettings(partial: Partial<AIProviderSettings>): void` — merges update
- `getActiveProviderConfig(): ProviderConfig` — shortcut for active provider's config
- `setActiveProvider(provider: AIProvider): void` — switches active provider
- `setProviderConfig(provider: AIProvider, config: Partial<ProviderConfig>): void` — updates a specific provider's config
- `clearProviderConfig(provider: AIProvider): void` — clears a specific provider's config
- `maskApiKey(key: string | undefined | null): string` — reuse existing logic

**Migration logic** in `getProviderSettings()`:
1. Try reading from `STORAGE_KEY` first
2. If not found, check for legacy `LEGACY_STORAGE_KEY`
3. If legacy found, migrate to new format with `activeProvider: 'openrouter'` and the legacy data under `providers.openrouter`
4. Write the migrated data to `STORAGE_KEY` and remove `LEGACY_STORAGE_KEY`
5. If neither found, return `EMPTY_SETTINGS`

Do NOT modify or delete `openrouterSettings.ts` yet — keep it for backward compatibility during the transition.
</action>

<acceptance_criteria>
- `getProviderSettings()` returns correct shape
- Legacy `openrouter_settings` localStorage data is transparently migrated
- After migration, `openrouter_settings` key is removed from localStorage
- `maskApiKey` works identically to existing implementation
- All functions are exported with proper TypeScript types
</acceptance_criteria>

---

### Task 2.2: Write tests for provider settings

<read_first>
- client/src/lib/openrouterSettings.test.ts (existing test patterns)
- client/src/lib/providerSettings.ts (from Task 2.1)
</read_first>

<action>
Create `client/src/lib/providerSettings.test.ts` with tests for:

1. **Default state**: `getProviderSettings()` returns `EMPTY_SETTINGS` when localStorage is empty
2. **Save and read**: `setProviderConfig('openrouter', { apiKey: 'test' })` persists and reads back
3. **Active provider switching**: `setActiveProvider('generalcompute')` updates and persists
4. **Legacy migration**: Seed `openrouter_settings` in localStorage, verify `getProviderSettings()` migrates correctly and removes the old key
5. **Clear provider config**: `clearProviderConfig('generalcompute')` resets only that provider
6. **maskApiKey**: Edge cases (empty, short, normal keys)
7. **Corrupt data handling**: Malformed JSON in localStorage returns defaults
</action>

<acceptance_criteria>
- All tests pass: `npm run test -- providerSettings.test.ts --run`
- Tests cover migration, CRUD, and edge cases
- >80% code coverage for `providerSettings.ts`
</acceptance_criteria>

---

## Wave 3: Server Provider Abstraction

### Task 3.1: Update LLM schemas for provider awareness

<read_first>
- server/schemas/llm.py (current LLMContext, get_llm_context)
- server/agents/base.py (how LLMContext is used)
</read_first>

<action>
Update `server/schemas/llm.py`:

1. Add `provider` field to `LLMContext`:
```python
from enum import Enum

class AIProviderEnum(str, Enum):
    OPENROUTER = "openrouter"
    GENERALCOMPUTE = "generalcompute"

class LLMContext(BaseModel):
    provider: AIProviderEnum = Field(
        default=AIProviderEnum.OPENROUTER,
        description="AI provider to route requests through",
    )
    api_key: str = Field(..., description="Provider API Key")
    model: Optional[str] = Field(default=None, ...)
    http_referer: Optional[str] = Field(default=None, ...)
    app_title: Optional[str] = Field(default=None, ...)
```

2. Update `get_llm_context()` to read `X-AI-Provider` header and `X-GeneralCompute-Key`:
```python
async def get_llm_context(
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
    x_generalcompute_key: Optional[str] = Header(None, alias="X-GeneralCompute-Key"),
    x_openrouter_model: Optional[str] = Header(None, alias="X-OpenRouter-Model"),
    x_generalcompute_model: Optional[str] = Header(None, alias="X-GeneralCompute-Model"),
    http_referer: Optional[str] = Header(None, alias="HTTP-Referer"),
    x_openrouter_title: Optional[str] = Header(None, alias="X-OpenRouter-Title"),
) -> LLMContext:
```

Logic:
- Determine provider from `X-AI-Provider` header (default: `openrouter` for backward compat)
- Pick the correct API key header based on provider
- Return 401 if the provider's key is missing
- Set `model` from the provider-appropriate model header

3. Keep `ModelResponse` unchanged — it's already generic.

4. Keep `get_attribution_headers()` — only returns headers for OpenRouter.
</action>

<acceptance_criteria>
- `AIProviderEnum` with `OPENROUTER` and `GENERALCOMPUTE` values
- `LLMContext` has `provider` field
- `get_llm_context()` supports both providers via headers
- Backward compatible: requests without `X-AI-Provider` default to `openrouter`
- Missing key for the active provider returns 401
</acceptance_criteria>

---

### Task 3.2: Update LLM router for provider-aware model listing

<read_first>
- server/routers/llm.py (current list_models endpoint)
- server/config.py (base URLs)
</read_first>

<action>
Update `server/routers/llm.py`:

1. Update `list_models()` to branch by `llm_context.provider`:

For **OpenRouter** (existing logic, unchanged):
- `GET https://openrouter.ai/api/v1/models`
- Send `Authorization: Bearer {api_key}` + attribution headers
- Parse `data[].{id, name, context_length}`

For **General Compute** (new):
- `POST https://api.generalcompute.com/v1/models/list`
- Send `Authorization: Bearer {api_key}`
- Parse `data[].{id, object, created, owned_by}` → map to `ModelResponse(id=id, name=id)`
- General Compute models don't have `context_length` or `name` fields in the standard response — use `id` as the display name and `None` for context_length

2. Extract provider-specific logic into helper functions:
- `_fetch_openrouter_models(llm_context: LLMContext) -> List[ModelResponse]`
- `_fetch_generalcompute_models(llm_context: LLMContext) -> List[ModelResponse]`
</action>

<acceptance_criteria>
- `GET /llm/models` with `X-AI-Provider: openrouter` + `X-OpenRouter-Key` returns OpenRouter models
- `GET /llm/models` with `X-AI-Provider: generalcompute` + `X-GeneralCompute-Key` returns General Compute models
- `GET /llm/models` without `X-AI-Provider` defaults to OpenRouter (backward compat)
- Upstream errors from either provider return appropriate 401/502 status codes
</acceptance_criteria>

---

### Task 3.3: Update instructor client for provider-aware base URL

<read_first>
- server/utils/instructor_client.py (current create_structured method)
- server/schemas/llm.py (LLMContext with provider field, from Task 3.1)
- server/config.py (base URLs, from Task 1.2)
</read_first>

<action>
Update `server/utils/instructor_client.py`:

1. Import `AIProviderEnum` from schemas
2. Update `create_structured()` to accept an optional `provider` parameter (or extract it from a passed `LLMContext`)
3. Select `base_url` and `timeout` based on provider:

```python
def _get_provider_config(
    self, provider: AIProviderEnum
) -> tuple[str, float]:
    """Return (base_url, timeout) for the given provider."""
    if provider == AIProviderEnum.GENERALCOMPUTE:
        return (
            settings.GENERALCOMPUTE_BASE_URL,
            settings.GENERALCOMPUTE_TIMEOUT_SECONDS,
        )
    return (
        settings.OPENROUTER_BASE_URL,
        settings.OPENROUTER_TIMEOUT_SECONDS,
    )
```

4. In `create_structured()`, use the provider to select base URL:
```python
base_url, timeout = self._get_provider_config(provider)
base_client = AsyncOpenAI(
    base_url=base_url,
    api_key=api_key,
    default_headers=attribution_headers or {},
    timeout=timeout,
    max_retries=0,
)
```

5. Add `provider` parameter with default `AIProviderEnum.OPENROUTER` to `create_structured()` signature.
</action>

<acceptance_criteria>
- `create_structured()` with `provider=AIProviderEnum.GENERALCOMPUTE` uses General Compute base URL
- `create_structured()` with `provider=AIProviderEnum.OPENROUTER` (or default) uses OpenRouter base URL
- Existing agent calls continue to work without changes (default provider = openrouter)
</acceptance_criteria>

---

### Task 3.4: Update base agent to pass provider through

<read_first>
- server/agents/base.py (BaseAgent.generate method)
- server/schemas/llm.py (LLMContext with provider)
</read_first>

<action>
Update `server/agents/base.py`:

In `BaseAgent.generate()`, pass `llm_context.provider` through to `instructor_client.create_structured()`:

```python
response = await instructor_client.create_structured(
    role=self._role,
    response_model=response_model,
    messages=messages,
    api_key=api_key,
    model_override=model_override,
    attribution_headers=attribution_headers,
    system_prompt=full_system_prompt,
    provider=llm_context.provider,  # NEW
    **kwargs,
)
```
</action>

<acceptance_criteria>
- `BaseAgent.generate()` passes `provider` from `llm_context` to instructor client
- Existing tests still pass: `python -m unittest server.tests.test_course_orchestrator`
</acceptance_criteria>

---

### Task 3.5: Update LLM router tests

<read_first>
- server/tests/test_llm_router.py (existing tests)
- server/routers/llm.py (updated router from Task 3.2)
</read_first>

<action>
Update `server/tests/test_llm_router.py`:

1. Keep all existing OpenRouter tests (they should pass with backward-compatible defaults)
2. Add new test class `TestLLMRouterGeneralCompute`:
   - `test_list_models_generalcompute_returns_models`: Mock `POST https://api.generalcompute.com/v1/models/list` returning model data, verify response
   - `test_list_models_generalcompute_returns_401_without_key`: Request with `X-AI-Provider: generalcompute` but no `X-GeneralCompute-Key`
   - `test_list_models_generalcompute_returns_502_on_upstream_error`: Mock upstream failure
3. Add backward-compatibility test: request without `X-AI-Provider` header still works as OpenRouter
</action>

<acceptance_criteria>
- All existing tests pass unchanged
- New General Compute tests pass
- Backward-compatibility test passes
- `python -m unittest server.tests.test_llm_router` all green
</acceptance_criteria>

---

## Wave 4: Client API Abstraction

### Task 4.1: Create provider-aware API client

<read_first>
- client/src/lib/openrouterApi.ts (existing API client)
- client/src/lib/providerSettings.ts (from Task 2.1)
- client/src/types/provider.ts (from Task 1.1)
</read_first>

<action>
Create `client/src/lib/providerApi.ts`:

```typescript
import axios from 'axios';
import type { AIProvider, ProviderModelList } from '@/types/provider';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export class ProviderApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProviderApiError';
    this.status = status;
  }
}

/**
 * Builds provider-specific headers for backend requests.
 */
export function buildProviderHeaders(
  provider: AIProvider,
  apiKey: string,
  model?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-AI-Provider': provider,
  };

  if (provider === 'openrouter') {
    headers['X-OpenRouter-Key'] = apiKey;
    if (model) headers['X-OpenRouter-Model'] = model;
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-OpenRouter-Title'] = 'A2UI';
  } else if (provider === 'generalcompute') {
    headers['X-GeneralCompute-Key'] = apiKey;
    if (model) headers['X-GeneralCompute-Model'] = model;
  }

  return headers;
}

/**
 * Fetches the model catalog for the active provider.
 */
export async function getProviderModels(
  provider: AIProvider,
  apiKey: string
): Promise<ProviderModelList> {
  try {
    const response = await axios.get<ProviderModelList>(
      `${baseURL}/llm/models`,
      {
        headers: buildProviderHeaders(provider, apiKey),
        timeout: 15000,
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const { status } = error.response;
      if (status === 401) {
        throw new ProviderApiError('Invalid or missing API key', 401);
      }
      throw new ProviderApiError('Backend/provider unavailable', status);
    }
    throw new ProviderApiError('Failed to connect to backend', 0);
  }
}
```

Keep `openrouterApi.ts` unchanged for now — it will be deprecated but not deleted in this phase.
</action>

<acceptance_criteria>
- `getProviderModels('openrouter', key)` sends correct OpenRouter headers
- `getProviderModels('generalcompute', key)` sends correct General Compute headers
- `buildProviderHeaders()` is exported for use by `learningApi.ts`
- Error handling matches existing `OpenRouterApiError` patterns
</acceptance_criteria>

---

### Task 4.2: Write tests for provider API client

<read_first>
- client/src/lib/openrouterApi.test.ts (existing test patterns)
- client/src/lib/providerApi.ts (from Task 4.1)
</read_first>

<action>
Create `client/src/lib/providerApi.test.ts` with tests:

1. `buildProviderHeaders` returns correct headers for `openrouter`
2. `buildProviderHeaders` returns correct headers for `generalcompute`
3. `getProviderModels` with `openrouter` sends `X-OpenRouter-Key` header
4. `getProviderModels` with `generalcompute` sends `X-GeneralCompute-Key` header
5. `getProviderModels` throws `ProviderApiError` with status 401 on auth failure
6. `getProviderModels` throws `ProviderApiError` with status 502 on server error
</action>

<acceptance_criteria>
- All tests pass: `npm run test -- providerApi.test.ts --run`
- >80% code coverage for `providerApi.ts`
</acceptance_criteria>

---

### Task 4.3: Update learning API interceptors

<read_first>
- client/src/lib/learningApi.ts (current interceptors)
- client/src/lib/providerSettings.ts (from Task 2.1)
- client/src/lib/providerApi.ts (buildProviderHeaders from Task 4.1)
</read_first>

<action>
Update `client/src/lib/learningApi.ts`:

Replace the duplicated OpenRouter-specific interceptors with provider-aware ones:

```typescript
import { getProviderSettings } from './providerSettings';
import { buildProviderHeaders } from './providerApi';

// Shared interceptor factory
function attachProviderHeaders(config: any) {
  const settings = getProviderSettings();
  const activeConfig = settings.providers[settings.activeProvider];
  if (activeConfig.apiKey) {
    const headers = buildProviderHeaders(
      settings.activeProvider,
      activeConfig.apiKey,
      activeConfig.model || undefined
    );
    Object.assign(config.headers, headers);
  }
  return config;
}

api.interceptors.request.use(attachProviderHeaders);
learningApi.interceptors.request.use(attachProviderHeaders);
```

This replaces both duplicate interceptor blocks with a single shared function.
</action>

<acceptance_criteria>
- `learningApi.ts` uses `getProviderSettings()` and `buildProviderHeaders()` instead of `getOpenRouterSettings()`
- Both `api` and `learningApi` instances use the same interceptor function
- Correct provider headers are sent based on `activeProvider`
- Import of `getOpenRouterSettings` is removed from this file
</acceptance_criteria>

---

## Wave 5: Settings UI

### Task 5.1: Create generic ModelPicker component

<read_first>
- client/src/features/settings/OpenRouterModelPicker.tsx (existing picker)
- client/src/features/settings/OpenRouterModelPicker.test.tsx (existing tests)
- client/src/types/provider.ts (ProviderModel type)
</read_first>

<action>
Create `client/src/features/settings/ModelPicker.tsx`:

A generalized version of `OpenRouterModelPicker` that:
- Accepts a `provider: AIProvider` prop
- Accepts a `fetchModels: (provider: AIProvider, apiKey: string) => Promise<ProviderModelList>` prop
- Uses `['provider-models', provider, apiKey]` as the React Query key
- Renders the same searchable dropdown UI
- Uses `ProviderModel` type instead of `OpenRouterModel`

Props interface:
```typescript
interface ModelPickerProps {
  provider: AIProvider;
  apiKey: string;
  value: string;
  onSelect: (modelId: string, modelTitle: string) => void;
  disabled?: boolean;
}
```

Keep `OpenRouterModelPicker.tsx` unchanged for now — it can be deprecated later.
</action>

<acceptance_criteria>
- `ModelPicker` renders a searchable dropdown
- Fetches models using `getProviderModels(provider, apiKey)` via React Query
- Displays model id, name, and context_length (when available)
- Shows loading, error, and empty states
- Works for both `openrouter` and `generalcompute` providers
</acceptance_criteria>

---

### Task 5.2: Write tests for ModelPicker

<read_first>
- client/src/features/settings/OpenRouterModelPicker.test.tsx (existing test patterns)
- client/src/features/settings/ModelPicker.tsx (from Task 5.1)
</read_first>

<action>
Create `client/src/features/settings/ModelPicker.test.tsx` with tests:

1. Renders trigger button with "Select a model" when no value
2. Shows "Enter API key first" when apiKey is empty
3. Opens dropdown on click and shows search input
4. Filters models by search query
5. Calls onSelect with model id and name on selection
6. Shows error state for 401 (invalid key)
7. Works with `provider='generalcompute'`
</action>

<acceptance_criteria>
- All tests pass: `npm run test -- ModelPicker.test.tsx --run`
- >80% coverage for `ModelPicker.tsx`
</acceptance_criteria>

---

### Task 5.3: Redesign SettingsPage with provider selection

<read_first>
- client/src/features/settings/SettingsPage.tsx (current page)
- client/src/lib/providerSettings.ts (from Task 2.1)
- client/src/types/provider.ts (PROVIDERS registry)
- conductor/product-guidelines.md (visual identity)
</read_first>

<action>
Redesign `client/src/features/settings/SettingsPage.tsx`:

**New layout**:
1. **Appearance section** (unchanged — theme selector)
2. **AI Provider section** (new):
   - Provider selector: segmented control or card selection (like theme selector) for `OpenRouter` | `General Compute`
   - Shows the active provider's config card:
     - API Key input (with show/hide, save, verify, clear)
     - Model picker for the active provider
   - Provider switch preserves per-provider settings (switching back restores saved key/model)

**State changes**:
- Replace individual `apiKey`/`model`/`modelTitle` state with provider-aware state from `getProviderSettings()`
- `activeProvider` state controls which provider card is shown
- Each provider's settings are independently stored and restored

**Key implementation details**:
- Use `PROVIDERS` registry for labels, descriptions, placeholders
- Verify button calls `getProviderModels(activeProvider, apiKey)` 
- Save/clear operations target the active provider only
- Description text changes from "Configure your OpenRouter API credentials" to "Configure your AI provider and model"
- Section heading changes from "OpenRouter API Configuration" to "AI Provider Configuration"

**Visual design** (per product guidelines):
- Provider selector uses the same segmented control pattern as theme selector
- Active provider card uses glassmorphism card style consistent with existing sections
- Cyber Yellow accent for active provider indicator
</action>

<acceptance_criteria>
- Settings page shows provider selector with OpenRouter and General Compute options
- Switching providers shows the appropriate config card with correct placeholder text
- API key save/clear/verify works independently per provider
- Model picker fetches models for the selected provider
- Theme selector section is unaffected
- Settings persist correctly in localStorage under `ai_provider_settings`
- Legacy `openrouter_settings` data is migrated on first load
</acceptance_criteria>

---

### Task 5.4: Update SettingsPage tests

<read_first>
- client/src/features/settings/SettingsPage.test.tsx (existing tests)
- client/src/features/settings/SettingsPage.tsx (updated from Task 5.3)
</read_first>

<action>
Update `client/src/features/settings/SettingsPage.test.tsx`:

1. Update mocks to use `providerSettings` instead of `openrouterSettings`
2. Update mocks to use `providerApi` instead of `openrouterApi`
3. Keep all existing test cases (adapted for new module names):
   - Renders headings and initial state
   - Theme switching works
   - API key validation (empty, short)
   - API key save and verify
   - API key clear
   - Navigation
4. Add new test cases:
   - Provider switching renders correct provider card
   - Saving key for OpenRouter doesn't affect General Compute config
   - Provider selector shows both options
   - Verify button works for General Compute provider
</action>

<acceptance_criteria>
- All tests pass: `npm run test -- SettingsPage.test.tsx --run`
- Tests cover both providers
- >80% coverage for `SettingsPage.tsx`
</acceptance_criteria>

---

## Wave 6: Integration & Cleanup

### Task 6.1: Update TopicInput provider check

<read_first>
- client/src/features/learning/TopicInput.tsx (uses getOpenRouterSettings)
- client/src/features/learning/LearningFlow.test.tsx (tests that reference settings)
</read_first>

<action>
Update `client/src/features/learning/TopicInput.tsx`:

Replace:
```typescript
import { getOpenRouterSettings } from '@/lib/openrouterSettings';
// ...
const hasApiKey = Boolean(getOpenRouterSettings().apiKey);
```

With:
```typescript
import { getProviderSettings } from '@/lib/providerSettings';
// ...
const settings = getProviderSettings();
const activeConfig = settings.providers[settings.activeProvider];
const hasApiKey = Boolean(activeConfig.apiKey);
```

This ensures the "Enter API key" warning works regardless of which provider is active.
</action>

<acceptance_criteria>
- TopicInput uses `getProviderSettings()` to check for API key
- Warning message appears when the active provider has no API key
- No reference to `openrouterSettings` in this file
</acceptance_criteria>

---

### Task 6.2: Update health check endpoint

<read_first>
- server/main.py (health endpoint)
</read_first>

<action>
Update the `/health` endpoint in `server/main.py` to report both providers:

```python
@app.get("/health")
async def health():
    """Health check endpoint exposing provider status."""
    return {
        "status": "ok",
        "services": {
            "openrouter": "enabled",
            "generalcompute": "enabled",
        },
    }
```
</action>

<acceptance_criteria>
- `GET /health` returns both `openrouter` and `generalcompute` as enabled
</acceptance_criteria>

---

### Task 6.3: Update INTEGRATIONS.md documentation

<read_first>
- .planning/codebase/INTEGRATIONS.md (current docs)
</read_first>

<action>
Update `.planning/codebase/INTEGRATIONS.md` to document:

1. **Provider abstraction**: `AIProvider` type, `providerSettings.ts` module, `X-AI-Provider` header
2. **General Compute integration**: Base URL, auth pattern, model catalog endpoint
3. **Header contract**: Document all provider-specific headers
4. **Migration**: How legacy `openrouter_settings` data is handled
5. **Backend routing**: How `get_llm_context()` dispatches by provider
</action>

<acceptance_criteria>
- INTEGRATIONS.md documents both OpenRouter and General Compute
- Header contract is fully documented
- Migration path is documented
</acceptance_criteria>

---

## Verification Plan

### Automated Tests

```bash
# Server tests
cd server
.venv\Scripts\activate
python -m unittest server.tests.test_llm_router

# Client tests
cd client
npm run test -- --run

# Client build check
npm run build
```

### Manual Verification

1. **OpenRouter flow**: Configure OpenRouter key in settings → verify key → pick model → generate a learning course → verify it works
2. **General Compute flow**: Switch to General Compute → enter key → verify key → pick model → generate a learning course → verify it works
3. **Provider switching**: Switch between providers, verify settings are preserved independently
4. **Migration**: Clear `ai_provider_settings`, set `openrouter_settings` with old format, reload page, verify migration
5. **Backward compat**: Verify app works if no `X-AI-Provider` header is sent (defaults to OpenRouter)

---

## PLANNING COMPLETE
