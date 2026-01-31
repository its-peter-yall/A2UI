// animations/CardTransitions.tsx
// Animated wrapper components for card state transitions

// Provides animated wrappers that handle enter/exit animations
// based on node status. Uses AnimatePresence for exit animations.

// @see: client/src/features/learning/animations/index.ts - Variants
// @note: Uses layout animations for smooth reordering

import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';
import type { NodeStatus } from '@/types/learning';
import {
  unlockVariants,
  contentSwapVariants,
  masteryCelebrationVariants,
  retryVariants,
  prefersReducedMotion,
  reducedMotionVariants,
  TIMING,
} from './index';

interface AnimatedCardProps {
  status: NodeStatus;
  previousStatus?: NodeStatus;
  children: ReactNode;
  onAnimationComplete?: () => void;
}

/**
 * Wrapper that animates the card container based on status.
 * Handles unlock animations when transitioning from LOCKED.
 */
export function AnimatedCard({
  status,
  previousStatus,
  children,
  onAnimationComplete,
}: AnimatedCardProps) {
  const isUnlocking =
    previousStatus === 'LOCKED' && status === 'VIEWING_EXPLANATION';
  const isCelebrating =
    previousStatus === 'SHOWING_FEEDBACK' && status === 'COMPLETED';

  const variants = prefersReducedMotion()
    ? reducedMotionVariants
    : isUnlocking
    ? unlockVariants
    : isCelebrating
    ? masteryCelebrationVariants
    : undefined;

  const animate = isUnlocking
    ? 'unlocked'
    : isCelebrating
    ? 'celebrating'
    : 'visible';

  const initial = isUnlocking
    ? 'locked'
    : isCelebrating
    ? 'initial'
    : undefined;

  return (
    <motion.div
      layout
      variants={variants}
      initial={initial}
      animate={animate}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </motion.div>
  );
}

interface ContentTransitionProps {
  /** Unique key for AnimatePresence to track enter/exit */
  contentKey: string;
  children: ReactNode;
}

/**
 * Wrapper for content that changes between states.
 * Animates out old content and in new content with overlap.
 */
export function ContentTransition({
  contentKey,
  children,
}: ContentTransitionProps) {
  const variants = prefersReducedMotion()
    ? reducedMotionVariants
    : contentSwapVariants;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={contentKey}
        variants={variants}
        initial="enter"
        animate="visible"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

interface RetryTransitionProps {
  isRetrying: boolean;
  children: ReactNode;
}

/**
 * Subtle animation for retry action.
 * Briefly fades content to indicate reset.
 */
export function RetryTransition({
  isRetrying,
  children,
}: RetryTransitionProps) {
  return (
    <motion.div
      variants={retryVariants}
      animate={isRetrying ? 'resetting' : 'initial'}
    >
      {children}
    </motion.div>
  );
}

interface UnlockPulseProps {
  isUnlocking: boolean;
  children: ReactNode;
}

/**
 * Pulsing glow effect when a node unlocks.
 * Applied to the card border/shadow.
 */
export function UnlockPulse({ isUnlocking, children }: UnlockPulseProps) {
  return (
    <motion.div
      animate={
        isUnlocking
          ? {
              boxShadow: [
                '0 0 0 0 rgba(var(--primary-rgb), 0)',
                '0 0 20px 4px rgba(var(--primary-rgb), 0.4)',
                '0 0 0 0 rgba(var(--primary-rgb), 0)',
              ],
            }
          : {}
      }
      transition={{
        duration: TIMING.slow,
        times: [0, 0.5, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
