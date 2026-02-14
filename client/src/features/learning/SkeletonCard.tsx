/**
 * ============================================================================
 * FILE: SkeletonCard.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Skeleton loader component that displays animated placeholder content while
 * a concept node is being generated. Provides visual feedback during the
 * scatter-gather process and matches the layout of ConceptCard for smooth
 * transitions when content loads.
 * 
 * KEY COMPONENTS:
 * - SkeletonCard: Single card skeleton matching ConceptCard layout
 * - SkeletonPath: Multiple skeleton cards in a column (for loading states)
 * 
 * DEPENDENCIES:
 * - @/lib/utils: cn() utility for conditional className composition
 * - tailwindcss: animate-pulse utility for loading animation
 * 
 * USAGE PATTERN:
 * ```tsx
 * // Single skeleton for one node
 * <SkeletonCard />
 * 
 * // Multiple skeletons for loading state
 * <SkeletonPath count={5} />
 * ```
 * 
 * ERROR HANDLING:
 * - Pure presentation component; no error handling needed
 * 
 * PERFORMANCE NOTES:
 * - Uses CSS-only animation (animate-pulse) for performance
 * - aria-busy="true" announces loading state to screen readers
 * - Hidden text "Loading content..." for screen reader context
 * 
 * RELATED FILES:
 * - ConceptCard.tsx: Target layout that skeleton matches
 * - ErrorStates.tsx: GeneratingState component for initial generation loading
 * 
 * NOTES:
 * - Layout mirrors ConceptCard: header, body, footer sections
 * - Header: icon placeholder, title lines, sequence number
 * - Body: multiple paragraph lines with varying widths
 * - Footer: button placeholder
 * ============================================================================
 */

import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'border rounded-lg bg-card animate-pulse',
        className
      )}
      aria-busy="true"
    >
      <span className="sr-only">Loading content...</span>
      
      {/* Header skeleton */}
      <div className="flex items-center gap-3 p-4 border-b">
        <div className="w-8 h-8 bg-muted rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/4" />
        </div>
        <div className="h-4 w-6 bg-muted rounded" />
      </div>

      {/* Body skeleton */}
      <div className="p-4 space-y-3">
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-5/6" />
        <div className="h-4 bg-muted rounded w-4/6" />
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-3/4" />
      </div>

      {/* Footer skeleton */}
      <div className="flex justify-end p-4 border-t">
        <div className="h-9 w-32 bg-muted rounded" />
      </div>
    </div>
  );
}

interface SkeletonPathProps {
  count?: number;
}

export function SkeletonPath({ count = 5 }: SkeletonPathProps) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
