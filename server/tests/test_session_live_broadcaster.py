"""
============================================================================
FILE: test_session_live_broadcaster.py
LOCATION: server/tests/test_session_live_broadcaster.py
============================================================================
PURPOSE:
    Verifies live draft target isolation, accumulation, and attempt reset.
ROLE IN PROJECT:
    Locks SessionLiveStreamBroadcaster behavior for P2/P3 producers.
    - Isolates concurrent topics and sessions
    - Replaces only the retried target's draft
KEY COMPONENTS:
    - begin/send: Topic-target test helpers
    - SessionLiveBroadcasterTests: Isolation and reconnect tests
============================================================================
"""

from __future__ import annotations

import asyncio
import unittest

from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    ProgressEventType, TopicContentDeltaPayload,
)
from server.services.session_event_stream import SessionLiveStreamBroadcaster


async def begin(hub, node="n", attempt=1, session="s", index=0):
    await hub.begin_target(
        session_id=session, job_id="j", stage=GenerationStage.GENERATING_BATCH,
        target_type="topic", target_id=node, sequence_index=index,
        attempt=attempt, reason="started" if attempt == 1 else "retry",
    )


async def send(hub, text, node="n", attempt=1, session="s", index=0):
    await hub.publish(
        session_id=session, job_id="j", stage=GenerationStage.GENERATING_BATCH,
        event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
        payload=TopicContentDeltaPayload(
            node_id=node, sequence_index=index,
            text_delta=text, attempt=attempt,
        ),
    )


class SessionLiveBroadcasterTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_topics_and_sessions_are_isolated(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub, "a", index=0)
        await begin(hub, "b", index=1)
        await begin(hub, "a", session="other", index=0)
        await asyncio.gather(
            send(hub, "A", "a", index=0),
            send(hub, "B", "b", index=1),
        )
        await send(hub, "1", "a", index=0)
        await send(hub, "2", "b", index=1)
        await send(hub, "private", "a", session="other", index=0)
        async with hub.subscribe("s") as sub:
            values = {event.payload.target_id if
                      event.event_type == ProgressEventType.TARGET_DRAFT_RESET
                      else event.payload.node_id: event.snapshot.text
                      for event in sub.snapshots}
            self.assertEqual(values, {"a": "A1", "b": "B2"})
            self.assertNotIn("private", str(sub.snapshots))

    async def test_retry_resets_only_affected_target_and_drops_old_attempt(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub, "a", index=0)
        await begin(hub, "b", index=1)
        await send(hub, "old", "a", index=0)
        await send(hub, "healthy", "b", index=1)
        await begin(hub, "a", attempt=2, index=0)
        await send(hub, "stale", "a", attempt=1, index=0)
        await send(hub, "new", "a", attempt=2, index=0)
        async with hub.subscribe("s") as sub:
            by_node = {event.payload.node_id: event for event in sub.snapshots}
            self.assertEqual(by_node["a"].snapshot.text, "new")
            self.assertEqual(by_node["a"].attempt, 2)
            self.assertEqual(by_node["a"].sequence, 2)
            self.assertEqual(by_node["b"].snapshot.text, "healthy")

    async def test_subscribe_captures_snapshot_then_receives_future_delta(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub)
        await send(hub, "first")
        async with hub.subscribe("s") as sub:
            self.assertEqual(sub.snapshots[0].snapshot.text, "first")
            await send(hub, "second")
            event = await asyncio.wait_for(sub.next_event(), 0.1)
            self.assertEqual(event.payload.text_delta, "second")
            self.assertEqual(event.sequence, 3)
        async with hub.subscribe("s") as reconnected:
            self.assertEqual(reconnected.snapshots[0].snapshot.text,
                             "firstsecond")


if __name__ == "__main__":
    unittest.main()
