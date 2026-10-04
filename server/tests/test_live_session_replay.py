"""
============================================================================
FILE: test_live_session_replay.py
LOCATION: server/tests/test_live_session_replay.py
============================================================================
PURPOSE:
    Verifies live SSE merge with durable replay and atomic snapshots.
ROLE IN PROJECT:
    Proves reconnect snapshots ignore job watermarks and that publishes
    during durable replay appear once as a current snapshot.
KEY COMPONENTS:
    - LiveSessionReplayTests: Reconnect and replay-race tests
============================================================================
"""

from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    ProgressEventType, StageChangedPayload, TopicContentDeltaPayload,
)
from server.services.session_event_stream import (
    SessionLiveStreamBroadcaster, stream_session_events,
)


def data(frame):
    return json.loads(next(line[6:] for line in frame.splitlines()
                           if line.startswith("data: ")))


class LiveSessionReplayTests(unittest.IsolatedAsyncioTestCase):
    async def test_reconnect_snapshot_then_resume_ignores_job_watermark(self):
        hub = SessionLiveStreamBroadcaster()
        await hub.begin_target(
            session_id="s", job_id="j", stage=GenerationStage.GENERATING_BATCH,
            target_type="topic", target_id="n", sequence_index=0, attempt=1,
        )
        async def publish(text):
            await hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_BATCH,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n", sequence_index=0, text_delta=text,
                ),
            )
        await publish("before")
        events = MagicMock()
        events.list_after.return_value = []
        jobs = MagicMock()
        jobs.to_public_by_session.return_value = {
            "id": "j", "stage": "GENERATING_BATCH", "last_event_id": 999,
        }
        stream = stream_session_events(
            session_id="s", cursor=10, event_store=events, job_store=jobs,
            broadcaster=hub,
        )
        try:
            snapshot = await asyncio.wait_for(anext(stream), 0.2)
            self.assertNotIn("\nid:", "\n" + snapshot)
            self.assertEqual(data(snapshot)["id"], 0)
            self.assertEqual(data(snapshot)["snapshot"]["text"], "before")
            await publish("after")
            delta = await asyncio.wait_for(anext(stream), 0.1)
            self.assertEqual(data(delta)["payload"]["text_delta"], "after")
            self.assertEqual(data(delta)["sequence"], 3)
            self.assertNotIn("generation", data(delta))
            self.assertEqual(events.list_after.call_args.args[1], 10)
            events.append_once.assert_not_called()
        finally:
            await stream.aclose()
        stream2 = stream_session_events(
            session_id="s", cursor=999, event_store=events, job_store=jobs,
            broadcaster=hub,
        )
        try:
            restored = data(await asyncio.wait_for(anext(stream2), 0.2))
            self.assertEqual(restored["snapshot"]["text"], "beforeafter")
            self.assertEqual(restored["sequence"], 3)
        finally:
            await stream2.aclose()

    async def test_publish_during_replay_is_in_snapshot_once(self):
        hub = SessionLiveStreamBroadcaster()
        await hub.begin_target(
            session_id="s", job_id="j", stage=GenerationStage.GENERATING_BATCH,
            target_type="topic", target_id="n", sequence_index=0, attempt=1,
        )
        events = MagicMock()
        events.list_after.side_effect = [[SimpleNamespace(
            id=8, event_type=ProgressEventType.STAGE_CHANGED,
            payload=StageChangedPayload(
                previous_stage=GenerationStage.PLANNING_BATCH,
                stage=GenerationStage.GENERATING_BATCH,
            ), created_at="2026-10-04T00:00:00Z",
        )], [], []]
        jobs = MagicMock()
        jobs.to_public_by_session.return_value = {
            "id": "j", "stage": "GENERATING_BATCH", "last_event_id": 8,
        }
        stream = stream_session_events(
            session_id="s", cursor=7, event_store=events, job_store=jobs,
            broadcaster=hub, heartbeat_seconds=0,
        )
        try:
            self.assertIn("id: 8\n", await anext(stream))
            await hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_BATCH,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n", sequence_index=0, text_delta="during",
                ),
            )
            snapshot = data(await anext(stream))
            self.assertEqual(snapshot["snapshot"]["text"], "during")
            self.assertEqual(snapshot["sequence"], 2)
            self.assertEqual(await anext(stream), ": keepalive\n\n")
        finally:
            await stream.aclose()


if __name__ == "__main__":
    unittest.main()
