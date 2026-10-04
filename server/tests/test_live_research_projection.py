"""
============================================================================
FILE: test_live_research_projection.py
LOCATION: server/tests/test_live_research_projection.py
============================================================================
PURPOSE:
    Prove incremental URL/credential guards, suffixes, chunking, and
    display-field allowlisting for live research drafts.
ROLE IN PROJECT:
    Dedicated P2 projection tests for private runner display helpers.
    Existing sanitizer tests remain the saved-section contract.
KEY COMPONENTS:
    - ResearchProjectionTests: suffix, correction, secret, and field guards
DEPENDENCIES:
    - External: unittest, unittest.mock
    - Internal: server.services.research_runner, session_event_stream
USAGE:
    python -m unittest server.tests.test_live_research_projection -v
============================================================================
"""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock

from server.schemas.research import ResearchIteration
from server.services.research_runner import (
    _ResearchDraftCorrection, _ResearchTextDisplay,
)
from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.utils.instructor_client import StructuredStreamUpdate


class ResearchProjectionTests(unittest.IsolatedAsyncioTestCase):
    def make_display(self, secrets=()):
        hub = SessionLiveStreamBroadcaster()
        display = _ResearchTextDisplay(
            hub=hub, session_id="s", job_id="j", report_id="r",
            sequence_index=0, theme="fundamentals",
            field_name="section_markdown", allowed_ids={"known"},
            secrets=secrets, check_cancelled=lambda: None,
        )
        return display, hub

    async def send(self, display, text, attempt=1):
        await display.on_delta(StructuredStreamUpdate(
            "partial", attempt,
            ResearchIteration.model_construct(section_markdown=text),
        ))

    async def test_suffix_empty_duplicate_and_chunk_bound(self):
        display, hub = self.make_display()
        with unittest.mock.patch.object(
            hub, "publish", wraps=hub.publish,
        ) as publish:
            await display.on_delta(StructuredStreamUpdate("attempt_started", 1))
            for text in (None, "", "A", "A", "A" + "x" * 9000):
                await self.send(display, text)
            chunks = [c.kwargs["payload"].text_delta
                      for c in publish.await_args_list]
            self.assertEqual("".join(chunks), "A" + "x" * 9000)
            self.assertTrue(all(0 < len(c) <= 4000 for c in chunks))

    async def test_nonprefix_requires_domain_correction_not_concat(self):
        display, hub = self.make_display()
        await display.on_delta(StructuredStreamUpdate("attempt_started", 1))
        await self.send(display, "Original ")
        with self.assertRaises(_ResearchDraftCorrection):
            await self.send(display, "Replacement ")
        snapshot = (await hub.snapshots("s"))[0]
        self.assertEqual(snapshot.snapshot.text, "Original ")

    async def test_fragmented_links_and_credentials_are_never_published(self):
        display, hub = self.make_display(("tvly-private-key", "gc-private-key"))
        await display.on_delta(StructuredStreamUpdate("attempt_started", 1))
        partials = [
            "Evidence ht", "Evidence https://evil.example/key",
            "Evidence https://evil.example/key safe ",
            "Evidence https://evil.example/key safe [link](http://127.0",
            "Evidence https://evil.example/key safe [link](http://127.0.0.1) ",
        ]
        base = partials[-1]
        partials.extend([base + "tvly-pr", base + "tvly-private-key ",
                         base + "tvly-private-key gc-private-key "])
        with unittest.mock.patch.object(
            hub, "publish", wraps=hub.publish,
        ) as publish:
            for text in partials:
                await self.send(display, text)
                snapshot = (await hub.snapshots("s"))[0].snapshot.text
                for forbidden in ("http", "127.0", "evil.example",
                                  "tvly-pr", "gc-private-key"):
                    self.assertNotIn(forbidden, snapshot)
            wire = "".join(c.kwargs["payload"].text_delta
                           for c in publish.await_args_list)
            self.assertIn("Evidence", wire)
            self.assertIn("[redacted]", wire)

    async def test_only_approved_display_field_is_selected(self):
        display, hub = self.make_display()
        await display.on_delta(StructuredStreamUpdate("attempt_started", 1))
        partial = ResearchIteration.model_construct(
            section_markdown="Safe evidence. ", theme="attacker-secret",
            conflicts=["provider-body-secret"],
            follow_up_queries=["hidden-reasoning-secret"],
            source_ids=["unknown-secret"],
        )
        await display.on_delta(StructuredStreamUpdate("partial", 1, partial))
        wire = (await hub.snapshots("s"))[0].model_dump_json()
        self.assertIn("Safe evidence", wire)
        self.assertNotIn("secret", wire)


if __name__ == "__main__":
    unittest.main()
