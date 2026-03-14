"""
============================================================================
FILE: __init__.py
LOCATION: server/__init__.py
============================================================================
PURPOSE:
    Package root for the AgUI backend server. Acts as the namespace package
    containing FastAPI application, configuration, routers, services, utils,
    and database modules.
ROLE IN PROJECT:
    Marks the server directory as a Python package for module resolution.
    - Enables `python -m uvicorn server.main:app` execution
    - Provides the top-level namespace for all server submodules
KEY COMPONENTS:
    - main: FastAPI application module (app instance, routes, lifecycle)
    - config: Environment configuration and settings management
    - routers: API endpoint definitions
    - services: Business logic layer
    - utils: AI client wrappers
    - database: Persistence layer
DEPENDENCIES:
    - External: None
    - Internal: server.main, server.config, server.routers, server.services,
              server.utils, server.database
USAGE:
    ```bash
    python -m uvicorn server.main:app --reload --port 8000
    ```
============================================================================
"""
