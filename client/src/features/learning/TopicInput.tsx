/**
 * ============================================================================
 * FILE: TopicInput.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Form component that allows users to enter a topic they want to learn.
 * Triggers course generation on submit, shows loading progress during the
 * scatter-gather process, and navigates to the generated learning path.
 * 
 * KEY COMPONENTS:
 * - TopicInput: Main form with text input and submit button
 * - Suggestion Chips: Clickable topic suggestions for quick starts
 * - Loading State: Shows progress message while generating course
 * - Error Display: Shows error message if generation fails
 * 
 * DEPENDENCIES:
 * - react-router-dom: useNavigate for navigation after generation
 * - @tanstack/react-query: useMutation for course generation
 * - @/lib/utils: cn() utility for conditional className
 * - @/lib/learningApi: generateCourse API function
 * 
 * USAGE PATTERN:
 * ```tsx
 * // Basic usage on LearningHome page
 * <TopicInput />
 * 
 * // With custom placeholder and user ID
 * <TopicInput
 *   placeholder="What do you want to master?"
 *   userId="user-123"
 *   className="mb-8"
 * />
 * ```
 * 
 * ERROR HANDLING:
 * - Generation failure: Shows error message with aria-live="polite"
 * - Button disabled during loading to prevent double submission
 * - Empty input prevented from submission
 * 
 * PERFORMANCE NOTES:
 * - Navigation happens in onSuccess callback (TanStack Query best practice)
 * - Button disabled with isPending prevents duplicate mutations
 * - Loading message with progress hint during generation (which takes time)
 * 
 * RELATED FILES:
 * - LearningHome.tsx: Parent component that renders TopicInput
 * - @/lib/learningApi.ts: generateCourse API function
 * - LearningPathContainer.tsx: Renders the generated learning path
 * 
 * NOTES:
 * - Default suggestions: "Newton's Laws", "Photosynthesis", "Machine Learning Basics"
 * - Navigation: /learn/:sessionId after successful generation
 * - Best practice: Button disabled during isPending to prevent double-submission
 * ============================================================================
 */

import { useState, useId } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { generateCourse } from '@/lib/learningApi';

interface TopicInputProps {
  className?: string;
  placeholder?: string;
  userId?: string;
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
}: TopicInputProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputId = useId();

  const generateMutation = useMutation({
    mutationFn: generateCourse,
    onSuccess: (session) => {
      // Navigate on success - best practice from TanStack Query
      navigate(`/learn/${session.id}`);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim() && !generateMutation.isPending) {
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
          placeholder={placeholder}
          disabled={isLoading}
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
          type="submit"
          disabled={!query.trim() || isLoading}
          aria-label={isLoading ? 'Generating course' : 'Start learning'}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2',
            'px-4 py-1.5 rounded-md text-sm font-medium',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
          )}
        >
          {isLoading ? 'Generating...' : 'Learn'}
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

      {/* Suggestions */}
      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        <span className="text-sm text-muted-foreground">Try:</span>
        {TOPIC_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => handleSuggestionClick(suggestion)}
            disabled={isLoading}
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
