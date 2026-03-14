/**
 * ============================================================================
 * FILE: ThemeToggle.tsx
 * LOCATION: client/src/components/ThemeToggle.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Button component that cycles through light, dark, and system themes.
 *
 * ROLE IN PROJECT:
 *    Provides the UI control for theme switching, placed in the app header.
 *    Reads current theme from context and updates it on each click.
 *
 * KEY COMPONENTS:
 *    - ThemeToggle: Icon button cycling light → dark → system → light
 *
 * DEPENDENCIES:
 *    - External: lucide-react (Sun, Moon, Monitor icons)
 *    - Internal: @/hooks/useTheme
 *
 * USAGE:
 *    <ThemeToggle />
 * ============================================================================
 */
import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "../hooks/useTheme"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark")
    } else if (theme === "dark") {
      setTheme("system")
    } else {
      setTheme("light")
    }
  }

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      title={`Toggle theme (Current: ${theme})`}
    >
      {theme === "light" && <Sun className="h-5 w-5" />}
      {theme === "dark" && <Moon className="h-5 w-5" />}
      {theme === "system" && <Monitor className="h-5 w-5" />}
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
