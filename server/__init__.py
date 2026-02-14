"""
=============================================================================
FILE: server/__init__.py
=============================================================================

PURPOSE:
Package root for the AgUI backend server. Acts as the namespace package
containing FastAPI application, configuration, routers, services, utils,
and database modules. Provides a single entry point for running the server.

KEY COMPONENTS:
- main: FastAPI application module (app instance, routes, lifecycle)
- config: Environment configuration and settings management
- routers: API endpoint definitions (chat, learning)
- services: Business logic layer (course orchestration, agents)
- utils: AI client wrappers (Vertex AI, Instructor)
- database: Persistence layer (SQLAlchemy models, connection)

DEPENDENCIES:
- server.main: Main application entry point
- server.config: Settings class and environment loading
- server.routers: API route modules
- server.services: Business logic modules
- server.utils: Utility modules for AI integration
- server.database: Database models and persistence

USAGE PATTERN:
```bash
# Run server from project root
cd AgUI
python -m uvicorn server.main:app --reload --port 8000

# Or import for programmatic use
from server.main import app
```

ERROR HANDLING:
- See individual module documentation for specific error behavior

PERFORMANCE NOTES:
- Module imports trigger configuration loading via load_dotenv()
- Lazy initialization pattern for AI clients and database
- Application lifespan manages startup/shutdown resources

RELATED FILES:
- server/main.py: FastAPI application with routes and lifecycle
- server/config.py: Environment variable configuration
- server/routers/: API endpoint definitions
- server/services/: Business logic and orchestration
- server/utils/: AI client integrations
- server/database/: Data persistence layer

NOTES:
- This __init__.py serves as a namespace package marker
- Primary purpose is enabling `python -m server.main` execution
- All actual functionality lives in the submodules
- Import from submodules for type hints and explicit dependencies
=============================================================================
"""
