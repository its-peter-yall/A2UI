# Technology Stack

## Frontend (Client)
- **Framework:** React 19 (TypeScript)
- **Build Tool:** Vite
- **Styling:** Tailwind CSS 4.x
- **State Management:**
    - **Server State:** TanStack Query (React Query) v5
    - **Local State:** React Context API or Zustand (lightweight)
- **HTTP Client:** Axios
- **Icons:** Lucide React
- **Markdown:** React Markdown
- **Testing:** Vitest (Unit/Integration)

## Backend (Server)
- **Framework:** FastAPI (Python 3.10+)
- **Server:** Uvicorn
- **AI Integration:** Google Vertex AI Python SDK (`google-cloud-aiplatform`)
- **Data Validation:** Pydantic v2
- **CORS:** FastAPI CORSMiddleware

## Data Persistence
- **Session Storage:**
    - **Selection:** SQLite (local file-based) for true standalone simplicity and reliable session persistence without external database overhead.

## Development Tools
- **Package Manager:** npm (Frontend), pip (Backend)
- **Linting/Formatting:** ESLint, Prettier, Ruff (Python)
- **Version Control:** Git