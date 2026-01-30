"""SQLite persistence layer for session and message management."""

import sqlite3
import uuid
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Database path
DB_PATH = Path(__file__).parent.parent / "data" / "agui.db"


class SessionManager:
    """Manages SQLite database operations for sessions and messages."""

    def __init__(self, db_path: Optional[Path] = None):
        """Initialize the SessionManager with a database path."""
        self.db_path = db_path or DB_PATH
        # Ensure the data directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_connection(self) -> sqlite3.Connection:
        """Get a database connection with row factory."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        """Initialize the database with sessions and messages tables."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # Create sessions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Create messages table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user', 'model')),
                    content TEXT NOT NULL,
                    thinking_content TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                )
            """)

            # Create indexes for better query performance
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_session_id 
                ON messages(session_id)
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
                ON messages(timestamp)
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_updated_at 
                ON sessions(updated_at DESC)
            """)

            conn.commit()
            logger.info("Database initialized successfully")

        except sqlite3.Error as e:
            logger.error(f"Error initializing database: {e}")
            raise
        finally:
            conn.close()

    def create_session(self, title: str) -> Dict[str, Any]:
        """Create a new session and return the session data."""
        conn = self._get_connection()
        try:
            session_id = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()

            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO sessions (id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, title, now, now),
            )
            conn.commit()

            logger.info(f"Created session: {session_id} - {title}")

            return {
                "id": session_id,
                "title": title,
                "created_at": now,
                "updated_at": now,
                "message_count": 0,
            }

        except sqlite3.Error as e:
            logger.error(f"Error creating session: {e}")
            raise
        finally:
            conn.close()

    def list_sessions(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """List all sessions sorted by most recently updated."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT 
                    s.id, 
                    s.title, 
                    s.created_at, 
                    s.updated_at,
                    COUNT(m.id) as message_count
                FROM sessions s
                LEFT JOIN messages m ON s.id = m.session_id
                GROUP BY s.id
                ORDER BY s.updated_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            )

            sessions = []
            for row in cursor.fetchall():
                sessions.append(
                    {
                        "id": row["id"],
                        "title": row["title"],
                        "created_at": row["created_at"],
                        "updated_at": row["updated_at"],
                        "message_count": row["message_count"],
                    }
                )

            return sessions

        except sqlite3.Error as e:
            logger.error(f"Error listing sessions: {e}")
            raise
        finally:
            conn.close()

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a single session by ID."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT 
                    s.id, 
                    s.title, 
                    s.created_at, 
                    s.updated_at,
                    COUNT(m.id) as message_count
                FROM sessions s
                LEFT JOIN messages m ON s.id = m.session_id
                WHERE s.id = ?
                GROUP BY s.id
                """,
                (session_id,),
            )

            row = cursor.fetchone()
            if row:
                return {
                    "id": row["id"],
                    "title": row["title"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "message_count": row["message_count"],
                }
            return None

        except sqlite3.Error as e:
            logger.error(f"Error getting session: {e}")
            raise
        finally:
            conn.close()

    def update_session(self, session_id: str, title: str) -> Optional[Dict[str, Any]]:
        """Update a session's title and return the updated session."""
        conn = self._get_connection()
        try:
            now = datetime.utcnow().isoformat()

            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE sessions 
                SET title = ?, updated_at = ?
                WHERE id = ?
                """,
                (title, now, session_id),
            )

            if cursor.rowcount == 0:
                return None

            conn.commit()
            logger.info(f"Updated session: {session_id}")

            return self.get_session(session_id)

        except sqlite3.Error as e:
            logger.error(f"Error updating session: {e}")
            raise
        finally:
            conn.close()

    def delete_session(self, session_id: str) -> bool:
        """Delete a session and all its messages."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))

            deleted = cursor.rowcount > 0
            conn.commit()

            if deleted:
                logger.info(f"Deleted session: {session_id}")

            return deleted

        except sqlite3.Error as e:
            logger.error(f"Error deleting session: {e}")
            raise
        finally:
            conn.close()

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        thinking_content: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Add a message to a session and return the message data."""
        conn = self._get_connection()
        try:
            message_id = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()

            cursor = conn.cursor()

            # First verify the session exists
            cursor.execute("SELECT id FROM sessions WHERE id = ?", (session_id,))
            if not cursor.fetchone():
                raise ValueError(f"Session not found: {session_id}")

            # Insert the message
            cursor.execute(
                """
                INSERT INTO messages (id, session_id, role, content, thinking_content, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (message_id, session_id, role, content, thinking_content, now),
            )

            # Update the session's updated_at timestamp
            cursor.execute(
                """
                UPDATE sessions 
                SET updated_at = ?
                WHERE id = ?
                """,
                (now, session_id),
            )

            conn.commit()

            logger.info(f"Added message to session {session_id}: {message_id}")

            return {
                "id": message_id,
                "session_id": session_id,
                "role": role,
                "content": content,
                "thinking_content": thinking_content,
                "timestamp": now,
            }

        except sqlite3.Error as e:
            logger.error(f"Error adding message: {e}")
            raise
        finally:
            conn.close()

    def get_history(self, session_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get message history for a session."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT 
                    id, 
                    session_id, 
                    role, 
                    content, 
                    thinking_content, 
                    timestamp
                FROM messages
                WHERE session_id = ?
                ORDER BY timestamp ASC
                LIMIT ?
                """,
                (session_id, limit),
            )

            messages = []
            for row in cursor.fetchall():
                messages.append(
                    {
                        "id": row["id"],
                        "session_id": row["session_id"],
                        "role": row["role"],
                        "content": row["content"],
                        "thinking_content": row["thinking_content"],
                        "timestamp": row["timestamp"],
                    }
                )

            return messages

        except sqlite3.Error as e:
            logger.error(f"Error getting history: {e}")
            raise
        finally:
            conn.close()

    def get_message_count(self, session_id: str) -> int:
        """Get the number of messages in a session."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) FROM messages WHERE session_id = ?", (session_id,)
            )

            return cursor.fetchone()[0]

        except sqlite3.Error as e:
            logger.error(f"Error getting message count: {e}")
            raise
        finally:
            conn.close()


# Global instance
session_manager = SessionManager()
