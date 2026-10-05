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

import copy
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from typing import Optional

from server.schemas.learning import (
    QuizCard,
    RevisionMode,
    RevisionNodeStatus,
)
from server.services.revision_progress import (
    RevisionAttemptInput,
    RevisionNodeInput,
    RevisionProjectionInput,
    evaluate_revision_selection,
    normalize_revision_timestamp,
    normalize_selected_option_ids,
    project_revision,
    project_revision_node,
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


START = datetime(2026, 10, 5, 9, tzinfo=timezone.utc)
FIRST = datetime(2026, 10, 5, 10, tzinfo=timezone.utc)
SECOND = datetime(2026, 10, 5, 11, tzinfo=timezone.utc)


def revision(mode: RevisionMode = 'quiz_only') -> RevisionProjectionInput:
    """Return stored revision metadata for projection inputs."""
    return RevisionProjectionInput(
        id='revision-1', mode=mode, started_at=START,
    )


def topic(
    quizzes: Optional[tuple[QuizCard, ...]] = None,
    *,
    id: str = 'progress-1',
    revision_session_id: str = 'revision-1',
    node_id: str = 'node-1',
    sequence_index: int = 0,
    stored_status: RevisionNodeStatus = 'pending',
    reviewed_at: Optional[datetime] = None,
    explicit_review_present: bool = False,
    content_reviewed_at: Optional[datetime] = None,
) -> RevisionNodeInput:
    """Return a batched node input with two available quizzes by default."""
    return RevisionNodeInput(
        id=id,
        revision_session_id=revision_session_id,
        node_id=node_id,
        node_title='Topic',
        sequence_index=sequence_index,
        quizzes=(quiz('q0'), quiz('q1')) if quizzes is None else quizzes,
        stored_status=stored_status,
        reviewed_at=reviewed_at,
        explicit_review_present=explicit_review_present,
        content_reviewed_at=content_reviewed_at,
    )


def saved(
    identifier: str = 'attempt-a',
    index: int = 0,
    number: int = 1,
    correct: bool = True,
    selected: Optional[tuple[str, ...]] = None,
    created_at: datetime = FIRST,
    revision_id: Optional[str] = 'revision-1',
) -> RevisionAttemptInput:
    """Return a saved attempt consistent with the q{index} quiz."""
    return RevisionAttemptInput(
        id=identifier,
        revision_session_id=revision_id,
        node_id='node-1',
        attempt_number=number,
        quiz_index=index,
        selected_option_ids=(
            (f'q{index}-0' if correct else f'q{index}-1',)
            if selected is None else selected
        ),
        is_correct=correct,
        score_percent=100 if correct else 0,
        created_at=created_at,
    )


class RevisionNodeProjectionTests(unittest.TestCase):
    def test_partial_then_mixed_coverage_is_independent_per_quiz(self) -> None:
        first = saved()
        partial = project_revision_node(revision(), topic(), [first])
        self.assertEqual(partial.node.status, 'pending')
        self.assertIsNone(partial.completed_at)
        second = saved(
            'attempt-b', index=1, number=2, correct=False,
            created_at=SECOND,
        )
        complete = project_revision_node(
            revision(), topic(), [second, first]
        )
        self.assertEqual(complete.node.status, 'quiz_failed')
        self.assertEqual(complete.completed_at, SECOND)
        self.assertEqual(
            [
                (result.quiz_index, result.is_correct)
                for result in complete.node.quiz_results
            ],
            [(0, True), (1, False)],
        )
        self.assertIsNone(complete.node.content_reviewed_at)
        wrong = complete.node.quiz_results[1]
        self.assertEqual(wrong.correct_option_ids, [])
        self.assertEqual(wrong.explanation, '')
        self.assertEqual(
            wrong.selected_explanation, 'Explanation q1-1'
        )
        self.assertEqual(
            complete.node.quiz_results[0].correct_option_ids, ['q0-0']
        )

    def test_reading_is_explicit_and_independent_of_quiz_results(self) -> None:
        full = revision('full_review')
        attempts = [saved(), saved('wrong', index=1, correct=False)]
        self.assertEqual(
            project_revision_node(full, topic(), attempts).node.status,
            'pending',
        )
        reviewed = topic(
            explicit_review_present=True, content_reviewed_at=FIRST
        )
        result = project_revision_node(full, reviewed, attempts)
        self.assertEqual(result.node.status, 'reviewed')
        self.assertEqual(result.node.content_reviewed_at, FIRST)
        self.assertEqual(result.completed_at, FIRST)
        self.assertEqual(
            project_revision_node(full, reviewed, []).node.status,
            'reviewed',
        )

    def test_legacy_absence_is_distinct_from_intentionally_null(self) -> None:
        full = revision('full_review')
        legacy = topic(stored_status='reviewed', reviewed_at=FIRST)
        inferred = project_revision_node(full, legacy, [])
        self.assertEqual(inferred.node.content_reviewed_at, FIRST)
        self.assertEqual(inferred.notices[0].code, 'legacy_review_inferred')
        initialized = replace(
            legacy,
            explicit_review_present=True,
            content_reviewed_at=inferred.node.content_reviewed_at,
            stored_status='quiz_failed',
        )
        self.assertEqual(
            project_revision_node(
                full, initialized, []
            ).node.content_reviewed_at,
            FIRST,
        )
        fallback = project_revision_node(
            full, replace(legacy, reviewed_at=None), []
        )
        self.assertEqual(fallback.node.content_reviewed_at, START)
        explicit_null = replace(legacy, explicit_review_present=True)
        self.assertEqual(
            project_revision_node(
                full, explicit_null, []
            ).node.status,
            'pending',
        )
        for status in ('quiz_passed', 'quiz_failed'):
            result = project_revision_node(
                full, topic(stored_status=status, reviewed_at=FIRST), []
            )
            self.assertIsNone(result.node.content_reviewed_at)
            self.assertEqual(
                result.notices[0].code, 'legacy_review_required'
            )

    def test_latest_uses_sequence_then_id_and_counts_own_attempts(self) -> None:
        older = saved('attempt-a', number=9, created_at=SECOND)
        latest = saved('attempt-z', number=9, correct=False, created_at=FIRST)
        original = saved('original', number=500, revision_id=None)
        foreign = saved('foreign', number=501, revision_id='revision-2')
        inputs = [older, latest, original, foreign]
        before = copy.deepcopy(inputs)
        for order in (inputs, list(reversed(inputs))):
            result = project_revision_node(revision(), topic(), order)
            attempt = result.node.quiz_results[0]
            self.assertEqual(attempt.id, 'attempt-z')
            self.assertEqual(attempt.attempt_number, 9)
            self.assertEqual(attempt.quiz_attempt_count, 2)
            self.assertEqual(result.total_attempts, 2)
            self.assertEqual(result.correct_attempts, 1)
        self.assertEqual(inputs, before)
        self.assertEqual(
            project_revision_node(
                replace(revision(), id='revision-2'),
                topic(revision_session_id='revision-2'),
                [older, latest],
            ).node.quiz_results,
            [],
        )

    def test_incompatible_attempts_are_excluded_without_remapping(self) -> None:
        attempts = [
            saved('bad-index', index=5),
            saved('old-id', selected=('removed-option',)),
            replace(saved('missing-index'), quiz_index=None),
            replace(saved('bad-score'), score_percent=0),
        ]
        result = project_revision_node(revision(), topic(), attempts)
        self.assertEqual(result.node.quiz_results, [])
        self.assertEqual(result.total_attempts, 0)
        self.assertEqual(result.node.status, 'pending')
        self.assertEqual(result.notices[0].code, 'incompatible_attempts')
        self.assertEqual(result.notices[0].attempt_count, 4)
        legacy_single = project_revision_node(
            revision(),
            topic(quizzes=(quiz('q0'),)),
            [replace(saved(), quiz_index=None)],
        )
        self.assertEqual(
            legacy_single.node.quiz_results[0].quiz_index, 0
        )

    def test_multi_correct_disclosure_preserves_option_explanations(self) -> None:
        multi = quiz('q0', multiple=True)
        current = topic(quizzes=(multi,))
        wrong = saved('wrong', correct=False, selected=('q0-0',))
        correct = saved('correct', number=2, selected=('q0-2', 'q0-0'))
        wrong_result = project_revision_node(
            revision(), current, [wrong]
        ).node.quiz_results[0]
        self.assertEqual(wrong_result.correct_option_ids, [])
        self.assertEqual(
            wrong_result.selected_explanation, 'Explanation q0-0'
        )
        result = project_revision_node(
            revision(), current, [wrong, correct]
        ).node.quiz_results[0]
        self.assertEqual(result.correct_option_ids, ['q0-0', 'q0-2'])
        self.assertEqual(result.selected_option_ids, ['q0-2', 'q0-0'])
        self.assertEqual(result.quiz_attempt_count, 2)
        self.assertEqual(
            [
                option.explanation for option in multi.options
                if option.is_correct
            ],
            ['Explanation q0-0', 'Explanation q0-2'],
        )


class RevisionAggregateProjectionTests(unittest.TestCase):
    def test_completion_accuracy_and_retry_keep_distinct_meanings(
        self,
    ) -> None:
        rows = [
            saved(),
            saved('second', index=1, number=2, correct=False,
                  created_at=SECOND),
        ]
        partial = project_revision(
            revision=revision(), nodes=[topic()], attempts=rows[:1],
        )
        self.assertEqual(
            (partial.nodes_completed, partial.nodes_total), (0, 1)
        )
        self.assertEqual(partial.progress_percent, 0)
        self.assertIsNone(partial.completed_at)
        complete = project_revision(
            revision=revision(), nodes=[topic()], attempts=rows,
        )
        self.assertEqual(complete.status, 'completed')
        self.assertEqual(complete.progress_percent, 100)
        self.assertEqual(complete.total_quiz_score_percent, 50)
        self.assertEqual(
            (
                complete.correct_attempts,
                complete.incorrect_attempts,
                complete.total_attempts,
            ),
            (1, 1, 2),
        )
        self.assertEqual(complete.completed_at, SECOND)
        self.assertEqual(complete.time_spent_seconds, 7200)
        persisted = replace(
            revision(), stored_status='completed',
            stored_completed_at=SECOND,
        )
        retry = saved(
            'retry', index=1, number=3, correct=True,
            created_at=datetime(2026, 10, 5, 12, tzinfo=timezone.utc),
        )
        refreshed = project_revision(
            revision=persisted, nodes=[topic()], attempts=rows + [retry],
        )
        self.assertEqual(refreshed.nodes[0].status, 'quiz_passed')
        self.assertEqual(refreshed.total_quiz_score_percent, 66)
        self.assertEqual(refreshed.total_attempts, 3)
        self.assertEqual(refreshed.completed_at, SECOND)
        self.assertFalse(refreshed.completion_reconciled)

    def test_quizless_and_empty_denominators_do_not_auto_complete(
        self,
    ) -> None:
        for nodes in ([], [topic(quizzes=())]):
            with self.subTest(nodes=nodes):
                result = project_revision(
                    revision=revision(), nodes=nodes, attempts=[],
                )
                self.assertEqual(result.status, 'in_progress')
                self.assertEqual(result.nodes_total, 0)
                self.assertEqual(result.progress_percent, 0)
                self.assertIsNone(result.total_quiz_score_percent)
                self.assertIsNone(result.completed_at)
                self.assertIsNone(result.time_spent_seconds)
        quizless = topic(
            quizzes=(), explicit_review_present=True,
            content_reviewed_at=FIRST,
        )
        full = project_revision(
            revision=revision('full_review'), nodes=[quizless], attempts=[],
        )
        self.assertEqual(full.status, 'completed')
        self.assertEqual((full.nodes_completed, full.nodes_total), (1, 1))
        self.assertIsNone(full.total_quiz_score_percent)
        self.assertEqual(full.nodes[0].quiz_count, 0)

    def test_participating_counts_and_topic_order_are_deterministic(
        self,
    ) -> None:
        skipped = topic(
            quizzes=(), node_id='no-quiz', id='progress-0',
            sequence_index=0,
        )
        practicing = topic(sequence_index=1)
        rows = [saved(), saved('second', index=1, correct=False)]
        result = project_revision(
            revision=revision(), nodes=[practicing, skipped], attempts=rows,
        )
        self.assertEqual(
            [node.node_id for node in result.nodes],
            ['no-quiz', 'node-1'],
        )
        self.assertEqual(
            (result.nodes_completed, result.nodes_total), (1, 1)
        )
        self.assertEqual(result.total_quiz_score_percent, 50)
        incomplete = project_revision(
            revision=revision('full_review'),
            nodes=[
                replace(
                    practicing, explicit_review_present=True,
                    content_reviewed_at=FIRST,
                ),
                skipped,
            ],
            attempts=rows,
        )
        self.assertEqual(
            (incomplete.nodes_completed, incomplete.nodes_total), (1, 2)
        )
        self.assertEqual(incomplete.progress_percent, 50)
        self.assertIsNone(incomplete.completed_at)

    def test_legacy_completion_is_hidden_then_replaced_on_coverage(
        self,
    ) -> None:
        old = replace(
            revision(), stored_status='completed',
            stored_completed_at=FIRST,
        )
        first = saved()
        partial = project_revision(
            revision=old, nodes=[topic(stored_status='quiz_passed')],
            attempts=[first],
        )
        self.assertEqual(partial.status, 'in_progress')
        self.assertIsNone(partial.completed_at)
        self.assertTrue(partial.completion_reconciled)
        self.assertIn(
            'completion_recalculated',
            [notice.code for notice in partial.notices],
        )
        self.assertEqual(old.stored_completed_at, FIRST)
        later = saved(
            'later', index=1, number=2, correct=False,
            created_at=SECOND,
        )
        complete = project_revision(
            revision=old, nodes=[topic()], attempts=[first, later],
        )
        self.assertEqual(complete.completed_at, SECOND)
        self.assertTrue(complete.completion_reconciled)
        reconciled = replace(old, stored_completed_at=SECOND)
        restored = project_revision(
            revision=reconciled, nodes=[topic()], attempts=[later, first],
        )
        self.assertEqual(restored.completed_at, SECOND)
        self.assertFalse(restored.completion_reconciled)

    def test_isolation_and_incompatible_data_stay_out_of_accuracy(
        self,
    ) -> None:
        attempts = [
            saved(),
            saved('wrong', correct=False, number=2),
            saved('original', revision_id=None),
            saved('other-revision', revision_id='revision-2'),
            saved('old-options', selected=('missing',)),
        ]
        nodes = [topic()]
        before = copy.deepcopy((nodes, attempts))
        result = project_revision(
            revision=revision(), nodes=nodes, attempts=attempts,
        )
        self.assertEqual(result.total_attempts, 2)
        self.assertEqual(result.total_quiz_score_percent, 50)
        self.assertEqual(result.nodes[0].quiz_results[0].id, 'wrong')
        self.assertEqual(result.notices[0].attempt_count, 1)
        self.assertEqual((nodes, attempts), before)
        all_bad = project_revision(
            revision=revision(), nodes=nodes, attempts=[attempts[-1]],
        )
        self.assertIsNone(all_bad.total_quiz_score_percent)
        self.assertEqual(all_bad.total_attempts, 0)

    def test_invalid_node_ownership_or_duplicate_membership_raises(
        self,
    ) -> None:
        for nodes in (
            [topic(revision_session_id='revision-2')],
            [topic(), topic()],
        ):
            with self.subTest(nodes=nodes):
                with self.assertRaises(ValueError):
                    project_revision(
                        revision=revision(), nodes=nodes, attempts=[],
                    )

    def test_own_orphan_attempt_is_not_applied_to_another_topic(self) -> None:
        orphan = replace(saved(), node_id='removed-node')
        result = project_revision(
            revision=revision(), nodes=[topic()], attempts=[orphan],
        )
        self.assertEqual(result.total_attempts, 0)
        self.assertEqual(result.nodes[0].quiz_results, [])
        self.assertEqual(result.notices[0].code, 'incompatible_attempts')
        self.assertIsNone(result.notices[0].node_id)
        self.assertEqual(result.notices[0].attempt_count, 1)


def main() -> None:
    """Run the revision projection tests."""
    unittest.main()


if __name__ == '__main__':
    main()
