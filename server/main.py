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
- AutoReloader: File watcher that restarts server on code changes

DEPENDENCIES:
- fastapi: Web framework for building REST APIs
- fastapi.middleware.cors: Cross-origin resource sharing configuration
- server.utils.vertex_client: Vertex AI SDK initialization utilities
- server.utils.instructor_client: Instructor client singleton
- server.database.learning_persistence: Database initialization
- server.routers: API route definitions (learning_router)
- watchdog: File system monitoring for auto-reload

USAGE PATTERN:
```bash
# Run the server (auto-reload enabled by default)
python server/main.py

# Or with uvicorn directly
python -m uvicorn server.main:app --reload --port 8000
```

ERROR HANDLING:
- Startup errors (DB, Vertex AI, Instructor) logged but don't crash server
- Each initialization wrapped in try/except with error logging
- Health endpoint reflects connection status for monitoring

PERFORMANCE NOTES:
- CORS configured to allow localhost:5173 (Vite dev server)
- Lifespan context ensures cleanup on shutdown
- Async initialization prevents blocking event loop
- File watcher ignores common non-Python directories

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
- Auto-reload monitors all .py files in server/ directory
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
RELOAD_DELAY = float(os.getenv("RELOAD_DELAY", "1.0"))  # seconds to wait before restarting
WATCH_PATHS = ["server"]
IGNORE_PATTERNS = ["__pycache__", "*.pyc", ".git", "*.log", "*.db"]


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
        if not event.src_path.endswith('.py'):
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
        log_level="info"
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
        logger.info("File watcher not available. Starting server without auto-reload...")
        run_server()
        return
    
    try:
        while True:
            # Start server in a subprocess
            logger.info("Starting server...")
            process = subprocess.Popen(
                [sys.executable, "-c", 
                 "from server.main import run_server; run_server()"],
                cwd=Path(__file__).parent.parent,
                env={**os.environ, "AUTO_RELOAD": "false"}  # Disable nested reloading
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
        if 'process' in locals() and process.poll() is None:
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
