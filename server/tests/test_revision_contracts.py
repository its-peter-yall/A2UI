"""
============================================================================
FILE: test_revision_contracts.py
LOCATION: server/tests/test_revision_contracts.py
============================================================================
PURPOSE:
    Schema regression tests for aligned revision attempt, node, and notice
    response contracts shared by SQLite, Mongo, and the TypeScript client.
ROLE IN PROJECT:
    Guards the P1 shared revision wire contract.
    - Verifies every attempt/node/notice field is required and serialized
    - Verifies wrong answers cannot disclose correct answers or a wrong score
    - Verifies restored feedback cannot cross node or quiz boundaries
KEY COMPONENTS:
    - attempt_payload: Canonical invalid-but-complete submission fixture
    - RevisionContractTests: Required-field and disclosure contract tests
DEPENDENCIES:
    - External: unittest, pydantic
    - Internal: server.schemas.learning
USAGE:
    python -m unittest server.tests.test_revision_contracts -v
============================================================================
"""

from __future__ import annotations

import unittest

from pydantic import ValidationError

from server.schemas.learning import (
    RevisionNodeProgressWithDetails,
    RevisionQuizSubmissionResult,
    RevisionSessionResponse,
)


def attempt_payload() -> dict[str, object]:
    """Return a complete wrong-answer submission payload."""
    return {
        'id': 'attempt-9',
        'revision_session_id': 'revision-1',
        'node_id': 'node-1',
        'quiz_index': 1,
        'attempt_number': 9,
        'quiz_attempt_count': 2,
        'selected_option_ids': ['option-2'],
        'is_correct': False,
        'score_percent': 0,
        'correct_option_ids': [],
        'explanation': '',
        'selected_explanation': 'Selected option explanation',
        'created_at': '2026-10-05T10:00:00Z',
        'revision_node_status': 'pending',
    }


class RevisionContractTests(unittest.TestCase):
    def test_submission_keeps_required_identity_and_nullable_fields(self) -> None:
        payload = attempt_payload()
        dumped = RevisionQuizSubmissionResult.model_validate(
            payload
        ).model_dump(mode='json')
        self.assertEqual(set(dumped), set(payload))
        self.assertEqual(dumped['node_id'], 'node-1')
        payload['selected_explanation'] = None
        self.assertIsNone(
            RevisionQuizSubmissionResult.model_validate(
                payload
            ).selected_explanation
        )
        for field in payload:
            with self.subTest(field=field):
                missing = dict(payload)
                del missing[field]
                with self.assertRaises(ValidationError):
                    RevisionQuizSubmissionResult.model_validate(missing)

    def test_wrong_feedback_cannot_disclose_answers_or_wrong_score(self) -> None:
        for field, value in (
            ('correct_option_ids', ['unselected-correct']),
            ('explanation', 'Hidden answer'),
            ('score_percent', 100),
            ('quiz_index', -1),
            ('attempt_number', 0),
            ('quiz_attempt_count', 0),
            ('selected_option_ids', []),
        ):
            with self.subTest(field=field):
                payload = attempt_payload()
                payload[field] = value
                with self.assertRaises(ValidationError):
                    RevisionQuizSubmissionResult.model_validate(payload)

    def test_restored_shape_matches_submission_without_topic_status(self) -> None:
        payload = attempt_payload()
        del payload['revision_node_status']
        node = RevisionNodeProgressWithDetails.model_validate({
            'id': 'progress-1',
            'node_id': 'node-1',
            'node_title': 'Topic',
            'sequence_index': 0,
            'status': 'pending',
            'reviewed_at': None,
            'content_reviewed_at': None,
            'quiz_count': 2,
            'quiz_results': [payload],
        })
        restored = node.model_dump(mode='json')['quiz_results'][0]
        self.assertEqual(set(restored), set(payload))
        self.assertNotIn('revision_node_status', restored)
        for field in ('content_reviewed_at', 'quiz_count', 'quiz_results'):
            data = node.model_dump()
            del data[field]
            with self.subTest(field=field):
                with self.assertRaises(ValidationError):
                    RevisionNodeProgressWithDetails.model_validate(data)

    def test_session_notice_contract_is_required_and_serialized(self) -> None:
        payload = {
            'id': 'revision-1',
            'original_session_id': 'original-1',
            'revision_number': 1,
            'mode': 'full_review',
            'status': 'in_progress',
            'progress_percent': 0,
            'total_quiz_score_percent': None,
            'started_at': '2026-10-05T09:00:00Z',
            'completed_at': None,
            'notices': [{
                'code': 'legacy_review_required',
                'node_id': 'node-1',
                'attempt_count': 0,
            }],
        }
        dumped = RevisionSessionResponse.model_validate(
            payload
        ).model_dump(mode='json')
        self.assertEqual(dumped['notices'], payload['notices'])
        del payload['notices']
        with self.assertRaises(ValidationError):
            RevisionSessionResponse.model_validate(payload)


def main() -> None:
    """Run the revision contract tests."""
    unittest.main()


if __name__ == '__main__':
    main()
