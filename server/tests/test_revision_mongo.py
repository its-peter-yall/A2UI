"""
============================================================================
FILE: test_revision_mongo.py
LOCATION: server/tests/test_revision_mongo.py
============================================================================
PURPOSE:
    Deterministic Mongo revision persistence and recovery tests.
ROLE IN PROJECT:
    Exercise the real repository and P1 projection without network access.
    Supply reusable in-memory collections for storage parity acceptance.
KEY COMPONENTS:
    - MemoryMongo: Query-aware, stateful, inspectable collection doubles
    - RevisionMongoTests: Revision contracts and preservation assertions
============================================================================
"""
from __future__ import annotations

import copy
import unittest
from collections import defaultdict
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from pymongo.errors import AutoReconnect

from server.database.repositories.mongo_learning import (
    MongoLearningRepository,
)
from server.schemas.learning import (
    QuizCard,
    QuizSet,
    RevisionNodeProgressWithDetails,
    RevisionQuizSubmissionResult,
    RevisionSessionResponse,
    RevisionSessionWithProgress,
    RevisionSummary,
)

START = '2026-10-05T09:00:00+00:00'
FIRST = '2026-10-05T10:00:00+00:00'
SECOND = '2026-10-05T11:00:00+00:00'
THIRD = '2026-10-05T12:00:00+00:00'


