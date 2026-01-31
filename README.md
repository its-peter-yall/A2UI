# AgUI - Agentic UI

A modern, session-based chat interface for direct interaction with Google's Gemini AI models via Vertex AI.

AgUI (Agentic UI) is a lightweight, standalone "Pure Chat" application designed for researchers and students who need a reliable, distraction-free interface for AI interaction. It serves as a reference implementation for Vertex AI integration using React and FastAPI.
## Features

- **Session Management** - Create, list, rename, pin, and delete chat sessions
- **Persistent Chat History** - All messages stored in SQLite database
- **Markdown Rendering** - Full markdown support with syntax highlighting
- **Thinking Mode Visualization** - Display model's reasoning process when available
- **Responsive Design** - Mobile-friendly with collapsible sidebar
- **Dark Theme** - Optimized for long sessions with "Cyber Yellow" accent

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript 5.9 | Type safety |
| Vite 7 | Build tool & dev server |
| Tailwind CSS 4 | Styling |
| TanStack Query 5 | Server state management |
| Axios | HTTP client |
| React Markdown | Markdown rendering |
| Lucide React | Icons |
| Vitest | Testing |

### Backend
| Technology | Purpose |
|------------|---------|
| FastAPI | Web framework |
| Uvicorn | ASGI server |
| Pydantic v2 | Data validation |
| SQLite | Data persistence |
| Vertex AI SDK | Google AI integration |

## Project Structure

```
AgUI/
├── client/                      # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── main.tsx            # Entry point
│   │   ├── App.tsx             # Root component
│   │   ├── components/         # Reusable UI components
│   │   ├── features/chat/      # Chat feature module
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # Utilities and API client
│   │   ├── providers/          # Context providers
│   │   └── types/              # TypeScript definitions
│   └── package.json
│
├── server/                      # Backend (FastAPI + Python)
│   ├── main.py                 # FastAPI app entry point
│   ├── config.py               # Environment configuration
│   ├── routers/                # API route handlers
│   ├── schemas/                # Pydantic models
│   ├── database/               # SQLite persistence layer
│   ├── utils/                  # Vertex AI client
│   └── tests/                  # Unit tests
│
├── conductor/                   # Project documentation
│   ├── product.md              # Product definition
│   ├── tech-stack.md           # Technology decisions
│   └── code_styleguides/       # Code style guides
│
├── AGENTS.md                    # AI agent instructions
└── run.bat                      # Windows startup script
```

## Prerequisites

- **Node.js 18+** (for frontend)
- **Python 3.10+** (for backend)
- **Google Cloud Project** with Vertex AI API enabled
- **Service Account** with Vertex AI User permissions

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd AgUI
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

## API Reference

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Root endpoint - confirms API is running |
| `GET` | `/health` | Health check with Vertex AI status |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions` | Create a new session |
| `GET` | `/sessions` | List all sessions (`limit`, `offset` supported) |
| `GET` | `/sessions/{id}` | Get session with message history |
| `PATCH` | `/sessions/{id}` | Update session title/pin status |
| `DELETE` | `/sessions/{id}` | Delete session and all messages |
| `GET` | `/sessions/{id}/messages` | Get session messages |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/chat` | Send message and get AI response |

#### Chat Request

```json
{
  "session_id": "string (optional - creates new if omitted)",
  "message": "string (required)",
  "model": "string (default: gemini-2.0-flash-001)"
}
```

#### Chat Response

```json
{
  "session_id": "string",
  "message": {
    "id": "string",
    "session_id": "string",
    "role": "model",
    "content": "string",
    "thinking_content": "string | null",
    "timestamp": "ISO 8601 string"
  },
  "thinking_content": "string | null"
}
```

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
python -m unittest server.tests.test_chat

# Run specific test case
python -m unittest server.tests.test_chat.ChatSessionTests.test_valid_chat_request
```

### Code Style

This project follows strict code style guidelines:

- **TypeScript**: Strict mode enabled, no `any` types
- **Python**: PEP 8 compliant, type hints required for public APIs
- **CSS**: Tailwind CSS with custom design tokens

See `conductor/code_styleguides/` for detailed guidelines.

## Data Models

### Session

```typescript
interface Session {
  id: string;              // UUID
  title: string;           // 1-200 characters
  is_pinned: boolean;
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
  message_count: number;
}
```

### Message

```typescript
interface Message {
  id: string;              // UUID
  session_id: string;      // UUID
  role: 'user' | 'model';
  content: string;
  thinking_content: string | null;
  timestamp: string;       // ISO 8601
}
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
npm run test -- -t "QueryProvider"
```

### Backend Testing

Tests use Python's unittest framework:

```bash
cd server

# Run all tests
python -m unittest

# Run specific module
python -m unittest server.tests.test_sessions

# Run specific test
python -m unittest server.tests.test_sessions.SessionTests.test_create_session
```

## Troubleshooting

### Common Issues

**1. Vertex AI Authentication Error**

```
Error: Could not automatically determine credentials
```

**Solution**: Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to a valid service account JSON file with Vertex AI permissions.

**2. CORS Errors**

**Solution**: The backend is configured to allow `http://localhost:5173`. If using a different port, update `server/main.py`.

**3. Database Locked Error**

**Solution**: Ensure only one instance of the backend is running. The SQLite database file is located at `server/data/agui.db`.

**4. Port Already in Use**

```bash
# Find process using port (Windows)
netstat -ano | findstr :8000

# Find process using port (macOS/Linux)
lsof -i :8000
```

## Limitations

- **No Authentication** - Currently uses a placeholder user
- **No RAG** - Designed for direct AI interaction without document retrieval
- **Local Database** - SQLite for simplicity; not suitable for multi-user deployment
- **Vertex AI Required** - Requires Google Cloud credentials for AI responses

## Documentation

Additional documentation is available in the `conductor/` directory:

| File | Description |
|------|-------------|
| `product.md` | Product definition and vision |
| `product-guidelines.md` | UX/UI standards |
| `tech-stack.md` | Technology decisions |
| `workflow.md` | Development workflow |
| `code_styleguides/` | Language-specific style guides |

## Contributing

1. Follow the code style guidelines in `conductor/code_styleguides/`
2. Write tests for new functionality
3. Run linting and tests before committing
4. Use conventional commit messages

## License

[License information to be added]

---

Built with React, FastAPI, and Vertex AI
