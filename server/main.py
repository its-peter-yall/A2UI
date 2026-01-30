# main.py
# Entry point for the AgUI backend

# Initializes the FastAPI application, configures CORS for the frontend,
# and serves as the central hub for route registration.

# @see: routers/ (future)
# @note: Runs on port 8000 by default

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from server.utils.vertex_client import init_vertex, get_vertex_status
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for the FastAPI app.
    Initializes Vertex AI connection on startup.
    """
    logger.info("Starting AgUI Backend...")
    try:
        if init_vertex():
            logger.info("Vertex AI successfully initialized.")
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
