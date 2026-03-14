"""
============================================================================
FILE: database/__init__.py
LOCATION: server/database/__init__.py
============================================================================
PURPOSE:
    Database persistence module entry point. Re-exports the shared
    database path constant for convenient imports.
ROLE IN PROJECT:
    Namespace package marker for the database module.
    - Provides a clean public API surface for the database package
    - Allows imports from server.database without knowing internals
KEY COMPONENTS:
    - DB_PATH: Re-exported Path object pointing to server/data/agui.db
DEPENDENCIES:
    - External: None
    - Internal: server.database.persistence
USAGE:
    ```python
    from server.database import DB_PATH
    ```
============================================================================
"""

from server.database.persistence import DB_PATH

__all__ = ["DB_PATH"]
