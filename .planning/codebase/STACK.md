# Technology Stack

**Analysis Date:** 2026-02-16

## Languages

**Primary:**
- **TypeScript** ~5.9.3 - Frontend React application (`client/src/**/*.ts`, `client/src/**/*.tsx`)
- **Python** 3.10+ - Backend FastAPI server (`server/**/*.py`)

**Secondary:**
- **JavaScript/JSX** - Legacy compatibility (minimal usage)
- **Markdown** - Documentation and content rendering (via `react-markdown`)
- **CSS/Tailwind** - Styling (`client/src/index.css`, Tailwind utility classes)

## Runtime

**Client Environment:**
- **Node.js** - Development and build runtime
- **Vite** 7.2.4 - Build tool and dev server (`client/vite.config.ts`)
- **Type:** ES Modules (`"type": "module"` in `client/package.json`)

**Server Environment:**
- **Python** 3.10+
- **ASGI Server:** Uvicorn with standard extras (`uvicorn[standard]`)
- **Virtual Environment:** `.venv/` in `server/` directory

**Package Manager:**
- **Client:** npm (lockfile: `client/package-lock.json` - not detected, likely present)
- **Server:** pip with `server/requirements.txt`

## Frameworks

**Core Client:**
- **React** 19.2.0 - UI library with JSX transform
- **React DOM** 19.2.0 - DOM rendering
- **React Router DOM** 7.13.0 - Client-side routing
- **FastAPI** - Python web framework for REST API

**UI/Styling:**
- **Tailwind CSS** 4.1.18 - Utility-first CSS framework
- **@tailwindcss/vite** 4.1.18 - Vite plugin for Tailwind v4
- **@tailwindcss/typography** 0.5.19 - Prose content styling for Markdown
- **Framer Motion** 12.29.2 - Animation library
- **Lucide React** 0.563.0 - Icon library

**State Management & Data:**
- **TanStack React Query** 5.90.20 - Server state management and caching
- **Axios** 1.13.4 - HTTP client for API requests

**Content Rendering:**
- **React Markdown** 10.1.0 - Markdown rendering in React
- **Rehype Raw** 7.0.0 - Parse raw HTML in Markdown
- **Rehype Sanitize** 6.0.0 - Sanitize HTML output
- **Remark GFM** 4.0.1 - GitHub Flavored Markdown support

**AI/ML Backend:**
- **Google Cloud AI Platform** (`google-cloud-aiplatform`) - Vertex AI SDK
- **Instructor** - Structured LLM output validation with Pydantic
- **Pydantic** v2 - Data validation and settings management

**Utilities:**
- **Tenacity** - Retry logic with exponential backoff
- **python-dotenv** - Environment variable loading
- **jsonref** - JSON reference resolution

**Testing:**
- **Vitest** 3.2.4 - Unit testing framework
- **@vitest/coverage-v8** 3.2.4 - Code coverage
- **@testing-library/react** 16.3.2 - React component testing
- **@testing-library/jest-dom** 6.9.1 - DOM assertion matchers
- **@testing-library/dom** 10.4.1 - DOM testing utilities
- **jsdom** 27.0.1 - Browser environment for tests
- **Python unittest** - Server-side testing (stdlib)

**Linting & Code Quality:**
- **ESLint** 9.39.1 - TypeScript/JavaScript linting
- **typescript-eslint** 8.46.4 - TypeScript ESLint rules
- **eslint-plugin-react-hooks** 7.0.1 - React Hooks rules
- **eslint-plugin-react-refresh** 0.4.24 - React Fast Refresh validation
- **clsx** 2.1.1 - Conditional className construction
- **tailwind-merge** 3.4.0 - Tailwind class conflict resolution

**Build Tools:**
- **Vite** 7.2.4 - Fast dev server and optimized builds
- **@vitejs/plugin-react** 5.1.1 - React Fast Refresh integration
- **TypeScript** ~5.9.3 - Type checking and transpilation
- **PostCSS** 8.5.6 - CSS processing
- **Autoprefixer** 10.4.23 - CSS vendor prefixing

## Key Dependencies

**Critical:**
- `react@^19.2.0` - Core UI framework
- `fastapi` - Backend API framework
- `google-cloud-aiplatform` - Google Vertex AI integration for LLM features
- `instructor` - Structured output from LLMs with Pydantic validation
- `@tanstack/react-query` - Server state synchronization
- `pydantic` - Data validation (both client types and server schemas)

**Infrastructure:**
- `uvicorn[standard]` - ASGI server for FastAPI
- `axios` - HTTP client with interceptors
- `react-router-dom` - SPA routing
- `sqlite3` (stdlib) - Local database for persistence

## Configuration

**Client Configuration:**
- `client/vite.config.ts` - Vite build configuration with path aliases
- `client/tsconfig.app.json` - TypeScript strict mode config
- `client/tsconfig.node.json` - TypeScript config for Vite config file
- `client/tsconfig.json` - Project references configuration
- `client/tailwind.config.js` - Tailwind CSS v4 content paths
- `client/eslint.config.js` - ESLint flat config
- `client/vitest.setup.ts` - Test environment setup with Jest DOM matchers

**Server Configuration:**
- `server/config.py` - Environment-based settings (PROJECT_ID, LOCATION, credentials)
- `server/.env` - Environment variables (not committed)
- `server/.env.example` - Template for required environment variables
- `server/requirements.txt` - Python dependencies

**Environment Variables (Client):**
- `VITE_API_URL` - Backend API base URL (defaults to `http://localhost:8000`)

**Environment Variables (Server):**
- `PROJECT_ID` - Google Cloud project ID
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account JSON key
- `LOCATION` - Vertex AI region (default: `us-central1`)
- `VERTEX_CONFIG` - Alternative way to set credentials path

## Platform Requirements

**Development:**
- Node.js (for client build tools)
- Python 3.10+ with virtual environment support
- Google Cloud SDK (for Vertex AI access)
- Service account key file for Google Cloud authentication

**Production:**
- ASGI-compatible server (Uvicorn recommended)
- Static file server for built client assets
- Google Cloud project with Vertex AI API enabled
- Service account with appropriate Vertex AI permissions

**Ports:**
- Client dev server: `5173` (Vite default)
- Backend API: `8000` (FastAPI/Uvicorn default)

---

*Stack analysis: 2026-02-16*
