/**
 * ============================================================================
 * FILE: utils.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Provides utility functions for className composition, specifically merging
 * Tailwind CSS class names while resolving conflicts. This is the core utility
 * for conditional styling throughout the component library, enabling safe
 * combination of static and dynamic Tailwind classes.
 * 
 * KEY COMPONENTS:
 * - cn(): Primary export - merges className inputs resolving Tailwind conflicts
 * 
 * DEPENDENCIES:
 * - clsx: Lightweight utility for constructing className strings conditionally
 * - tailwind-merge: Merges Tailwind CSS classes resolving conflicts (last-wins)
 * 
 * USAGE PATTERN:
 * ```tsx
 * import { cn } from '@/lib/utils';
 * 
 * // Basic usage with static classes
 * <div className={cn('px-4 py-2', 'bg-blue-500')} />
 * 
 * // Conditional classes - truthy values added, falsy ignored
 * <button className={cn(
 *   'px-4 py-2 rounded',
 *   isActive && 'bg-yellow-400 text-black',
 *   isDisabled && 'opacity-50 cursor-not-allowed'
 * )} />
 * 
 * // Combining with existing classNames
 * <div className={cn(baseClasses, conditional && 'extra-classes')} />
 * ```
 * 
 * ERROR HANDLING:
 * - Invalid className types are handled gracefully by clsx
 * - Non-string values in classList are filtered out automatically
 * 
 * PERFORMANCE NOTES:
 * - twMerge is optimized for merging many className strings
 * - Prefer using cn() over string concatenation for any conditional classes
 * - Creates new string on each call; avoid in tight loops if possible
 * 
 * RELATED FILES:
 * - client/src/lib/learningApi.ts: Uses cn() for component styling
 * - client/src/components/*: Many UI components use cn() for class merging
 * 
 * NOTES:
 * - Essential for conditional Tailwind classes in all React components
 * - tailwind-merge uses "last wins" strategy for conflicting classes
 * - Example: cn('px-2', 'px-4') returns 'px-4'
 * ============================================================================
 */

// utils.ts
// Utility functions for className composition

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}