/**
 * ============================================================================
 * FILE: TopicInput.tsx
 * LOCATION: client/src/features/learning/TopicInput.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Form component for entering a learning topic. Triggers course generation
 *    on submit, shows loading progress during the scatter-gather process, and
 *    navigates to the generated learning path on success.
 *
 * ROLE IN PROJECT:
 *    Entry point of the learning feature rendered on LearningHome. Bridges
 *    user intent to the generateCourse API and routes to the resulting
 *    LearningPathContainer session.
 *
 * KEY COMPONENTS:
 *    - TopicInput: Main form with text input and submit button
 *    - Depth Mode Picker: Custom Auto/Lite/Full dropdown
 *    - Suggestion Chips: Clickable topic suggestions for quick starts
 *    - Loading State: Progress message while generating course
 *    - Error Display: Error message if generation fails
 *
 * DEPENDENCIES:
 *    - External: react-router-dom, @tanstack/react-query, lucide-react
 *    - Internal: @/lib/utils (cn), @/lib/learningApi (generateCourse)
 *
 * USAGE:
 *    ```tsx
 *    <TopicInput />
 *
 *    <TopicInput placeholder="What do you want to master?" userId="user-123" />
 *    ```
 * ============================================================================
 */

import { useState, useId, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateCourse } from '@/lib/learningApi';
import { getProviderSettings } from '@/lib/providerSettings';
import type {
  GenerateCourseRequest,
  LearningDepthMode,
} from '@/types/learning';

interface TopicInputProps {
  className?: string;
  placeholder?: string;
  userId?: string;
  autoFocus?: boolean;
}

const TOPIC_SUGGESTIONS = [
  "Newton's Laws",
  'Photosynthesis',
  'Machine Learning Basics',
] as const;

const DEPTH_MODE_OPTIONS: Array<{
  value: LearningDepthMode;
  label: string;
}> = [
  { value: 'auto', label: 'Auto' },
  { value: 'lite', label: 'Lite' },
  { value: 'full', label: 'Full' },
];

export function TopicInput({
  className,
  placeholder = 'What do you want to learn today?',
  userId,
  autoFocus = false,
}: TopicInputProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<LearningDepthMode>('auto');
  const [modeOpen, setModeOpen] = useState(false);
  const inputId = useId();
  const modeListboxId = useId();
  const modePickerRef = useRef<HTMLDivElement>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        modePickerRef.current &&
        !modePickerRef.current.contains(event.target as Node)
      ) {
        setModeOpen(false);
      }
    }

    if (modeOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [modeOpen]);

  const generateMutation = useMutation({
    mutationFn: (data: GenerateCourseRequest) => {
      const controller = new AbortController();
      abortRef.current = controller;
      return generateCourse(data, controller.signal);
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      // Navigate on success - best practice from TanStack Query
      navigate(`/learn/${session.id}`);
    },
    onSettled: () => {
      abortRef.current = null;
    },
  });

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    generateMutation.reset();
  };

  const settings = getProviderSettings();
  const hasApiKey = Boolean(settings.providers[settings.activeProvider].apiKey);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim() && !generateMutation.isPending && hasApiKey) {
      generateMutation.mutate({
        query: query.trim(),
        user_id: userId,
        mode,
      });
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
  };

  const isLoading = generateMutation.isPending;
  const error = generateMutation.error;
  const selectedModeLabel =
    DEPTH_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? 'Auto';

  return (
    <div className={cn('w-full max-w-2xl', className)}>
      <form onSubmit={handleSubmit} className="relative" role="search">
        <label htmlFor={inputId} className="sr-only">
          Enter a topic to learn
        </label>
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
          placeholder={placeholder}
          disabled={isLoading || !hasApiKey}
          aria-describedby={error ? `${inputId}-error` : undefined}
          aria-invalid={error ? 'true' : undefined}
          className={cn(
            'w-full px-4 py-3 pr-48 text-lg rounded-lg border',
            'bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-200',
            error && 'border-destructive focus:ring-destructive'
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <div ref={modePickerRef} className="relative">
            <button
              type="button"
              onClick={() => {
                if (!isLoading && hasApiKey) {
                  setModeOpen((open) => !open);
                }
              }}
              disabled={isLoading || !hasApiKey}
              aria-label="Learning depth mode"
              aria-haspopup="listbox"
              aria-expanded={modeOpen}
              aria-controls={modeListboxId}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm',
                'bg-muted text-foreground border border-border',
                'hover:border-border/80 hover:bg-muted/80',
                'focus:outline-none focus:ring-2 focus:ring-primary',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors duration-200',
                modeOpen && 'ring-2 ring-primary border-transparent'
              )}
            >
              <span className="leading-none">{selectedModeLabel}</span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                  modeOpen && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>

            {modeOpen && (
              <div
                id={modeListboxId}
                role="listbox"
                aria-label="Learning depth mode"
                className={cn(
                  'absolute right-0 top-full z-50 mt-1 min-w-full',
                  'rounded-md border border-border bg-popover text-popover-foreground',
                  'shadow-lg overflow-hidden'
                )}
              >
                {DEPTH_MODE_OPTIONS.map((option) => {
                  const isSelected = option.value === mode;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setMode(option.value);
                        setModeOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors',
                        'hover:bg-muted focus:outline-none focus:bg-muted',
                        isSelected &&
                          'bg-primary/10 text-primary font-semibold'
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type={isLoading ? 'button' : 'submit'}
            onClick={isLoading ? handleStop : undefined}
            disabled={(!query.trim() && !isLoading) || !hasApiKey}
            aria-label={isLoading ? 'Stop generating' : 'Start learning'}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium',
              isLoading
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary',
              'transition-colors duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus:outline-none focus:ring-2 focus:ring-offset-2'
            )}
          >
            {isLoading ? 'Stop' : 'Learn'}
          </button>
        </div>
      </form>

      {/* Loading message with progress hint */}
      {isLoading && (
        <div className="mt-3 text-center" role="status" aria-live="polite">
          <p className="text-sm text-muted-foreground animate-pulse">
            Creating your personalized learning path...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Generating explanations and quizzes for each topic
          </p>
        </div>
      )}

      {/* Error message with accessible announcement */}
      {error && (
        <p
          id={`${inputId}-error`}
          className="mt-3 text-sm text-destructive text-center"
          role="alert"
        >
          Failed to generate course. Please try again.
        </p>
      )}

      {/* No API key warning */}
      {!hasApiKey && (
        <p
          className="mt-3 text-sm text-amber-600 dark:text-amber-400 text-center"
          role="alert"
        >
          Enter your API key in the settings page to start
          learning.
        </p>
      )}

      {/* Suggestions */}
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        <span className="text-sm text-muted-foreground">Try:</span>
        {TOPIC_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => handleSuggestionClick(suggestion)}
            disabled={isLoading || !hasApiKey}
            className={cn(
              'px-3 py-1 text-sm rounded-full',
              'bg-muted hover:bg-muted/80 text-muted-foreground',
              'transition-colors duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
            )}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
