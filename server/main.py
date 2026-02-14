"""
=============================================================================
FILE: main.py
=============================================================================

PURPOSE:
FastAPI application entry point for the AgUI backend server. Initializes
the web application, configures CORS middleware, manages application
lifecycle (startup/shutdown), and registers all API route routers.

KEY COMPONENTS:
- app: FastAPI application instance with title and version metadata
- lifespan(): Async context manager handling startup/shutdown lifecycle
- root(): Health check endpoint returning server status
- health(): Detailed health check exposing Vertex AI connection status

DEPENDENCIES:
- fastapi: Web framework for building REST APIs
- fastapi.middleware.cors: Cross-origin resource sharing configuration
- server.utils.vertex_client: Vertex AI SDK initialization utilities
- server.utils.instructor_client: Instructor client singleton
- server.database.learning_persistence: Database initialization
- server.routers: API route definitions (learning_router)

USAGE PATTERN:
```bash
# Run the server
python -m uvicorn server.main:app --reload --port 8000

# Or programmatically
import uvicorn
uvicorn.run("server.main:app", host="0.0.0.0", port=8000)
```

ERROR HANDLING:
- Startup errors (DB, Vertex AI, Instructor) logged but don't crash server
- Each initialization wrapped in try/except with error logging
- Health endpoint reflects connection status for monitoring

PERFORMANCE NOTES:
- CORS configured to allow localhost:5173 (Vite dev server)
- Lifespan context ensures cleanup on shutdown
- Async initialization prevents blocking event loop

RELATED FILES:
- server/routers/learning_router.py: Main API route definitions
- server/database/learning_persistence.py: Learning data persistence
- server/utils/vertex_client.py: Vertex AI initialization
- server/utils/instructor_client.py: AI client initialization
- client/: React frontend expecting CORS access to port 8000

NOTES:
- Default port is 8000 (standard FastAPI/uvicorn default)
- CORS whitelist includes both localhost:5173 and 127.0.0.1:5173
- Health endpoint returns vertex_ai status: "connected" or "disconnected"
- Database and AI clients initialized in order during startup
- graceful shutdown logs message on context exit
=============================================================================
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from server.utils.vertex_client import init_vertex, get_vertex_status
from server.utils.instructor_client import instructor_client
from server.database.learning_persistence import learning_manager
from server.routers import learning_router
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for the FastAPI app.
    Initializes database and Vertex AI connection on startup.
    """
    logger.info("Starting AgUI Backend...")

    # Initialize database
    try:
        learning_manager.init_learning_tables()
        logger.info("Learning tables initialized successfully.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")

    # Initialize Vertex AI
    try:
        if init_vertex():
            logger.info("Vertex AI successfully initialized.")
            # Initialize InstructorClient after Vertex AI is ready
            try:
                if instructor_client.init():
                    logger.info("InstructorClient initialized successfully.")
                else:
                    logger.warning(
                        "InstructorClient initialization skipped (missing config)."
                    )
            except Exception as e:
                logger.error(f"InstructorClient initialization failed: {e}")
        else:
            logger.warning("Vertex AI initialization skipped (missing config).")
    except Exception as e:
        logger.error(f"Vertex AI initialization failed: {e}")

    yield

    logger.info("Shutting down AgUI Backend...")


app = FastAPI(title="AgUI Backend", version="1.0.0", lifespan=lifespan)

# Configure CORS
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "AgUI Backend is running"}


@app.get("/health")
async def health():
    """Health check endpoint exposing Vertex AI connection status."""
    return {
        "status": "ok",
        "services": {
            "vertex_ai": "connected" if get_vertex_status() else "disconnected"
        },
    }


# Include routers
app.include_router(learning_router)
