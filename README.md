# A2UI - Agent-Generated User Interface

A modern adaptive learning platform that transforms user-submitted topics into structured, AI-generated courses with mastery-based progression. Built with React 19, FastAPI, and Google Vertex AI.

## What This Is

A2UI implements **retrieval-based learning** - a pedagogical approach where active recall through testing strengthens learning more effectively than passive review. Users submit a topic, receive AI-generated sequential learning paths with explanations and quizzes, and must pass assessments to unlock subsequent content.

## Core Features

### Adaptive Learning System
- **Multi-Agent AI Pipeline**: Planner, Generator, and Quizzer agents orchestrated via Scatter-Gather pattern
- **Sequential Learning Paths**: Topics decomposed into ordered concept nodes with narrative coherence
- **Mastery-Based Progression**: Server-enforced state machine (LOCKED → VIEWING_EXPLANATION → IN_QUIZ → COMPLETED)
- **Dynamic Quiz Generation**: 1-5 quizzes per topic based on complexity with difficulty gradients (Recall → Application → Synthesis)
- **Course Persistence**: SQLite-backed storage with progress tracking and session resumption
- **Revision Sessions**: Full review and quiz-only modes with performance comparison

### User Experience
- **Framer Motion Animations**: Gamified unlock experiences and smooth transitions
- **Dark Theme**: Optimized for long study sessions with Cyber Yellow accents
- **Responsive Design**: Mobile-friendly with collapsible navigation
- **Real-time Generation**: Skeleton loaders provide <15s perceived latency

### Chat Foundation
- **Session Management**: Create, list, rename, pin, and delete chat sessions
- **Persistent History**: All messages stored in SQLite database
- **Markdown Rendering**: Full markdown support with syntax highlighting
- **Thinking Mode**: Display model's reasoning process when available

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 | UI framework with latest features |
| TypeScript 5.9 | Type safety with strict mode |
| Vite 7 | Build tool & dev server |
| Tailwind CSS 4.x | Utility-first styling |
| TanStack Query 5 | Server state management & caching |
| Framer Motion | Animation library |
| React Markdown | Markdown rendering |

### Backend
| Technology | Purpose |
|------------|---------|
| FastAPI | Web framework with automatic docs |
| Python 3.10+ | Server language |
| Pydantic v2 | Data validation & serialization |
| SQLite | Data persistence |
| Google Vertex AI | Gemini models for AI generation |
| Instructor | Structured LLM output validation |
| Tenacity | Retry logic with exponential backoff |

### AI/ML Architecture
- **Planner Agent** (Gemini 1.5 Pro): Decomposes topics into structured course outlines
- **Generator Agent** (Gemini 1.5 Flash): Creates educational content using 5E model
- **Quizzer Agent** (Gemini 1.5 Flash): Generates assessments with plausible distractors
- **Scatter-Gather Pattern**: Parallel generation with partial failure handling

## Project Structure

```
A2UI/
├── client/                      # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── main.tsx            # Entry point
│   │   ├── App.tsx             # Root component
│   │   ├── components/         # Reusable UI components
│   │   ├── features/
│   │   │   ├── chat/          # Chat feature module
│   │   │   └── learning/      # Learning system components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # Utilities and API client
│   │   ├── providers/          # Context providers
│   │   └── types/              # TypeScript definitions
│   └── package.json
│
├── server/                      # Backend (FastAPI + Python)
│   ├── main.py                 # FastAPI app entry point
│   ├── config.py               # Environment configuration
│   ├── routers/
│   │   └── learning.py        # Learning API routes
│   ├── schemas/                # Pydantic models
│   ├── services/               # Business logic
│   │   └── course_orchestrator.py
│   ├── agents/                 # AI agent implementations
│   │   ├── base.py
│   │   ├── planner.py
│   │   ├── generator.py
│   │   └── quizzer.py
│   ├── database/               # SQLite persistence layer
│   └── utils/                  # Vertex AI client wrappers
│
├── conductor/                   # Product documentation
├── .planning/                   # Development planning
│   ├── codebase/              # Architecture docs
│   ├── phases/                # Implementation phases
│   └── ROADMAP.md            # Feature roadmap
└── run.bat                      # Windows startup script
```

## Installation

### Prerequisites
- **Node.js 18+** (for frontend)
- **Python 3.10+** (for backend)
- **Google Cloud Project** with Vertex AI API enabled
- **Service Account** with Vertex AI User permissions

