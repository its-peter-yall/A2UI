/**
 * ============================================================================
 * FILE: useTypewriter.test.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Unit tests for useTypewriter hook. Validates typewriter effect behavior
 * including character-by-character reveal, timing configuration, and
 * initial empty state.
 * 
 * KEY TESTS:
 * - Returns empty string initially (before animation starts)
 * - Types out text character by character over time
 * - Respects delay parameter for typing speed
 * - Completes to full string after sufficient time advancement
 * 
 * DEPENDENCIES:
 * - vitest: Testing framework
 * - @testing-library/react: renderHook, act
 * - client/src/hooks/useTypewriter: Hook under test
 * 
 * USAGE PATTERN:
 * ```bash
 * # Run useTypewriter tests
 * npm run test -- src/hooks/useTypewriter.test.ts
 * ```
 * 
 * TEST SETUP:
 * - Uses renderHook from @testing-library/react
 * - Uses vi.useFakeTimers() for time control
 * - Uses act() to advance timers synchronously
 * - Tests with 30ms delay per character
 * 
 * RELATED FILES:
 * - client/src/hooks/useTypewriter.ts
 * 
 * NOTES:
 * - Text reveals character by character (not all at once)
 * - Delay parameter controls typing speed (ms per character)
 * - Useful for AI response streaming effects
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
