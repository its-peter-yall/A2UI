"""
============================================================================
FILE: mongo_learning.py
LOCATION: server/database/repositories/mongo_learning.py
============================================================================
PURPOSE:
    Synchronous Mongo implementation of LearningRepository for sessions,
    concept nodes, quizzes, attempts, and revisions.
ROLE IN PROJECT:
    Phase 3A Atlas adapter for learning persistence. Mirrors LearningManager
    public method names and API shapes using one document per SQLite row.
DEPENDENCIES:
    - External: pymongo, pydantic
    - Internal: server.database.repositories.mongo_common,
                server.schemas.learning
USAGE:
    repo = MongoLearningRepository(database)
    session = repo.create_learning_session("q", "Course")
============================================================================
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import replace
from datetime import datetime
from typing import Any, Optional

from pydantic import ValidationError
from pymongo import ASCENDING, DESCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from server.database.repositories.mongo_common import (
    document_to_row,
    model_payload,
    utc_iso,
)
from server.schemas.learning import (
    FailedStep,
    NodeStatus,
    QuizCard,
    QuizSet,
    RevisionQuizSubmissionResult,
    RevisionSessionWithProgress,
    RevisionSummary,
    convert_legacy_quiz_card,
    convert_legacy_to_quiz_set,
)
from server.services.revision_progress import (
    RevisionAttemptInput,
    RevisionNodeInput,
    RevisionProjection,
    RevisionProjectionInput,
    evaluate_revision_selection,
    normalize_revision_timestamp,
    normalize_selected_option_ids,
    project_revision,
)

logger = logging.getLogger(__name__)

_VALID_TRANSITIONS: dict[NodeStatus, set[NodeStatus]] = {
    NodeStatus.LOCKED: {
        NodeStatus.VIEWING_EXPLANATION,
        NodeStatus.ERROR,
    },
    NodeStatus.VIEWING_EXPLANATION: {
        NodeStatus.IN_QUIZ,
        NodeStatus.ERROR,
    },
    NodeStatus.IN_QUIZ: {
        NodeStatus.SHOWING_FEEDBACK,
        NodeStatus.ERROR,
    },
    NodeStatus.SHOWING_FEEDBACK: {
        NodeStatus.IN_QUIZ,
        NodeStatus.COMPLETED,
    },
    NodeStatus.COMPLETED: set(),
    NodeStatus.ERROR: {
        NodeStatus.LOCKED,
        NodeStatus.VIEWING_EXPLANATION,
    },
}


def _is_valid_transition(
    current_status: NodeStatus,
    next_status: NodeStatus,
) -> bool:
    if current_status == next_status:
        return True
    return next_status in _VALID_TRANSITIONS[current_status]


def _calculate_progress_percent(
    completed_nodes: int,
    total_nodes: int,
) -> int:
    if total_nodes <= 0:
        return 0
    bounded = min(max(completed_nodes, 0), total_nodes)
    return (bounded * 100) // total_nodes


RevisionBatch = tuple[
    RevisionProjectionInput,
    list[RevisionNodeInput],
    list[RevisionAttemptInput],
    RevisionProjection,
]


def _revision_quizzes(
    document: Optional[dict[str, Any]],
) -> tuple[QuizCard, ...]:
    if document is None:
        return ()
    return tuple(QuizSet.model_validate(document['payload']).quizzes)


def _revision_attempt(
    document: dict[str, Any], started_at: datetime,
) -> RevisionAttemptInput:
    return RevisionAttemptInput(
        id=document['_id'],
        revision_session_id=document.get('revision_session_id'),
        node_id=document['node_id'],
        attempt_number=document['attempt_number'],
        quiz_index=document.get('quiz_index'),
        selected_option_ids=normalize_selected_option_ids(
            document.get('selected_option_id')
        ),
        is_correct=bool(document.get('is_correct')),
        score_percent=int(document.get('score_percent') or 0),
        created_at=normalize_revision_timestamp(document['created_at']),
    )


class MongoLearningRepository:
    """Mongo implementation of learning, quiz, and revision persistence."""

    def __init__(self, database: Any) -> None:
        self._db = database
        self._sessions = database["learning_sessions"]
        self._nodes = database["concept_nodes"]
        self._quizzes = database["quiz_data"]
        self._attempts = database["quiz_attempts"]
        self._revisions = database["revision_sessions"]
        self._revision_nodes = database["revision_node_progress"]

    def create_learning_session(
        self,
        query: str,
        course_title: str,
        user_id: Optional[str] = None,
        mode: str = "auto",
        resolved_mode: Optional[str] = None,
        custom_topic_count: Optional[int] = None,
    ) -> dict[str, Any]:
        now = utc_iso()
        document = {
            "_id": str(uuid.uuid4()),
            "user_id": user_id,
            "query": query,
            "course_title": course_title,
            "title_finalized": True,
            "mode": mode,
            "resolved_mode": resolved_mode,
            "custom_topic_count": custom_topic_count,
            "status": "in_progress",
            "progress_percent": 0,
            "completed_at": None,
            "last_active_node_id": None,
            "created_at": now,
            "updated_at": now,
        }
        self._sessions.insert_one(document)
        return document_to_row(document) or {}

    def get_learning_session(
        self,
        session_id: str,
    ) -> Optional[dict[str, Any]]:
        document = self._sessions.find_one({"_id": session_id})
        if document is None:
            return None
        row = document_to_row(document) or {}
        row.setdefault("custom_topic_count", None)
        total_nodes = self._nodes.count_documents(
            {"learning_session_id": session_id}
        )
        completed_nodes = self._nodes.count_documents(
            {
                "learning_session_id": session_id,
                "status": NodeStatus.COMPLETED.value,
            }
        )
        title_finalized = row.get("title_finalized")
        if title_finalized is None:
            title_finalized = True
        row["title_finalized"] = bool(title_finalized)
        row["total_nodes"] = total_nodes
        row["completed_nodes"] = completed_nodes
        return row

    def get_session_progress(
        self,
        session_id: str,
    ) -> Optional[dict[str, Any]]:
        session = self._sessions.find_one({"_id": session_id})
        if session is None:
            return None
        total = self._nodes.count_documents(
            {"learning_session_id": session_id}
        )
        completed = self._nodes.count_documents(
            {
                "learning_session_id": session_id,
                "status": NodeStatus.COMPLETED.value,
            }
        )
        progress = _calculate_progress_percent(completed, total)
        last_active_id = session.get("last_active_node_id")
        last_title = None
        if last_active_id is not None:
            last_node = self._nodes.find_one(
                {"_id": last_active_id},
                {"title": 1},
            )
            if last_node is not None:
                last_title = last_node.get("title")
        current_status = session.get("status")
        return {
            "progress_percent": progress,
            "status": (
                "in_progress"
                if current_status in ("active", None, "")
                else current_status
            ),
            "completed_nodes": completed,
            "total_nodes": total,
            "last_active_node_id": last_active_id,
            "last_active_node_title": last_title,
        }

    def get_sessions_list(
        self,
        user_id: Optional[str],
        status: str = "all",
        sort_by: str = "updated_at",
        sort_order: str = "desc",
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        query: dict[str, Any] = {}
        if user_id is not None:
            query["user_id"] = user_id
        if status == "in_progress":
            query["status"] = {"$in": ["in_progress", "active"]}
        elif status != "all":
            query["status"] = status
        safe_sort = sort_by if sort_by in {
            "created_at",
            "updated_at",
            "course_title",
        } else "updated_at"
        direction = ASCENDING if sort_order == "asc" else DESCENDING
        cursor = self._sessions.find(query).sort(
            safe_sort,
            direction,
        ).skip(offset).limit(limit)
        rows = []
        for item in cursor:
            row = document_to_row(item) or {}
            row.setdefault("custom_topic_count", None)
            sid = row.get("id")
            if sid:
                raw_total = self._nodes.count_documents(
                    {"learning_session_id": sid}
                )
                raw_completed = self._nodes.count_documents(
                    {
                        "learning_session_id": sid,
                        "status": NodeStatus.COMPLETED.value,
                    }
                )
                raw_rev = self._revisions.count_documents(
                    {"original_session_id": sid}
                )
                total = (
                    int(raw_total)
                    if isinstance(raw_total, (int, float))
                    else 0
                )
                completed = (
                    int(raw_completed)
                    if isinstance(raw_completed, (int, float))
                    else 0
                )
                rev_count = (
                    int(raw_rev)
                    if isinstance(raw_rev, (int, float))
                    else 0
                )
                last_active_id = row.get("last_active_node_id")
                last_title = None
                if last_active_id:
                    last_node = self._nodes.find_one(
                        {"_id": last_active_id},
                        {"title": 1},
                    )
                    if isinstance(last_node, dict):
                        last_title = last_node.get("title")
                row["total_nodes"] = total
                row["completed_nodes"] = completed
                row["progress_percent"] = _calculate_progress_percent(
                    completed, total
                )
                row["revision_count"] = rev_count
                row["last_active_node_title"] = last_title
                if total > 0 and completed == total:
                    row["status"] = "completed"
                elif row.get("status") in ("active", "in_progress", None, ""):
                    row["status"] = "in_progress"
            rows.append(row)
        return rows, self._sessions.count_documents(query)

    def update_session_resolved_mode(
        self,
        session_id: str,
        resolved_mode: str,
    ) -> None:
        if resolved_mode not in ("lite", "full", "custom"):
            raise ValueError(f"Invalid resolved_mode: {resolved_mode}")
        result = self._sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "resolved_mode": resolved_mode,
                    "updated_at": utc_iso(),
                }
            },
        )
        if result.matched_count == 0:
            raise LookupError(f"Learning session not found: {session_id}")

    def update_last_active_node(
        self,
        session_id: str,
        node_id: str,
    ) -> None:
        result = self._sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "last_active_node_id": node_id,
                    "updated_at": utc_iso(),
                }
            },
        )
        if result.matched_count == 0:
            raise LookupError(f"Learning session not found: {session_id}")

    def delete_learning_session(self, session_id: str) -> bool:
        node_ids = [
            item["_id"]
            for item in self._nodes.find(
                {"learning_session_id": session_id},
                {"_id": 1},
            )
        ]
        revision_ids = [
            item["_id"]
            for item in self._revisions.find(
                {"original_session_id": session_id},
                {"_id": 1},
            )
        ]
        reports = self._db["research_reports"]
        report_ids = [
            item["_id"]
            for item in reports.find({"session_id": session_id}, {"_id": 1})
        ]
        sections = self._db["research_sections"]
        section_ids = (
            [
                item["_id"]
                for item in sections.find(
                    {"report_id": {"$in": report_ids}},
                    {"_id": 1},
                )
            ]
            if report_ids
            else []
        )

        with self._db.client.start_session() as mongo_session:
            with mongo_session.start_transaction():
                if section_ids:
                    self._db["research_section_sources"].delete_many(
                        {"section_id": {"$in": section_ids}},
                        session=mongo_session,
                    )
                if report_ids:
                    self._db["research_provider_statuses"].delete_many(
                        {"report_id": {"$in": report_ids}},
                        session=mongo_session,
                    )
                    sections.delete_many(
                        {"report_id": {"$in": report_ids}},
                        session=mongo_session,
                    )
                self._db["research_sources"].delete_many(
                    {"session_id": session_id},
                    session=mongo_session,
                )
                reports.delete_many(
                    {"session_id": session_id},
                    session=mongo_session,
                )

                if revision_ids:
                    self._attempts.delete_many(
                        {"revision_session_id": {"$in": revision_ids}},
                        session=mongo_session,
                    )
                    self._revision_nodes.delete_many(
                        {"revision_session_id": {"$in": revision_ids}},
                        session=mongo_session,
                    )
                    self._revisions.delete_many(
                        {"_id": {"$in": revision_ids}},
                        session=mongo_session,
                    )
                if node_ids:
                    self._attempts.delete_many(
                        {"node_id": {"$in": node_ids}},
                        session=mongo_session,
                    )
                    self._quizzes.delete_many(
                        {"node_id": {"$in": node_ids}},
                        session=mongo_session,
                    )
                    self._db["node_sources"].delete_many(
                        {"node_id": {"$in": node_ids}},
                        session=mongo_session,
                    )
                    self._db["generation_briefs"].delete_many(
                        {"node_id": {"$in": node_ids}},
                        session=mongo_session,
                    )
                    self._nodes.delete_many(
                        {"_id": {"$in": node_ids}},
                        session=mongo_session,
                    )

                self._db["generation_briefs"].delete_many(
                    {"session_id": session_id},
                    session=mongo_session,
                )
                self._db["generation_jobs"].delete_many(
                    {"session_id": session_id},
                    session=mongo_session,
                )
                self._db["progress_events"].delete_many(
                    {"session_id": session_id},
                    session=mongo_session,
                )
                result = self._sessions.delete_one(
                    {"_id": session_id},
                    session=mongo_session,
                )
        return result.deleted_count > 0

    def create_concept_node(
        self,
        session_id: str,
        sequence_index: int,
        title: str,
        content_markdown: str,
        status: NodeStatus,
        quiz: Optional[QuizCard] = None,
        quiz_set: Optional[QuizSet] = None,
        error_message: Optional[str] = None,
        retry_available: bool = False,
        complexity: Optional[str] = "Intermediate",
        summary_for_context: Optional[str] = None,
        key_terms: Optional[list[str]] = None,
        failed_step: Optional[FailedStep] = None,
    ) -> dict[str, Any]:
        if self._sessions.find_one({"_id": session_id}) is None:
            raise ValueError(f"Learning session not found: {session_id}")
        now = utc_iso()
        node_id = str(uuid.uuid4())
        document: dict[str, Any] = {
            "_id": node_id,
            "learning_session_id": session_id,
            "sequence_index": sequence_index,
            "title": title,
            "content_markdown": content_markdown,
            "status": status.value,
            "generation_status": "READY",
            "error_message": error_message,
            "retry_available": retry_available,
            "failed_step": (
                failed_step.value if failed_step is not None else None
            ),
            "complexity": complexity,
            "summary_for_context": summary_for_context,
            "key_terms": key_terms,
            "created_at": now,
            "updated_at": now,
        }
        try:
            self._nodes.insert_one(document)
        except DuplicateKeyError as exc:
            raise ValueError(
                "Duplicate concept node for session/sequence"
            ) from exc

        quiz_payload: Any = None
        if quiz_set is not None:
            self._upsert_quiz_document(
                node_id=node_id,
                payload=model_payload(quiz_set),
                format_version=1,
                shuffle_seed=quiz_set.shuffle_seed,
                current_index=quiz_set.current_index,
                now=now,
            )
            quiz_payload = quiz_set.model_dump()
        elif quiz is not None:
            quiz_payload = quiz.model_dump()
            self._upsert_quiz_document(
                node_id=node_id,
                payload=model_payload(quiz),
                format_version=0,
                shuffle_seed=None,
                current_index=0,
                now=now,
            )

        row = document_to_row(document) or {}
        row["quiz"] = quiz_payload
        return row

    def get_session_nodes(self, session_id: str) -> list[dict[str, Any]]:
        cursor = self._nodes.find(
            {"learning_session_id": session_id}
        ).sort("sequence_index", ASCENDING)
        nodes: list[dict[str, Any]] = []
        for item in cursor:
            row = document_to_row(item) or {}
            generation_status = row.get("generation_status")
            if generation_status is None:
                generation_status = "READY"
            row["generation_status"] = generation_status
            row["retry_available"] = bool(row.get("retry_available"))
            quiz_doc = self._quizzes.find_one({"node_id": row["id"]})
            row["quiz"] = (
                quiz_doc.get("payload") if quiz_doc is not None else None
            )
            nodes.append(row)
        return nodes

    def get_concept_node(self, node_id: str) -> Optional[dict[str, Any]]:
        return self._get_node_by_id(node_id)

    def get_next_node(
        self,
        session_id: str,
        sequence_index: int,
    ) -> Optional[dict[str, Any]]:
        document = self._nodes.find_one(
            {
                "learning_session_id": session_id,
                "sequence_index": sequence_index + 1,
            }
        )
        if document is None:
            return None
        return self._node_row_with_quiz(document)

    def update_node_status(
        self,
        node_id: str,
        status: NodeStatus,
    ) -> Optional[dict[str, Any]]:
        current = self._nodes.find_one({"_id": node_id})
        if current is None:
            return None
        current_status = NodeStatus(current["status"])
        if not _is_valid_transition(current_status, status):
            raise ValueError(
                f"Invalid status transition: {current_status} -> {status}"
            )
        now = utc_iso()
        set_fields: dict[str, Any] = {
            "status": status.value,
            "updated_at": now,
        }
        if (
            status == NodeStatus.VIEWING_EXPLANATION
            and current.get("started_at") is None
        ):
            set_fields["started_at"] = now
        if status == NodeStatus.COMPLETED:
            set_fields["completed_at"] = now
        updated = self._nodes.find_one_and_update(
            {"_id": node_id, "status": current_status.value},
            {"$set": set_fields},
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            raise ValueError("retry")
        self._update_session_progress(updated["learning_session_id"])
        if status == NodeStatus.VIEWING_EXPLANATION:
            self._sessions.update_one(
                {"_id": updated["learning_session_id"]},
                {
                    "$set": {
                        "last_active_node_id": node_id,
                        "updated_at": now,
                    }
                },
            )
        return document_to_row(updated)

    def update_node_content(
        self,
        node_id: str,
        content_markdown: str,
        status: NodeStatus,
        quiz: Optional[QuizCard] = None,
        quiz_set: Optional[QuizSet] = None,
        error_message: Optional[str] = None,
        retry_available: bool = False,
        failed_step: Optional[FailedStep] = None,
    ) -> Optional[dict[str, Any]]:
        current = self._nodes.find_one({"_id": node_id})
        if current is None:
            return None
        current_status = NodeStatus(current["status"])
        if not _is_valid_transition(current_status, status):
            raise ValueError(
                "Invalid status transition from "
                f"{current_status.value} to {status.value}"
            )
        now = utc_iso()
        updated = self._nodes.find_one_and_update(
            {"_id": node_id, "status": current_status.value},
            {
                "$set": {
                    "content_markdown": content_markdown,
                    "status": status.value,
                    "error_message": error_message,
                    "retry_available": retry_available,
                    "failed_step": (
                        failed_step.value
                        if failed_step is not None
                        else None
                    ),
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            if self._nodes.find_one({"_id": node_id}) is None:
                return None
            raise ValueError("Node status changed during update; retry")

        if quiz_set is not None:
            self._upsert_quiz_document(
                node_id=node_id,
                payload=model_payload(quiz_set),
                format_version=1,
                shuffle_seed=quiz_set.shuffle_seed,
                current_index=quiz_set.current_index,
                now=now,
            )
        elif quiz is not None:
            self._upsert_quiz_document(
                node_id=node_id,
                payload=model_payload(quiz),
                format_version=0,
                shuffle_seed=None,
                current_index=0,
                now=now,
            )
        else:
            self._quizzes.delete_many({"node_id": node_id})

        return self._get_node_by_id(node_id)

    def replace_node_content(
        self,
        node_id: str,
        content_markdown: str,
        status: NodeStatus,
        quiz_set: Optional[QuizSet] = None,
    ) -> Optional[dict[str, Any]]:
        current = self._nodes.find_one({"_id": node_id})
        if current is None:
            return None
        now = utc_iso()
        self._nodes.update_one(
            {"_id": node_id},
            {
                "$set": {
                    "content_markdown": content_markdown,
                    "status": status.value,
                    "error_message": None,
                    "retry_available": False,
                    "failed_step": None,
                    "updated_at": now,
                },
            },
        )
        if quiz_set is not None:
            self._upsert_quiz_document(
                node_id=node_id,
                payload=model_payload(quiz_set),
                format_version=1,
                shuffle_seed=quiz_set.shuffle_seed,
                current_index=quiz_set.current_index,
                now=now,
            )
        else:
            self._quizzes.delete_many({"node_id": node_id})
        return self._get_node_by_id(node_id)

    def _update_session_progress(
        self,
        session_id: str,
        last_active_node_id: Optional[str] = None,
    ) -> int:
        total_nodes = self._nodes.count_documents(
            {"learning_session_id": session_id}
        )
        completed_nodes = self._nodes.count_documents(
            {
                "learning_session_id": session_id,
                "status": NodeStatus.COMPLETED.value,
            }
        )
        progress_percent = _calculate_progress_percent(
            completed_nodes,
            total_nodes,
        )
        session_status = (
            "completed" if progress_percent == 100 else "in_progress"
        )
        now = utc_iso()
        set_fields: dict[str, Any] = {
            "status": session_status,
            "progress_percent": progress_percent,
            "updated_at": now,
        }
        if last_active_node_id is not None:
            set_fields["last_active_node_id"] = last_active_node_id
        if session_status == "completed":
            existing = self._sessions.find_one(
                {"_id": session_id},
                {"completed_at": 1},
            )
            if existing is not None and existing.get("completed_at") is None:
                set_fields["completed_at"] = now
        self._sessions.update_one(
            {"_id": session_id},
            {"$set": set_fields},
        )
        return progress_percent

    def _upsert_quiz_document(
        self,
        *,
        node_id: str,
        payload: dict[str, Any],
        format_version: int,
        shuffle_seed: Optional[str],
        current_index: int,
        now: str,
    ) -> dict[str, Any]:
        existing = self._quizzes.find_one({"node_id": node_id})
        if existing is not None:
            document = {
                "_id": existing["_id"],
                "node_id": node_id,
                "payload": payload,
                "format_version": format_version,
                "shuffle_seed": shuffle_seed,
                "current_index": current_index,
                "created_at": existing.get("created_at", now),
                "updated_at": now,
            }
        else:
            document = {
                "_id": str(uuid.uuid4()),
                "node_id": node_id,
                "payload": payload,
                "format_version": format_version,
                "shuffle_seed": shuffle_seed,
                "current_index": current_index,
                "created_at": now,
                "updated_at": now,
            }
        try:
            self._quizzes.replace_one(
                {"node_id": node_id},
                document,
                upsert=True,
            )
        except DuplicateKeyError:
            # Unique node_id race: another writer inserted first. Retry
            # against the winner's _id so 1:1 node/quiz holds.
            raced = self._quizzes.find_one({"node_id": node_id})
            if raced is None:
                raise
            document = {
                "_id": raced["_id"],
                "node_id": node_id,
                "payload": payload,
                "format_version": format_version,
                "shuffle_seed": shuffle_seed,
                "current_index": current_index,
                "created_at": raced.get("created_at", now),
                "updated_at": now,
            }
            self._quizzes.replace_one(
                {"node_id": node_id},
                document,
                upsert=True,
            )
        return document

    def _get_node_by_id(self, node_id: str) -> Optional[dict[str, Any]]:
        document = self._nodes.find_one({"_id": node_id})
        if document is None:
            return None
        return self._node_row_with_quiz(document)

    def _node_row_with_quiz(
        self,
        document: dict[str, Any],
    ) -> dict[str, Any]:
        row = document_to_row(document) or {}
        row["retry_available"] = bool(row.get("retry_available"))
        quiz_doc = self._quizzes.find_one({"node_id": row["id"]})
        row["quiz"] = (
            quiz_doc.get("payload") if quiz_doc is not None else None
        )
        return row

    def create_quiz_set(
        self,
        node_id: str,
        quiz_set: QuizSet,
        shuffle_seed: Optional[str] = None,
    ) -> dict[str, Any]:
        now = utc_iso()
        document = {
            "_id": str(uuid.uuid4()),
            "node_id": node_id,
            "payload": model_payload(quiz_set),
            "format_version": 1,
            "shuffle_seed": shuffle_seed,
            "current_index": quiz_set.current_index,
            "created_at": now,
            "updated_at": now,
        }
        self._quizzes.replace_one(
            {"node_id": node_id},
            document,
            upsert=True,
        )
        return document_to_row(document) or {}

    def get_quiz_set_for_node(
        self,
        node_id: str,
    ) -> Optional[dict[str, Any]]:
        row = self._quizzes.find_one({"node_id": node_id})
        if row is None:
            return None
        payload = row.get("payload")
        format_version = row.get("format_version")
        if format_version is None or format_version < 1:
            quiz_set = convert_legacy_to_quiz_set(payload)
            shuffle_seed = row.get("shuffle_seed")
            current_index = row.get("current_index") or 0
        else:
            try:
                quiz_set = QuizSet.model_validate(payload)
                shuffle_seed = row.get("shuffle_seed")
                current_index = row.get("current_index")
            except ValidationError:
                logger.warning(
                    "Detected stale format_version for legacy quiz row: "
                    "node_id=%s. Falling back to wrapped legacy quiz.",
                    node_id,
                )
                quiz_set = convert_legacy_to_quiz_set(payload)
                shuffle_seed = None
                current_index = 0
                format_version = 0
        return {
            "quiz_set": quiz_set,
            "format_version": format_version or 0,
            "shuffle_seed": shuffle_seed,
            "current_index": current_index,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }

    def get_quiz_for_node(self, node_id: str) -> Optional[QuizCard]:
        row = self._quizzes.find_one({"node_id": node_id})
        if row is None:
            return None
        payload = row.get("payload")
        format_version = row.get("format_version")
        current_index = row.get("current_index")
        if format_version is None or format_version < 1:
            return convert_legacy_quiz_card(payload)
        try:
            quiz_set = QuizSet.model_validate(payload)
        except ValidationError:
            logger.warning(
                "Detected stale format_version for legacy quiz row: "
                "node_id=%s. Falling back to legacy parsing.",
                node_id,
            )
            return convert_legacy_quiz_card(payload)
        if quiz_set.quizzes:
            idx = (
                current_index
                if current_index is not None
                else quiz_set.current_index
            )
            return quiz_set.quizzes[idx]
        return None

    def update_quiz_shuffle_seed(
        self,
        node_id: str,
        shuffle_seed: str,
    ) -> bool:
        result = self._quizzes.update_one(
            {"node_id": node_id},
            {
                "$set": {
                    "shuffle_seed": shuffle_seed,
                    "updated_at": utc_iso(),
                }
            },
        )
        return result.matched_count > 0

    def decrement_quiz_set_progress(
        self,
        node_id: str,
    ) -> Optional[dict[str, Any]]:
        row = self._quizzes.find_one({"node_id": node_id})
        if row is None:
            return None
        format_version = row.get("format_version")
        if format_version is None or format_version < 1:
            return None
        current_index = row.get("current_index") or 0
        if current_index <= 0:
            return self._get_node_by_id(node_id)
        new_index = current_index - 1
        self._quizzes.update_one(
            {"node_id": node_id},
            {
                "$set": {
                    "current_index": new_index,
                    "updated_at": utc_iso(),
                }
            },
        )
        return self._get_node_by_id(node_id)

    def update_quiz_set_progress(
        self,
        node_id: str,
        current_index: int,
    ) -> Optional[dict[str, Any]]:
        row = self._quizzes.find_one({"node_id": node_id})
        if row is None:
            return None
        payload = row.get("payload")
        format_version = row.get("format_version")
        if format_version is None or format_version < 1:
            total_quizzes = 1
        else:
            quiz_set_data = QuizSet.model_validate(payload)
            total_quizzes = len(quiz_set_data.quizzes)
        if current_index < 0 or current_index >= total_quizzes:
            raise ValueError(
                f"Invalid current_index {current_index} for quiz set "
                f"with {total_quizzes} quizzes"
            )
        self._quizzes.update_one(
            {"node_id": node_id},
            {
                "$set": {
                    "current_index": current_index,
                    "updated_at": utc_iso(),
                }
            },
        )
        return self.get_quiz_set_for_node(node_id)

    def create_quiz_attempt(
        self,
        node_id: str,
        selected_option_ids: list[str],
        quiz_index: int = 0,
        revision_session_id: Optional[str] = None,
    ) -> dict[str, Any]:
        node = self._get_node_by_id(node_id)
        if node is None:
            raise ValueError(f"Concept node not found: {node_id}")
        session_id = node["learning_session_id"]
        quiz_set_data = self.get_quiz_set_for_node(node_id)
        if quiz_set_data is None:
            raise ValueError(f"No quiz found for node: {node_id}")
        quiz_set = quiz_set_data["quiz_set"]
        if quiz_index < 0 or quiz_index >= len(quiz_set.quizzes):
            raise ValueError(
                f"Invalid quiz_index {quiz_index} for quiz set with "
                f"{len(quiz_set.quizzes)} quizzes"
            )
        quiz = quiz_set.quizzes[quiz_index]
        question_type = getattr(quiz, "question_type", "single_choice")
        correct_options = [opt for opt in quiz.options if opt.is_correct]
        correct_option_ids_set = {opt.option_id for opt in correct_options}
        selected_options = []
        for opt_id in selected_option_ids:
            found = False
            for opt in quiz.options:
                if opt.option_id == opt_id:
                    selected_options.append(opt)
                    found = True
                    break
            if not found:
                raise ValueError(f"Invalid option id: {opt_id}")
        selected_option_id_set = set(selected_option_ids)
        if question_type == "single_choice":
            is_correct = (
                len(selected_options) == 1
                and selected_options[0].is_correct
            )
        else:
            is_correct = correct_option_ids_set == selected_option_id_set
        score_percent = 100 if is_correct else 0
        attempt_number = (
            self._attempts.count_documents({"node_id": node_id}) + 1
        )
        attempt_id = str(uuid.uuid4())
        now = utc_iso()
        document = {
            "_id": attempt_id,
            "node_id": node_id,
            "attempt_number": attempt_number,
            "quiz_index": quiz_index,
            "selected_option_id": selected_option_ids,
            "revision_session_id": revision_session_id,
            "is_correct": is_correct,
            "score_percent": score_percent,
            "created_at": now,
        }
        self._attempts.insert_one(document)
        if revision_session_id is None:
            self._sessions.update_one(
                {"_id": session_id},
                {
                    "$set": {
                        "last_active_node_id": node_id,
                        "updated_at": now,
                    }
                },
            )
        total_quizzes = len(quiz_set.quizzes)
        if total_quizzes == 1:
            is_mastered = is_correct
        else:
            is_mastered = self._check_multi_quiz_mastery(
                node_id,
                total_quizzes,
            )
        return {
            "id": attempt_id,
            "node_id": node_id,
            "attempt_number": attempt_number,
            "quiz_index": quiz_index,
            "selected_option_ids": selected_option_ids,
            "is_correct": is_correct,
            "score_percent": score_percent,
            "correct_option_ids": (
                list(correct_option_ids_set) if is_correct else []
            ),
            "explanation": (
                correct_options[0].explanation
                if correct_options and is_correct
                else ""
            ),
            "selected_explanation": (
                selected_options[0].explanation
                if not is_correct and selected_options
                else None
            ),
            "is_mastered": is_mastered,
            "created_at": now,
            "updated_at": now,
        }

    def get_quiz_attempts(self, node_id: str) -> dict[str, Any]:
        cursor = self._attempts.find({"node_id": node_id}).sort(
            "attempt_number",
            ASCENDING,
        )
        quiz_set_data = self.get_quiz_set_for_node(node_id)
        quiz_set = (
            quiz_set_data["quiz_set"] if quiz_set_data is not None else None
        )
        attempts: list[dict[str, Any]] = []
        best_score = 0
        for row in cursor:
            score = int(row.get("score_percent") or 0)
            if score > best_score:
                best_score = score
            quiz_index = int(row.get("quiz_index") or 0)
            selected_raw = row.get("selected_option_id")
            if isinstance(selected_raw, list):
                selected_option_ids = selected_raw
            elif isinstance(selected_raw, str):
                selected_option_ids = [selected_raw]
            else:
                selected_option_ids = []
            correct_option_ids: list[str] = []
            explanation = ""
            if quiz_set is not None and quiz_index < len(quiz_set.quizzes):
                quiz = quiz_set.quizzes[quiz_index]
                for option in quiz.options:
                    if option.is_correct:
                        correct_option_ids.append(option.option_id)
                for option in quiz.options:
                    if option.option_id in selected_option_ids:
                        explanation = option.explanation
                        break
                if not explanation:
                    for option in quiz.options:
                        if option.is_correct:
                            explanation = option.explanation
                            break
            attempts.append(
                {
                    "id": row.get("_id"),
                    "node_id": row.get("node_id"),
                    "attempt_number": row.get("attempt_number"),
                    "quiz_index": quiz_index,
                    "selected_option_ids": selected_option_ids,
                    "is_correct": bool(row.get("is_correct")),
                    "score_percent": score,
                    "created_at": row.get("created_at"),
                    "correct_option_ids": correct_option_ids,
                    "explanation": explanation,
                    "is_mastered": score >= 100,
                }
            )
        is_mastered = self._calculate_mastery_from_attempts(
            node_id,
            attempts,
        )
        return {
            "node_id": node_id,
            "total_attempts": len(attempts),
            "is_mastered": is_mastered,
            "best_score": best_score,
            "attempts": attempts,
        }

    def check_mastery(self, node_id: str) -> bool:
        quiz_set_data = self.get_quiz_set_for_node(node_id)
        if quiz_set_data is None:
            return False
        quiz_set = quiz_set_data["quiz_set"]
        total_quizzes = len(quiz_set.quizzes)
        if total_quizzes == 1:
            return (
                self._attempts.find_one(
                    {"node_id": node_id, "is_correct": True}
                )
                is not None
            )
        return self._check_multi_quiz_mastery(node_id, total_quizzes)

    def create_revision_session(
        self,
        original_session_id: str,
        mode: str,
    ) -> dict[str, Any]:
        allowed_modes = {"full_review", "quiz_only"}
        if mode not in allowed_modes:
            raise ValueError(f"Invalid revision mode: {mode}")
        session = self._sessions.find_one({"_id": original_session_id})
        if session is None:
            raise LookupError(
                f"Learning session not found: {original_session_id}"
            )
        nodes = list(
            self._nodes.find({"learning_session_id": original_session_id})
        )
        nodes.sort(key=lambda item: int(item.get("sequence_index") or 0))
        is_completed = session.get("status") == "completed"
        if not is_completed:
            total_nodes = len(nodes)
            completed_nodes = sum(
                1
                for node in nodes
                if node.get("status") == NodeStatus.COMPLETED.value
            )
            is_completed = total_nodes > 0 and completed_nodes == total_nodes
        if not is_completed:
            raise ValueError(
                "Revision sessions can only be created for completed sessions"
            )
        revision_number = (
            self._revisions.count_documents(
                {"original_session_id": original_session_id}
            )
            + 1
        )
        revision_id = str(uuid.uuid4())
        now = utc_iso()
        revision_doc = {
            "_id": revision_id,
            "original_session_id": original_session_id,
            "revision_number": revision_number,
            "mode": mode,
            "status": "in_progress",
            "progress_percent": 0,
            "total_quiz_score_percent": None,
            "started_at": now,
            "completed_at": None,
        }
        self._revisions.insert_one(revision_doc)
        progress_rows: list[dict[str, Any]] = []
        progress_docs: list[dict[str, Any]] = []
        for node in nodes:
            progress_id = str(uuid.uuid4())
            progress_docs.append(
                {
                    "_id": progress_id,
                    "revision_session_id": revision_id,
                    "node_id": node["_id"],
                    "status": "pending",
                    "reviewed_at": None,
                }
            )
            progress_rows.append(
                {
                    "id": progress_id,
                    "revision_session_id": revision_id,
                    "node_id": node["_id"],
                    "node_title": node.get("title"),
                    "sequence_index": int(node.get("sequence_index") or 0),
                    "status": "pending",
                    "reviewed_at": None,
                }
            )
        if progress_docs:
            self._revision_nodes.insert_many(progress_docs)
        return {
            "id": revision_id,
            "original_session_id": original_session_id,
            "revision_number": revision_number,
            "mode": mode,
            "status": "in_progress",
            "progress_percent": 0,
            "total_quiz_score_percent": None,
            "started_at": now,
            "completed_at": None,
            "nodes": progress_rows,
        }

    def get_revisions_for_session(
        self,
        session_id: str,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        query = {'original_session_id': session_id}
        total = self._revisions.count_documents(query)
        documents = list(
            self._revisions.find(query).sort('started_at', DESCENDING)
            .skip(max(offset, 0)).limit(max(limit, 0))
        )
        batches = self._load_revision_batch(documents)
        responses = []
        for document in documents:
            result = self._revision_response(
                document, batches[document['_id']][3],
            )
            result.pop('nodes')
            responses.append(result)
        return responses, total

    def _load_revision_batch(
        self, revisions: list[dict[str, Any]],
    ) -> dict[str, RevisionBatch]:
        if not revisions:
            return {}
        ids = [row['_id'] for row in revisions]
        progress = list(self._revision_nodes.find({
            'revision_session_id': {'$in': ids},
        }))
        node_ids = sorted({row['node_id'] for row in progress})
        concepts = {
            row['_id']: row for row in self._nodes.find({
                '_id': {'$in': node_ids},
            })
        }
        quizzes = {
            row['node_id']: row for row in self._quizzes.find({
                'node_id': {'$in': node_ids},
            })
        }
        saved = list(self._attempts.find({
            'revision_session_id': {'$in': ids},
        }))
        batches = {}
        for document in revisions:
            revision = RevisionProjectionInput(
                id=document['_id'], mode=document['mode'],
                started_at=normalize_revision_timestamp(
                    document['started_at']
                ),
                stored_status=document.get('status', 'in_progress'),
                stored_completed_at=(
                    normalize_revision_timestamp(document['completed_at'])
                    if document.get('completed_at') is not None else None
                ),
            )
            inputs = []
            for row in progress:
                if row['revision_session_id'] != revision.id:
                    continue
                concept = concepts.get(row['node_id'])
                if concept is None:
                    continue
                if (concept['learning_session_id']
                        != document['original_session_id']):
                    raise ValueError('revision node belongs to another course')
                inputs.append(RevisionNodeInput(
                    id=row['_id'], revision_session_id=revision.id,
                    node_id=row['node_id'], node_title=concept['title'],
                    sequence_index=concept['sequence_index'],
                    quizzes=_revision_quizzes(quizzes.get(row['node_id'])),
                    stored_status=row.get('status', 'pending'),
                    reviewed_at=(
                        normalize_revision_timestamp(row['reviewed_at'])
                        if row.get('reviewed_at') is not None else None
                    ),
                    explicit_review_present='content_reviewed_at' in row,
                    content_reviewed_at=(
                        normalize_revision_timestamp(
                            row['content_reviewed_at']
                        ) if row.get('content_reviewed_at') is not None
                        else None
                    ),
                ))
            attempts = [
                _revision_attempt(row, revision.started_at)
                for row in saved
                if row.get('revision_session_id') == revision.id
            ]
            projection = project_revision(
                revision=revision, nodes=inputs, attempts=attempts,
            )
            batches[revision.id] = (revision, inputs, attempts, projection)
        return batches

    def _revision_response(
        self, document: dict[str, Any], projection: RevisionProjection,
    ) -> dict[str, Any]:
        return RevisionSessionWithProgress.model_validate({
            'id': document['_id'],
            'original_session_id': document['original_session_id'],
            'revision_number': document['revision_number'],
            'mode': document['mode'],
            'status': projection.status,
            'progress_percent': projection.progress_percent,
            'total_quiz_score_percent': projection.total_quiz_score_percent,
            'started_at': document['started_at'],
            'completed_at': projection.completed_at,
            'nodes': list(projection.nodes),
            'notices': list(projection.notices),
        }).model_dump(mode='json')

    def get_revision_session(
        self, revision_id: str,
    ) -> Optional[dict[str, Any]]:
        document = self._revisions.find_one({'_id': revision_id})
        if document is None:
            return None
        batch = self._load_revision_batch([document])[revision_id]
        return self._revision_response(document, batch[3])

    def delete_revision_session(self, revision_id: str) -> bool:
        self._attempts.delete_many({"revision_session_id": revision_id})
        self._revision_nodes.delete_many(
            {"revision_session_id": revision_id}
        )
        result = self._revisions.delete_one({"_id": revision_id})
        return result.deleted_count > 0

    def mark_revision_node_reviewed(
        self,
        revision_id: str,
        node_id: str,
    ) -> dict[str, Any]:
        revision = self._revisions.find_one({"_id": revision_id})
        if revision is None:
            raise LookupError(f"Revision session not found: {revision_id}")
        if revision.get("mode") != "full_review":
            raise ValueError(
                "mark-reviewed is only allowed for full_review revisions"
            )
        now = utc_iso()
        updated = self._revision_nodes.find_one_and_update(
            {"revision_session_id": revision_id, "node_id": node_id},
            {"$set": {"status": "reviewed", "reviewed_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            raise LookupError(
                f"Revision node not found for revision {revision_id}: "
                f"{node_id}"
            )
        self._update_revision_progress(revision_id)
        return {
            "id": updated["_id"],
            "revision_session_id": updated["revision_session_id"],
            "node_id": updated["node_id"],
            "status": updated["status"],
            "reviewed_at": updated["reviewed_at"],
        }

    def submit_revision_quiz(
        self,
        revision_id: str,
        node_id: str,
        selected_option_ids: list[str],
        quiz_index: int = 0,
    ) -> dict[str, Any]:
        document, batch, target = self._revision_mutation_inputs(
            revision_id, node_id,
        )
        if quiz_index < 0 or quiz_index >= len(target.quizzes):
            raise ValueError('Invalid quiz_index')
        correct = evaluate_revision_selection(
            target.quizzes[quiz_index], selected_option_ids,
        )
        revision, nodes, attempts = self._prepare_revision_write(batch)
        last = self._attempts.find_one(
            {'node_id': node_id},
            sort=[('attempt_number', DESCENDING), ('_id', DESCENDING)],
        )
        number = int(last['attempt_number']) + 1 if last else 1
        now = utc_iso()
        saved = {
            '_id': str(uuid.uuid4()), 'revision_session_id': revision_id,
            'node_id': node_id, 'quiz_index': quiz_index,
            'attempt_number': number,
            'selected_option_id': list(selected_option_ids),
            'is_correct': correct, 'score_percent': 100 if correct else 0,
            'created_at': now,
        }
        self._attempts.insert_one(saved)
        projected = project_revision(
            revision=revision, nodes=nodes,
            attempts=attempts + [_revision_attempt(saved, revision.started_at)],
        )
        node = next(row for row in projected.nodes if row.node_id == node_id)
        result = next(row for row in node.quiz_results
                      if row.quiz_index == quiz_index)
        try:
            self._persist_revision_projection(revision_id, projected)
        except PyMongoError as error:
            logger.warning(
                'Revision aggregate deferred revision_id=%s error_type=%s',
                revision_id, type(error).__name__,
            )
        return RevisionQuizSubmissionResult.model_validate({
            **result.model_dump(), 'revision_node_status': node.status,
        }).model_dump(mode='json')

    def get_revision_summary(self, revision_id: str) -> dict[str, Any]:
        document = self._revisions.find_one({'_id': revision_id})
        if document is None:
            raise LookupError(f'Revision session not found: {revision_id}')
        batch = self._load_revision_batch([document])[revision_id]
        projection = batch[3]
        node_ids = sorted(node.node_id for node in batch[1])
        comparison = None
        if projection.total_attempts and node_ids:
            originals = list(self._attempts.find({
                'revision_session_id': None,
                'node_id': {'$in': node_ids},
            }))
            if originals:
                score = (sum(bool(row.get('is_correct'))
                             for row in originals) * 100) // len(originals)
                comparison = {
                    'original_quiz_score_percent': score,
                    'improvement_percent': (
                        projection.total_quiz_score_percent - score
                    ),
                }
        return RevisionSummary.model_validate({
            'revision_id': revision_id, 'mode': document['mode'],
            'progress_percent': projection.progress_percent,
            'total_quiz_score_percent': projection.total_quiz_score_percent,
            'nodes_reviewed': projection.nodes_completed,
            'nodes_total': projection.nodes_total,
            'quizzes_passed': projection.correct_attempts,
            'quizzes_failed': projection.incorrect_attempts,
            'quizzes_total': projection.total_attempts,
            'time_spent_seconds': projection.time_spent_seconds,
            'comparison': comparison, 'notices': list(projection.notices),
        }).model_dump(mode='json')

    def _revision_mutation_inputs(
        self, revision_id: str, node_id: str,
    ) -> tuple[dict[str, Any], RevisionBatch, RevisionNodeInput]:
        document = self._revisions.find_one({'_id': revision_id})
        if document is None:
            raise LookupError(f'Revision session not found: {revision_id}')
        batch = self._load_revision_batch([document])[revision_id]
        target = next((node for node in batch[1]
                       if node.node_id == node_id), None)
        if target is None:
            raise LookupError('Revision node not found')
        return document, batch, target

    def _persist_revision_projection(
        self, revision_id: str, projection: RevisionProjection,
    ) -> None:
        self._revisions.update_one({'_id': revision_id}, {'$set': {
            'status': projection.status,
            'progress_percent': projection.progress_percent,
            'total_quiz_score_percent': projection.total_quiz_score_percent,
            'completed_at': (
                projection.completed_at.isoformat()
                if projection.completed_at is not None else None
            ),
        }})

    def _prepare_revision_write(
        self, batch: RevisionBatch,
    ) -> tuple[
        RevisionProjectionInput,
        list[RevisionNodeInput],
        list[RevisionAttemptInput],
    ]:
        revision, nodes, attempts, projection = batch
        if (revision.stored_status == 'completed'
                and projection.status == 'in_progress'):
            # Validated progress write reconciles disproven history before
            # new evidence could make the revision complete again.
            self._persist_revision_projection(revision.id, projection)
            revision = replace(
                revision, stored_status='in_progress',
                stored_completed_at=None,
            )
        return revision, nodes, attempts

    def _update_revision_progress(self, revision_id: str) -> dict[str, Any]:
        document = self._revisions.find_one({'_id': revision_id})
        if document is None:
            raise LookupError(f'Revision session not found: {revision_id}')
        projection = self._load_revision_batch([document])[revision_id][3]
        self._persist_revision_projection(revision_id, projection)
        return self._revision_response(document, projection)

    def _check_multi_quiz_mastery(
        self,
        node_id: str,
        total_quizzes: int,
    ) -> bool:
        correct_indices = {
            int(doc.get("quiz_index") or 0)
            for doc in self._attempts.find(
                {"node_id": node_id, "is_correct": True}
            )
        }
        return correct_indices.issuperset(set(range(total_quizzes)))

    def _calculate_mastery_from_attempts(
        self,
        node_id: str,
        attempts: list[dict[str, Any]],
    ) -> bool:
        if not attempts:
            return False
        quiz_set_data = self.get_quiz_set_for_node(node_id)
        if quiz_set_data is None:
            return False
        total_quizzes = len(quiz_set_data["quiz_set"].quizzes)
        if total_quizzes == 1:
            return any(item["is_correct"] for item in attempts)
        correct_indices = {
            item["quiz_index"] for item in attempts if item["is_correct"]
        }
        return correct_indices.issuperset(set(range(total_quizzes)))
