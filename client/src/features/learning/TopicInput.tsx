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
 *    - Suggestion Chips: Clickable topic suggestions for quick starts
 *    - Loading State: Progress message while generating course
 *    - Error Display: Error message if generation fails
 *
 * DEPENDENCIES:
 *    - External: react-router-dom, @tanstack/react-query
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

import { useState, useId, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { generateCourse } from '@/lib/learningApi';
import { getProviderSettings } from '@/lib/providerSettings';
import type { GenerateCourseRequest } from '@/types/learning';

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

export function TopicInput({
  className,
  placeholder = 'What do you want to learn today?',
  userId,
  autoFocus = false,
}: TopicInputProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const inputId = useId();

  const abortRef = useRef<AbortController | null>(null);

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
      });
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
  };

  const isLoading = generateMutation.isPending;
  const error = generateMutation.error;

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
            'w-full px-4 py-3 pr-24 text-lg rounded-lg border',
            'bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-200',
            error && 'border-destructive focus:ring-destructive'
          )}
        />
        <button
          type={isLoading ? 'button' : 'submit'}
          onClick={isLoading ? handleStop : undefined}
          disabled={(!query.trim() && !isLoading) || !hasApiKey}
          aria-label={isLoading ? 'Stop generating' : 'Start learning'}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2',
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
