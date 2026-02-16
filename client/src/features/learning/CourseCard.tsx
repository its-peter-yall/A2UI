// CourseCard.tsx
// Card component displaying a single learning course with progress and actions

// Renders a course summary card for the dashboard with two visual states:
// - In-progress: Shows progress bar, "Resume Course" button, last active topic
// - Completed: Shows green checkmark, "Revise Course" and "Practice Quizzes" buttons
// Key features include Cyber Yellow progress bar, glassmorphism styling,
// Framer Motion hover animation, and expandable revision history list.

// @see: client/src/types/learning.ts (LearningSessionSummary)
// @see: RevisionHistoryList.tsx (expandable revision history)
// @see: conductor/product-guidelines.md (visual identity)
// @note: onRevise accepts a mode param ('full_review' | 'quiz_only')

import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

import type { LearningSessionSummary } from '@/types/learning';
import { cn } from '@/lib/utils';
import { RevisionHistoryList } from './RevisionHistoryList';

export interface CourseCardProps {
  session: LearningSessionSummary;
  onResume: (sessionId: string) => void;
  onRevise: (sessionId: string, mode: 'full_review' | 'quiz_only') => void;
  onViewRevision?: (revisionId: string) => void;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function CourseCard({ session, onResume, onRevise, onViewRevision }: CourseCardProps) {
  const isCompleted = session.status === 'completed';

  return (
    <motion.article
      className={cn(
        'relative rounded-xl border border-white/10 p-5',
        'bg-card/80 backdrop-blur-sm',
        'flex flex-col gap-3',
        'w-full'
      )}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      data-testid="course-card"
    >
      {/* Header: title + status */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground truncate flex-1">
          {session.course_title}
        </h3>
        {isCompleted && (
          <span
            className="flex items-center gap-1 shrink-0 text-green-400"
            data-testid="completed-badge"
          >
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Completed</span>
          </span>
        )}
      </div>

      {/* Query text */}
      <p className="text-sm text-muted-foreground line-clamp-2">
        {session.query}
      </p>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div
          className="h-2 w-full rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={session.progress_percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Course progress: ${session.progress_percent}%`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out',
              isCompleted ? 'bg-green-400' : 'bg-[#FFD400]'
            )}
            style={{ width: `${session.progress_percent}%` }}
            data-testid="progress-bar-fill"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {session.completed_nodes}/{session.total_nodes} topics completed
          </span>
          <span>{session.progress_percent}%</span>
        </div>
      </div>

      {/* Last active node (in-progress only) */}
      {!isCompleted && session.last_active_node_title && (
        <p className="text-xs text-muted-foreground">
          Last active: <span className="text-foreground">{session.last_active_node_title}</span>
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 mt-1">
        {isCompleted ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onRevise(session.id, 'full_review')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background'
              )}
            >
              Revise Course
            </button>
            <button
              onClick={() => onRevise(session.id, 'quiz_only')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                'border border-primary/50 text-primary',
                'hover:bg-primary/10 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background'
              )}
            >
              Practice Quizzes
            </button>
          </div>
        ) : (
          <button
            onClick={() => onResume(session.id)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background'
            )}
          >
            Resume Course
          </button>
        )}
        <span className="text-xs text-muted-foreground shrink-0">
          {isCompleted
            ? `Completed: ${formatDate(session.completed_at ?? session.updated_at)}`
            : `Started: ${formatDate(session.created_at)}`}
        </span>
      </div>

      {/* Revision history section */}
      {session.revision_count > 0 && onViewRevision && (
        <RevisionHistoryList
          sessionId={session.id}
          onViewRevision={onViewRevision}
        />
      )}
    </motion.article>
  );
}
