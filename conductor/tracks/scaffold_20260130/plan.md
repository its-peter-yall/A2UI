# Plan: Project Scaffolding & Configuration

## Phase 1: Client Initialization (Atomic)
- [x] Task: Run `npm create vite@latest client -- --template react-ts` in `AgUI/` (4c53d3c)
- [x] Task: Install core dependencies: `npm install -D tailwindcss postcss autoprefixer` and `npm install lucide-react @tanstack/react-query react-router-dom clsx tailwind-merge` (1d7089b)
- [x] Task: Initialize Tailwind: Run `npx tailwindcss init -p` (0351e5e)
- [ ] Task: Configure `vite.config.ts` to set up `@` alias for path resolution
- [ ] Task: Remove default Vite boilerplate (assets, app.css, trivial App.tsx content)
- [ ] Task: Conductor - User Manual Verification 'Client Initialization' (Protocol in workflow.md)

## Phase 2: Client Styling & Assets (Atomic)
- [ ] Task: Copy `tailwind.config.js` logic from AURA-CHAT (colors, animations)
- [ ] Task: Copy `index.css` variables (Cyber Yellow, dark mode base) from AURA-CHAT
- [ ] Task: Create `lib/utils.ts` for the `cn` (class name merger) utility
- [ ] Task: Conductor - User Manual Verification 'Client Styling & Assets' (Protocol in workflow.md)

## Phase 3: Server Initialization (Atomic)
- [ ] Task: Create `AgUI/server` directory and `requirements.txt` with `fastapi`, `uvicorn`, `google-cloud-aiplatform`, `python-dotenv`, `pydantic`
- [ ] Task: Create and initialize Python virtual environment `.venv` in `server/`
- [ ] Task: Create `server/main.py` with basic FastAPI app instance and CORS middleware
- [ ] Task: Create `server/config.py` for environment variable loading (`GOOGLE_APPLICATION_CREDENTIALS`, `PROJECT_ID`)
- [ ] Task: Create `server/.env.example` file
- [ ] Task: Conductor - User Manual Verification 'Server Initialization' (Protocol in workflow.md)

## Phase 4: Vertex AI SDK Setup (Atomic)
- [ ] Task: Create `server/utils/vertex_client.py`
- [ ] Task: Implement `init_vertex()` function calling `aiplatform.init()`
- [ ] Task: Add a startup event handler in `main.py` to initialize Vertex AI on server start
- [ ] Task: Add a `GET /health` endpoint that checks the Vertex AI client status
- [ ] Task: Conductor - User Manual Verification 'Vertex AI SDK Setup' (Protocol in workflow.md)