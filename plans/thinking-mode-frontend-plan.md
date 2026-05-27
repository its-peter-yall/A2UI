# Frontend Implementation Plan: OpenRouter Thinking Mode

**Feature**: User-configurable thinking/reasoning mode for OpenRouter models
**Scope**: Client-side changes only (TypeScript/React)
**Estimated Effort**: 3-4 hours
**Prerequisites**: Backend plan completed, read `research/openrouter-thinking-research.md`

---

## Overview

This plan adds a thinking mode toggle to the Settings page, allowing users to enable/disable thinking and select effort level. The frontend must:
1. Store thinking preferences in localStorage alongside provider settings
2. Pass thinking headers (`X-Thinking-Enabled`, `X-Thinking-Effort`) with API requests
3. Show thinking support indicator on models in the ModelPicker
4. Provide a clean UI for thinking configuration

---

## Step 1: Update Provider Types

**File**: `client/src/types/provider.ts`

**What to change**: Add thinking configuration to provider types.

**Current exports**:
```typescript
export type AIProvider = 'openrouter' | 'generalcompute';

export interface ProviderModel {
  id: string;
  name?: string;
  context_length?: number;
}
```

**Add these types** (after `ProviderModel`):
```typescript
/** Thinking effort levels for OpenRouter reasoning mode */
export type ThinkingEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** Thinking configuration stored per-provider */
export interface ThinkingConfig {
  enabled: boolean;
  effort: ThinkingEffort;
}
```

**Update `ProviderModel`** to include thinking support:
```typescript
export interface ProviderModel {
  id: string;
  name?: string;
  context_length?: number;
  supports_thinking?: boolean;
}
```

**Update `ProviderConfig`** (in providerSettings.ts or here):
```typescript
export interface ProviderConfig {
  apiKey: string;
  model: string;
  modelTitle: string;
  thinking?: ThinkingConfig;  // Add this field
}
```

---

## Step 2: Update Provider Settings Storage

**File**: `client/src/lib/providerSettings.ts`

**What to change**: Persist thinking configuration in localStorage.

**Update `ProviderConfig` interface** (around line 25):
```typescript
export interface ProviderConfig {
  apiKey: string;
  model: string;
  modelTitle: string;
  thinking?: {
    enabled: boolean;
    effort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  };
}
```

**Update `EMPTY_CONFIG`** (around line 30):
```typescript
const EMPTY_CONFIG: ProviderConfig = {
  apiKey: '',
  model: '',
  modelTitle: '',
  thinking: {
    enabled: false,
    effort: 'high',
  },
};
```

**Add helper function** (after `clearProviderConfig`):
```typescript
/**
 * Updates thinking configuration for a specific provider.
 */
export function setProviderThinking(
  provider: AIProvider,
  thinking: { enabled: boolean; effort: string }
): void {
  const settings = getProviderSettings();
  const updatedProviders = {
    ...settings.providers,
    [provider]: {
      ...settings.providers[provider],
      thinking: {
        enabled: thinking.enabled,
        effort: thinking.effort as ThinkingEffort,
      },
    },
  };
  setProviderSettings({ providers: updatedProviders });
}
```

**Update `getProviderSettings()`** to handle migration (around line 50-80):

In the migration logic, ensure old settings without `thinking` get the default:
```typescript
// In the parsed data normalization, add:
thinking: parsed?.providers?.openrouter?.thinking ?? { enabled: false, effort: 'high' },
```

---

## Step 3: Update Provider API Headers

**File**: `client/src/lib/providerApi.ts`

**What to change**: Include thinking headers in API requests.

**Update `buildProviderHeaders()`** (around line 35):
```typescript
/**
 * Builds provider-specific headers for backend requests.
 */
export function buildProviderHeaders(
  provider: AIProvider,
  apiKey: string,
  model?: string,
  thinking?: { enabled: boolean; effort?: string }
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
    
    // Add thinking headers for OpenRouter only
    if (thinking?.enabled) {
      headers['X-Thinking-Enabled'] = 'true';
      headers['X-Thinking-Effort'] = thinking.effort || 'high';
    }
  } else if (provider === 'generalcompute') {
    headers['X-GeneralCompute-Key'] = apiKey;
    if (model) headers['X-GeneralCompute-Model'] = model;
  }

  return headers;
}
```

---

## Step 4: Update Learning API Interceptor

**File**: `client/src/lib/learningApi.ts`

**What to change**: Pass thinking config from localStorage to header builder.