def make_quiz(prefix: str, multiple: bool = False) -> QuizCard:
    return QuizCard.model_validate({
        'question_text': prefix,
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


def matches(document: dict, query: dict) -> bool:
    for key, expected in query.items():
        actual = document.get(key)
        if isinstance(expected, dict):
            for operator, value in expected.items():
                if operator == '$in':
                    if actual not in value:
                        return False
                elif operator == '$exists':
                    if (key in document) != value:
                        return False
                else:
                    raise AssertionError(f'Unsupported operator {operator}')
        elif actual != expected:
            return False
    return True


class MemoryCursor(list):
    def sort(self, key, direction=1):
        pairs = key if isinstance(key, list) else [(key, direction)]
        for field, order in reversed(pairs):
            super().sort(
                key=lambda row: (row.get(field) is None, row.get(field)),
                reverse=order < 0,
            )
        return self

    def skip(self, count):
        return MemoryCursor(self[count:])

    def limit(self, count):
        return MemoryCursor(self[:count] if count else self)


class MemoryMongo:
    def __init__(self) -> None:
        self.rows = defaultdict(list)
        self.collections = {}
        self.client = MagicMock()
        self.client.start_session.side_effect = AssertionError(
            'Revision operations must not require transactions'
        )

    def find(self, name, query):
        return MemoryCursor(copy.deepcopy([
            row for row in self.rows[name] if matches(row, query)
        ]))

    def insert(self, name, document):
        if any(row['_id'] == document['_id'] for row in self.rows[name]):
            raise AssertionError('Duplicate fixture ID')
        self.rows[name].append(copy.deepcopy(document))
        return SimpleNamespace(inserted_id=document['_id'])

    def update(self, name, query, update):
        if set(update) != {'$set'}:
            raise AssertionError('Fixture supports $set updates only')
        for row in self.rows[name]:
            if matches(row, query):
                before = copy.deepcopy(row)
                row.update(copy.deepcopy(update['$set']))
                return SimpleNamespace(
                    matched_count=1, modified_count=int(before != row),
                )
        return SimpleNamespace(matched_count=0, modified_count=0)

    def __getitem__(self, name):
        if name not in self.collections:
            self.rows[name]  # Initialize empty collections before snapshots.
            collection = MagicMock(name=name)
            collection.find.side_effect = (
                lambda query, projection=None: self.find(name, query)
            )

            def find_one(query, projection=None, sort=None):
                cursor = self.find(name, query)
                if sort is not None:
                    cursor.sort(sort)
                return next(iter(cursor), None)

            collection.find_one.side_effect = find_one
            collection.count_documents.side_effect = (
                lambda query: len(self.find(name, query))
            )
            collection.insert_one.side_effect = (
                lambda document: self.insert(name, document)
            )
            collection.insert_many.side_effect = (
                lambda documents: [self.insert(name, d) for d in documents]
            )
            collection.update_one.side_effect = (
                lambda query, update: self.update(name, query, update)
            )
            self.collections[name] = collection
        return self.collections[name]


def make_store(mode: str = 'quiz_only'):
    db = MemoryMongo()
    db.rows['learning_sessions'] = [{
        '_id': 's1', 'status': 'completed', 'progress_percent': 100,
        'last_active_node_id': 'n1', 'created_at': START,
        'updated_at': FIRST, 'completed_at': FIRST,
    }]
    db.rows['concept_nodes'] = [{
        '_id': 'n1', 'learning_session_id': 's1', 'title': 'Topic',
        'sequence_index': 0, 'status': 'COMPLETED',
        'content_markdown': '# Topic', 'created_at': START,
        'updated_at': FIRST, 'completed_at': FIRST,
    }]
    db.rows['quiz_data'] = [{
        '_id': 'quiz-1', 'node_id': 'n1', 'format_version': 1,
        'payload': QuizSet(
            quizzes=[make_quiz('q0'), make_quiz('q1')],
        ).model_dump(mode='json'),
        'current_index': 1, 'shuffle_seed': 'original-seed',
    }]
    db.rows['revision_sessions'] = [{
        '_id': 'r1', 'original_session_id': 's1', 'revision_number': 1,
        'mode': mode, 'status': 'in_progress', 'progress_percent': 0,
        'total_quiz_score_percent': None, 'started_at': START,
        'completed_at': None,
    }]
    db.rows['revision_node_progress'] = [{
        '_id': 'p1', 'revision_session_id': 'r1', 'node_id': 'n1',
        'status': 'pending', 'reviewed_at': None,
        'content_reviewed_at': None,
    }]
    return db, MongoLearningRepository(db)


def attempt(identifier, index=0, number=1, correct=True,
            revision='r1', time=FIRST):
    return {
        '_id': identifier, 'revision_session_id': revision, 'node_id': 'n1',
        'quiz_index': index, 'attempt_number': number,
        'selected_option_id': [f'q{index}-{0 if correct else 1}'],
        'is_correct': correct, 'score_percent': 100 if correct else 0,
        'created_at': time,
    }


class RevisionMongoTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db, self.repo = make_store()

    def test_restore_is_scoped_ordered_disclosed_and_batched(self) -> None:
        self.db.rows['quiz_attempts'] = [
            attempt('a', number=7, time=THIRD),
            attempt('z', number=7, correct=False),
            attempt('b', index=1, number=8, time=SECOND),
            attempt('original', number=99, revision=None),
            attempt('foreign', number=100, revision='r2'),
        ]
        before = copy.deepcopy(self.db.rows)
        restored = self.repo.get_revision_session('r1')
        self.assertIsNotNone(restored)
        validated = RevisionSessionWithProgress.model_validate(restored)
        node = restored['nodes'][0]
        self.assertEqual(node['quiz_count'], 2)
        self.assertEqual(node['status'], 'quiz_failed')
        self.assertIsNone(node['content_reviewed_at'])
        self.assertNotIn('revision_session_id', node)
        wrong, correct = node['quiz_results']
        self.assertEqual([wrong['id'], correct['id']], ['z', 'b'])
        self.assertEqual(wrong['quiz_attempt_count'], 2)
        self.assertEqual(wrong['selected_option_ids'], ['q0-1'])
        self.assertEqual(wrong['correct_option_ids'], [])
        self.assertEqual(wrong['explanation'], '')
        self.assertEqual(wrong['selected_explanation'], 'Explanation q0-1')
        self.assertEqual(correct['correct_option_ids'], ['q1-0'])
        self.assertNotIn('revision_node_status', wrong)
        self.assertEqual(validated.total_quiz_score_percent, 66)
        for name in ('revision_node_progress', 'concept_nodes',
                     'quiz_data', 'quiz_attempts'):
            self.db[name].find.assert_called_once()
            self.db[name].find_one.assert_not_called()
        self.db['quiz_attempts'].find.assert_called_once_with({
            'revision_session_id': {'$in': ['r1']},
        })
        self.assertEqual(self.db.rows, before)

    def test_history_summary_share_projection_and_original_comparison(
        self,
    ) -> None:
        self.db.rows['revision_sessions'][0].update({
            'status': 'completed', 'progress_percent': 100,
            'completed_at': FIRST, 'total_quiz_score_percent': 100,
        })
        self.db.rows['revision_node_progress'][0]['status'] = 'quiz_passed'
        self.db.rows['quiz_attempts'] = [
            attempt('one'),
            attempt('old', correct=False, revision=None),
            attempt('other', revision='r2'),
        ]
        before = copy.deepcopy(self.db.rows)
        restored = self.repo.get_revision_session('r1')
        history, count = self.repo.get_revisions_for_session('s1')
        summary = self.repo.get_revision_summary('r1')
        self.assertEqual(count, 1)
        for payload in (restored, history[0], summary):
            self.assertEqual(payload['progress_percent'], 0)
            self.assertEqual(payload['total_quiz_score_percent'], 100)
            self.assertIn('completion_recalculated', [
                notice['code'] for notice in payload['notices']
            ])
        self.assertIsNone(restored['completed_at'])
        self.assertIsNone(history[0]['completed_at'])
        self.assertEqual(summary['nodes_reviewed'], 0)
        self.assertEqual(summary['nodes_total'], 1)
        self.assertEqual(summary['quizzes_total'], 1)
        self.assertEqual(summary['comparison'], {
            'original_quiz_score_percent': 0, 'improvement_percent': 100,
        })
        RevisionSessionResponse.model_validate(history[0])
        RevisionSummary.model_validate(summary)
        self.assertEqual(self.db.rows, before)
        self.db['quiz_attempts'].find.assert_any_call({
            'revision_session_id': None, 'node_id': {'$in': ['n1']},
        })

    def test_history_batches_all_revisions_and_respects_pagination(
        self,
    ) -> None:
        second = dict(self.db.rows['revision_sessions'][0])
        second.update(_id='r2', revision_number=2, started_at=SECOND)
        self.db.rows['revision_sessions'].append(second)
        progress = dict(self.db.rows['revision_node_progress'][0])
        progress.update(_id='p2', revision_session_id='r2')
        self.db.rows['revision_node_progress'].append(progress)
        self.db.rows['quiz_attempts'] = [attempt('one')]
        history, count = self.repo.get_revisions_for_session('s1')
        self.assertEqual(count, 2)
        self.assertEqual([row['id'] for row in history], ['r2', 'r1'])
        self.assertIsNone(history[0]['total_quiz_score_percent'])
        self.assertEqual(history[1]['total_quiz_score_percent'], 100)
        for name in ('revision_node_progress', 'concept_nodes',
                     'quiz_data', 'quiz_attempts'):
            self.db[name].find.assert_called_once()
            self.db[name].find_one.assert_not_called()
        page, count = self.repo.get_revisions_for_session('s1', 1, 1)
        self.assertEqual(count, 2)
        self.assertEqual([row['id'] for row in page], ['r1'])

    def test_quizless_empty_and_reviewable_denominators(self) -> None:
        self.db.rows['quiz_data'] = []
        self.db.rows['revision_node_progress'][0]['status'] = 'quiz_passed'
        for empty in (False, True):
            with self.subTest(empty=empty):
                if empty:
                    self.db.rows['revision_node_progress'] = []
                restored = self.repo.get_revision_session('r1')
                summary = self.repo.get_revision_summary('r1')
                self.assertEqual(restored['status'], 'in_progress')
                self.assertIsNone(restored['total_quiz_score_percent'])
                self.assertIsNone(restored['completed_at'])
                self.assertEqual(summary['nodes_total'], 0)
                self.assertEqual(summary['quizzes_total'], 0)
                self.assertIsNone(summary['total_quiz_score_percent'])
        db, repo = make_store('full_review')
        db.rows['quiz_data'] = []
        db.rows['revision_node_progress'][0]['content_reviewed_at'] = FIRST
        restored = repo.get_revision_session('r1')
        self.assertEqual(restored['status'], 'completed')
        self.assertEqual(repo.get_revision_summary('r1')['nodes_total'], 1)
        self.assertEqual(restored['nodes'][0]['quiz_count'], 0)

    def test_practice_submission_retry_and_timestamp_contract(self) -> None:
        self.db.rows['quiz_attempts'] = [
            attempt('original', number=7, revision=None),
        ]
        original = copy.deepcopy([
            self.db.rows[name] for name in
            ('learning_sessions', 'concept_nodes', 'quiz_data')
        ])
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=FIRST):
            first = self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        RevisionQuizSubmissionResult.model_validate(first)
        self.assertEqual(first['attempt_number'], 8)
        self.assertEqual(first['quiz_attempt_count'], 1)
        self.assertEqual(first['revision_node_status'], 'pending')
        self.assertEqual(first['revision_session_id'], 'r1')
        self.assertEqual(first['correct_option_ids'], ['q0-0'])
        self.assertEqual(first['explanation'], 'Explanation q0-0')
        self.assertEqual(self.repo.get_revision_session('r1')
                         ['progress_percent'], 0)
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=SECOND):
            wrong = self.repo.submit_revision_quiz(
                'r1', 'n1', ['q1-1'], quiz_index=1,
            )
        self.assertEqual(wrong['revision_node_status'], 'quiz_failed')
        self.assertEqual(wrong['correct_option_ids'], [])
        self.assertEqual(wrong['explanation'], '')
        self.assertEqual(wrong['selected_explanation'], 'Explanation q1-1')
        completed = self.repo.get_revision_session('r1')
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=THIRD):
            retry = self.repo.submit_revision_quiz(
                'r1', 'n1', ['q1-0'], quiz_index=1,
            )
        self.assertEqual(retry['quiz_attempt_count'], 2)
        self.assertEqual(retry['revision_node_status'], 'quiz_passed')
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(restored['completed_at'], completed['completed_at'])
        self.assertEqual(restored['total_quiz_score_percent'], 66)
        self.assertEqual(restored['progress_percent'], 100)
        result = restored['nodes'][0]['quiz_results'][1]
        self.assertEqual({key: value for key, value in retry.items()
                          if key != 'revision_node_status'}, result)
        summary = self.repo.get_revision_summary('r1')
        self.assertEqual((summary['quizzes_passed'], summary['quizzes_failed'],
                          summary['quizzes_total']), (2, 1, 3))
        self.assertEqual(summary['time_spent_seconds'], 7200)
        history, _ = self.repo.get_revisions_for_session('s1')
        self.assertEqual(history[0]['total_quiz_score_percent'], 66)
        self.assertEqual([
            self.db.rows[name] for name in
            ('learning_sessions', 'concept_nodes', 'quiz_data')
        ], original)
        self.db.client.start_session.assert_not_called()

    def test_multi_select_exact_match_uses_stable_ids(self) -> None:
        self.db.rows['quiz_data'][0]['payload'] = QuizSet(
            quizzes=[make_quiz('q0', multiple=True)],
        ).model_dump(mode='json')
        wrong = self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        self.assertFalse(wrong['is_correct'])
        self.assertEqual(wrong['correct_option_ids'], [])
        correct = self.repo.submit_revision_quiz(
            'r1', 'n1', ['q0-2', 'q0-0'],
        )
        self.assertTrue(correct['is_correct'])
        self.assertEqual(correct['correct_option_ids'], ['q0-0', 'q0-2'])
        self.assertEqual(correct['selected_option_ids'], ['q0-2', 'q0-0'])
        self.assertEqual(correct['quiz_attempt_count'], 2)
        payload = self.db.rows['quiz_data'][0]['payload']
        self.assertEqual([option['explanation'] for option in
                          payload['quizzes'][0]['options']
                          if option['is_correct']],
                         ['Explanation q0-0', 'Explanation q0-2'])

    def test_invalid_submission_records_nothing(self) -> None:
        cases = [
            ('missing', 'n1', ['q0-0'], 0, LookupError),
            ('r1', 'foreign', ['q0-0'], 0, LookupError),
            ('r1', 'n1', ['q0-0'], -1, ValueError),
            ('r1', 'n1', ['q0-0'], 2, ValueError),
            ('r1', 'n1', [], 0, ValueError),
            ('r1', 'n1', ['D'], 0, ValueError),
            ('r1', 'n1', ['q0-0', 'q0-0'], 0, ValueError),
            ('r1', 'n1', ['q0-0', 'q0-1'], 0, ValueError),
        ]
        for revision, node, selected, index, error in cases:
            with self.subTest(revision=revision, selected=selected,
                              node=node, index=index):
                before = copy.deepcopy(self.db.rows)
                with self.assertRaises(error):
                    self.repo.submit_revision_quiz(
                        revision, node, selected, index,
                    )
                self.assertEqual(self.db.rows, before)
        self.db.rows['concept_nodes'][0]['learning_session_id'] = 'other'
        before = copy.deepcopy(self.db.rows)
        with self.assertRaises(ValueError):
            self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        self.assertEqual(self.db.rows, before)

    def test_committed_attempt_survives_aggregate_failure(self) -> None:
        self.db.rows['quiz_attempts'] = [attempt('first')]
        self.db['revision_sessions'].update_one.side_effect = AutoReconnect(
            'simulated metadata failure'
        )
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=SECOND):
            result = self.repo.submit_revision_quiz(
                'r1', 'n1', ['q1-1'], quiz_index=1,
            )
        RevisionQuizSubmissionResult.model_validate(result)
        self.assertEqual(result['revision_node_status'], 'quiz_failed')
        self.assertEqual(self.db.rows['revision_sessions'][0]
                         ['progress_percent'], 0)
        restored = self.repo.get_revision_session('r1')
        history, _ = self.repo.get_revisions_for_session('s1')
        summary = self.repo.get_revision_summary('r1')
        for payload in (restored, history[0], summary):
            self.assertEqual(payload['progress_percent'], 100)
            self.assertEqual(payload['total_quiz_score_percent'], 50)
        self.assertEqual(restored['nodes'][0]['quiz_results'][1]['id'],
                         result['id'])
        self.assertEqual(len(self.db.rows['quiz_attempts']), 2)

    def test_attempt_insert_failure_keeps_saved_result(self) -> None:
        self.db.rows['quiz_attempts'] = [attempt('saved', correct=False)]
        before = copy.deepcopy(self.db.rows)
        self.db['quiz_attempts'].insert_one.side_effect = AutoReconnect(
            'simulated insert failure'
        )
        with self.assertRaises(AutoReconnect):
            self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        self.assertEqual(self.db.rows, before)
        self.assertEqual(self.repo.get_revision_session('r1')['nodes'][0]
                         ['quiz_results'][0]['id'], 'saved')

    def test_disproven_completion_reconciles_before_new_evidence(self) -> None:
        self.db.rows['revision_sessions'][0].update({
            'status': 'completed', 'progress_percent': 100,
            'completed_at': THIRD,
        })
        self.db.rows['quiz_attempts'] = [attempt('first')]
        self.assertIsNone(self.repo.get_revision_session('r1')['completed_at'])
        self.assertEqual(self.db.rows['revision_sessions'][0]
                         ['completed_at'], THIRD)
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=SECOND):
            self.repo.submit_revision_quiz('r1', 'n1', ['q1-1'], 1)
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(
            restored['completed_at'],
            '2026-10-05T11:00:00Z',
        )

    def test_full_review_is_explicit_idempotent_and_quiz_independent(
        self,
    ) -> None:
        self.db.rows['revision_sessions'][0]['mode'] = 'full_review'
        before = copy.deepcopy([
            self.db.rows[name] for name in
            ('learning_sessions', 'concept_nodes', 'quiz_data')
        ])
        self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        self.assertEqual(self.repo.get_revision_session('r1')
                         ['progress_percent'], 0)
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=FIRST):
            reviewed = self.repo.mark_revision_node_reviewed('r1', 'n1')
        RevisionNodeProgressWithDetails.model_validate(reviewed)
        self.assertEqual(reviewed['status'], 'reviewed')
        self.assertEqual(reviewed['content_reviewed_at'],
                         '2026-10-05T10:00:00Z')
        self.assertEqual(reviewed['quiz_count'], 2)
        self.assertEqual(len(reviewed['quiz_results']), 1)
        self.assertNotIn('revision_session_id', reviewed)
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=THIRD):
            again = self.repo.mark_revision_node_reviewed('r1', 'n1')
            wrong = self.repo.submit_revision_quiz('r1', 'n1', ['q1-1'], 1)
        self.assertEqual(again['content_reviewed_at'],
                         reviewed['content_reviewed_at'])
        self.assertEqual(wrong['revision_node_status'], 'reviewed')
        self.assertEqual(self.repo.get_revision_session('r1')['completed_at'],
                         '2026-10-05T10:00:00Z')
        self.assertEqual([
            self.db.rows[name] for name in
            ('learning_sessions', 'concept_nodes', 'quiz_data')
        ], before)

    def test_legacy_review_inference_only_for_absent_reviewed_field(
        self,
    ) -> None:
        self.db.rows['revision_sessions'][0]['mode'] = 'full_review'
        progress = self.db.rows['revision_node_progress'][0]
        progress.pop('content_reviewed_at')
        progress.update(status='reviewed', reviewed_at=FIRST)
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(restored['notices'][0]['code'],
                         'legacy_review_inferred')
        with patch('server.database.repositories.mongo_learning.utc_iso',
                   return_value=THIRD):
            reviewed = self.repo.mark_revision_node_reviewed('r1', 'n1')
        self.assertEqual(reviewed['content_reviewed_at'],
                         '2026-10-05T10:00:00Z')
        self.assertEqual(progress['content_reviewed_at'],
                         '2026-10-05T10:00:00+00:00')
        self.assertEqual(self.repo.mark_revision_node_reviewed('r1', 'n1')
                         ['content_reviewed_at'], reviewed['content_reviewed_at'])
        self.db['revision_node_progress'].update_one.assert_any_call(
            {'_id': 'p1', 'content_reviewed_at': {'$exists': False}},
            {'$set': {'content_reviewed_at': FIRST}},
        )
        for status, reviewed_at, present, expected in (
            ('reviewed', None, False, '2026-10-05T09:00:00Z'),
            ('quiz_passed', FIRST, False, None),
            ('quiz_failed', FIRST, False, None),
            ('reviewed', FIRST, True, None),
        ):
            with self.subTest(status=status, present=present):
                progress.pop('content_reviewed_at', None)
                progress.update(status=status, reviewed_at=reviewed_at)
                if present:
                    progress['content_reviewed_at'] = None
                node = self.repo.get_revision_session('r1')['nodes'][0]
                self.assertEqual(node['content_reviewed_at'], expected)
                self.assertEqual(node['status'],
                                 'pending' if expected is None else 'reviewed')
        progress.update(status='quiz_passed', reviewed_at=FIRST)
        self.repo.submit_revision_quiz('r1', 'n1', ['q0-0'])
        restored = self.repo.get_revision_session('r1')
        self.assertIsNone(restored['nodes'][0]['content_reviewed_at'])
        self.assertIn('legacy_review_required', [
            notice['code'] for notice in restored['notices']
        ])

    def test_review_mode_membership_and_source_failure_write_nothing(
        self,
    ) -> None:
        before = copy.deepcopy(self.db.rows)
        with self.assertRaises(ValueError):
            self.repo.mark_revision_node_reviewed('r1', 'n1')
        self.assertEqual(self.db.rows, before)
        self.db.rows['revision_sessions'][0]['mode'] = 'full_review'
        for revision, node in (('missing', 'n1'), ('r1', 'missing')):
            before = copy.deepcopy(self.db.rows)
            with self.assertRaises(LookupError):
                self.repo.mark_revision_node_reviewed(revision, node)
            self.assertEqual(self.db.rows, before)
        before = copy.deepcopy(self.db.rows)
        self.db['revision_node_progress'].update_one.side_effect = (
            AutoReconnect('simulated review failure')
        )
        with self.assertRaises(AutoReconnect):
            self.repo.mark_revision_node_reviewed('r1', 'n1')
        self.assertEqual(self.db.rows, before)

    def test_committed_review_recovers_after_aggregate_interruption(
        self,
    ) -> None:
        self.db.rows['revision_sessions'][0]['mode'] = 'full_review'
        self.db['revision_sessions'].update_one.side_effect = AutoReconnect(
            'simulated aggregate failure'
        )
        reviewed = self.repo.mark_revision_node_reviewed('r1', 'n1')
        self.assertEqual(reviewed['status'], 'reviewed')
        restored = self.repo.get_revision_session('r1')
        self.assertEqual(restored['progress_percent'], 100)
        self.assertEqual(restored['nodes'][0], reviewed)
        self.assertEqual(self.repo.get_revision_summary('r1')
                         ['nodes_reviewed'], 1)

    def test_new_revision_starts_explicitly_unreviewed_unanswered(
        self,
    ) -> None:
        self.db.rows['quiz_attempts'] = [attempt('older')]
        created = self.repo.create_revision_session('s1', 'full_review')
        RevisionSessionWithProgress.model_validate(created)
        self.assertEqual(created['nodes'][0]['quiz_results'], [])
        self.assertIsNone(created['nodes'][0]['content_reviewed_at'])
        progress = self.db.rows['revision_node_progress'][-1]
        self.assertIn('content_reviewed_at', progress)
        self.assertIsNone(progress['content_reviewed_at'])
        self.assertEqual(created['notices'], [])
        self.assertEqual(created['progress_percent'], 0)

    def test_revision_attempts_never_count_as_original_mastery(self) -> None:
        self.db.rows['quiz_attempts'] = [
            attempt('revision-q0'),
            attempt('revision-q1', index=1, number=2),
            attempt('original-wrong', number=3, correct=False, revision=None),
        ]
        history = self.repo.get_quiz_attempts('n1')
        self.assertEqual(history['total_attempts'], 1)
        self.assertFalse(history['is_mastered'])
        self.assertEqual(history['best_score'], 0)
        self.assertEqual(history['attempts'][0]['id'], 'original-wrong')
        self.assertFalse(self.repo.check_mastery('n1'))
        self.db.rows['quiz_data'][0]['payload'] = QuizSet(
            quizzes=[make_quiz('q0')],
        ).model_dump(mode='json')
        self.assertFalse(self.repo.check_mastery('n1'))
        missing_scope = attempt('legacy-original', number=4)
        missing_scope.pop('revision_session_id')
        self.db.rows['quiz_attempts'].append(missing_scope)
        self.assertTrue(self.repo.check_mastery('n1'))
        self.assertEqual(self.repo.get_quiz_attempts('n1')
                         ['total_attempts'], 2)


def main() -> None:
    unittest.main()


if __name__ == '__main__':
    main()
