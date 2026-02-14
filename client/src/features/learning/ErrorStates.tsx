/**
 * ============================================================================
 * FILE: ErrorStates.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Collection of reusable UI components for displaying various state conditions
 * in the learning feature: error states, not found states, loading states,
 * generating states, and empty states. Provides consistent styling and
 * recovery actions across the application.
 * 
 * KEY COMPONENTS:
 * - ErrorState: Generic error with retry button and optional home link
 * - NotFoundState: Resource not found (session/node/course) with navigation
 * - EmptyState: No content available with optional action button
 * - LoadingState: Generic loading spinner with message
 * - GeneratingState: Course generation progress with animated indicator
 * 
 * DEPENDENCIES:
 * - react-router-dom: Link for navigation back to learning home
 * - @/lib/utils: cn() utility for conditional className composition
 * 
 * USAGE PATTERN:
 * ```tsx
 * // Error with retry
 * <ErrorState
 *   title="Failed to load session"
 *   message="Please try again."
 *   onRetry={() => refetch()}
 * />
 * 
 * // Not found (session, node, or course)
 * <NotFoundState type="session" />
 * 
 * // Empty with action
 * <EmptyState
 *   title="No topics yet"
 *   action={{ label: 'Generate', onClick: () => generate() }}
 * />
 * 
 * // Loading
 * <LoadingState message="Loading your session..." />
 * 
 * // Generating
 * <GeneratingState topicCount={5} />
 * ```
 * 
 * ERROR HANDLING:
 * - Pure presentation components; no error handling needed
 * - All components are accessible (role="alert", aria-live, aria-busy)
 * 
 * PERFORMANCE NOTES:
 * - Lightweight components with minimal re-renders
 * - GeneratingState uses CSS animations (animate-pulse, animate-bounce)
 * - All components support className override for custom styling
 * 
 * RELATED FILES:
 * - LearningPathContainer.tsx: Main consumer of error states
 * - LearningErrorBoundary.tsx: Error boundary that may show ErrorState
 * 
 * NOTES:
 * - ErrorState: Default showHomeLink=true, can be disabled
 * - NotFoundState: Three types with tailored messages
 * - EmptyState: action is optional (button only shown if provided)
 * - LoadingState: Uses ellipsis animation (not spinner)
 * - GeneratingState: Animated bouncing asterisk with progress dots
 * ============================================================================
 */

import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  showHomeLink?: boolean;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'An error occurred. Please try again.',
  onRetry,
  showHomeLink = true,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="text-5xl mb-4 text-destructive">!</div>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-muted-foreground mb-6 max-w-md">{message}</p>
      <div className="flex gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        )}
        {showHomeLink && (
          <Link
            to="/learn"
            className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
          >
            Back to Learning Home
          </Link>
        )}
      </div>
    </div>
  );
}

interface NotFoundStateProps {
  type?: 'session' | 'node' | 'course';
  className?: string;
}

export function NotFoundState({
  type = 'session',
  className,
}: NotFoundStateProps) {
  const messages: Record<
    NonNullable<NotFoundStateProps['type']>,
    { title: string; message: string }
  > = {
    session: {
      title: 'Session not found',
      message: "This learning session doesn't exist or has been deleted.",
    },
    node: {
      title: 'Topic not found',
      message: "This topic doesn't exist in the learning path.",
    },
    course: {
      title: 'Course not found',
      message: "This course doesn't exist or has been removed.",
    },
  };

  const { title, message } = messages[type];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center',
        className
      )}
    >
      <div className="text-5xl mb-4">?</div>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-muted-foreground mb-6 max-w-md">{message}</p>
      <Link
        to="/learn"
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        Start New Learning Session
      </Link>
    </div>
  );
}

interface EmptyStateProps {
  title?: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  title = 'Nothing here yet',
  message = 'Start learning something new!',
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center',
        className
      )}
    >
      <div className="text-5xl mb-4">+</div>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-muted-foreground mb-6 max-w-md">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = 'Loading...',
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="animate-spin text-4xl mb-4">...</div>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

interface GeneratingStateProps {
  topicCount?: number;
  className?: string;
}

export function GeneratingState({
  topicCount = 5,
  className,
}: GeneratingStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-5xl mb-4 animate-bounce">*</div>
      <h2 className="text-xl font-semibold mb-2">
        Creating your learning path
      </h2>
      <p className="text-muted-foreground mb-4 max-w-md">
        Generating {topicCount} topics with explanations and quizzes...
      </p>
      <div className="flex gap-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`pulse-${index}`}
            className="w-2 h-2 bg-primary rounded-full animate-pulse"
            style={{ animationDelay: `${index * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}