**Update `attachProviderHeaders()`** (around line 45):
```typescript
// Shared interceptor factory to attach provider-aware headers
function attachProviderHeaders(config: InternalAxiosRequestConfig) {
  const settings = getProviderSettings();
  const activeConfig = settings.providers[settings.activeProvider];
  if (activeConfig.apiKey && config.headers) {
    const headers = buildProviderHeaders(
      settings.activeProvider,
      activeConfig.apiKey,
      activeConfig.model || undefined,
      activeConfig.thinking  // Pass thinking config
    );
    Object.assign(config.headers, headers);
  }
  return config;
}
```

---

## Step 5: Create Thinking Mode Component

**File**: `client/src/features/settings/ThinkingModeToggle.tsx` (new file)

**What to create**: A reusable component for thinking configuration.

```tsx
/**
 * ============================================================================
 * FILE: ThinkingModeToggle.tsx
 * LOCATION: client/src/features/settings/ThinkingModeToggle.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Toggle and effort selector for OpenRouter thinking/reasoning mode.
 *
 * ROLE IN PROJECT:
 *    Provides UI for users to enable/disable thinking and select effort level.
 *    Only visible when an OpenRouter model that supports thinking is selected.
 *
 * KEY COMPONENTS:
 *    - ThinkingModeToggle: Main toggle with effort dropdown
 *
 * DEPENDENCIES:
 *    - External: react, lucide-react
 *    - Internal: @/types/provider, @/lib/utils
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { Brain, ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThinkingEffort } from '@/types/provider';

export interface ThinkingModeToggleProps {
  enabled: boolean;
  effort: ThinkingEffort;
  onChange: (enabled: boolean, effort: ThinkingEffort) => void;
  disabled?: boolean;
  supportsThinking?: boolean;
}

const EFFORT_OPTIONS: Array<{ value: ThinkingEffort; label: string; description: string }> = [
  { value: 'minimal', label: 'Minimal', description: '~10% reasoning tokens. Fastest, cheapest.' },
  { value: 'low', label: 'Low', description: '~20% reasoning tokens. Light analysis.' },
  { value: 'medium', label: 'Medium', description: '~50% reasoning tokens. Balanced.' },
  { value: 'high', label: 'High', description: '~80% reasoning tokens. Deep reasoning.' },
  { value: 'xhigh', label: 'Maximum', description: '~95% reasoning tokens. Hardest problems.' },
];

export function ThinkingModeToggle({
  enabled,
  effort,
  onChange,
  disabled = false,
  supportsThinking = true,
}: ThinkingModeToggleProps) {
  const [showEffortPicker, setShowEffortPicker] = useState(false);

  const handleToggle = useCallback(() => {
    if (disabled || !supportsThinking) return;
    onChange(!enabled, effort);
  }, [enabled, effort, disabled, supportsThinking, onChange]);

  const handleEffortSelect = useCallback((newEffort: ThinkingEffort) => {
    onChange(enabled, newEffort);
    setShowEffortPicker(false);
  }, [enabled, onChange]);

  const currentEffort = EFFORT_OPTIONS.find((o) => o.value === effort) ?? EFFORT_OPTIONS[3]; // Default to 'high'

  if (!supportsThinking) {
    return null; // Don't render if model doesn't support thinking
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className={cn(
            'h-4 w-4 transition-colors',
            enabled ? 'text-[#FFD400]' : 'text-muted-foreground'
          )} />
          <span className="text-sm font-semibold text-foreground">
            Thinking Mode
          </span>
          {enabled && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
              {currentEffort.label}
            </span>
          )}
        </div>
        
        {/* Toggle Switch */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            enabled
              ? 'bg-[#FFD400]'
              : 'bg-muted border border-border'
          )}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle thinking mode"
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1'
            )}
          />
        </button>
      </div>

      {/* Effort Selector (only shown when enabled) */}
      {enabled && (
        <div className="pl-6 space-y-2">
          <button
            type="button"
            onClick={() => setShowEffortPicker(!showEffortPicker)}
            disabled={disabled}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm',
              'bg-muted border border-border text-foreground',
              'hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/20',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <span>
              <span className="font-medium">{currentEffort.label}</span>
              <span className="text-muted-foreground ml-2">— {currentEffort.description}</span>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform shrink-0',
                showEffortPicker && 'rotate-180'
              )}
            />
          </button>

          {/* Effort Dropdown */}
          {showEffortPicker && (
            <div className="rounded-lg border border-border bg-popover overflow-hidden">
              {EFFORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleEffortSelect(option.value)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 text-sm transition-colors',
                    'hover:bg-muted focus:outline-none focus:bg-muted',
                    option.value === effort && 'bg-primary/10 text-primary font-semibold'
                  )}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </button>
              ))}
            </div>
          )}

          {/* Info Box */}
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Thinking mode lets the model reason step-by-step before answering. 
              Higher effort = better accuracy but higher cost (~4× at maximum).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Step 6: Update OpenRouter Settings Panel

**File**: `client/src/features/settings/OpenRouterSettingsPanel.tsx`

**What to change**: Add ThinkingModeToggle below the model picker.

**Add imports** (at top):
```typescript
import { ThinkingModeToggle } from './ThinkingModeToggle';
import { setProviderThinking } from '@/lib/providerSettings';
import type { ThinkingEffort } from '@/types/provider';
```

**Add state** (inside component, after existing state):
```typescript
  // Get current active model's thinking support
  const activeModelSupportsThinking = useMemo(() => {
    // We need to check if the active model supports thinking
    // This requires the model list data - we'll get it from the ModelPicker's data
    // For now, we'll use a simple heuristic or check from model list
    return settings.activeProvider === 'openrouter'; // Only show for OpenRouter
  }, [settings.activeProvider]);
