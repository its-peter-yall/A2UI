/**
 * ============================================================================
 * FILE: QuizAnimations.tsx
 * LOCATION: client/src/features/learning/animations/QuizAnimations.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Animated React components for quiz interactions and feedback display,
 *    including option highlighting, score reveals, and result iconography.
 *
 * ROLE IN PROJECT:
 *    Isolates all quiz-specific animation logic so ConceptCard stays
 *    declarative. Provides staggered option reveals, a spring-physics score
 *    counter, and SVG path-draw checkmark/cross icons.
 *
 * KEY COMPONENTS:
 *    - AnimatedOption: Quiz option button with correct/incorrect state animations
 *    - SubmitButtonAnimation: Pulsing submit button during quiz submission
 *    - ScoreReveal: Animated percentage score with mastery indication (green/amber)
 *    - CheckmarkAnimation: SVG checkmark with path-drawing reveal for correct answers
 *    - CrossAnimation: SVG X mark with spring-bounce reveal for incorrect answers
 *
 * DEPENDENCIES:
 *    - External: framer-motion, react
 *    - Internal: @/lib/utils, @/features/learning/animations/index
 *
 * USAGE:
 *    ```tsx
 *    import { AnimatedOption, ScoreReveal } from './animations/QuizAnimations';
 *
 *    {options.map((opt, i) => (
 *      <AnimatedOption key={opt.id} isCorrect={opt.is_correct} isSelected={selected} index={i}>
 *        {opt.text}
 *      </AnimatedOption>
 *    ))}
 *    <ScoreReveal score={result.score_percent} isMastered={result.is_mastered} />
 *    ```
 * ============================================================================
 */

// QuizAnimations.tsx
// Animated components for quiz interaction and feedback

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  optionResultVariants,
  TIMING,
  prefersReducedMotion,
} from './index';

interface AnimatedOptionProps {
  isCorrect: boolean;
  isSelected: boolean;
  index: number;
  children: ReactNode;
  className?: string;
}

/**
 * Animated quiz option that reveals correct/incorrect state.
 * Staggered animation based on index for sequential reveal.
 */
export function AnimatedOption({
  isCorrect,
  isSelected,
  index,
  children,
  className,
}: AnimatedOptionProps) {
  const state = isSelected
    ? isCorrect
      ? 'correct'
      : 'incorrect'
    : isCorrect
    ? 'correct'
    : 'notSelected';

  return (
    <motion.div
      variants={optionResultVariants}
      initial="initial"
      animate={state}
      transition={{
        delay: prefersReducedMotion() ? 0 : index * 0.1,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface SubmitButtonAnimationProps {
  isSubmitting: boolean;
  children: ReactNode;
}

/**
 * Animated submit button with loading state.
 */
export function SubmitButtonAnimation({
  isSubmitting,
  children,
}: SubmitButtonAnimationProps) {
  return (
    <motion.div
      animate={
        isSubmitting
          ? {
              scale: [1, 0.98, 1],
            }
          : {}
      }
      transition={{
        duration: TIMING.fast,
        repeat: isSubmitting ? Infinity : 0,
      }}
    >
      {children}
    </motion.div>
  );
}

interface ScoreRevealProps {
  score: number;
  isMastered: boolean;
}

/**
 * Animated score reveal with emphasis on mastery.
 */
export function ScoreReveal({ score, isMastered }: ScoreRevealProps) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 20,
      }}
      className={cn(
        'text-4xl font-bold',
        isMastered ? 'text-green-500' : 'text-amber-500'
      )}
    >
      <motion.span
        animate={
          isMastered
            ? {
                scale: [1, 1.2, 1],
              }
            : {}
        }
        transition={{
          duration: TIMING.slow,
          delay: TIMING.normal,
        }}
      >
        {score}%
      </motion.span>
    </motion.div>
  );
}

interface CheckmarkAnimationProps {
  show: boolean;
}

/**
 * Animated checkmark for correct answers.
 */
export function CheckmarkAnimation({ show }: CheckmarkAnimationProps) {
  if (!show) return null;

  return (
    <motion.svg
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{
        pathLength: { duration: TIMING.normal, ease: 'easeOut' },
        opacity: { duration: TIMING.fast },
      }}
      viewBox="0 0 24 24"
      className="w-5 h-5 text-green-500"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <motion.path d="M5 12l5 5L20 7" />
    </motion.svg>
  );
}

interface CrossAnimationProps {
  show: boolean;
}

/**
 * Animated cross for incorrect answers.
 */
export function CrossAnimation({ show }: CrossAnimationProps) {
  if (!show) return null;

  return (
    <motion.svg
      initial={{ scale: 0, opacity: 0, rotate: -90 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 15,
      }}
      viewBox="0 0 24 24"
      className="w-5 h-5 text-red-500"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M6 18L18 6" />
    </motion.svg>
  );
}
