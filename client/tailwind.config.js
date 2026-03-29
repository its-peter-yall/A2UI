/**
 * ============================================================================
 * FILE: tailwind.config.js
 * ============================================================================
 * 
 * PURPOSE:
 * Configures Tailwind CSS for the A2UI client application. Defines content
 * scanning paths and enables the typography plugin for prose/styled content.
 * 
 * KEY COMPONENTS:
 * - Content paths: Directs Tailwind to scan all source files for class usage
 * - Theme extend: Custom theme extensions (colors, fonts, spacing)
 * - Plugins: Typography plugin for rich text content styling
 * 
 * DEPENDENCIES:
 * - tailwindcss: Core utility-first CSS framework
 * - @tailwindcss/typography: Plugin for prose content (Markdown rendering)
 * 
 * USAGE PATTERN:
 * ```bash
 * # Tailwind classes are automatically applied in component JSX
 * <div className="prose dark:prose-invert">Markdown content</div>
 * ```
 * 
 * ERROR HANDLING:
 * - Missing content paths will cause Tailwind to miss classes
 * - Plugin not installed will cause build failures
 * 
 * PERFORMANCE NOTES:
 * - Content paths are optimized to scan src/** only
 * - Avoid overly broad patterns that slow down builds
 * 
 * RELATED FILES:
 * - client/src/index.css - Tailwind directives and base styles
 * - client/vite.config.ts - Build configuration
 * 
 * NOTES:
 * - Cyber Yellow (#FFD400) accent is defined in CSS variables
 * - Dark mode support via Tailwind's dark: variant
 * ============================================================================
 */

// tailwind.config.js
// Tailwind CSS configuration for styling

// Defines content paths for Tailwind to scan and includes
// the typography plugin for prose content styling.

// @see: client/src/index.css - Tailwind imports
// @note: Add custom theme colors in extend section

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