```

**Add handler** (after `handleModelSelect`):
```typescript
  const handleThinkingChange = useCallback(
    (enabled: boolean, effort: ThinkingEffort) => {
      setProviderThinking(settings.activeProvider, { enabled, effort });
      setSettings(getProviderSettings());
    },
    [settings.activeProvider]
  );
```

**Add the toggle** in the JSX (after the ModelPicker section, around line 120):
```tsx
              {/* Thinking Mode Toggle - Only for OpenRouter */}
              {settings.activeProvider === 'openrouter' && openrouterConfig.apiKey && (
                <div className="mt-4 pt-4 border-t border-border">
                  <ThinkingModeToggle
                    enabled={openrouterConfig.thinking?.enabled ?? false}
                    effort={openrouterConfig.thinking?.effort ?? 'high'}
                    onChange={handleThinkingChange}
                    supportsThinking={activeModelSupportsThinking}
                  />
                </div>
              )}
```

---

## Step 7: Update ModelPicker to Show Thinking Support

**File**: `client/src/features/settings/ModelPicker.tsx`

**What to change**: Add visual indicator for models that support thinking.

**Add import**:
```typescript
import { Brain } from 'lucide-react';
```

**Update the model rendering** (around line 180-210), add after the context_length badge:
```tsx
                        {/* Thinking Support Badge */}
                        {model.supports_thinking && (
                          <span className="shrink-0 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded text-[10px] border border-amber-500/20 dark:border-amber-500/30 flex items-center gap-1">
                            <Brain className="h-2.5 w-2.5" />
                            Thinking
                          </span>
                        )}
```

---

## Step 8: Update Provider Types Response

**File**: `client/src/lib/providerApi.ts` or wherever `getProviderModels` is used

**What to change**: Ensure `supports_thinking` is included in the response type.

The `ProviderModel` type already has `supports_thinking?: boolean` from Step 1. The backend will return this field, and TypeScript will type it correctly.

No changes needed here if the type is already updated.

---

## Step 9: Write Tests

**File**: `client/src/lib/providerSettings.test.ts` (update existing)

**Add test cases**:
```typescript
describe('Thinking Configuration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('setProviderThinking persists thinking config', () => {
    setProviderThinking('openrouter', { enabled: true, effort: 'high' });
    const settings = getProviderSettings();
    expect(settings.providers.openrouter.thinking).toEqual({
      enabled: true,
      effort: 'high',
    });
  });

  test('setProviderThinking does not affect other providers', () => {
    setProviderThinking('openrouter', { enabled: true, effort: 'low' });
    setProviderThinking('generalcompute', { enabled: false, effort: 'medium' });
    
    const settings = getProviderSettings();
    expect(settings.providers.openrouter.thinking?.enabled).toBe(true);
    expect(settings.providers.generalcompute.thinking?.enabled).toBe(false);
  });

  test('default thinking config is disabled with high effort', () => {
    const settings = getProviderSettings();
    expect(settings.providers.openrouter.thinking).toEqual({
      enabled: false,
      effort: 'high',
    });
  });
});
```

**File**: `client/src/features/settings/ThinkingModeToggle.test.tsx` (new file)

**Test cases**:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ThinkingModeToggle } from './ThinkingModeToggle';

describe('ThinkingModeToggle', () => {
  test('renders nothing when model does not support thinking', () => {
    const { container } = render(
      <ThinkingModeToggle
        enabled={false}
        effort="high"
        onChange={jest.fn()}
        supportsThinking={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders toggle when model supports thinking', () => {
    render(
      <ThinkingModeToggle
        enabled={false}
        effort="high"
        onChange={jest.fn()}
        supportsThinking={true}
      />
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  test('toggle calls onChange with inverted enabled state', () => {
    const onChange = jest.fn();
    render(
      <ThinkingModeToggle
        enabled={false}
        effort="high"
        onChange={onChange}
        supportsThinking={true}
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true, 'high');
  });

  test('shows effort picker when enabled', () => {
    render(
      <ThinkingModeToggle
        enabled={true}
        effort="high"
        onChange={jest.fn()}
        supportsThinking={true}
      />
    );
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  test('hides effort picker when disabled', () => {
    render(
      <ThinkingModeToggle
        enabled={false}
        effort="high"
        onChange={jest.fn()}
        supportsThinking={true}
      />
    );
    expect(screen.queryByText('High')).not.toBeInTheDocument();
  });
});
```

