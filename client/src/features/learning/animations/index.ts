/**
 * ============================================================================
 * FILE: index.ts
 * LOCATION: client/src/features/learning/animations/index.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Central export hub and animation utility library for the learning feature.
 *    Provides Framer Motion variants, timing constants, and transition presets.
 *
 * ROLE IN PROJECT:
 *    Single source of truth for all learning animation definitions. Other
 *    animation files (CardTransitions, QuizAnimations, etc.) import from here
 *    to ensure consistent timing and motion across the feature.
 *
 * KEY COMPONENTS:
 *    - TIMING: Duration constants (fast: 0.2s, normal: 0.3s, slow: 0.5s, celebration: 0.8s)
 *    - unlockVariants: Card unlock animation (LOCKED → VIEWING_EXPLANATION)
 *    - contentSwapVariants: Fade + slide for explanation ↔ quiz transitions
 *    - optionResultVariants: Quiz option correct/incorrect highlighting
 *    - carouselSlideVariants: Direction-aware slide transitions
 *    - prefersReducedMotion(): Accessibility helper for motion preferences
 *    - getVariants(): Returns full or reduced-motion variants based on preference
 *
 * DEPENDENCIES:
 *    - External: framer-motion (Variants, Transition types)
 *    - Internal: none
 *
 * USAGE:
 *    ```tsx
 *    import { unlockVariants, TIMING, prefersReducedMotion } from './animations';
 *
 *    <motion.div
 *      variants={unlockVariants}
 *      initial="locked"
 *      animate="unlocked"
 *      transition={{ duration: TIMING.normal }}
 *    />
 *    ```
 * ============================================================================
 */

// index.ts
// Framer Motion variants and utilities for learning animations

import type { Variants, Transition } from 'framer-motion';

// ============================================================
// Timing constants
// ============================================================
export const TIMING = {
  fast: 0.2,
  normal: 0.3,
  slow: 0.5,
  celebration: 0.8,
} as const;

// ============================================================
// Transition presets
// ============================================================
export const springTransition: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
};

export const easeOutTransition: Transition = {
  type: 'tween',
  ease: 'easeOut',
  duration: TIMING.normal,
};

export const slowEaseTransition: Transition = {
  type: 'tween',
  ease: [0.25, 0.1, 0.25, 1],
  duration: TIMING.slow,
};

// ============================================================
// Card unlock animation (LOCKED → VIEWING_EXPLANATION)
// ============================================================
export const unlockVariants: Variants = {
  locked: {
    scale: 0.98,
    opacity: 0.5,
    filter: 'blur(4px)',
  },
  unlocking: {
    scale: 1.02,
    opacity: 0.8,
    filter: 'blur(2px)',
    transition: {
      duration: TIMING.fast,
    },
  },
  unlocked: {
    scale: 1,
    opacity: 1,
    filter: 'blur(0px)',
    transition: springTransition,
  },
};

// ============================================================
// Content swap animation (explanation ↔ quiz)
// ============================================================
export const contentSwapVariants: Variants = {
  enter: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: easeOutTransition,
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: TIMING.fast,
    },
  },
};

// ============================================================
// Quiz option highlighting (for feedback state)
// ============================================================
export const optionResultVariants: Variants = {
  initial: {
    scale: 1,
    backgroundColor: 'hsl(var(--card))',
  },
  correct: {
    scale: 1.02,
    backgroundColor: 'hsl(142 71% 45% / 0.2)',
    transition: {
      duration: TIMING.normal,
      delay: 0.1,
    },
  },
  incorrect: {
    scale: 0.98,
    backgroundColor: 'hsl(var(--destructive) / 0.2)',
    transition: {
      duration: TIMING.normal,
      delay: 0.1,
    },
  },
  notSelected: {
    scale: 1,
    opacity: 0.6,
    transition: {
      duration: TIMING.fast,
    },
  },
};

// ============================================================
// Mastery celebration (SHOWING_FEEDBACK → COMPLETED)
// ============================================================
export const masteryCelebrationVariants: Variants = {
  initial: {
    scale: 1,
  },
  celebrating: {
    scale: [1, 1.05, 1],
    transition: {
      duration: TIMING.celebration,
      times: [0, 0.3, 1],
    },
  },
};

// ============================================================
// Progress bar step animation
// ============================================================
export const progressStepVariants: Variants = {
  incomplete: {
    scale: 1,
    backgroundColor: 'hsl(var(--muted))',
  },
  complete: {
    scale: [1, 1.3, 1],
    backgroundColor: 'hsl(142 71% 45%)',
    transition: {
      scale: {
        duration: TIMING.slow,
        times: [0, 0.4, 1],
      },
      backgroundColor: {
        duration: TIMING.fast,
      },
    },
  },
};

// ============================================================
// Retry animation (subtle reset)
// ============================================================
export const retryVariants: Variants = {
  initial: {
    opacity: 1,
  },
  resetting: {
    opacity: [1, 0.5, 1],
    transition: {
      duration: TIMING.normal,
    },
  },
};

// ============================================================
// Reduced motion check
// ============================================================
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get variants with reduced motion fallback.
 * Returns simplified variants if user prefers reduced motion.
 */
export function getVariants<T extends Variants>(
  fullVariants: T,
  reducedVariants: T
): T {
  return prefersReducedMotion() ? reducedVariants : fullVariants;
}

// Reduced motion variants (instant transitions)
export const reducedMotionVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

// ============================================================
// Carousel slide animations (direction-aware)
// ============================================================

/**
 * Carousel slide variants for direction-aware sliding transitions.
 * Uses the `custom` prop to determine slide direction:
 * - direction > 0: next slide (enter from right, exit to left)
 * - direction < 0: previous slide (enter from left, exit to right)
 * - direction = 0: initial mount (no animation)
 */
export const carouselSlideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : direction < 0 ? '-100%' : 0,
    opacity: direction === 0 ? 1 : 0,
    scale: direction === 0 ? 1 : 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0,
    scale: 0.95,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  }),
};

/**
 * Reduced motion variant for carousel slides.
 * Simple fade without horizontal movement.
 */
export const carouselSlideReducedMotionVariants: Variants = {
  enter: { opacity: 0 },
  center: {
    opacity: 1,
    transition: { duration: TIMING.fast },
  },
  exit: {
    opacity: 0,
    transition: { duration: TIMING.fast },
  },
};

// ============================================================
// Component Exports
// ============================================================
export { Confetti } from './Confetti';
export { MasteryCelebration } from './MasteryCelebration';
export { AnimatedCard, ContentTransition, RetryTransition, UnlockPulse } from './CardTransitions';
export { AnimatedOption, ScoreReveal, CheckmarkAnimation, CrossAnimation } from './QuizAnimations';
