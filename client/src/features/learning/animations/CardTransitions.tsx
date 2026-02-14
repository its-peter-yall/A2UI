/**
 * ============================================================================
 * FILE: CardTransitions.tsx
 
 * PURPOSE:
 * Provides animated wrapper components that handle state * ============================================================================
 *-based transitions
 * for learning concept cards. These wrappers automatically select appropriate
 * Framer Motion animations based on the card's current status (locked, viewing,
 * in-quiz, showing-feedback, completed). Uses AnimatePresence for exit
 * animations and layout animations for smooth reordering when cards reorder.
 * 
 * KEY COMPONENTS:
 * - AnimatedCard: Main wrapper that animates based on status transitions
 * - ContentTransition: Wrapper for animating content changes (explanation ↔ quiz)
 * - RetryTransition: Subtle fade animation for quiz retry action
 * - UnlockPulse: Pulsing glow effect on card border when unlocking
 * 
 * DEPENDENCIES:
 * - framer-motion: motion, AnimatePresence, layout animations
 * - react: ReactNode type for children
 * - @/types/learning: NodeStatus enum
 * - @/features/learning/animations/index: All variant definitions and helpers
 * 
 * USAGE PATTERN:
 * ```tsx
 * import { AnimatedCard, ContentTransition, UnlockPulse } from './animations/CardTransitions';
 * 
 * // Card wrapper with status-based animation:
 * <AnimatedCard
 *   status={node.status}
 *   previousStatus={previousStatus}
 *   onAnimationComplete={() => setPreviousStatus(node.status)}
 * >
 *   <CardContent />
 * </AnimatedCard>
 * 
 * // Content swap with exit/enter:
 * <ContentTransition contentKey={showQuiz ? 'quiz' : 'explanation'}>
 *   {showQuiz ? <QuizContent /> : <ExplanationContent />}
 * </ContentTransition>
 * ```
 * 
 * ERROR HANDLING:
 * - Variants default to undefined for continuous display (no animation)
 * - Reduced motion uses instant opacity transitions instead of scale/blur
 * - onAnimationComplete callback is optional
 * 
 * PERFORMANCE NOTES:
 * - Uses layout prop for smooth reordering when cards move
 * - Unlock animation: scale 0.98→1.02→1, opacity 0.5→1, blur 4px→0
 * - Content swap: vertical slide 20px with fade
 * - Unlock pulse: box-shadow animation with primary color glow
 * 
 * RELATED FILES:
 * - index.ts: Variant definitions (unlockVariants, contentSwapVariants, etc.)
 * - ConceptCard.tsx: Uses AnimatedCard and ContentTransition wrappers
 * - LearningPathContainer.tsx: Uses AnimatedCard for node cards
 * 
 * NOTES:
 * - Accessibility: Reduced motion disables blur/scale, uses instant opacity
 * - AnimatedCard detects unlock (LOCKED→VIEWING_EXPLANATION) and celebration
 * - ContentTransition uses AnimatePresence mode="wait" for clean exit
 * - UnlockPulse adds glow effect to card border, not the card content
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
