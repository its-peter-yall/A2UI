/**
 * ============================================================================
 * FILE: LearningErrorBoundary.tsx
 * LOCATION: client/src/features/learning/LearningErrorBoundary.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    React Error Boundary that catches rendering errors in learning feature
 *    components. Prevents blank screens and provides retry/home navigation.
 *
 * ROLE IN PROJECT:
 *    Safety net wrapping LearningPathContainer and its children. Catches
 *    unexpected runtime errors, logs them, and renders a recoverable fallback
 *    UI so the rest of the application remains functional.
 *
 * KEY COMPONENTS:
 *    - LearningErrorBoundary: Class component implementing React error boundary
 *    - Fallback UI: Error message with retry and home navigation options
 *    - Dev Tools: Error details shown only in development mode
 *
 * DEPENDENCIES:
 *    - External: react, react-router-dom
 *    - Internal: (none)
 *
 * USAGE:
 *    ```tsx
 *    <LearningErrorBoundary onError={(err, info) => console.error(err)}>
 *      <LearningPathContainer sessionId={sessionId} />
 *    </LearningErrorBoundary>
 *
 *    <LearningErrorBoundary fallback={<CustomErrorUI />}>
 *      <Content />
 *    </LearningErrorBoundary>
 *    ```
 * ============================================================================
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface LearningErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface LearningErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class LearningErrorBoundary extends Component<
  LearningErrorBoundaryProps,
  LearningErrorBoundaryState
> {
  constructor(props: LearningErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): LearningErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Learning feature error:', error);
    console.error('Component stack:', errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center">
          <div className="text-5xl mb-4 text-destructive">!</div>
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            An error occurred while loading the learning content. Please try
            again or return to the learning home.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
            >
              Try Again
            </button>
            <Link
              to="/learn"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Back to Learning Home
            </Link>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-6 text-left max-w-lg">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Error details (dev only)
              </summary>
              <pre className="mt-2 p-4 bg-muted rounded text-xs overflow-auto">
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
