"""
============================================================================
FILE: test_live_progress_contracts.py
LOCATION: server/tests/test_live_progress_contracts.py
============================================================================
PURPOSE:
    Locks the six live draft payloads and live envelope validators.
ROLE IN PROJECT:
    Frozen P1 contract for P2/P3/P4 live progress events.
    - Rejects secret/extra fields on closed payloads
    - Rejects durable IDs and mismatched live envelope payloads
KEY COMPONENTS:
    - LiveProgressContractsTests: Payload and envelope contract tests
============================================================================
"""

from __future__ import annotations

import unittest

from pydantic import ValidationError

from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    PAYLOAD_BY_EVENT_TYPE, DraftSnapshot, LiveDraftEvent,
    ProgressEventType, ResearchSourcesUpdatedPayload,
    ResearchTextDeltaPayload, OutlineTextDeltaPayload,
    TopicContentDeltaPayload, TopicExplanationReadyPayload,
    TargetDraftResetPayload,
)

CASES = [
    ("research_sources_updated", ResearchSourcesUpdatedPayload,
     {"unique_source_count": 2, "new_sources_count": 1}),
    ("research_text_delta", ResearchTextDeltaPayload,
     {"report_id": "r", "theme": "Basics", "sequence_index": 0,
      "text_delta": "Growing"}),
    ("outline_text_delta", OutlineTextDeltaPayload,
     {"course_title_delta": "Course"}),
    ("topic_content_delta", TopicContentDeltaPayload,
     {"node_id": "n", "sequence_index": 0, "text_delta": "Text"}),
    ("topic_explanation_ready", TopicExplanationReadyPayload,
     {"node_id": "n", "sequence_index": 0}),
    ("target_draft_reset", TargetDraftResetPayload,
     {"target_type": "topic", "target_id": "n", "attempt": 2,
      "reason": "retry"}),
]


class LiveProgressContractsTests(unittest.TestCase):
    def test_all_six_types_have_closed_payloads(self):
        for name, cls, fields in CASES:
            with self.subTest(name=name):
                kind = ProgressEventType(name)
                self.assertIs(PAYLOAD_BY_EVENT_TYPE[kind], cls)
                payload = cls(**fields)
                self.assertEqual(payload.model_dump()[next(iter(fields))],
                                 fields[next(iter(fields))])
                for forbidden in (
                    "api_key", "answers", "reasoning", "raw_response"
                ):
                    with self.assertRaises(ValidationError):
                        cls(**fields, **{forbidden: "private"})

    def test_empty_outline_and_unpaired_topic_are_rejected(self):
        for fields in ({}, {"topic_index": 0},
                       {"topic_title_delta": "Topic"}):
            with self.assertRaises(ValidationError):
                OutlineTextDeltaPayload(**fields)
        with self.assertRaises(ValidationError):
            ResearchSourcesUpdatedPayload(
                unique_source_count=1, new_sources_count=2,
            )

    def test_envelope_rejects_durable_ids_and_wrong_payloads(self):
        fields = dict(
            session_id="s", job_id="j", stage=GenerationStage.OUTLINING,
            target='["outline","s",null]', attempt=1, sequence=2,
            event_type=ProgressEventType.OUTLINE_TEXT_DELTA,
            payload=OutlineTextDeltaPayload(course_title_delta="Course"),
        )
        event = LiveDraftEvent(**fields, snapshot=DraftSnapshot())
        self.assertEqual(event.id, 0)
        with self.assertRaises(ValidationError):
            LiveDraftEvent(**fields, id=1)
        fields["payload"] = TopicExplanationReadyPayload(
            node_id="n", sequence_index=0,
        )
        with self.assertRaises(ValidationError):
            LiveDraftEvent(**fields)


if __name__ == "__main__":
    unittest.main()
