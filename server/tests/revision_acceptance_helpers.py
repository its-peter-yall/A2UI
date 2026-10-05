"""
============================================================================
FILE: revision_acceptance_helpers.py
LOCATION: server/tests/revision_acceptance_helpers.py
============================================================================
PURPOSE:
    Build deterministic disposable acceptance data and serialized fixtures.
ROLE IN PROJECT:
    P7 test-only bridge between repository, route, client, and browser gates.
    - Never opens the user's database or calls a provider
    - Reuse query-aware Mongo collections from P3
KEY COMPONENTS:
    - AcceptanceFixture: Isolated SQLite and mirrored Mongo repositories
    - frozen_writes: Deterministic timestamps and attempt identifiers
============================================================================
"""
from __future__ import annotations

import copy
import itertools
import json
import sqlite3
from contextlib import ExitStack, closing, contextmanager
from datetime import datetime
from typing import Iterator
from unittest.mock import patch
from uuid import UUID

from server.database.repositories.mongo_learning import (
    MongoLearningRepository,
)
from server.database.repositories.sqlite import SqliteLearningRepository
from server.schemas.learning import (
    RevisionSessionResponse, RevisionSessionWithProgress, RevisionSummary,
)
from server.tests.test_revision_mongo import MemoryMongo
from server.tests.test_revision_sqlite import (
    FIRST, SECOND, START, THIRD, RevisionSqliteFixture, make_quiz,
)


@contextmanager
def frozen_writes(timestamp: str, first_id: int = 100) -> Iterator[None]:
    """Freeze local write clocks and UUIDs; restore them on exit."""
    instant = datetime.fromisoformat(timestamp)

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return instant if tz is None else instant.astimezone(tz)

    counter = itertools.count(first_id)
    with ExitStack() as stack:
        stack.enter_context(patch(
            "server.database.learning_persistence.datetime", FixedDatetime
        ))
        stack.enter_context(patch(
            "server.database.repositories.mongo_learning.utc_iso",
            return_value=timestamp,
        ))
        stack.enter_context(patch(
            "uuid.uuid4", side_effect=lambda: UUID(int=next(counter))
        ))
        yield


class AcceptanceFixture(RevisionSqliteFixture):
    """Identical seed data behind actual adapters; temp database only."""

    def __init__(self, mode: str = "quiz_only") -> None:
        self.mode = mode

    def __enter__(self):
        with frozen_writes(START, 1):
            self.open_fixture()
            self.execute(
                "UPDATE concept_nodes SET title = ?, content_markdown = ? "
                "WHERE id = ?",
                ("Topic A", "# Foundations\n\nOriginal paragraph.\n\n"
                 "## Curiosity Spark\n- Why study A?", self.node),
            )
            self.manager.create_quiz_attempt(self.node, ["q0-1"], 0)
            self.revision_id = self.revision(self.mode)
        self.refresh_mongo()
        self.repositories = {
            "sqlite": SqliteLearningRepository(self.manager),
            "mongo": self.mongo_repo,
        }
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        self.close_fixture()

    def refresh_mongo(self) -> None:
        """Mirror all raw columns, not projected/canned response objects."""
        self.mongo = MemoryMongo()
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.row_factory = sqlite3.Row
            for table in (
                "learning_sessions", "concept_nodes", "quiz_data",
                "revision_sessions", "revision_node_progress", "quiz_attempts",
            ):
                for row in connection.execute(f"SELECT * FROM {table}"):
                    document = dict(row)
                    document["_id"] = document.pop("id")
                    for key in ("payload", "key_terms", "selected_option_id"):
                        value = document.get(key)
                        if isinstance(value, str):
                            try:
                                document[key] = json.loads(value)
                            except json.JSONDecodeError:
                                document[key] = value
                    self.mongo.rows[table].append(document)
        self.mongo_repo = MongoLearningRepository(self.mongo)
        if hasattr(self, "repositories"):
            self.repositories["mongo"] = self.mongo_repo

    def raw_snapshot(self, backend: str, original: bool = False) -> dict:
        """Read all raw records, including original timestamps and quiz seed."""
        if backend == "sqlite":
            return self.snapshot(original_only=original)
        names = ("learning_sessions", "concept_nodes", "quiz_data")
        if not original:
            names += (
                "revision_sessions", "revision_node_progress", "quiz_attempts",
            )
        return {name: copy.deepcopy(self.mongo.rows[name]) for name in names}


def run_transcript(fixture: AcceptanceFixture, backend: str) -> dict:
    """Execute the identical revision action sequence against one adapter."""
    repo = fixture.repositories[backend]
    rid, node = fixture.revision_id, fixture.node
    result = {}

    def restore() -> dict:
        return RevisionSessionWithProgress.model_validate(
            repo.get_revision_session(rid)
        ).model_dump(mode="json")

    with frozen_writes(FIRST, 100):
        repo.submit_revision_quiz(rid, node, ["q0-0"], 0)
        result["partial"] = restore()
        if fixture.mode == "full_review":
            result["first_review"] = repo.mark_revision_node_reviewed(rid, node)
            result["second_review"] = repo.mark_revision_node_reviewed(rid, node)
    with frozen_writes(SECOND, 200):
        repo.submit_revision_quiz(rid, node, ["q1-1"], 1)
        result["complete"] = restore()
    with frozen_writes(THIRD, 300):
        repo.submit_revision_quiz(rid, node, ["q1-0"], 1)
        result["retry"] = restore()
    result["summary"] = RevisionSummary.model_validate(
        repo.get_revision_summary(rid)
    ).model_dump(mode="json")
    result["listed"] = RevisionSessionResponse.model_validate(
        repo.get_revisions_for_session(fixture.session)[0][0]
    ).model_dump(mode="json")
    return result
