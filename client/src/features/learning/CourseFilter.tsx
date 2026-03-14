/**
 * ============================================================================
 * FILE: CourseFilter.tsx
 * LOCATION: client/src/features/learning/CourseFilter.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Filter and sort controls for the course dashboard list.
 *
 * ROLE IN PROJECT:
 *    Renders pill-style status filters (All, In Progress, Completed) and sort
 *    options (Recent, Progress) above the course grid in LearningHome.
 *    Active pills use Cyber Yellow styling; accessible via role="tablist".
 *
 * KEY COMPONENTS:
 *    - CourseFilter: Status filter pills and sort selector with aria support
 *
 * DEPENDENCIES:
 *    - External: none
 *    - Internal: @/lib/utils (cn)
 *
 * USAGE:
 *    <CourseFilter status={status} sortBy={sortBy} onStatusChange={...} onSortChange={...} />
 * ============================================================================
 */
// CourseFilter.tsx
// Filter and sort controls for the course dashboard

// Provides pill-style status filter buttons (All, In Progress, Completed)
// and a sort selector (Recent, Progress) for filtering
// the course list. Active pill uses Cyber Yellow styling (adapts to theme).
// Accessible with role="tablist" and aria-selected on active pills.

// @see: client/src/features/learning/LearningHome.tsx (parent)
// @see: conductor/product-guidelines.md (Cyber Yellow visual identity)
// @note: Sort labels are user-friendly; values map to API sort fields

import { cn } from '@/lib/utils';

export type FilterStatus = 'all' | 'in_progress' | 'completed';
export type SortField = 'updated_at' | 'progress_percent';

export interface CourseFilterProps {
  status: FilterStatus;
  sortBy: SortField;
  onStatusChange: (status: FilterStatus) => void;
  onSortChange: (sortBy: SortField) => void;
}

const STATUS_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'updated_at', label: 'Recent' },
  { value: 'progress_percent', label: 'Progress' },
];

export function CourseFilter({
  status,
  sortBy,
  onStatusChange,
  onSortChange,
}: CourseFilterProps) {
  return (
    <div className="mt-3 ml-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Status filter pills */}
      <div
        role="tablist"
        aria-label="Filter courses by status"
        className="flex items-center gap-2"
      >
        {STATUS_OPTIONS.map((option) => {
          const isActive = status === option.value;
          return (
            <button
              key={option.value}
              role="tab"
              aria-selected={isActive}
              onClick={() => onStatusChange(option.value)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
                isActive
                  ? 'bg-[var(--cyber-yellow)] text-gray-900 focus:ring-gray-900'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 focus:ring-primary'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Sort selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Sort by:</span>
        <div
          role="tablist"
          aria-label="Sort courses"
          className="flex items-center gap-1"
        >
          {SORT_OPTIONS.map((option) => {
            const isActive = sortBy === option.value;
            return (
              <button
                key={option.value}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSortChange(option.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
                  isActive
                    ? 'bg-[var(--cyber-yellow)] text-gray-900 focus:ring-gray-900'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 focus:ring-primary'
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
