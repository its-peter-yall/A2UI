// CourseCardSkeleton.tsx
// Skeleton loading placeholder for CourseCard components

// Renders an animated pulse skeleton matching CourseCard dimensions.
// Used in the course dashboard grid while useCourseList is loading.
// Matches the CourseCard layout: title, query text, progress bar,
// topic count, and action button areas.

// @see: client/src/features/learning/CourseCard.tsx (target layout)
// @see: client/src/features/learning/SkeletonCard.tsx (existing pattern)
// @note: Uses CSS animate-pulse for performance (no JS animation)

import { cn } from '@/lib/utils';

interface CourseCardSkeletonProps {
  className?: string;
}

export function CourseCardSkeleton({ className }: CourseCardSkeletonProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl border border-white/10 p-5',
        'bg-card/80 backdrop-blur-sm',
        'flex flex-col gap-3 w-full animate-pulse',
        className
      )}
      aria-busy="true"
      data-testid="course-card-skeleton"
    >
      <span className="sr-only">Loading course...</span>

      {/* Header: title + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="h-5 bg-muted rounded w-3/4" />
        <div className="h-5 w-20 bg-muted rounded shrink-0" />
      </div>

      {/* Query text */}
      <div className="space-y-1.5">
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2 w-full rounded-full bg-muted" />
        <div className="flex items-center justify-between">
          <div className="h-3 bg-muted rounded w-32" />
          <div className="h-3 bg-muted rounded w-8" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="h-8 w-28 bg-muted rounded-lg" />
        <div className="h-3 bg-muted rounded w-24" />
      </div>
    </div>
  );
}
