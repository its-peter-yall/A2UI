"""
============================================================================
FILE: main.py
LOCATION: server/main.py
============================================================================
PURPOSE:
    FastAPI application entry point. Initializes the web application,
    configures CORS middleware, manages application lifecycle, and registers
    all API route routers.
ROLE IN PROJECT:
    Top-level server entry point that wires together all backend components.
    - Bootstraps database and OpenRouter integration on startup
    - Mounts all API routers and exposes health check endpoints
KEY COMPONENTS:
    - app: FastAPI application instance with title and version metadata
    - lifespan(): Async context manager handling startup/shutdown lifecycle
    - root(): Root endpoint returning server status
    - health(): Detailed health check exposing OpenRouter status
DEPENDENCIES:
    - External: fastapi, uvicorn
    - Internal: server.utils.instructor_client,
              server.database.learning_persistence, server.routers
USAGE:
    ```bash
    python -m uvicorn server.main:app --reload --port 8000
    ```
============================================================================
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from server.database.learning_persistence import learning_manager
from server.routers import learning_router, llm_router
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for the FastAPI app.
    Initializes database on startup.
    """
    logger.info("Starting A2UI Backend...")

    # Initialize database
    try:
        learning_manager.init_learning_tables()
        logger.info("Learning tables initialized successfully.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")

    yield

    logger.info("Shutting down A2UI Backend...")


app = FastAPI(title="A2UI Backend", version="1.0.0", lifespan=lifespan)

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
    return {"message": "A2UI Backend is running"}


@app.get("/health")
async def health():
    """Health check endpoint exposing provider status."""
    return {
        "status": "ok",
        "services": {
            "openrouter": "enabled",
            "generalcompute": "enabled",
        },
    }


# Include routers
app.include_router(learning_router)
app.include_router(llm_router)
