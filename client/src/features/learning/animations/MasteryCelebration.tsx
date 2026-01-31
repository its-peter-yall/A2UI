// client/src/features/learning/animations/MasteryCelebration.tsx
// Full mastery celebration overlay

// Combines confetti burst with success messaging.
// Shows when user achieves 100% on a quiz.
// Auto-dismisses after animation completes.

// @see: client/src/features/learning/LearningPathContainer.tsx
// @note: Doesn't block interaction; purely decorative

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Confetti } from './Confetti';
// MasteryCelebration itself uses framer-motion which respects prefersReducedMotion
// if configured or by manual check.

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
  const [showMessage, setShowMessage] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (active) {
      // Stagger the reveals
      setShowConfetti(true);
      const messageTimeout = setTimeout(() => setShowMessage(true), 200);
      const completeTimeout = setTimeout(() => {
        setShowMessage(false);
        onComplete?.();
      }, 2500);

      return () => {
        clearTimeout(messageTimeout);
        clearTimeout(completeTimeout);
      };
    } else {
      setShowMessage(false);
      setShowConfetti(false);
    }
  }, [active, onComplete]);

  return (
    <>
      <Confetti
        active={showConfetti}
        duration={3000}
        particleCount={isCourseComplete ? 200 : 100}
        onComplete={() => setShowConfetti(false)}
      />

      <AnimatePresence>
        {showMessage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 25,
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
                  delay: 0.1,
                }}
                className="text-5xl mb-3"
              >
                {isCourseComplete ? '🎓' : '🎉'}
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xl font-bold text-green-600 dark:text-green-400 mb-1"
              >
                {isCourseComplete ? 'Course Complete!' : 'Topic Mastered!'}
              </motion.h2>
              {topicTitle && !isCourseComplete && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm text-muted-foreground max-w-[200px]"
                >
                  {topicTitle}
                </motion.p>
              )}
              {isCourseComplete && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
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
