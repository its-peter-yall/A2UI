"""
============================================================================
FILE: test_live_topic_readiness.py
LOCATION: server/tests/test_live_topic_readiness.py
============================================================================
PURPOSE:
    Verify content and quiz persistence precede their readiness signals.
ROLE IN PROJECT:
    Protects two-phase preview retention and durable milestone retirement.
KEY COMPONENTS:
    - LiveReadinessTests: Commit, failure, and retirement contract tests.
============================================================================
"""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from server.graph import nodes
from server.schemas.learning import QuizCard, QuizOption, QuizSet
from server.schemas.progress import ProgressEventType
from server.tests.realtime_foundation_helpers import fake_instructor
from server.tests.test_live_outline_streaming import (
    LiveHarness, content, dispose, outline,
)


def quiz_set():
    return QuizSet(quizzes=[QuizCard(
        question_text="Which is correct?",
        options=[QuizOption(
            option_id=str(index), display_label=label,
            text=f"Option {index}", is_correct=index == 0,
            explanation="QUIZ_ANSWER_SECRET",
        ) for index, label in enumerate("ABCD")],
    )])


class LiveReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_explanation_ready_waits_for_commit_and_keeps_preview(self):
        entered = asyncio.Event()
        release = asyncio.Event()

        async def stream(**kwargs):
            yield content()

        async def quizzes(**kwargs):
            entered.set()
            await release.wait()
            return quiz_set()

        with LiveHarness() as h, fake_instructor(stream), patch.object(
            nodes.quizzer_agent, "generate_quiz_set", side_effect=quizzes,
        ):
            original_publish = h.hub.publish
            async def publish(**kwargs):
                if kwargs["event_type"] == (
                    ProgressEventType.TOPIC_EXPLANATION_READY
                ):
                    self.assertIn("n0", h.saved)
                    self.assertIn(("content_saved", "n0"), h.trace)
                    self.assertNotIn("n0", h.ready)
                await original_publish(**kwargs)
            h.hub.publish = publish
            original_retire = h.hub.retire_target
            async def retire(**kwargs):
                self.assertIn(("quiz_saved", "n0"), h.trace)
                self.assertIn(("durable", "module_ready"), h.trace)
                await original_retire(**kwargs)
            h.hub.retire_target = retire
            await nodes.generator_node(h.worker_state(), h.runtime)
            snap = (await h.hub.snapshots("s"))[0]
            self.assertTrue(snap.snapshot.explanation_ready)
            self.assertEqual(h.saved["n0"], content().content_markdown)
            self.assertEqual(h.ready, set())
            self.assertEqual(h.hub.retired, [])
            self.assertNotIn(("durable", "module_ready"), h.trace)
            live = [args for kind, args in h.hub.events if kind == "live"]
            ready = [args for args in live if args["event_type"] ==
                     ProgressEventType.TOPIC_EXPLANATION_READY]
            self.assertEqual(len(ready), 1)
            task = asyncio.create_task(nodes.quizzer_node(
                h.worker_state(), h.runtime,
            ))
            try:
                await asyncio.wait_for(entered.wait(), 1)
                self.assertFalse(task.done())
                self.assertTrue((await h.hub.snapshots("s"))[0]
                                .snapshot.explanation_ready)
                self.assertEqual(h.ready, set())
                release.set()
                await task
                self.assertEqual(h.ready, {"n0"})
                self.assertLess(h.trace.index(("quiz_saved", "n0")),
                                h.trace.index(("durable", "module_ready")))
                self.assertEqual(await h.hub.snapshots("s"), [])
            finally:
                await dispose(task)

    async def test_persist_failure_never_emits_explanation_ready(self):
        async def stream(**kwargs):
            yield content()

        with LiveHarness() as h, fake_instructor(stream):
            h.artifacts.persist_content_with_citations.side_effect = (
                RuntimeError("commit failed")
            )
            result = await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertFalse(result["generator_results"][0]["content_ready"])
            snaps = await h.hub.snapshots("s")
            self.assertFalse(snaps[0].snapshot.explanation_ready)
            self.assertEqual(h.saved, {})
            self.assertEqual(h.hub.retired, [])

    async def test_failed_module_ready_append_retains_preview(self):
        async def stream(**kwargs):
            yield content()

        with LiveHarness() as h, fake_instructor(stream), patch.object(
            nodes.quizzer_agent, "generate_quiz_set",
            new=AsyncMock(return_value=quiz_set()),
        ):
            await nodes.generator_node(h.worker_state(), h.runtime)
            def append(**kwargs):
                if kwargs["event_type"] == ProgressEventType.MODULE_READY:
                    raise RuntimeError("durable event unavailable")
                return h.append(**kwargs)
            h.events.append_once.side_effect = append
            await nodes.quizzer_node(h.worker_state(), h.runtime)
            self.assertEqual(h.ready, {"n0"})
            self.assertEqual(h.hub.retired, [])
            self.assertTrue((await h.hub.snapshots("s"))[0]
                            .snapshot.explanation_ready)

    async def test_outline_ready_append_failure_retains_toc(self):
        async def stream(**kwargs):
            yield outline()

        with LiveHarness() as h, fake_instructor(stream):
            def append(**kwargs):
                if kwargs["event_type"] == ProgressEventType.OUTLINE_READY:
                    raise RuntimeError("durable event unavailable")
                return h.append(**kwargs)
            h.events.append_once.side_effect = append
            await nodes.outline_planner_node(h.outline_state(), h.runtime)
            self.assertEqual(h.hub.retired, [])
            self.assertEqual(len(await h.hub.snapshots("s")), 1)

    async def test_quiz_failure_preserves_explanation_and_error_milestone(self):
        async def stream(**kwargs):
            yield content()

        with LiveHarness() as h, fake_instructor(stream), patch.object(
            nodes.quizzer_agent, "generate_quiz_set",
            new=AsyncMock(side_effect=RuntimeError("quiz unavailable")),
        ):
            await nodes.generator_node(h.worker_state(), h.runtime)
            result = await nodes.quizzer_node(h.worker_state(), h.runtime)
            self.assertEqual(result["topic_results"][0]["terminal_status"],
                             "ERROR")
            self.assertNotIn(("durable", "module_ready"), h.trace)
            self.assertIn(("durable", "module_failed"), h.trace)
            self.assertTrue((await h.hub.snapshots("s"))[0]
                            .snapshot.explanation_ready)
            self.assertEqual(h.hub.retired, [])


class LiveReadinessPublicationGuards(unittest.IsolatedAsyncioTestCase):
    async def test_failed_explanation_signal_keeps_committed_content(self):
        async def stream(**kwargs):
            yield content()

        with LiveHarness() as h, fake_instructor(stream):
            original_publish = h.hub.publish

            async def publish(**kwargs):
                if kwargs["event_type"] == (
                    ProgressEventType.TOPIC_EXPLANATION_READY
                ):
                    raise RuntimeError("display unavailable")
                await original_publish(**kwargs)

            h.hub.publish = publish
            result = await nodes.generator_node(h.worker_state(), h.runtime)
            self.assertTrue(result["generator_results"][0]["content_ready"])
            self.assertEqual(h.saved["n0"], content().content_markdown)
            h.artifacts.persist_topic_error.assert_not_called()
            self.assertEqual(h.hub.retired, [])


if __name__ == "__main__":
    unittest.main()
