"""
============================================================================
FILE: persistence.py
LOCATION: server/database/persistence.py
============================================================================
PURPOSE:
    Provides shared SQLite database path configuration used by all
    persistence layers in the A2UI application.
ROLE IN PROJECT:
    Single source of truth for the database file location, imported by
    every persistence module.
    - Ensures all modules share the same SQLite database
    - Resolves path relative to this file for portability
KEY COMPONENTS:
    - DB_PATH: Path object pointing to server/data/a2ui.db
DEPENDENCIES:
    - External: pathlib
    - Internal: None
USAGE:
    ```python
    from server.database.persistence import DB_PATH
    # DB_PATH resolved relative to this file's location
    ```
============================================================================
"""

from pathlib import Path

# Database path - shared across all persistence modules
DB_PATH = Path(__file__).parent.parent / "data" / "a2ui.db"
