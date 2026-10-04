"""
============================================================================
FILE: test_live_stream_safety.py
LOCATION: server/tests/test_live_stream_safety.py
============================================================================
PURPOSE:
    Verifies credential-safe callbacks and live payload attribution.
ROLE IN PROJECT:
    Prevents secret leakage and stale/wrong-stage live publishes.
    - Redacts API keys only in display callbacks
    - Rejects untrusted reset reasons and old-job drafts
KEY COMPONENTS:
    - LiveStreamSafetyTests: Redaction, logging, and attribution tests
============================================================================
"""

from __future__ import annotations

import unittest

from pydantic import BaseModel

from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    ProgressEventType, TopicContentDeltaPayload, TargetDraftResetPayload,
)
from server.services.session_event_stream import SessionLiveStreamBroadcaster
from server.tests.realtime_foundation_helpers import fake_instructor
from server.tests.test_session_live_broadcaster import begin, send
from server.utils.instructor_client import InstructorClient


class SafeOutput(BaseModel):
    text: str


class LiveStreamSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_credential_echo_is_redacted_only_in_display_callback(self):
        seen = []
        async def chunks(**kwargs):
            yield SafeOutput(text="Provider echoed fixture-secret")
        async def collect(update):
            if update.partial is not None:
                seen.append(update.partial.text)
        with fake_instructor(chunks):
            final = await InstructorClient().create_partial_structured(
                role="generator", response_model=SafeOutput, messages=[],
                api_key="fixture-secret", model_override="model",
                on_delta=collect,
            )
        self.assertNotIn("fixture-secret", str(seen))
        self.assertIn("[redacted]", seen[0])
        self.assertIn("fixture-secret", final.text)

    async def test_provider_failure_logs_no_secrets_or_raw_body(self):
        async def fail(**kwargs):
            raise ValueError("fixture-secret raw-provider-body quiz-answer")
            yield SafeOutput(text="unreachable")
        with fake_instructor(fail), self.assertLogs(
            "server.utils.instructor_client", level="ERROR",
        ) as logs:
            with self.assertRaises(ValueError):
                await InstructorClient().create_partial_structured(
                    role="generator", response_model=SafeOutput, messages=[],
                    api_key="fixture-secret", model_override="model",
                )
        rendered = "".join(logs.output)
        for secret in ("fixture-secret", "raw-provider-body", "quiz-answer"):
            self.assertNotIn(secret, rendered)
        self.assertIn("ValueError", rendered)

    async def test_wrong_stage_and_untrusted_reset_reason_are_rejected(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub)
        with self.assertRaises(ValueError):
            await hub.publish(
                session_id="s", job_id="j", stage=GenerationStage.RESEARCHING,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n", sequence_index=0, text_delta="wrong stage",
                ),
            )
        with self.assertRaises(ValueError):
            await hub.publish(
                session_id="s", job_id="j",
                stage=GenerationStage.GENERATING_BATCH,
                event_type=ProgressEventType.TARGET_DRAFT_RESET,
                payload=TargetDraftResetPayload(
                    target_type="topic", target_id="n", sequence_index=0,
                    attempt=2, reason="raw-provider-body fixture-secret",
                ),
            )
        self.assertEqual((await hub.snapshots("s"))[0].snapshot.text, "")

    async def test_old_job_cannot_replace_the_new_jobs_draft(self):
        hub = SessionLiveStreamBroadcaster()
        await begin(hub)
        await send(hub, "current")
        with self.assertRaises(ValueError):
            await hub.publish(
                session_id="s", job_id="old-job",
                stage=GenerationStage.GENERATING_BATCH,
                event_type=ProgressEventType.TOPIC_CONTENT_DELTA,
                payload=TopicContentDeltaPayload(
                    node_id="n", sequence_index=0, text_delta="stale",
                ),
            )
        self.assertEqual((await hub.snapshots("s"))[0].snapshot.text, "current")


if __name__ == "__main__":
    unittest.main()
