/**
 * ============================================================================
 * FILE: MasteryCelebration.tsx
 * LOCATION: client/src/features/learning/animations/MasteryCelebration.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Full-screen celebration overlay combining confetti and animated messaging
 *    when a user achieves topic or course mastery.
 *
 * ROLE IN PROJECT:
 *    Provides positive reinforcement at key learning milestones. Auto-dismisses
 *    after the animation completes so it never blocks the learning flow.
 *    Supports a course-completion variant with different copy and emoji.
 *
 * KEY COMPONENTS:
 *    - MasteryCelebration: Main overlay with confetti + animated messaging
 *    - Auto-dismiss logic: Calls onComplete after duration (3000ms / 500ms reduced)
 *    - Course completion variant: Different emoji/message for full course mastery
 *
 * DEPENDENCIES:
 *    - External: framer-motion, react
 *    - Internal: ./Confetti, @/features/learning/animations/index
 *
 * USAGE:
 *    ```tsx
 *    import { MasteryCelebration } from './animations/MasteryCelebration';
 *
 *    <MasteryCelebration
 *      active={showCelebration}
 *      topicTitle={node.title}
 *      isCourseComplete={isLastNode && isMastered}
 *      onComplete={() => setShowCelebration(false)}
 *    />
 *    ```
 * ============================================================================
 */

// MasteryCelebration.tsx
// Full mastery celebration overlay component

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Confetti } from './Confetti';
import { prefersReducedMotion } from './index';

interface MasteryCelebrationProps {
  /** Whether to show the celebration */
  active: boolean;
  /** Topic title that was mastered */
  topicTitle?: string;
  /** Whether this completes the entire course */
  isCourseComplete?: boolean;
  /** Callback when celebration finishes */
  onComplete?: () => void;
}

export function MasteryCelebration({
  active,
  topicTitle,
  isCourseComplete = false,
  onComplete,
}: MasteryCelebrationProps) {
  const shouldReduceMotion = prefersReducedMotion();
  const celebrationDuration = shouldReduceMotion ? 500 : 1500;

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const completeTimeout = setTimeout(() => {
      onComplete?.();
    }, celebrationDuration);

    return () => {
      clearTimeout(completeTimeout);
    };
  }, [active, celebrationDuration, onComplete]);

  return (
    <>
      <Confetti
        active={active}
        duration={celebrationDuration}
        particleCount={isCourseComplete ? 200 : 100}
        onComplete={undefined}
      />

      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 25,
              duration: shouldReduceMotion ? 0 : undefined,
            }}
            className="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="bg-card border-2 border-green-500 rounded-xl px-8 py-6 text-center shadow-2xl">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 15,
                  delay: shouldReduceMotion ? 0 : 0.1,
                  duration: shouldReduceMotion ? 0 : undefined,
                }}
                className="text-5xl mb-3"
              >
                {isCourseComplete ? '🎓' : '🎉'}
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : 0.2, duration: shouldReduceMotion ? 0 : undefined }}
                className="text-xl font-bold text-green-600 dark:text-green-400 mb-1"
              >
                {isCourseComplete ? 'Course Complete!' : 'Topic Mastered!'}
              </motion.h2>
              {topicTitle && !isCourseComplete && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: shouldReduceMotion ? 0 : 0.3, duration: shouldReduceMotion ? 0 : undefined }}
                  className="text-sm text-muted-foreground max-w-50"
                >
                  {topicTitle}
                </motion.p>
              )}
              {isCourseComplete && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: shouldReduceMotion ? 0 : 0.3, duration: shouldReduceMotion ? 0 : undefined }}
                  className="text-sm text-muted-foreground"
                >
                  You've mastered all topics!
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
