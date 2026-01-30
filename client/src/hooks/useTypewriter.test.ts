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
