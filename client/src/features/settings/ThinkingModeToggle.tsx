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

import { useState, useCallback, useRef, useEffect } from 'react';
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

const DEFAULT_EFFORT = EFFORT_OPTIONS.find((o) => o.value === 'high')!;

export function ThinkingModeToggle({
  enabled,
  effort,
  onChange,
  disabled = false,
  supportsThinking = true,
}: ThinkingModeToggleProps) {
  const [showEffortPicker, setShowEffortPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close effort dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowEffortPicker(false);
      }
    }
    if (showEffortPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEffortPicker]);

  const handleToggle = useCallback(() => {
    if (disabled || !supportsThinking) return;
    onChange(!enabled, effort);
  }, [enabled, effort, disabled, supportsThinking, onChange]);

  const handleEffortSelect = useCallback((newEffort: ThinkingEffort) => {
    onChange(enabled, newEffort);
    setShowEffortPicker(false);
  }, [enabled, onChange]);

  const currentEffort = EFFORT_OPTIONS.find((o) => o.value === effort) ?? DEFAULT_EFFORT;

  if (!supportsThinking) {
    return null; // Don't render if model doesn't support thinking
  }

  return (
    <div ref={containerRef} className="space-y-3">
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
            <span
              data-testid="thinking-effort-badge"
              className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider"
            >
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
            onClick={() => !disabled && setShowEffortPicker(!showEffortPicker)}
            disabled={disabled}
            data-testid="effort-picker-trigger"
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
            <div data-testid="effort-picker-dropdown" className="rounded-lg border border-border bg-popover overflow-hidden">
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
