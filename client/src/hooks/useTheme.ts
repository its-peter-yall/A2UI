/**
 * ============================================================================
 * FILE: useTheme.ts
 * LOCATION: client/src/hooks/useTheme.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Hook that exposes the current theme and setTheme from ThemeProviderContext.
 *
 * ROLE IN PROJECT:
 *    Provides a safe, typed access point to theme state for any component.
 *    Throws a descriptive error if used outside of ThemeProvider.
 *
 * KEY COMPONENTS:
 *    - useTheme: Returns { theme, setTheme } from ThemeProviderContext
 *
 * DEPENDENCIES:
 *    - External: react (useContext)
 *    - Internal: @/providers/theme-context (ThemeProviderContext)
 *
 * USAGE:
 *    const { theme, setTheme } = useTheme();
 * ============================================================================
 */
import { useContext } from "react";
import { ThemeProviderContext } from "@/providers/theme-context";

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
}
