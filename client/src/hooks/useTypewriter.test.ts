/**
 * ============================================================================
 * FILE: useTypewriter.test.ts
 * LOCATION: client/src/hooks/useTypewriter.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for useTypewriter hook. Validates typewriter effect behavior
 *    including character-by-character reveal, timing configuration, and
 *    initial empty state.
 *
 * ROLE IN PROJECT:
 *    Ensures the typewriter animation hook behaves correctly under fake timers,
 *    guarding against regressions in the character reveal timing logic used
 *    for AI response display effects.
 *
 * KEY COMPONENTS:
 *    - Initial state test: Returns empty string before animation starts
 *    - Timing test: Characters revealed progressively over time
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react
 *    - Internal: ./useTypewriter
 *
 * USAGE:
 *    ```bash
 *    npm run test -- src/hooks/useTypewriter.test.ts
 *    ```
 * ============================================================================
 */

// useTypewriter.test.ts
// Tests for the useTypewriter hook

// Verifies typewriter effect behavior: character-by-character reveal,
// timing configuration, and initial empty state.

// @see: client/src/hooks/useTypewriter.ts

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTypewriter } from './useTypewriter';
import { vi } from 'vitest';

describe('useTypewriter', () => {
    it('should return empty string initially', () => {
        const { result } = renderHook(() => useTypewriter('Hello', true));
        expect(result.current).toBe('');
    });

    it('should type out text over time', async () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useTypewriter('Hi', true, 30));

        // Advance time enough for 'H'
        act(() => {
            vi.advanceTimersByTime(50);
        });
        expect(result.current).toContain('H');

        // Advance time for rest
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current).toBe('Hi');

        vi.useRealTimers();
    });
});
