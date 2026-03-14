/**
 * ============================================================================
 * FILE: theme-context.tsx
 * LOCATION: client/src/providers/theme-context.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Defines the Theme type, ThemeProviderState, and ThemeProviderContext.
 *
 * ROLE IN PROJECT:
 *    Shared context definition consumed by ThemeProvider (value) and
 *    useTheme (consumer). Kept separate to avoid circular imports.
 *
 * KEY COMPONENTS:
 *    - ThemeProviderContext: React context with theme and setTheme
 *
 * DEPENDENCIES:
 *    - External: react (createContext)
 *    - Internal: none
 *
 * USAGE:
 *    import { ThemeProviderContext } from '@/providers/theme-context';
 * ============================================================================
 */
import { createContext } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

export const ThemeProviderContext = createContext<ThemeProviderState>(initialState);
