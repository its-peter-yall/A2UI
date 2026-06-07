"""
============================================================================
FILE: test_failed_step_schema.py
LOCATION: server/tests/test_failed_step_schema.py
============================================================================
PURPOSE:
    Validates FailedStep enum and ConceptNodeResponse.failed_step field.
ROLE IN PROJECT:
    Contract test for the new partial-failure tracking column.
USAGE:
    python -m unittest server.tests.test_failed_step_schema -v
============================================================================
"""
from __future__ import annotations

import unittest

from server.schemas.learning import ConceptNodeResponse, FailedStep, NodeStatus


class FailedStepSchemaTests(unittest.TestCase):
    def test_enum_values(self) -> None:
        self.assertEqual(FailedStep.GENERATOR.value, "GENERATOR")
        self.assertEqual(FailedStep.QUIZZER.value, "QUIZZER")
        self.assertEqual(FailedStep.BOTH.value, "BOTH")

    def test_concept_node_response_accepts_failed_step(self) -> None:
        node = ConceptNodeResponse(
            id="n1",
            learning_session_id="s1",
            sequence_index=0,
            title="t",
            content_markdown="c",
            status=NodeStatus.ERROR,
            failed_step=FailedStep.QUIZZER,
        )
        self.assertEqual(node.failed_step, FailedStep.QUIZZER)

    def test_concept_node_response_default_failed_step_none(self) -> None:
        node = ConceptNodeResponse(
            id="n1",
            learning_session_id="s1",
            sequence_index=0,
            title="t",
            content_markdown="c",
            status=NodeStatus.VIEWING_EXPLANATION,
        )
        self.assertIsNone(node.failed_step)


if __name__ == "__main__":
    unittest.main()
