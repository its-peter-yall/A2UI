"""
=============================================================================
FILE: persistence.py
=============================================================================

PURPOSE:
Provides shared SQLite database path configuration used by all persistence
layers in the AgUI application. This is the single source of truth for the
database location, enabling all modules to access the same SQLite database.

KEY COMPONENTS:
- DB_PATH: Path object pointing to server/data/agui.db

DEPENDENCIES:
- pathlib.Path: For cross-platform path construction

USAGE PATTERN:
```python
from server.database.persistence import DB_PATH
# DB_PATH is automatically resolved relative to this file's location
```

ERROR HANDLING:
- Path may not exist until first database write operation
- No exceptions raised at import time

PERFORMANCE NOTES:
- Minimal overhead - single Path object construction at import
- Path is resolved once at module load time

RELATED FILES:
- server/database/learning_persistence.py: Uses DB_PATH for learning data
- server/database/__init__.py: Re-exports DB_PATH for convenience

NOTES:
- Database directory (data/) is created automatically on first write
- All persistence modules share this single database file
- Path uses parent-relative resolution to work in any deployment location
=============================================================================
"""

from pathlib import Path

# Database path - shared across all persistence modules
DB_PATH = Path(__file__).parent.parent / "data" / "agui.db"
