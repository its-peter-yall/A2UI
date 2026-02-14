/**
 * ============================================================================
 * FILE: vite.config.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Vite build configuration for the AgUI React application. Defines the React
 * plugin, Tailwind CSS integration, path aliases for cleaner imports, and
 * Vitest configuration for unit testing with jsdom environment. This is the
 * central configuration file for both development builds and test execution.
 * 
 * KEY COMPONENTS:
 * - defineConfig: Vite configuration exporter with type safety
 * - react(): Vite plugin for React Fast Refresh and JSX transformation
 * - tailwindcss(): Vite plugin for Tailwind CSS v4 processing
 * - path alias '@': Maps to './src' for cleaner import statements
 * - test environment: jsdom for React component testing
 * - setupFiles: Points to vitest.setup.ts for global test configuration
 * 
 * DEPENDENCIES:
 * - vitest/config: Testing framework configuration
 * - @vitejs/plugin-react: Official Vite React integration
 * - @tailwindcss/vite: Tailwind CSS v4 Vite plugin
 * - path: Node.js path module for resolving aliases
 * 
 * USAGE PATTERN:
 * ```bash
 * # Development server
 * npm run dev
 * 
 * # Production build
 * npm run build
 * 
 * # Run tests
 * npm run test
 * 
 * # Run tests with coverage
 * npm run test -- --coverage
 * ```
 * 
 * ERROR HANDLING:
 * - Path alias requires TypeScript to recognize '@' in tsconfig.json
 * - Test environment must match jsdom for React Testing Library to work
 * - setupFiles path is relative to project root
 * 
 * PERFORMANCE NOTES:
 * - chunkSizeWarningLimit: 1000kb raises warning instead of error for large bundles
 * - React Fast Refresh preserves component state during development
 * - Tailwind CSS is processed at build time (no runtime overhead)
 * 
 * RELATED FILES:
 * - client/vitest.setup.ts: Test setup with jest-dom matchers
 * - client/tsconfig.app.json: TypeScript config with path alias
 * - client/src/index.css: Tailwind directives entry point
 * 
 * NOTES:
 * - Path alias '@' resolves to client/src directory
 * - Vitest uses Vite's engine, so config can share settings
 * - @tailwindcss/vite is for Tailwind v4; use tailwindcss plugin for v3
 * - globals: true allows using describe/it without importing in every test
 * ============================================================================
 */

// vite.config.ts
// Vite build configuration and test setup

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
  },
})
