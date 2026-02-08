"""SQLite database configuration.

Provides the database path used by both chat and learning persistence layers.
Learning persistence depends on this module for DB_PATH.

@see: server/database/learning_persistence.py
"""

from pathlib import Path

# Database path - shared across all persistence modules
DB_PATH = Path(__file__).parent.parent / "data" / "agui.db"
