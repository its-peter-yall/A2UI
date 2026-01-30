// utils.ts
// Shared utility functions for the AgUI client

// Includes the 'cn' helper for conditionally merging Tailwind CSS classes
// using 'clsx' and 'tailwind-merge' to ensure conflict-free styling.

// @see: https://github.com/lukeed/clsx
// @see: https://github.com/dcastil/tailwind-merge

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges multiple class names and resolves Tailwind CSS conflicts.
 * @param inputs - Variadic list of class names or conditional class objects.
 * @returns A single merged class name string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
