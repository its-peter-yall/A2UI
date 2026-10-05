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
from types import SimpleNamespace
from typing import Iterator
from unittest.mock import patch
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.database.repositories.facade import RepositoryFacade
from server.database.repositories.mongo_learning import (
    MongoLearningRepository,
)
from server.database.repositories.sqlite import SqliteLearningRepository
from server.routers.learning import router
from server.schemas.learning import (
    NodeStatus, RevisionSessionResponse, RevisionSessionWithProgress,
    RevisionSummary,
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


@contextmanager
def route_client(fixture: AcceptanceFixture, backend: str):
    """Actual router and late-bound facade; isolated external read ports."""
    app = FastAPI()
    app.include_router(router)
    facade = RepositoryFacade(lambda: fixture.repositories[backend])
    with ExitStack() as stack:
        stack.enter_context(patch(
            "server.routers.learning.learning_manager", facade
        ))
        stack.enter_context(patch(
            "server.routers.learning.generation_job_store",
            SimpleNamespace(to_public_by_session=lambda _: None),
        ))
        stack.enter_context(patch(
            "server.routers.learning.research_store",
            SimpleNamespace(get_citations_by_session=lambda _: {}),
        ))
        yield stack.enter_context(TestClient(app, raise_server_exceptions=False))


def wire_fixture(backend: str, mode: str) -> dict:
    """Capture real response bodies for page acceptance; no files written."""
    with AcceptanceFixture(mode) as fixture:
        with frozen_writes(START, 20):
            second = fixture.manager.create_concept_node(
                fixture.session, 1, "Topic B", "# Plain heading\n\n"
                "Fallback paragraph without curiosity.", NodeStatus.COMPLETED,
            )["id"]
            fixture.execute(
                "INSERT INTO revision_node_progress "
                "(id, revision_session_id, node_id, status) "
                "VALUES (?, ?, ?, 'pending')",
                ("reading-progress", fixture.revision_id, second),
            )
        fixture.refresh_mongo()
        with route_client(fixture, backend) as client:
            rid = fixture.revision_id
            base = f"/learning/revisions/{rid}"

            def get(url: str) -> dict:
                response = client.get(url)
                if response.status_code != 200:
                    raise AssertionError(response.text)
                return response.json()

            def submit(index: int, option: str, timestamp: str, number: int):
                with frozen_writes(timestamp, number):
                    response = client.post(
                        f"{base}/nodes/{fixture.node}/submit-quiz",
                        json={"selected_option_ids": [option],
                              "quiz_index": index},
                    )
                if response.status_code != 200:
                    raise AssertionError(response.text)
                return response.json()

            result = {
                "original": get(f"/learning/sessions/{fixture.session}"),
                "initial": get(base),
                "original_before": fixture.raw_snapshot(backend, True),
            }
            first = submit(0, "q0-0", FIRST, 100)
            result["partial"] = get(base)
            second_attempt = submit(1, "q1-1", SECOND, 200)
            result["before_review"] = get(base)
            result["reviews"] = []
            if mode == "full_review":
                for node in (fixture.node, second):
                    with frozen_writes(SECOND, 250):
                        response = client.post(f"{base}/nodes/{node}/mark-reviewed")
                    if response.status_code != 200:
                        raise AssertionError(response.text)
                    result["reviews"].append(response.json())
            result["mixed"] = get(base)
            result["summary_mixed"] = get(f"{base}/summary")
            retry = submit(1, "q1-0", THIRD, 300)
            result["retry"] = get(base)
            result["summary_retry"] = get(f"{base}/summary")
            result["listed"] = get(
                f"/learning/sessions/{fixture.session}/revisions"
            )
            with frozen_writes(THIRD, 400):
                response = client.post(
                    f"/learning/sessions/{fixture.session}/revisions",
                    json={"mode": mode},
                )
            if response.status_code != 201:
                raise AssertionError(response.text)
            result["fresh"] = get(f"/learning/revisions/{response.json()['id']}")
            result["submissions"] = [first, second_attempt, retry]
            result["original_after"] = fixture.raw_snapshot(backend, True)
            return result


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--wire", action="store_true")
    args = parser.parse_args()
    if not args.wire:
        parser.error("Choose --wire; browser serving uses the ASGI factory")
    print(json.dumps({mode: wire_fixture("sqlite", mode)
                      for mode in ("full_review", "quiz_only")}))


if __name__ == "__main__":
    main()
