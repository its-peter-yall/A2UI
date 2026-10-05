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
            collection.find_one.side_effect = (
                lambda query, projection=None: next(
                    iter(self.find(name, query)), None,
                )
            )
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


def main() -> None:
    unittest.main()


if __name__ == '__main__':
    main()
