/**
 * ============================================================================
 * FILE: vitest.setup.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Global test setup file for Vitest that imports Jest DOM matchers from
 * @testing-library/jest-dom. This enables additional DOM-specific assertion
 * matchers in tests, such as toBeInTheDocument(), toHaveClass(), and
 * toBeDisabled(). This setup runs before any test files execute.
 * 
 * KEY COMPONENTS:
 * - @testing-library/jest-dom: DOM assertion matchers for React Testing Library
 * 
 * DEPENDENCIES:
 * - @testing-library/jest-dom: Provides jest-compatible DOM matchers
 * 
 * USAGE PATTERN:
 * ```tsx
 * // In any test file using React Testing Library
 * import { render, screen } from '@testing-library/react';
 * import { describe, it, expect } from 'vitest';
 * 
 * describe('Component', () => {
 *   it('renders element', () => {
 *     render(<MyComponent />);
 *     // These matchers require jest-dom setup
 *     expect(screen.getByRole('button')).toBeInTheDocument();
 *     expect(screen.getByRole('button')).toBeDisabled();
 *   });
 * });
 * ```
 * 
 * ERROR HANDLING:
 * - Import errors indicate @testing-library/jest-dom is not installed
 * - Ensure vitest.setup.ts path matches vite.config.ts setupFiles config
 * 
 * PERFORMANCE NOTES:
 * - Single import provides all matchers; no per-file imports needed
 * - globals: true in vite.config.ts makes describe/it available everywhere
 * - Setup runs once per test session; minimal performance impact
 * 
 * RELATED FILES:
 * - client/vite.config.ts: References this file in setupFiles
 * - client/src/providers/QueryProvider.tsx: Often needs mock in tests
 * - client/src/lib/learningApi.ts: Mocked in tests to avoid HTTP calls
 * 
 * NOTES:
 * - Must be loaded before test files run (configured in vite.config.ts)
 * - Only provides matchers; actual mocks need separate setup or per-test
 * - Common additional setup: mocking window.matchMedia, localStorage, etc.
 * - For React Query, wrap components in QueryClientProvider in tests
 * ============================================================================
 */

// vitest.setup.ts
// Vitest global test setup and DOM matchers

import '@testing-library/jest-dom';
