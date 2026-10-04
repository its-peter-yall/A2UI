"""
============================================================================
FILE: test_live_generation_safety.py
LOCATION: server/tests/test_live_generation_safety.py
============================================================================
PURPOSE:
    Verify live display projections exclude credentials and hidden fields.
ROLE IN PROJECT:
    Protects provisional output without altering final artifact sanitization.
KEY COMPONENTS:
    - LiveSafetyTests: Incremental secret, link, and field allowlist tests.
============================================================================
"""

from __future__ import annotations

import json
import unittest

from server.agents.generator import GeneratedContent
from server.graph import nodes
from server.schemas.progress import ProgressEventType
from server.tests.realtime_foundation_helpers import fake_instructor
from server.tests.test_live_outline_streaming import (
    LiveHarness, content, outline, partial_content,
)


def live_json(hub):
    return json.dumps([
        {
            "event": args["event_type"].value,
            "payload": args["payload"].model_dump(mode="json"),
        } for kind, args in hub.events if kind == "live"
    ])


class LiveSafetyTests(unittest.IsolatedAsyncioTestCase):
    def test_sensitive_syntax_is_withheld_until_classified(self):
        cases = (
            ("Visible [source:", "Visible "),
            ("Visible [source:bad] end", "Visible  end"),
            ("Visible [source:ok] end", "Visible [source:ok] end"),
            ("Visible <img src='https://bad", "Visible "),
            ("Visible <img src='https://bad'> end", "Visible  end"),
            ("Visible ![image](data:SECRET_IMAGE) end", "Visible  end"),
            ("Visible [link](https://bad/SECRET) end", "Visible  end"),
            ("Visible ht", "Visible "),
        )
        for raw, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(nodes._safe_live_display(
                    raw, secrets=(), approved_source_ids={"ok"},
                ), expected)

    async def test_only_explanation_field_is_public(self):
        async def stream(**kwargs):
            yield content(
                thinking_content="HIDDEN_REASONING_SECRET",
                quiz_answer="QUIZ_ANSWER_SECRET",
                provider_body="RAW_PROVIDER_SECRET",
                warnings=["WARNING_SECRET"],
            )

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.generator_node(h.worker_state(), h.runtime)
            wire = live_json(h.hub)
            for secret in ("HIDDEN_REASONING_SECRET", "QUIZ_ANSWER_SECRET",
                           "RAW_PROVIDER_SECRET", "WARNING_SECRET"):
                self.assertNotIn(secret, wire)
            self.assertIn("Alpha explanation", wire)
            self.assertNotIn("key_takeaways", wire)
            self.assertNotIn("citations", wire)

    async def test_secret_and_unsafe_link_split_across_partials(self):
        async def stream(**kwargs):
            for text in (
                "Safe opening. fixture-secon",
                "Safe opening. fixture-secondary-key More. ht",
                "Safe opening. fixture-secondary-key More. "
                "https://user:password@bad.example/?api_key=SECRET_URL ",
                "Safe opening. fixture-secondary-key More. "
                "https://user:password@bad.example/?api_key=SECRET_URL "
                "[source:unapproved] [click](javascript:alert(1)) ",
            ):
                yield partial_content(content_markdown=text)
            yield content(
                "Safe opening. fixture-secondary-key More. "
                "https://user:password@bad.example/?api_key=SECRET_URL "
                "[source:unapproved] [click](javascript:alert(1)) "
                + "Explanation. " * 30,
            )

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.generator_node(h.worker_state(), h.runtime)
            wire = live_json(h.hub)
            for forbidden in ("fixture-secon", "secondary-key", "https://",
                              "bad.example", "SECRET_URL", "password",
                              "javascript:", "source:unapproved"):
                self.assertNotIn(forbidden, wire)
            self.assertIn("Safe opening", wire)
            self.assertIn("Explanation", wire)

    async def test_title_fields_also_redact_inactive_provider_credentials(self):
        async def stream(**kwargs):
            yield outline(1, "Title fixture-secondary-key")

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.outline_planner_node(h.outline_state(), h.runtime)
            self.assertNotIn("fixture-secondary-key", live_json(h.hub))
            self.assertIn("Title", live_json(h.hub))

    async def test_invalid_final_partials_never_become_saved_artifacts(self):
        calls = 0
        async def stream(**kwargs):
            nonlocal calls
            calls += 1
            yield partial_content(
                content_markdown="Short preview", key_takeaways=[],
            )

        with LiveHarness() as h, fake_instructor(stream):
            result = await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertFalse(result["generator_results"][0]["content_ready"])
            self.assertEqual(h.saved, {})
            self.assertEqual(h.ready, set())
            h.artifacts.persist_content_with_citations.assert_not_called()
            self.assertNotIn("topic_explanation_ready", live_json(h.hub))
            self.assertNotIn(("durable", "module_ready"), h.trace)
            self.assertLessEqual(calls, 3)

    async def test_approved_citation_objects_and_claims_are_not_streamed(self):
        from server.schemas.generation import SourceCitation

        async def stream(**kwargs):
            yield content(citations=[SourceCitation(
                source_id="not-approved", claim="UNAPPROVED_CLAIM_SECRET",
            )])

        with LiveHarness() as h, fake_instructor(stream):
            await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertNotIn("UNAPPROVED_CLAIM_SECRET", live_json(h.hub))
            persisted = h.artifacts.persist_content_with_citations.call_args
            self.assertEqual(persisted.kwargs["citations"], [])


if __name__ == "__main__":
    unittest.main()
