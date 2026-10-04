"""
============================================================================
FILE: test_live_stream_repository_parity.py
LOCATION: server/tests/test_live_stream_repository_parity.py
============================================================================
PURPOSE:
    Proves in-flight provider-to-SSE delivery and SQLite/Mongo replay parity.
ROLE IN PROJECT:
    End-to-end P1 foundation evidence without producer or graph changes.
    - Two deltas reach SSE before the provider stream completes
    - Real repository adapters share milestone and draft cursors
KEY COMPONENTS:
    - LiveStreamRepositoryParityTests: In-flight and adapter parity tests
============================================================================
"""

from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from server.database.generation_jobs import GenerationJobStore
from server.database.generation_migrations import initialize_generation_schema
from server.database.learning_persistence import LearningManager
from server.database.progress_events import ProgressEventStore
from server.database.repositories.facade import RepositoryFacade
from server.database.repositories.mongo_progress import MongoProgressEventRepository
from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    ProgressEventType, StageChangedPayload, TopicContentDeltaPayload,
)
from server.services.session_event_stream import (
    SessionLiveStreamBroadcaster, stream_session_events,
)
from server.tests.realtime_foundation_helpers import StreamOutput, fake_instructor
from server.utils.instructor_client import InstructorClient


def frame_data(frame):
    return json.loads(next(line[6:] for line in frame.splitlines()
                           if line.startswith("data: ")))


class LiveStreamRepositoryParityTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_callback_reaches_sse_twice_before_completion(self):
        hub = SessionLiveStreamBroadcaster()
        release = asyncio.Event()
        updates_delivered = asyncio.Event()
        previous = ""
        async def chunks(**kwargs):
            yield StreamOutput.model_construct(text="a")
            yield StreamOutput.model_construct(text="ab")
            await release.wait()
            yield StreamOutput(text="abc")
        async def publish(update):
            nonlocal previous
            if update.kind == "attempt_started":
                previous = ""
                await hub.begin_target(
                    session_id="s", job_id="j",
                    stage=GenerationStage.GENERATING_BATCH,
                    target_type="topic", target_id="n", sequence_index=0,
                    attempt=update.attempt,
                )
            else:
                text = update.partial.text
                suffix = text[len(previous):]
                previous = text
                await hub.publish(
                    session_id="s", job_id="j",
                    stage=GenerationStage.GENERATING_BATCH,
                    event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                    payload=TopicContentDeltaPayload(
                        node_id="n", sequence_index=0,
                        text_delta=suffix, attempt=update.attempt,
                    ),
                )
                await asyncio.sleep(0)
        events = MagicMock()
        events.list_after.return_value = []
        jobs = MagicMock()
        jobs.to_public_by_session.return_value = {
            "id": "j", "stage": "GENERATING_BATCH", "last_event_id": 900,
        }
        stream = stream_session_events(
            session_id="s", cursor=10, event_store=events, job_store=jobs,
            broadcaster=hub,
        )
        received = []
        async def consume():
            async for frame in stream:
                if frame.startswith(":"):
                    continue
                value = frame_data(frame)
                if value["event_type"] == "topic_content_delta":
                    received.append(value["payload"]["text_delta"])
                    if len(received) == 2:
                        updates_delivered.set()
                        return
        consumer = asyncio.create_task(consume())
        await asyncio.sleep(0)  # Register before provider sends chunks.
        with fake_instructor(chunks):
            provider = asyncio.create_task(
                InstructorClient().create_partial_structured(
                    role="generator", response_model=StreamOutput, messages=[],
                    api_key="fixture-secret", model_override="model",
                    on_delta=publish,
                )
            )
            try:
                await asyncio.wait_for(updates_delivered.wait(), 0.25)
                self.assertEqual(received, ["a", "b"])
                self.assertFalse(provider.done())
                self.assertFalse(release.is_set())
                events.append_once.assert_not_called()
                release.set()
                self.assertEqual((await provider).text, "abc")
            finally:
                release.set()
                for task in (provider, consumer):
                    if not task.done():
                        task.cancel()
                await asyncio.gather(provider, consumer, return_exceptions=True)
                await stream.aclose()

    async def test_real_repository_adapters_share_milestone_and_draft_cursors(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "a2ui.db"
            LearningManager(path).init_learning_tables()
            initialize_generation_schema(path)
            session, _ = GenerationJobStore(path).create_session_shell_and_job(
                query="Parity", user_id=None, mode="lite",
                web_search_requested=False,
            )
            session_id = session["id"]
            sqlite = ProgressEventStore(path)
            milestone = sqlite.append_once(
                session_id=session_id,
                event_type=ProgressEventType.STAGE_CHANGED,
                payload=StageChangedPayload(
                    previous_stage=GenerationStage.PLANNING_BATCH,
                    stage=GenerationStage.GENERATING_BATCH,
                ), dedupe_key="parity-stage",
            )
            documents = [{
                "_id": milestone.id, "session_id": session_id,
                "event_type": "stage_changed",
                "payload": milestone.payload.model_dump(mode="json"),
                "dedupe_key": "parity-stage",
                "created_at": milestone.created_at.isoformat(),
            }]
            collection = MagicMock()
            def find(query):
                selected = [doc for doc in documents
                            if doc["_id"] > query["_id"]["$gt"]]
                cursor = MagicMock()
                cursor.sort.return_value = cursor
                cursor.limit.return_value = cursor
                cursor.__iter__.side_effect = lambda: iter(selected)
                return cursor
            collection.find.side_effect = find
            counters = MagicMock()
            database = MagicMock()
            database.__getitem__.side_effect = lambda name: {
                "progress_events": collection,
                "storage_counters": counters,
                "generation_jobs": MagicMock(),
            }[name]
            mongo = MongoProgressEventRepository(database)
            for backend in (sqlite, mongo):
                with self.subTest(backend=type(backend).__name__):
                    facade = RepositoryFacade(lambda: backend)
                    hub = SessionLiveStreamBroadcaster()
                    await hub.begin_target(
                        session_id=session_id, job_id="j",
                        stage=GenerationStage.GENERATING_BATCH,
                        target_type="topic", target_id="n", sequence_index=0,
                        attempt=1,
                    )
                    async def push(text):
                        await hub.publish(
                            session_id=session_id, job_id="j",
                            stage=GenerationStage.GENERATING_BATCH,
                            event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                            payload=TopicContentDeltaPayload(
                                node_id="n", sequence_index=0, text_delta=text,
                            ),
                        )
                    await push("retained")
                    jobs = MagicMock()
                    jobs.to_public_by_session.return_value = {
                        "id": "j", "stage": "GENERATING_BATCH",
                        "last_event_id": milestone.id + 500,
                    }
                    stream = stream_session_events(
                        session_id=session_id, cursor=0,
                        event_store=facade, job_store=jobs, broadcaster=hub,
                    )
                    try:
                        durable = frame_data(await anext(stream))
                        self.assertEqual(durable["id"], milestone.id)
                        snapshot = frame_data(await anext(stream))
                        self.assertEqual(snapshot["snapshot"]["text"], "retained")
                        self.assertEqual(snapshot["sequence"], 2)
                        await push(" live")
                        live = frame_data(await asyncio.wait_for(anext(stream), 0.1))
                        self.assertEqual(live["sequence"], 3)
                        self.assertEqual(live["id"], 0)
                        self.assertEqual(len(facade.list_after(session_id, 0)), 1)
                    finally:
                        await stream.aclose()
            collection.insert_one.assert_not_called()
            counters.find_one_and_update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