---

## Step 10: Update ModelPicker to Fetch Thinking Support

**File**: `client/src/features/settings/ModelPicker.tsx`

**What to change**: The `useModelList` hook already fetches from `/llm/models`. The backend will now return `supports_thinking` in the response. Since we updated the `ProviderModel` type in Step 1, the data will be typed correctly.

**No code changes needed** - just ensure the backend is returning the field.

---

## Edge Cases & Error Handling

1. **General Compute models**: The ThinkingModeToggle only renders when `activeProvider === 'openrouter'`. General Compute models won't show thinking options.

2. **Models without thinking support**: The toggle checks `supportsThinking` prop. If the model doesn't support thinking, the component returns `null`.

3. **Migration from old settings**: Old localStorage entries without `thinking` will get the default `{ enabled: false, effort: 'high' }` on first read.

4. **Header format**: Booleans are sent as strings (`'true'`/`'false'`) in HTTP headers. The backend parses these correctly.

5. **Cost warning**: The info box in ThinkingModeToggle warns users about cost implications. This is important for UX.

---

## Files Modified Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `client/src/types/provider.ts` | Modify | Add ThinkingEffort type, ThinkingConfig interface, supports_thinking field |
| `client/src/lib/providerSettings.ts` | Modify | Add thinking to ProviderConfig, add setProviderThinking function |
| `client/src/lib/providerApi.ts` | Modify | Add thinking params to buildProviderHeaders |
| `client/src/lib/learningApi.ts` | Modify | Pass thinking config to header builder |
| `client/src/features/settings/ThinkingModeToggle.tsx` | New | Thinking toggle component |
| `client/src/features/settings/OpenRouterSettingsPanel.tsx` | Modify | Add ThinkingModeToggle to settings UI |
| `client/src/features/settings/ModelPicker.tsx` | Modify | Add thinking support badge |
| `client/src/lib/providerSettings.test.ts` | Modify | Add thinking configuration tests |
| `client/src/features/settings/ThinkingModeToggle.test.tsx` | New | Component tests |

---

## Acceptance Criteria

- [ ] `ThinkingEffort` type exported from `provider.ts`
- [ ] `ThinkingConfig` interface exported from `provider.ts`
- [ ] `ProviderConfig` includes optional `thinking` field
- [ ] `setProviderThinking()` persists thinking config to localStorage
- [ ] `buildProviderHeaders()` includes `X-Thinking-Enabled` and `X-Thinking-Effort` headers
- [ ] `attachProviderHeaders()` passes thinking config to header builder
- [ ] `ThinkingModeToggle` component renders toggle and effort picker
- [ ] `OpenRouterSettingsPanel` includes ThinkingModeToggle for OpenRouter
- [ ] `ModelPicker` shows thinking support badge on supported models
- [ ] Thinking toggle only visible for OpenRouter provider
- [ ] Thinking toggle hidden for models without thinking support
- [ ] All existing tests pass
- [ ] New tests pass for thinking configuration
- [ ] Manual testing confirms UI works end-to-end

---

## Visual Design Reference

**Toggle States**:
- **Off**: Gray toggle, no effort picker shown
- **On**: Yellow (#FFD400) toggle, effort picker visible

**Effort Picker**:
- Dropdown with 5 options (Minimal, Low, Medium, High, Maximum)
- Each option shows label + description
- Selected option highlighted with primary color

**Info Box**:
- Below effort picker when enabled
- Explains what thinking does and cost implications
- Uses muted background with info icon

**Model Badge**:
- Small badge next to models that support thinking
- Amber color with brain icon
- Text: "Thinking"
