"""
============================================================================
FILE: test_live_stream_bounds.py
LOCATION: server/tests/test_live_stream_bounds.py
============================================================================
PURPOSE:
    Verifies draft retention budget and slow-subscriber backpressure.
ROLE IN PROJECT:
    Keeps live previews bounded without blocking producers.
    - Trims UTF-8 windows with character offsets
    - Compacts subscriber mailboxes to latest snapshots
KEY COMPONENTS:
    - LiveStreamBoundsTests: Budget, overflow, and retire tests
============================================================================
"""

from __future__ import annotations

import asyncio
import unittest

from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.tests.test_session_live_broadcaster import begin, send


class LiveStreamBoundsTests(unittest.IsolatedAsyncioTestCase):
    async def test_utf8_budget_keeps_latest_window_with_character_offset(self):
        hub = SessionLiveStreamBroadcaster(max_draft_bytes=12)
        await begin(hub)
        await send(hub, "é" * 10)
        async with hub.subscribe("s") as sub:
            snapshot = sub.snapshots[0].snapshot
            self.assertLessEqual(len(snapshot.text.encode("utf-8")), 12)
            self.assertEqual(snapshot.text, "é" * 6)
            self.assertEqual(snapshot.text_offset, 4)
            self.assertTrue(snapshot.truncated)

    async def test_slow_subscriber_receives_replacement_not_missing_suffixes(self):
        hub = SessionLiveStreamBroadcaster(subscriber_limit=2)
        await begin(hub)
        async with hub.subscribe("s") as sub:
            for _ in range(20):
                await asyncio.wait_for(send(hub, "x"), 0.1)
            self.assertLessEqual(sub.queue.qsize(), 2)
            restored = sub.snapshots[0].snapshot.text
            sequence = sub.snapshots[0].sequence
            while not sub.queue.empty():
                event = sub.queue.get_nowait()
                if event.sequence <= sequence:
                    continue
                if event.snapshot is not None:
                    restored = event.snapshot.text
                else:
                    restored += event.payload.text_delta
                sequence = event.sequence
            self.assertEqual(restored, "x" * 20)

    async def test_retire_and_clear_release_retained_drafts(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub)
        await send(hub, "preview")
        await hub.retire_target(
            session_id="s", target_type="topic", target_id="n",
            sequence_index=0,
        )
        self.assertEqual(await hub.snapshots("s"), [])
        await begin(hub)
        await send(hub, "preview")
        await hub.clear_session("s")
        self.assertEqual(await hub.snapshots("s"), [])


if __name__ == "__main__":
    unittest.main()
