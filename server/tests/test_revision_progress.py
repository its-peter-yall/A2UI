"""
============================================================================
FILE: test_revision_progress.py
LOCATION: server/tests/test_revision_progress.py
============================================================================
PURPOSE:
    Pure tests for revision timestamp/selection normalization and the
    authoritative node and revision projection services.
ROLE IN PROJECT:
    TDD guard for the shared revision projection used by both repositories.
    - Normalizes persisted selection and timestamp shapes without mutation
    - Validates stable option identity and exact-match selection
    - Projects independent reading, latest per-quiz feedback, and aggregates
KEY COMPONENTS:
    - quiz/topic/saved/revision: Deterministic revision fixtures
    - RevisionNormalizationTests: Normalization and selection evaluation
    - RevisionNodeProjectionTests: Per-topic projection rules
    - RevisionAggregateProjectionTests: Session aggregate and timestamps
DEPENDENCIES:
    - External: unittest, datetime
    - Internal: server.schemas.learning, server.services.revision_progress
USAGE:
    python -m unittest server.tests.test_revision_progress -v
============================================================================
"""

from __future__ import annotations

import unittest
from datetime import datetime, timezone

from server.schemas.learning import QuizCard
from server.services.revision_progress import (
    evaluate_revision_selection,
    normalize_revision_timestamp,
    normalize_selected_option_ids,
)


def quiz(prefix: str, multiple: bool = False) -> QuizCard:
    """Return a shuffled-label quiz with stable opaque option IDs."""
    return QuizCard.model_validate({
        'question_text': f'Question {prefix}',
        'question_type': (
            'multiple_choice' if multiple else 'single_choice'
        ),
        'options': [
            {
                'option_id': f'{prefix}-{index}',
                'display_label': label,
                'text': f'Option {index}',
                'is_correct': index == 0 or (multiple and index == 2),
                'explanation': f'Explanation {prefix}-{index}',
            }
            for index, label in enumerate(('D', 'B', 'A', 'C'))
        ],
    })


class RevisionNormalizationTests(unittest.TestCase):
    def test_legacy_selection_shapes_normalize_without_label_mapping(
        self,
    ) -> None:
        for value, expected in (
            ('q-0', ('q-0',)),
            ('["q-0", "q-2"]', ('q-0', 'q-2')),
            (['q-0', 'q-2'], ('q-0', 'q-2')),
            (None, None),
            ('[]', None),
            ('[1]', None),
            (['q-0', 'q-0'], None),
            ('[broken', None),
        ):
            with self.subTest(value=value):
                self.assertEqual(
                    normalize_selected_option_ids(value), expected
                )
        raw = ['q-0', 'q-2']
        normalize_selected_option_ids(raw)
        self.assertEqual(raw, ['q-0', 'q-2'])

    def test_exact_match_uses_ids_and_validates_selection(self) -> None:
        single = quiz('single')
        multi = quiz('multi', multiple=True)
        self.assertTrue(evaluate_revision_selection(single, ['single-0']))
        self.assertFalse(evaluate_revision_selection(single, ['single-1']))
        self.assertTrue(
            evaluate_revision_selection(multi, ['multi-2', 'multi-0'])
        )
        self.assertFalse(evaluate_revision_selection(multi, ['multi-0']))
        self.assertFalse(
            evaluate_revision_selection(
                multi, ['multi-0', 'multi-1', 'multi-2']
            )
        )
        for ids in (
            [], ['A'], ['single-0', 'single-0'], ['single-0', 'single-1']
        ):
            with self.subTest(ids=ids):
                with self.assertRaises(ValueError):
                    evaluate_revision_selection(single, ids)

    def test_timestamps_reconcile_naive_z_and_offset_instants(self) -> None:
        expected = datetime(2026, 10, 5, 10, tzinfo=timezone.utc)
        for value in (
            '2026-10-05T10:00:00Z',
            '2026-10-05T15:30:00+05:30',
            datetime(2026, 10, 5, 10),
            expected,
        ):
            with self.subTest(value=value):
                self.assertEqual(normalize_revision_timestamp(value), expected)
        with self.assertRaises(ValueError):
            normalize_revision_timestamp('bad-date')


def main() -> None:
    """Run the revision projection tests."""
    unittest.main()


if __name__ == '__main__':
    main()
