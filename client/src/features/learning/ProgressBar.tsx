// ProgressBar.tsx
// Progress indicator for learning path completion

// Shows visual progress through the sequential learning flow.
// Each step represents a node: locked, active, or completed (mastered).
// Clicking completed steps scrolls to them; locked steps are disabled.

// @see: client/src/types/learning.ts - NodeStatus enum
// @note: Respects sequential flow - cannot jump to locked nodes

// Best practices applied:
// - Accessibility with aria-current, aria-label, role="navigation"
// - aria-disabled for locked steps (not just disabled attribute)
// - Screen reader announcements for progress changes
// - Visual contrast ratios maintained for all states

import { cn } from '@/lib/utils';
import type { ConceptNode, NodeStatus } from '@/types/learning';

interface ProgressBarProps {
  nodes: ConceptNode[];
  currentNodeId?: string;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
}

export function ProgressBar({
  nodes,
  currentNodeId,
  onNodeClick,
  className,
}: ProgressBarProps) {
  const completedCount = nodes.filter((n) => n.status === 'COMPLETED').length;
  const progressPercent = nodes.length > 0 ? (completedCount / nodes.length) * 100 : 0;

  return (
    <div className={cn('w-full', className)}>
      {/* Progress text with screen reader context */}
      <div className="flex items-center justify-between mb-2 text-sm">
        <span className="text-muted-foreground">Progress</span>
        <span className="font-medium" aria-live="polite">
          <span className="sr-only">Course progress: </span>
          {completedCount} / {nodes.length} mastered
        </span>
      </div>

      {/* Main progress bar with ARIA attributes */}
      <div
        className="h-2 bg-muted rounded-full overflow-hidden mb-3"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Course progress: ${Math.round(progressPercent)}% complete`}
      >
        <div
          className="h-full bg-green-500 transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Node steps as navigation list */}
      <nav aria-label="Learning path progress">
        <ol className="flex items-center gap-1 list-none p-0 m-0">
          {nodes.map((node, index) => {
            const isCurrent = node.id === currentNodeId;
            const isLocked = node.status === 'LOCKED';
            const canClick = !isLocked && onNodeClick;

            return (
              <li key={node.id} className="flex-1">
                <button
                  onClick={() => {
                    // Only allow clicking non-locked nodes
                    if (canClick) {
                      onNodeClick(node.id);
                    }
                  }}
                  disabled={isLocked}
                  aria-disabled={isLocked}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`${node.title}: ${formatStatusForScreenReader(node.status, index + 1)}`}
                  title={`${node.title} (${formatStatus(node.status)})`}
                  className={cn(
                    'w-full h-2 rounded-full transition-all duration-200',
                    getStepColor(node.status),
                    isCurrent && 'ring-2 ring-offset-1 ring-primary',
                    isLocked
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer hover:opacity-80',
                    // Focus styles for accessibility
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                  )}
                />
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Legend - decorative, hidden from screen readers */}
      <div
        className="flex items-center gap-4 mt-3 text-xs text-muted-foreground"
        aria-hidden="true"
      >
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Mastered</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span>In progress</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
          <span>Locked</span>
        </div>
      </div>
    </div>
  );
}

function getStepColor(status: NodeStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-500';
    case 'LOCKED':
      return 'bg-muted-foreground/30';
    case 'ERROR':
      return 'bg-destructive';
    default:
      // VIEWING_EXPLANATION, IN_QUIZ, SHOWING_FEEDBACK are all "active"
      return 'bg-primary';
  }
}

function formatStatus(status: NodeStatus): string {
  switch (status) {
    case 'LOCKED':
      return 'Locked - complete previous topic first';
    case 'VIEWING_EXPLANATION':
      return 'Reading explanation';
    case 'IN_QUIZ':
      return 'Taking quiz';
    case 'SHOWING_FEEDBACK':
      return 'Reviewing feedback';
    case 'COMPLETED':
      return 'Mastered';
    case 'ERROR':
      return 'Error - retry available';
    default:
      return status;
  }
}

function formatStatusForScreenReader(status: NodeStatus, stepNumber: number): string {
  switch (status) {
    case 'LOCKED':
      return `Step ${stepNumber}, locked. Complete previous topics to unlock.`;
    case 'VIEWING_EXPLANATION':
      return `Step ${stepNumber}, currently reading explanation`;
    case 'IN_QUIZ':
      return `Step ${stepNumber}, currently taking quiz`;
    case 'SHOWING_FEEDBACK':
      return `Step ${stepNumber}, reviewing feedback`;
    case 'COMPLETED':
      return `Step ${stepNumber}, mastered`;
    case 'ERROR':
      return `Step ${stepNumber}, error occurred. Retry available.`;
    default:
      return `Step ${stepNumber}, ${status}`;
  }
}
