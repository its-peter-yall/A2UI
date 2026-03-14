/**
 * ============================================================================
 * FILE: index.test.ts
 * LOCATION: client/src/features/learning/animations/index.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for animation utility functions exported from index.ts.
 *
 * ROLE IN PROJECT:
 *    Validates that timing constants, prefersReducedMotion detection, and
 *    variant selection logic behave correctly across motion and reduced-motion
 *    scenarios.
 *
 * KEY COMPONENTS:
 *    - TIMING constants: fast, normal, slow, celebration values
 *    - prefersReducedMotion: Returns correct value based on media query
 *    - getVariants: Selects full or reduced variants based on preference
 *    - unlockVariants / reducedMotionVariants: Required animation states
 *
 * DEPENDENCIES:
 *    - External: vitest
 *    - Internal: @/features/learning/animations/index
 *
 * USAGE:
 *    ```bash
 *    npm run test -- src/features/learning/animations/index.test.ts
 *    ```
 * ============================================================================
 */

// animations/index.test.ts
// Tests for animation utilities

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  prefersReducedMotion,
  getVariants,
  unlockVariants,
  reducedMotionVariants,
  TIMING,
} from './index';

describe('Animation Utilities', () => {
  describe('TIMING constants', () => {
    it('has expected timing values', () => {
      expect(TIMING.fast).toBe(0.2);
      expect(TIMING.normal).toBe(0.3);
      expect(TIMING.slow).toBe(0.5);
      expect(TIMING.celebration).toBe(0.8);
    });
  });

  describe('prefersReducedMotion', () => {
    // Save original matchMedia
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
      // Restore after tests
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: originalMatchMedia,
      });
    });

    it('returns false when user prefers motion', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(), // Deprecated
          removeListener: vi.fn(), // Deprecated
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
      expect(prefersReducedMotion()).toBe(false);
    });

    it('returns true when user prefers reduced motion', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(), // Deprecated
          removeListener: vi.fn(), // Deprecated
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
      expect(prefersReducedMotion()).toBe(true);
    });
  });

  describe('getVariants', () => {
    // Need to mock matchMedia here too
    const originalMatchMedia = window.matchMedia;
    
    afterEach(() => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: originalMatchMedia,
      });
    });

    it('returns full variants when motion preferred', () => {
       Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(), 
          removeListener: vi.fn(), 
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
      const result = getVariants(unlockVariants, reducedMotionVariants);
      expect(result).toBe(unlockVariants);
    });

    it('returns reduced variants when reduced motion preferred', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
      const result = getVariants(unlockVariants, reducedMotionVariants);
      expect(result).toBe(reducedMotionVariants);
    });
  });
});

describe('Variant Definitions', () => {
  it('unlockVariants has required states', () => {
    expect(unlockVariants).toHaveProperty('locked');
    expect(unlockVariants).toHaveProperty('unlocking');
    expect(unlockVariants).toHaveProperty('unlocked');
  });

  it('reducedMotionVariants has required states', () => {
    expect(reducedMotionVariants).toHaveProperty('hidden');
    expect(reducedMotionVariants).toHaveProperty('visible');
    expect(reducedMotionVariants).toHaveProperty('exit');
  });
});
