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
    - External: fastapi, uvicorn, watchdog
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
import sys
import os
import time
import signal
import subprocess
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Auto-reload configuration
AUTO_RELOAD = os.getenv("AUTO_RELOAD", "true").lower() in ("true", "1", "yes")
RELOAD_DELAY = float(
    os.getenv("RELOAD_DELAY", "1.0")
)  # seconds to wait before restarting
WATCH_PATHS = ["server"]
IGNORE_PATTERNS = ["__pycache__", "*.pyc", ".git", "*.log", "*.db"]


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



class ReloaderHandler:
    """Simple file change handler that triggers a restart."""

    def __init__(self):
        self.last_reload = time.time()
        self.should_reload = False

    def on_any_event(self, event):
        """Handle any file system event."""
        if event.is_directory:
            return

        # Only reload on Python file changes
        if not event.src_path.endswith(".py"):
            return

        # Debounce: don't reload too frequently
        current_time = time.time()
        if current_time - self.last_reload < RELOAD_DELAY:
            return

        # Ignore patterns
        for pattern in IGNORE_PATTERNS:
            if pattern in event.src_path:
                return

        logger.info(f"Detected change in: {event.src_path}")
        self.should_reload = True
        self.last_reload = current_time


def start_file_watcher():
    """Start the file watcher in a separate process."""
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler

        class EventHandler(FileSystemEventHandler):
            def __init__(self, handler):
                self.handler = handler

            def on_modified(self, event):
                self.handler.on_any_event(event)

            def on_created(self, event):
                self.handler.on_any_event(event)

        handler = ReloaderHandler()
        event_handler = EventHandler(handler)
        observer = Observer()

        # Get the project root (parent of server directory)
        project_root = Path(__file__).parent.parent

        for watch_path in WATCH_PATHS:
            full_path = project_root / watch_path
            if full_path.exists():
                observer.schedule(event_handler, str(full_path), recursive=True)
                logger.info(f"Watching for changes in: {full_path}")

        observer.start()
        return observer, handler
    except ImportError:
        logger.warning("watchdog not installed. Install with: pip install watchdog")
        return None, None


def run_server():
    """Run the uvicorn server."""
    import uvicorn

    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # We handle reloading ourselves
        log_level="info",
    )


def main():
    """Main entry point with auto-reload support."""
    if not AUTO_RELOAD:
        logger.info("Auto-reload disabled. Starting server...")
        run_server()
        return

    logger.info("Auto-reload enabled. Starting server with file watcher...")

    # Start file watcher
    observer, handler = start_file_watcher()

    if observer is None:
        logger.info(
            "File watcher not available. Starting server without auto-reload..."
        )
        run_server()
        return

    try:
        while True:
            # Start server in a subprocess
            logger.info("Starting server...")
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    "from server.main import run_server; run_server()",
                ],
                cwd=Path(__file__).parent.parent,
                env={**os.environ, "AUTO_RELOAD": "false"},  # Disable nested reloading
            )

            # Monitor for file changes
            while process.poll() is None:
                time.sleep(0.5)
                if handler and handler.should_reload:
                    logger.info("Code change detected. Restarting server...")
                    handler.should_reload = False

                    # Gracefully terminate the server
                    if sys.platform == "win32":
                        process.terminate()
                    else:
                        process.send_signal(signal.SIGTERM)

                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        logger.warning("Server didn't stop gracefully, forcing...")
                        process.kill()

                    break

            # If server exited on its own (not due to reload), exit the loop
            if process.poll() is not None and not (handler and handler.should_reload):
                exit_code = process.returncode
                logger.info(f"Server exited with code {exit_code}")
                break

            # Wait a bit before restarting
            time.sleep(0.5)

    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt. Shutting down...")
        if "process" in locals() and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
    finally:
        if observer:
            observer.stop()
            observer.join()


if __name__ == "__main__":
    main()
