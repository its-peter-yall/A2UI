/**
 * ============================================================================
 * FILE: RevisionHistoryList.tsx
 * LOCATION: client/src/features/learning/RevisionHistoryList.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Expandable list of past revision sessions for a learning course.
 *
 * ROLE IN PROJECT:
 *    Embedded inside CourseCard to surface revision history without cluttering
 *    the main dashboard. Data is lazy-loaded only when the user expands the
 *    panel, keeping initial page load fast.
 *
 * KEY COMPONENTS:
 *    - RevisionHistoryList: Collapsible container with toggle button
 *    - RevisionRow: Single row showing number, date, mode badge, and score
 *    - formatShortDate: Formats ISO timestamps to "Mon DD" display
 *
 * DEPENDENCIES:
 *    - External: react, @tanstack/react-query, framer-motion, lucide-react
 *    - Internal: @/lib/learningApi (getRevisionsList), @/types/learning, @/lib/utils
 *
 * USAGE:
 *    <RevisionHistoryList
 *      sessionId={session.id}
 *      onViewRevision={(revisionId) => navigate(`/learn/${sessionId}/revise/${revisionId}`)}
 *    />
 * ============================================================================
 */
// RevisionHistoryList.tsx
// Expandable list of past revision sessions for a learning course

// Displays revision history as a collapsible section with lazy-loading.
// Each row shows revision number, date, mode badge, quiz score, and
// improvement relative to previous attempt. Clicking a row triggers
// onViewRevision callback.

// @see: CourseCard.tsx (parent integration)
// @see: client/src/lib/learningApi.ts (getRevisionsList)
// @note: Data is lazy-loaded only when the list is expanded

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, History } from 'lucide-react';
import { getRevisionsList } from '@/lib/learningApi';
import type { RevisionSessionResponse } from '@/types/learning';
import { cn } from '@/lib/utils';

export interface RevisionHistoryListProps {
  sessionId: string;
  onViewRevision: (revisionId: string) => void;
}

/**
 * Format an ISO date string to a short display format (e.g., "Feb 14").
 */
function formatShortDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get the mode label for display.
 */
function getModeLabel(mode: RevisionSessionResponse['mode']): string {
  return mode === 'full_review' ? 'Full Review' : 'Quiz Only';
}

export function RevisionHistoryList({
  sessionId,
  onViewRevision,
}: RevisionHistoryListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['revisions', sessionId],
    queryFn: () => getRevisionsList(sessionId),
    enabled: !!sessionId && isExpanded,
    staleTime: 30_000,
  });

  const revisions = data?.revisions ?? [];

  // Sort by date descending (most recent first)
  const sortedRevisions = [...revisions].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div
      className="border-t border-border/80 pt-2 mt-1"
      data-testid="revision-history-section"
    >
      {/* Toggle button */}
      <button
        onClick={toggleExpanded}
        className={cn(
          'flex items-center gap-1.5 w-full text-left',
          'text-xs text-primary font-medium',
          'hover:text-primary/80 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm'
        )}
        aria-expanded={isExpanded}
        aria-controls={`revision-history-${sessionId}`}
        data-testid="revision-history-toggle"
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Revision History</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 ml-auto transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={`revision-history-${sessionId}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
            data-testid="revision-history-content"
          >
            <div className="pt-2 space-y-1">
              {isLoading && (
                <p
                  className="text-xs text-muted-foreground py-2 text-center"
                  data-testid="revision-history-loading"
                >
                  Loading revisions...
                </p>
              )}

              {isError && (
                <p
                  className="text-xs text-red-400 py-2 text-center"
                  data-testid="revision-history-error"
                >
                  Failed to load revision history.
                </p>
              )}

              {!isLoading && !isError && sortedRevisions.length === 0 && (
                <p
                  className="text-xs text-muted-foreground py-2 text-center"
                  data-testid="revision-history-empty"
                >
                  No revisions yet
                </p>
              )}

              {!isLoading && !isError && sortedRevisions.map((revision) => (
                <RevisionRow
                  key={revision.id}
                  revision={revision}
                  onClick={() => onViewRevision(revision.id)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A single row in the revision history list.
 */
function RevisionRow({
  revision,
  onClick,
}: {
  revision: RevisionSessionResponse;
  onClick: () => void;
}) {
  const score = revision.total_quiz_score_percent;
  const isPassed = score !== null && score >= 80;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5',
        'text-xs text-left',
        'hover:bg-muted/50 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-md'
      )}
      data-testid="revision-row"
      data-revision-id={revision.id}
    >
      {/* Revision number */}
      <span className="font-medium text-foreground shrink-0" data-testid="revision-number">
        #{revision.revision_number}
      </span>

      {/* Date */}
      <span className="text-muted-foreground shrink-0" data-testid="revision-date">
        {formatShortDate(revision.started_at)}
      </span>

      {/* Mode badge */}
      <span
        className={cn(
          'inline-block rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0',
          revision.mode === 'full_review'
            ? 'bg-primary/20 text-primary'
            : 'bg-blue-500/20 text-blue-400'
        )}
        data-testid="revision-mode-badge"
      >
        {getModeLabel(revision.mode)}
      </span>

      {/* Spacer */}
      <span className="flex-1" />

      {/* Score */}
      {score !== null && (
        <span
          className={cn(
            'font-medium shrink-0',
            isPassed ? 'text-green-400' : 'text-red-400'
          )}
          data-testid="revision-score"
        >
          {Math.round(score)}%
        </span>
      )}

      {/* Status indicator for in-progress */}
      {revision.status === 'in_progress' && (
        <span
          className="text-[10px] text-muted-foreground italic shrink-0"
          data-testid="revision-in-progress"
        >
          In Progress
        </span>
      )}
    </button>
  );
}
