# learning_persistence.py
# SQLite persistence layer for retrieval-based learning sessions and nodes

# Longer description (2-4 lines):
# - Manages learning session, concept node, and quiz data tables in SQLite.
# - Provides CRUD helpers for learning sessions and node progression.
# - Enforces foreign key constraints and ordering via indexes.

# @see: server/database/persistence.py - Session/message persistence pattern
# @note: Quiz payloads are stored as JSON strings and parsed on access

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server.database.persistence import DB_PATH
from server.schemas.learning import NodeStatus, QuizCard

logger = logging.getLogger(__name__)


class LearningManager:
    """Manages SQLite persistence for learning sessions and concept nodes."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def init_learning_tables(self) -> None:
        """Create learning tables if they do not exist."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    query TEXT NOT NULL,
                    course_title TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS concept_nodes (
                    id TEXT PRIMARY KEY,
                    learning_session_id TEXT NOT NULL,
                    sequence_index INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    content_markdown TEXT NOT NULL,
                    status TEXT NOT NULL,
                    error_message TEXT,
                    retry_available INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (learning_session_id)
                        REFERENCES learning_sessions(id)
                        ON DELETE CASCADE
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS quiz_data (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id)
                        REFERENCES concept_nodes(id)
                        ON DELETE CASCADE
                )
                """
            )

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_id
                ON learning_sessions(user_id)
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_concept_nodes_session_id
                ON concept_nodes(learning_session_id)
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_concept_nodes_sequence
                ON concept_nodes(learning_session_id, sequence_index)
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_quiz_data_node_id
                ON quiz_data(node_id)
                """
            )

            # Quiz attempts table for mastery tracking
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS quiz_attempts (
                    id TEXT PRIMARY KEY,
                    node_id TEXT NOT NULL,
                    attempt_number INTEGER NOT NULL,
                    selected_option_id TEXT NOT NULL,
                    is_correct INTEGER NOT NULL,
                    score_percent INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (node_id)
                        REFERENCES concept_nodes(id)
                        ON DELETE CASCADE
                )
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_quiz_attempts_node_id
                ON quiz_attempts(node_id)
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_quiz_attempts_node_attempt
                ON quiz_attempts(node_id, attempt_number)
                """
            )

            self._ensure_concept_node_columns(conn)

            conn.commit()
            logger.info("Learning tables initialized successfully")
        except sqlite3.Error as e:
            logger.error(f"Error initializing learning tables: {e}")
            raise
        finally:
            conn.close()

    def create_learning_session(
        self, query: str, course_title: str, user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        conn = self._get_connection()
        try:
            session_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO learning_sessions (id, user_id, query, course_title, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (session_id, user_id, query, course_title, now, now),
            )
            conn.commit()
            logger.info(f"Created learning session: {session_id}")
            return {
                "id": session_id,
                "user_id": user_id,
                "query": query,
                "course_title": course_title,
                "created_at": now,
                "updated_at": now,
                "total_nodes": 0,
                "completed_nodes": 0,
            }
        except sqlite3.Error as e:
            logger.error(f"Error creating learning session: {e}")
            raise
        finally:
            conn.close()

    def get_learning_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    ls.id,
                    ls.user_id,
                    ls.query,
                    ls.course_title,
                    ls.created_at,
                    ls.updated_at,
                    COUNT(cn.id) AS total_nodes,
                    SUM(CASE WHEN cn.status = ? THEN 1 ELSE 0 END) AS completed_nodes
                FROM learning_sessions ls
                LEFT JOIN concept_nodes cn ON ls.id = cn.learning_session_id
                WHERE ls.id = ?
                GROUP BY ls.id
                """,
                (NodeStatus.COMPLETED.value, session_id),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "user_id": row["user_id"],
                "query": row["query"],
                "course_title": row["course_title"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "total_nodes": row["total_nodes"],
                "completed_nodes": row["completed_nodes"] or 0,
            }
        except sqlite3.Error as e:
            logger.error(f"Error getting learning session: {e}")
            raise
        finally:
            conn.close()

    def create_concept_node(
        self,
        session_id: str,
        sequence_index: int,
        title: str,
        content_markdown: str,
        status: NodeStatus,
        quiz: Optional[QuizCard] = None,
        error_message: Optional[str] = None,
        retry_available: bool = False,
    ) -> Dict[str, Any]:
        """Create a new concept node for a learning session.

        Callers must provide the correct initial status:
        - NodeStatus.VIEWING_EXPLANATION for the first node (sequence_index=0)
        - NodeStatus.LOCKED for subsequent nodes (sequence_index>0)
        """
        conn = self._get_connection()
        try:
            node_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            cursor = conn.cursor()
            if not self._learning_session_exists(session_id, conn):
                raise ValueError(f"Learning session not found: {session_id}")
            cursor.execute(
                """
                INSERT INTO concept_nodes (
                    id, learning_session_id, sequence_index, title, content_markdown,
                    status, error_message, retry_available, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    node_id,
                    session_id,
                    sequence_index,
                    title,
                    content_markdown,
                    status.value,
                    error_message,
                    int(retry_available),
                    now,
                    now,
                ),
            )

            quiz_payload = None
            if quiz is not None:
                quiz_payload = quiz.model_dump()
                cursor.execute(
                    """
                    INSERT INTO quiz_data (id, node_id, payload, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (str(uuid.uuid4()), node_id, json.dumps(quiz_payload), now),
                )

            conn.commit()
            logger.info(f"Created concept node: {node_id}")
            return {
                "id": node_id,
                "learning_session_id": session_id,
                "sequence_index": sequence_index,
                "title": title,
                "content_markdown": content_markdown,
                "status": status.value,
                "error_message": error_message,
                "retry_available": retry_available,
                "created_at": now,
                "updated_at": now,
                "quiz": quiz_payload,
            }
        except sqlite3.Error as e:
            logger.error(f"Error creating concept node: {e}")
            raise
        finally:
            conn.close()

    def _learning_session_exists(
        self, session_id: str, conn: sqlite3.Connection
    ) -> bool:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id FROM learning_sessions WHERE id = ?
            """,
            (session_id,),
        )
        return cursor.fetchone() is not None

    def get_session_nodes(self, session_id: str) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    cn.id,
                    cn.learning_session_id,
                    cn.sequence_index,
                    cn.title,
                    cn.content_markdown,
                    cn.status,
                    cn.error_message,
                    cn.retry_available,
                    cn.created_at,
                    cn.updated_at,
                    qd.payload AS quiz_payload
                FROM concept_nodes cn
                LEFT JOIN quiz_data qd ON cn.id = qd.node_id
                WHERE cn.learning_session_id = ?
                ORDER BY cn.sequence_index ASC
                """,
                (session_id,),
            )
            nodes = []
            for row in cursor.fetchall():
                quiz_payload = (
                    json.loads(row["quiz_payload"]) if row["quiz_payload"] else None
                )
                nodes.append(
                    {
                        "id": row["id"],
                        "learning_session_id": row["learning_session_id"],
                        "sequence_index": row["sequence_index"],
                        "title": row["title"],
                        "content_markdown": row["content_markdown"],
                        "status": row["status"],
                        "error_message": row["error_message"],
                        "retry_available": bool(row["retry_available"])
                        if row["retry_available"] is not None
                        else False,
                        "created_at": row["created_at"],
                        "updated_at": row["updated_at"],
                        "quiz": quiz_payload,
                    }
                )
            return nodes
        except sqlite3.Error as e:
            logger.error(f"Error getting session nodes: {e}")
            raise
        finally:
            conn.close()

    def update_node_status(
        self, node_id: str, status: NodeStatus
    ) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            now = datetime.now(timezone.utc).isoformat()
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT status
                FROM concept_nodes
                WHERE id = ?
                """,
                (node_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            current_status = NodeStatus(row["status"])
            logger.info(
                f"Transition attempt: {current_status.value} -> {status.value} for node {node_id}"
            )
            if not self._is_valid_transition(current_status, status):
                logger.error(
                    f"Invalid transition: {current_status.value} -> {status.value}"
                )
                raise ValueError(
                    "Invalid status transition from "
                    f"{current_status.value} to {status.value}"
                )
            cursor.execute(
                """
                UPDATE concept_nodes
                SET status = ?, updated_at = ?
                WHERE id = ? AND status = ?
                """,
                (status.value, now, node_id, current_status.value),
            )
            if cursor.rowcount == 0:
                node = self._get_node_by_id(node_id, conn)
                if node is None:
                    return None
                raise ValueError("Node status changed during update; retry")
            conn.commit()
            return self._get_node_by_id(node_id, conn)
        except sqlite3.Error as e:
            logger.error(f"Error updating node status: {e}")
            raise
        finally:
            conn.close()

    def update_node_content(
        self,
        node_id: str,
        content_markdown: str,
        status: NodeStatus,
        quiz: Optional[QuizCard],
        error_message: Optional[str] = None,
        retry_available: bool = False,
    ) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            now = datetime.now(timezone.utc).isoformat()
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT status
                FROM concept_nodes
                WHERE id = ?
                """,
                (node_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            current_status = NodeStatus(row["status"])
            if not self._is_valid_transition(current_status, status):
                raise ValueError(
                    "Invalid status transition from "
                    f"{current_status.value} to {status.value}"
                )
            cursor.execute(
                """
                UPDATE concept_nodes
                SET content_markdown = ?, status = ?, error_message = ?,
                    retry_available = ?, updated_at = ?
                WHERE id = ? AND status = ?
                """,
                (
                    content_markdown,
                    status.value,
                    error_message,
                    int(retry_available),
                    now,
                    node_id,
                    current_status.value,
                ),
            )
            if cursor.rowcount == 0:
                node = self._get_node_by_id(node_id, conn)
                if node is None:
                    return None
                raise ValueError("Node status changed during update; retry")

            if quiz is None:
                cursor.execute(
                    """
                    DELETE FROM quiz_data
                    WHERE node_id = ?
                    """,
                    (node_id,),
                )
            else:
                quiz_payload = json.dumps(quiz.model_dump())
                cursor.execute(
                    """
                    SELECT id
                    FROM quiz_data
                    WHERE node_id = ?
                    """,
                    (node_id,),
                )
                quiz_row = cursor.fetchone()
                if quiz_row:
                    cursor.execute(
                        """
                        UPDATE quiz_data
                        SET payload = ?
                        WHERE node_id = ?
                        """,
                        (quiz_payload, node_id),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO quiz_data (id, node_id, payload, created_at)
                        VALUES (?, ?, ?, ?)
                        """,
                        (str(uuid.uuid4()), node_id, quiz_payload, now),
                    )

            conn.commit()
            return self._get_node_by_id(node_id, conn)
        except sqlite3.Error as e:
            logger.error(f"Error updating node content: {e}")
            raise
        finally:
            conn.close()

    @staticmethod
    def _is_valid_transition(
        current_status: NodeStatus, next_status: NodeStatus
    ) -> bool:
        """Validate state transitions for the sequential learning flow.

        Valid transitions:
            LOCKED → VIEWING_EXPLANATION (unlock when previous completed)
            VIEWING_EXPLANATION → IN_QUIZ (user clicks "proceed to quiz")
            VIEWING_EXPLANATION → ERROR (generation failed)
            IN_QUIZ → SHOWING_FEEDBACK (quiz submitted)
            SHOWING_FEEDBACK → IN_QUIZ (retry quiz, score < 100%)
            SHOWING_FEEDBACK → COMPLETED (score = 100%)
            ERROR → LOCKED (reset for retry)
            ERROR → VIEWING_EXPLANATION (regeneration succeeded)

        Note: First node starts as VIEWING_EXPLANATION (not LOCKED).
        """
        if current_status == next_status:
            return True
        allowed = {
            NodeStatus.LOCKED: {
                NodeStatus.VIEWING_EXPLANATION,  # Unlocked by previous completion
                NodeStatus.ERROR,
            },
            NodeStatus.VIEWING_EXPLANATION: {
                NodeStatus.IN_QUIZ,  # User clicks "proceed to quiz"
                NodeStatus.ERROR,
            },
            NodeStatus.IN_QUIZ: {
                NodeStatus.SHOWING_FEEDBACK,  # Quiz submitted
                NodeStatus.ERROR,
            },
            NodeStatus.SHOWING_FEEDBACK: {
                NodeStatus.IN_QUIZ,  # Retry (score < 100%)
                NodeStatus.COMPLETED,  # Mastered (score = 100%)
            },
            NodeStatus.COMPLETED: set(),  # Terminal state
            NodeStatus.ERROR: {
                NodeStatus.LOCKED,  # Reset
                NodeStatus.VIEWING_EXPLANATION,  # Regeneration succeeded
            },
        }
        return next_status in allowed[current_status]

    def get_next_node(
        self, session_id: str, sequence_index: int
    ) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    cn.id,
                    cn.learning_session_id,
                    cn.sequence_index,
                    cn.title,
                    cn.content_markdown,
                    cn.status,
                    cn.error_message,
                    cn.retry_available,
                    cn.created_at,
                    cn.updated_at,
                    qd.payload AS quiz_payload
                FROM concept_nodes cn
                LEFT JOIN quiz_data qd ON cn.id = qd.node_id
                WHERE cn.learning_session_id = ?
                  AND cn.sequence_index = ?
                """,
                (session_id, sequence_index + 1),
            )
            row = cursor.fetchone()
            if not row:
                return None
            quiz_payload = (
                json.loads(row["quiz_payload"]) if row["quiz_payload"] else None
            )
            return {
                "id": row["id"],
                "learning_session_id": row["learning_session_id"],
                "sequence_index": row["sequence_index"],
                "title": row["title"],
                "content_markdown": row["content_markdown"],
                "status": row["status"],
                "error_message": row["error_message"],
                "retry_available": bool(row["retry_available"])
                if row["retry_available"] is not None
                else False,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "quiz": quiz_payload,
            }
        except sqlite3.Error as e:
            logger.error(f"Error getting next node: {e}")
            raise
        finally:
            conn.close()

    def get_quiz_for_node(self, node_id: str) -> Optional[QuizCard]:
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT payload
                FROM quiz_data
                WHERE node_id = ?
                """,
                (node_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return QuizCard.model_validate(json.loads(row["payload"]))
        except sqlite3.Error as e:
            logger.error(f"Error getting quiz for node: {e}")
            raise
        finally:
            conn.close()

    def create_quiz_attempt(
        self,
        node_id: str,
        selected_option_id: str,
    ) -> Dict[str, Any]:
        """Record a quiz attempt and return result with mastery status.

        Args:
            node_id: The concept node identifier
            selected_option_id: The selected option (A, B, C, or D)

        Returns:
            Dict with attempt details including is_correct, score_percent,
            correct_option_id, explanation, and is_mastered

        Raises:
            ValueError: If node_id not found or has no quiz
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # Get quiz data for this node
            quiz = self.get_quiz_for_node(node_id)
            if quiz is None:
                raise ValueError(f"No quiz found for node: {node_id}")

            # Find correct option and selected option details
            correct_option = None
            selected_option = None
            for opt in quiz.options:
                if opt.is_correct:
                    correct_option = opt
                if opt.id == selected_option_id:
                    selected_option = opt

            if selected_option is None:
                raise ValueError(f"Invalid option id: {selected_option_id}")

            is_correct = selected_option.is_correct
            score_percent = 100 if is_correct else 0

            # Get next attempt number
            cursor.execute(
                """
                SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt
                FROM quiz_attempts
                WHERE node_id = ?
                """,
                (node_id,),
            )
            attempt_number = cursor.fetchone()["next_attempt"]

            # Insert attempt record
            attempt_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            cursor.execute(
                """
                INSERT INTO quiz_attempts (
                    id, node_id, attempt_number, selected_option_id,
                    is_correct, score_percent, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    attempt_id,
                    node_id,
                    attempt_number,
                    selected_option_id,
                    1 if is_correct else 0,
                    score_percent,
                    now,
                ),
            )
            conn.commit()

            logger.info(
                f"Quiz attempt recorded: node={node_id}, "
                f"attempt={attempt_number}, correct={is_correct}"
            )

            return {
                "id": attempt_id,
                "node_id": node_id,
                "attempt_number": attempt_number,
                "selected_option_id": selected_option_id,
                "is_correct": is_correct,
                "score_percent": score_percent,
                "correct_option_id": correct_option.id,
                "explanation": selected_option.explanation,
                "is_mastered": is_correct,  # 100% = mastered for single question
                "created_at": now,
                "updated_at": now,
            }
        except sqlite3.Error as e:
            logger.error(f"Error creating quiz attempt: {e}")
            raise
        finally:
            conn.close()

    def get_quiz_attempts(self, node_id: str) -> Dict[str, Any]:
        """Get quiz attempt history for a node.

        Args:
            node_id: The concept node identifier

        Returns:
            Dict with total_attempts, is_mastered, best_score, and attempts list
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # Get all attempts ordered by attempt_number
            cursor.execute(
                """
                SELECT
                    id, node_id, attempt_number, selected_option_id,
                    is_correct, score_percent, created_at
                FROM quiz_attempts
                WHERE node_id = ?
                ORDER BY attempt_number ASC
                """,
                (node_id,),
            )
            rows = cursor.fetchall()

            attempts = []
            best_score = 0
            is_mastered = False

            for row in rows:
                score = row["score_percent"]
                if score > best_score:
                    best_score = score
                if score == 100:
                    is_mastered = True

                attempts.append(
                    {
                        "id": row["id"],
                        "node_id": row["node_id"],
                        "attempt_number": row["attempt_number"],
                        "selected_option_id": row["selected_option_id"],
                        "is_correct": bool(row["is_correct"]),
                        "score_percent": score,
                        "created_at": row["created_at"],
                    }
                )

            return {
                "node_id": node_id,
                "total_attempts": len(attempts),
                "is_mastered": is_mastered,
                "best_score": best_score,
                "attempts": attempts,
            }
        except sqlite3.Error as e:
            logger.error(f"Error getting quiz attempts: {e}")
            raise
        finally:
            conn.close()

    def check_mastery(self, node_id: str) -> bool:
        """Check if a node's quiz has been mastered (100% score achieved).

        Args:
            node_id: The concept node identifier

        Returns:
            True if any attempt scored 100%, False otherwise
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT 1
                FROM quiz_attempts
                WHERE node_id = ? AND score_percent = 100
                LIMIT 1
                """,
                (node_id,),
            )
            return cursor.fetchone() is not None
        except sqlite3.Error as e:
            logger.error(f"Error checking mastery: {e}")
            raise
        finally:
            conn.close()

    def _get_node_by_id(
        self, node_id: str, conn: sqlite3.Connection
    ) -> Optional[Dict[str, Any]]:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                cn.id,
                cn.learning_session_id,
                cn.sequence_index,
                cn.title,
                cn.content_markdown,
                cn.status,
                cn.error_message,
                cn.retry_available,
                cn.created_at,
                cn.updated_at,
                qd.payload AS quiz_payload
            FROM concept_nodes cn
            LEFT JOIN quiz_data qd ON cn.id = qd.node_id
            WHERE cn.id = ?
            """,
            (node_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        quiz_payload = json.loads(row["quiz_payload"]) if row["quiz_payload"] else None
        return {
            "id": row["id"],
            "learning_session_id": row["learning_session_id"],
            "sequence_index": row["sequence_index"],
            "title": row["title"],
            "content_markdown": row["content_markdown"],
            "status": row["status"],
            "error_message": row["error_message"],
            "retry_available": bool(row["retry_available"])
            if row["retry_available"] is not None
            else False,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "quiz": quiz_payload,
        }

    def _ensure_concept_node_columns(self, conn: sqlite3.Connection) -> None:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(concept_nodes)")
        existing_columns = {row["name"] for row in cursor.fetchall()}
        if "error_message" not in existing_columns:
            cursor.execute("ALTER TABLE concept_nodes ADD COLUMN error_message TEXT")
        if "retry_available" not in existing_columns:
            cursor.execute(
                "ALTER TABLE concept_nodes ADD COLUMN retry_available INTEGER DEFAULT 0"
            )


learning_manager = LearningManager()