### 1. Clone the Repository
```bash
git clone <repository-url>
cd A2UI
```

### 2. Backend Setup
```bash
cd server

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup
```bash
cd client

# Install dependencies
npm install
```

### 4. Environment Configuration

#### Backend Environment

Create `server/.env` (or copy from `server/.env.example`):

```env
# Google Cloud Configuration
PROJECT_ID=your-gcp-project-id
LOCATION=us-central1

# Service Account Credentials
GOOGLE_APPLICATION_CREDENTIALS=./path-to-service-account-key.json

# Optional: Model Configuration
DEFAULT_MODEL=gemini-2.5-flash
```

#### Frontend Environment (Optional)

Create `client/.env`:

```env
VITE_API_URL=http://localhost:8000
```

## Running the Application

### Option 1: Using the Batch Script (Windows)

```bash
# From project root
run.bat
```

This starts both the backend and frontend servers.

### Option 2: Manual Start

**Terminal 1 - Start Backend:**

```bash
cd server
.\.venv\Scripts\activate          # Windows
# source .venv/bin/activate       # macOS/Linux

python -m uvicorn server.main:app --reload --port 8000
```

**Terminal 2 - Start Frontend:**

```bash
cd client
npm run dev
```

### Access Points

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Documentation | http://localhost:8000/docs |
| Health Check | http://localhost:8000/health |

## Application Routes

### Frontend Routes
- `/` or `/chat` - Main chat interface
- `/learn` - Learning dashboard with course list
- `/learn/:sessionId` - Active learning session
- `/learn/:sessionId/revise/:revisionId` - Revision session

### API Endpoints (Learning System)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/learning/generate` | Create new course from topic |
| `GET` | `/learning/sessions` | List learning sessions |
| `GET` | `/learning/sessions/{id}` | Get session with nodes |
| `GET` | `/learning/sessions/{id}/progress` | Get progress summary |
| `GET` | `/learning/nodes/{id}` | Get concept node |
| `POST` | `/learning/nodes/{id}/submit-quiz` | Submit quiz answer |
| `POST` | `/learning/nodes/{id}/retry-quiz` | Retry failed quiz |
| `POST` | `/learning/nodes/{id}/regenerate` | Regenerate failed content |

## Development

### Frontend Commands

```bash
cd client

npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
npm run test         # Run tests (watch mode)
npm run test -- --run  # Run tests once
```

### Backend Commands

```bash
cd server

# Start development server
python -m uvicorn server.main:app --reload --port 8000

# Run all tests
python -m unittest

# Run specific test module
python -m unittest server.tests.test_learning
```

## Testing

### Frontend Testing
Tests use Vitest and React Testing Library:

```bash
cd client

# Run all tests
npm run test

# Run specific test file
npm run test -- src/lib/api.test.ts

# Run tests matching pattern
npm run test -- -t "LearningPage"
```

### Backend Testing
Tests use Python's unittest framework:

```bash
cd server

# Run all tests
python -m unittest

# Run specific module
python -m unittest server.tests.test_orchestrator

# Run specific test
python -m unittest server.tests.test_learning.TestLearningSessions.test_create_session
```

## Design System

### Colors
| Name | Value | Usage |
|------|-------|-------|
| Primary (Cyber Yellow) | `#FFD400` | Accent, buttons, highlights |
| Background | `hsl(240, 10%, 3.9%)` | Main background |
| Foreground | `hsl(0, 0%, 98%)` | Text |

### Typography
| Type | Font |
|------|------|
| Primary | Inter |
| Code | JetBrains Mono |

## Limitations

- **No Authentication** - Currently uses a placeholder user
- **No RAG** - Designed for AI-generated content without document retrieval
- **Local Database** - SQLite for simplicity; not suitable for multi-user deployment
- **Vertex AI Required** - Requires Google Cloud credentials for AI features

## Contributing

1. Follow the code style guidelines in `.planning/codebase/CONVENTIONS.md`
2. Write tests for new functionality (target >80% coverage)
3. Run linting and tests before committing
4. Update relevant documentation

## Documentation

Additional documentation available in:
- `.planning/codebase/ARCHITECTURE.md` - Technical architecture
- `.planning/PROJECT.md` - Project scope and requirements
- `.planning/ROADMAP.md` - Feature roadmap and milestones
- `conductor/product-guidelines.md` - UX/UI standards

## License

[License information to be added]

---

Built with React, FastAPI, Vertex AI, and multi-agent orchestration
