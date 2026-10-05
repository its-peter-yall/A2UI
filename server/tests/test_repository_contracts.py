"""
============================================================================
FILE: test_repository_contracts.py
LOCATION: server/tests/test_repository_contracts.py
============================================================================
PURPOSE:
    Structural contract tests for repository Protocol surfaces and default
    StorageContext SQLite repository bundle wiring.
ROLE IN PROJECT:
    TDD guard for Phase 2A MongoDB Atlas storage repository ports.
    - Verifies Protocol method names match production call graph
    - Verifies StorageContext exposes complete SQLite bundle by default
DEPENDENCIES:
    - External: unittest, unittest.mock
    - Internal: server.database.repositories, server.database.storage_mode
USAGE:
    python -m unittest server.tests.test_repository_contracts -v
============================================================================
"""

from __future__ import annotations

import inspect
import unittest
from pathlib import Path
from typing import get_type_hints
from unittest.mock import MagicMock

from server.database.repositories.protocols import (
    AppSettingsRepository,
    GenerationArtifactRepository,
    GenerationJobRepository,
    LearningRepository,
    ProgressEventRepository,
    ResearchRepository,
)
from server.database.repositories.sqlite import build_sqlite_bundle
from server.database.storage_mode import DeploymentMode, StorageContext


class RepositoryContractTests(unittest.TestCase):
    def test_protocols_expose_required_call_graph_methods(self) -> None:
        required = {
            LearningRepository: {
                "create_learning_session",
                "get_learning_session",
                "create_quiz_attempt",
                "create_revision_session",
            },
            GenerationJobRepository: {
                "create_session_shell_and_job",
                "transition_stage",
                "try_acquire_lock",
                "mark_orphaned_jobs_paused",
            },
            GenerationArtifactRepository: {
                "persist_outline",
                "persist_briefs",
                "persist_topic_success",
            },
            ResearchRepository: {
                "create_report",
                "upsert_source",
                "get_public_report",
            },
            ProgressEventRepository: {
                "append_once",
                "list_after",
                "latest_id",
            },
            AppSettingsRepository: {
                "get_provider_settings",
                "put_web_search_settings",
            },
        }
        for contract, methods in required.items():
            with self.subTest(contract=contract.__name__):
                self.assertTrue(methods.issubset(vars(contract)))

    def test_context_exposes_sqlite_bundle_by_default(self) -> None:
        stores = {
            "learning": MagicMock(),
            "jobs": MagicMock(),
            "artifacts": MagicMock(),
            "research": MagicMock(),
            "progress": MagicMock(),
        }
        bundle = build_sqlite_bundle(**stores)
        context = StorageContext(
            deployment_mode=DeploymentMode.LOCAL,
            sqlite_path=Path("unused.db"),
            sqlite_repositories=bundle,
        )

        self.assertIs(context.learning, bundle.learning)
        self.assertIs(context.jobs, bundle.jobs)
        self.assertIs(context.artifacts, bundle.artifacts)
        self.assertIs(context.research, bundle.research)
        self.assertIs(context.progress, bundle.progress)

    def test_creation_ports_accept_optional_custom_topic_count(self) -> None:
        methods = (
            LearningRepository.create_learning_session,
            GenerationJobRepository.create_session_shell_and_job,
        )
        for method in methods:
            with self.subTest(method=method.__qualname__):
                parameters = inspect.signature(method).parameters
                self.assertIn("custom_topic_count", parameters)
                self.assertIsNone(
                    parameters["custom_topic_count"].default
                )

    def test_revision_ports_declare_required_wire_payloads(self) -> None:
        expected = {
            'submit_revision_quiz': {
                'id',
                'revision_session_id',
                'node_id',
                'quiz_index',
                'attempt_number',
                'quiz_attempt_count',
                'selected_option_ids',
                'is_correct',
                'score_percent',
                'correct_option_ids',
                'explanation',
                'selected_explanation',
                'created_at',
                'revision_node_status',
            },
            'mark_revision_node_reviewed': {
                'id',
                'node_id',
                'node_title',
                'sequence_index',
                'status',
                'reviewed_at',
                'content_reviewed_at',
                'quiz_count',
                'quiz_results',
            },
            'get_revision_summary': {
                'revision_id',
                'mode',
                'progress_percent',
                'total_quiz_score_percent',
                'nodes_reviewed',
                'nodes_total',
                'quizzes_passed',
                'quizzes_failed',
                'quizzes_total',
                'time_spent_seconds',
                'comparison',
                'notices',
            },
        }
        for name, keys in expected.items():
            with self.subTest(method=name):
                method = getattr(LearningRepository, name)
                payload_type = get_type_hints(method)['return']
                self.assertEqual(
                    getattr(payload_type, '__required_keys__', frozenset()),
                    keys,
                )
        parameters = inspect.signature(
            LearningRepository.submit_revision_quiz
        ).parameters
        self.assertEqual(parameters['quiz_index'].default, 0)
        self.assertEqual(
            list(parameters),
            [
                'self',
                'revision_id',
                'node_id',
                'selected_option_ids',
                'quiz_index',
            ],
        )


if __name__ == "__main__":
    unittest.main()
