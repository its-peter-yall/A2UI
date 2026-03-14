/**
 * ============================================================================
 * FILE: CardTransitions.tsx
 * LOCATION: client/src/features/learning/animations/CardTransitions.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Animated wrapper components that handle status-based transitions for
 *    learning concept cards using Framer Motion.
 *
 * ROLE IN PROJECT:
 *    Encapsulates all card-level animation logic so ConceptCard and
 *    LearningPathContainer stay declarative. Selects the correct variant
 *    set based on NodeStatus and accessibility preferences.
 *
 * KEY COMPONENTS:
 *    - AnimatedCard: Main wrapper that animates based on status transitions
 *    - ContentTransition: Wrapper for animating content changes (explanation ↔ quiz)
 *    - RetryTransition: Subtle fade animation for quiz retry action
 *    - UnlockPulse: Pulsing glow effect on card border when unlocking
 *
 * DEPENDENCIES:
 *    - External: framer-motion, react
 *    - Internal: @/types/learning, @/features/learning/animations/index
 *
 * USAGE:
 *    ```tsx
 *    import { AnimatedCard, ContentTransition } from './animations/CardTransitions';
 *
 *    <AnimatedCard status={node.status} previousStatus={prev}>
 *      <CardContent />
 *    </AnimatedCard>
 *
 *    <ContentTransition contentKey={showQuiz ? 'quiz' : 'explanation'}>
 *      {showQuiz ? <QuizContent /> : <ExplanationContent />}
 *    </ContentTransition>
 *    ```
 * ============================================================================
 */

// CardTransitions.tsx
// Animated wrapper components for card state transitions

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

  const shouldReduceMotion = prefersReducedMotion();
  const variants = shouldReduceMotion
    ? reducedMotionVariants
    : isUnlocking
    ? unlockVariants
    : isCelebrating
    ? masteryCelebrationVariants
    : undefined;

  const animate = shouldReduceMotion
    ? 'visible'
    : isUnlocking
    ? 'unlocked'
    : isCelebrating
    ? 'celebrating'
    : 'visible';

  const initial = shouldReduceMotion
    ? false
    : isUnlocking
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
  const shouldReduceMotion = prefersReducedMotion();
  const variants = shouldReduceMotion ? reducedMotionVariants : contentSwapVariants;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={contentKey}
        variants={variants}
        initial={shouldReduceMotion ? false : 'enter'}
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
                '0 0 0 0 hsl(var(--primary) / 0)',
                '0 0 20px 4px hsl(var(--primary) / 0.4)',
                '0 0 0 0 hsl(var(--primary) / 0)',
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
