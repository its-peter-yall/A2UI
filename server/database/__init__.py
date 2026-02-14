"""
=============================================================================
FILE: __init__.py
=============================================================================

PURPOSE:
Database persistence module entry point. Re-exports the shared database
path constant for convenient imports throughout the application. Provides
a clean public API surface for the database package.

KEY COMPONENTS:
- DB_PATH: Re-exported Path object pointing to server/data/agui.db

DEPENDENCIES:
- server.database.persistence: Internal module containing actual DB_PATH definition

USAGE PATTERN:
```python
# Preferred import style for database path
from server.database import DB_PATH

# Alternative - direct import
from server.database.persistence import DB_PATH
```

ERROR HANDLING:
- No additional error handling beyond what persistence.py provides
- Import-time errors will propagate if persistence.py has issues

PERFORMANCE NOTES:
- Negligible overhead - simple re-export of existing Path object
- No additional initialization or side effects

RELATED FILES:
- server/database/persistence.py: Original source of DB_PATH definition

NOTES:
- This module exists for import convenience and API consistency
- Allows imports from server.database without knowing internal structure
- Minimal module by design - avoid adding dependencies here
=============================================================================
"""

from server.database.persistence import DB_PATH

__all__ = ["DB_PATH"]
