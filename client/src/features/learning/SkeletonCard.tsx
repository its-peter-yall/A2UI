// SkeletonCard.tsx
// Skeleton loader for concept cards during generation

// Shows animated placeholder content while a node is being generated.
// Matches the layout of ConceptCard for smooth transitions.

// @see: client/src/features/learning/ConceptCard.tsx - Target layout
// @note: Uses Tailwind animate-pulse for loading effect

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
