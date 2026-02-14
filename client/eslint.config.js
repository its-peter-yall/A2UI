/**
 * ============================================================================
 * FILE: eslint.config.js
 * ============================================================================
 * 
 * PURPOSE:
 * Configures ESLint for TypeScript and React code quality enforcement.
 * Enforces React Hooks rules and enables React Refresh for hot reload.
 * 
 * KEY COMPONENTS:
 * - JavaScript recommended: Base ESLint rules
 * - TypeScript ESLint: TypeScript-specific linting
 * - React Hooks: Hooks dependency and exhaustiveness rules
 * - React Refresh: Vite HMR compatibility for fast dev experience
 * 
 * DEPENDENCIES:
 * - @eslint/js: ESLint core with recommended configs
 * - typescript-eslint: TypeScript language support for ESLint
 * - eslint-plugin-react-hooks: React Hooks rules
 * - eslint-plugin-react-refresh: Validate components work with Fast Refresh
 * - globals: Browser globals for environment
 * 
 * USAGE PATTERN:
 * ```bash
 * # Run linting
 * npm run lint
 * 
 * # Fix auto-fixable issues
 * npm run lint -- --fix
 * ```
 * 
 * ERROR HANDLING:
 * - React Refresh errors: Component must be default export or in allowlist
 * - TypeScript errors: tsconfig must be properly configured
 * 
 * PERFORMANCE NOTES:
 * - globalIgnores excludes dist/ from linting
 * - File patterns restricted to .ts and .tsx only
 * 
 * RELATED FILES:
 * - client/tsconfig.app.json - TypeScript configuration
 * - client/vite.config.ts - Vite/React Refresh setup
 * 
 * NOTES:
 * - allowExportNames permits specific named exports (useErrorToast)
 * - React Refresh requires Vite for HMR to work correctly
 * ============================================================================
 */

// eslint.config.js
// ESLint configuration for TypeScript and React

// Configures ESLint with TypeScript, React Hooks, and React Refresh
// plugins for code quality and hooks rules.

// @see: client/src/App.tsx - Main application
// @note: allowExportNames permits specific named exports

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['useErrorToast'] },
      ],
    },
  },
])
