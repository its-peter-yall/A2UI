/**
 * ============================================================================
 * FILE: utils.ts
 * LOCATION: client/src/lib/utils.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Provides utility functions for className composition, merging Tailwind
 *    CSS class names while resolving conflicts via clsx and tailwind-merge.
 *
 * ROLE IN PROJECT:
 *    Core styling utility used throughout the component library. Enables safe
 *    combination of static and dynamic Tailwind classes with last-wins conflict
 *    resolution, replacing manual string concatenation across all components.
 *
 * KEY COMPONENTS:
 *    - cn: Merges className inputs resolving Tailwind conflicts
 *
 * DEPENDENCIES:
 *    - External: clsx, tailwind-merge
 *    - Internal: (none)
 *
 * USAGE:
 *    ```tsx
 *    import { cn } from '@/lib/utils';
 *    <button className={cn('px-4 py-2', isActive && 'bg-yellow-400')} />
 *    ```
 * ============================================================================
 */

// utils.ts
// Utility functions for className composition

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}