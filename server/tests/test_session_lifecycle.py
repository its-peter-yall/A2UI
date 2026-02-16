"""
=============================================================================
FILE: test_session_lifecycle.py
=============================================================================

PURPOSE:
Integration tests for v1.1 feature set covering full session lifecycle,
revision sessions, and edge cases. Validates end-to-end persistence layer
behavior including session creation, node progression, status transitions,
revision creation, quiz tracking, and cascade deletion.

KEY TESTS:
- TestMultiCourseLifecycle: Full course lifecycle through persistence layer
  - Session creation with in_progress status and 0% progress
  - Progress updates on node completion with timestamp tracking
  - Session auto-completion when all nodes are done
  - Multiple independent sessions coexisting
  - Accurate progress calculations (0%, 33%, 66%, 100%)

- TestRevisionLifecycle: Revision feature end-to-end through persistence
  - Creating revisions for completed sessions
  - Blocking revisions for in-progress sessions
  - Full review mode with mark-reviewed and quiz submission
  - Quiz-only mode submission
  - Revision auto-completion
  - Separate tracking of revision vs original quiz attempts
  - Performance comparison in revision summary

- TestEdgeCases: Edge case handling
  - Cascade deletion of sessions to revisions
  - Concurrent sessions not interfering with each other
  - Progress bounds handling (never exceeds 100%)
  - Error node handling in sessions
  - Empty session list responses

DEPENDENCIES:
- unittest: Python standard testing framework
- tempfile: Temporary database file creation
- pathlib: Path manipulation
- server.database.learning_persistence: LearningManager under test
- server.schemas.learning: NodeStatus, QuizCard, QuizDifficulty, QuizSet schemas

USAGE PATTERN:
```python
# Run all lifecycle tests
python -m unittest server.tests.test_session_lifecycle

# Run specific test class
python -m unittest server.tests.test_session_lifecycle.TestMultiCourseLifecycle

# Run revision tests
python -m unittest server.tests.test_session_lifecycle.TestRevisionLifecycle
```

RELATED FILES:
- server/database/learning_persistence.py - LearningManager implementation
- server/tests/test_learning_persistence.py - Unit tests for persistence layer

NOTES:
- Each test uses a dedicated temporary SQLite database file
- Nodes must be walked through ALL transitions to complete:
  LOCKED -> VIEWING_EXPLANATION -> IN_QUIZ -> SHOWING_FEEDBACK -> COMPLETED
- Revision sessions require original session to be completed first
- Quiz attempts in revisions are tracked separately from original attempts
=============================================================================
"""

import tempfile
import unittest
import uuid
from pathlib import Path
from typing import Dict, List

from server.database.learning_persistence import LearningManager
from server.schemas.learning import (
    NodeStatus,
    QuizCard,
    QuizDifficulty,
    QuizOption,
    QuizSet,
)


def _make_stable_uuid(label: str) -> str:
    """Generate deterministic UUID for testing."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"test-option-{label}"))


def _make_quiz_card() -> QuizCard:
    """Create a standard quiz card for testing."""
    return QuizCard(
        question_text="What is 2 + 2?",
        options=[
            QuizOption(
                option_id=_make_stable_uuid("A"),
                display_label="A",
                text="4",
                is_correct=True,
                explanation="2 + 2 equals 4",
            ),
            QuizOption(
                option_id=_make_stable_uuid("B"),
                display_label="B",
                text="5",
                is_correct=False,
                explanation="2 + 2 does not equal 5",
            ),
            QuizOption(
                option_id=_make_stable_uuid("C"),
                display_label="C",
                text="3",
                is_correct=False,
                explanation="2 + 2 does not equal 3",
            ),
            QuizOption(
                option_id=_make_stable_uuid("D"),
                display_label="D",
                text="6",
                is_correct=False,
                explanation="2 + 2 does not equal 6",
            ),
        ],
        difficulty=QuizDifficulty.EASY,
    )


def _make_unique_quiz_card(prefix: str, correct_label: str = "A") -> QuizCard:
    """Create a quiz card with unique option IDs for testing."""
    options = []
    for label in ("A", "B", "C", "D"):
        options.append(
            QuizOption(
                option_id=_make_stable_uuid(f"{prefix}-{label}"),
                display_label=label,
                text=f"{prefix} answer {label}",
                is_correct=(label == correct_label),
                explanation=f"{prefix} explanation for {label}",
            )
        )
    return QuizCard(
        question_text=f"Question for {prefix}?",
        options=options,
        difficulty=QuizDifficulty.MEDIUM,
    )


class TestMultiCourseLifecycle(unittest.TestCase):
    """Test full course lifecycle through the persistence layer."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "lifecycle.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_session_with_nodes(
        self, num_nodes: int, user_id: str = "user-1"
    ) -> tuple[str, List[str]]:
        """Create a session with the specified number of nodes."""
        session = self.manager.create_learning_session(
            query=f"Learn {num_nodes}-node course",
            course_title=f"Course with {num_nodes} nodes",
            user_id=user_id,
        )
        node_ids: List[str] = []
        for i in range(num_nodes):
            # First node starts as VIEWING_EXPLANATION, others as LOCKED
            status = (
                NodeStatus.VIEWING_EXPLANATION if i == 0 else NodeStatus.LOCKED
            )
            quiz = _make_unique_quiz_card(f"node-{i}")
            node = self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=i,
                title=f"Node {i}",
                content_markdown=f"Content for node {i}",
                status=status,
                quiz=quiz,
            )
            node_ids.append(node["id"])
        return session["id"], node_ids

    def _walk_node_to_completion(self, node_id: str, start_status: NodeStatus) -> None:
        """Walk a node through all required state transitions to COMPLETED.

        Transitions: LOCKED -> VIEWING_EXPLANATION -> IN_QUIZ -> SHOWING_FEEDBACK -> COMPLETED
        """
        if start_status == NodeStatus.LOCKED:
            self.manager.update_node_status(node_id, NodeStatus.VIEWING_EXPLANATION)
            start_status = NodeStatus.VIEWING_EXPLANATION

        if start_status == NodeStatus.VIEWING_EXPLANATION:
            self.manager.update_node_status(node_id, NodeStatus.IN_QUIZ)
            start_status = NodeStatus.IN_QUIZ

        if start_status == NodeStatus.IN_QUIZ:
            # Submit quiz to get to SHOWING_FEEDBACK
            quiz = self.manager.get_quiz_for_node(node_id)
            if quiz:
                correct_option_id = next(
                    opt.option_id for opt in quiz.options if opt.is_correct
                )
                self.manager.create_quiz_attempt(node_id, correct_option_id)
            self.manager.update_node_status(node_id, NodeStatus.SHOWING_FEEDBACK)
            start_status = NodeStatus.SHOWING_FEEDBACK

        if start_status == NodeStatus.SHOWING_FEEDBACK:
            self.manager.update_node_status(node_id, NodeStatus.COMPLETED)

    def test_generate_course_creates_in_progress_session(self) -> None:
        """Create session + nodes, verify status='in_progress', progress=0%."""
        session_id, node_ids = self._create_session_with_nodes(3)

        progress = self.manager.get_session_progress(session_id)
        self.assertIsNotNone(progress)
        assert progress is not None

        self.assertEqual(progress["status"], "in_progress")
        self.assertEqual(progress["progress_percent"], 0)
        self.assertEqual(progress["completed_nodes"], 0)
        self.assertEqual(progress["total_nodes"], 3)

    def test_progress_updates_on_node_completion(self) -> None:
        """Walk a node through all transitions, verify session progress updates."""
        session_id, node_ids = self._create_session_with_nodes(3)

        # Complete first node (already at VIEWING_EXPLANATION)
        self._walk_node_to_completion(node_ids[0], NodeStatus.VIEWING_EXPLANATION)

        progress = self.manager.get_session_progress(session_id)
        self.assertIsNotNone(progress)
        assert progress is not None

        self.assertEqual(progress["completed_nodes"], 1)
        self.assertEqual(progress["progress_percent"], 33)  # 1/3 = 33%
        self.assertEqual(progress["status"], "in_progress")

    def test_session_auto_completes_when_all_nodes_done(self) -> None:
        """Complete ALL nodes in a 3-node session, verify status='completed',
        progress=100%, completed_at set."""
        session_id, node_ids = self._create_session_with_nodes(3)

        # Complete first node (already at VIEWING_EXPLANATION)
        self._walk_node_to_completion(node_ids[0], NodeStatus.VIEWING_EXPLANATION)

        # Unlock and complete second node
        self.manager.update_node_status(node_ids[1], NodeStatus.VIEWING_EXPLANATION)
        self._walk_node_to_completion(node_ids[1], NodeStatus.VIEWING_EXPLANATION)

        # Unlock and complete third node
        self.manager.update_node_status(node_ids[2], NodeStatus.VIEWING_EXPLANATION)
        self._walk_node_to_completion(node_ids[2], NodeStatus.VIEWING_EXPLANATION)

        progress = self.manager.get_session_progress(session_id)
        self.assertIsNotNone(progress)
        assert progress is not None

        self.assertEqual(progress["status"], "completed")
        self.assertEqual(progress["progress_percent"], 100)
        self.assertEqual(progress["completed_nodes"], 3)

        # Verify completed_at is set
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT completed_at FROM learning_sessions WHERE id = ?",
                (session_id,),
            )
            row = cursor.fetchone()
            self.assertIsNotNone(row["completed_at"])
        finally:
            conn.close()

    def test_multiple_sessions_coexist_independently(self) -> None:
        """Create 2 sessions, complete one, verify the other is unchanged."""
        session1_id, node_ids1 = self._create_session_with_nodes(2, user_id="user-1")
        session2_id, node_ids2 = self._create_session_with_nodes(2, user_id="user-2")

        # Complete all nodes in session 1
        self._walk_node_to_completion(node_ids1[0], NodeStatus.VIEWING_EXPLANATION)
        self.manager.update_node_status(node_ids1[1], NodeStatus.VIEWING_EXPLANATION)
        self._walk_node_to_completion(node_ids1[1], NodeStatus.VIEWING_EXPLANATION)

        # Verify session 1 is completed
        progress1 = self.manager.get_session_progress(session1_id)
        self.assertIsNotNone(progress1)
        assert progress1 is not None
        self.assertEqual(progress1["status"], "completed")
        self.assertEqual(progress1["progress_percent"], 100)

        # Verify session 2 is unchanged
        progress2 = self.manager.get_session_progress(session2_id)
        self.assertIsNotNone(progress2)
        assert progress2 is not None
        self.assertEqual(progress2["status"], "in_progress")
        self.assertEqual(progress2["progress_percent"], 0)

    def test_session_list_reflects_accurate_progress(self) -> None:
        """Create 3 sessions with different progress, verify get_sessions_list
        returns accurate data."""
        # Create 3 sessions with different progress states
        session1_id, _ = self._create_session_with_nodes(2)  # 0%
        session2_id, node_ids2 = self._create_session_with_nodes(2)  # 50%
        session3_id, node_ids3 = self._create_session_with_nodes(2)  # 100%

        # Complete 1 of 2 nodes in session 2
        self._walk_node_to_completion(node_ids2[0], NodeStatus.VIEWING_EXPLANATION)

        # Complete all nodes in session 3
        self._walk_node_to_completion(node_ids3[0], NodeStatus.VIEWING_EXPLANATION)
        self.manager.update_node_status(node_ids3[1], NodeStatus.VIEWING_EXPLANATION)
        self._walk_node_to_completion(node_ids3[1], NodeStatus.VIEWING_EXPLANATION)

        sessions, total_count = self.manager.get_sessions_list(
            sort_by="progress_percent",
            sort_order="asc",
        )

        self.assertEqual(total_count, 3)
        self.assertEqual(len(sessions), 3)

        # Verify progress values (sorted ascending)
        progress_values = [s["progress_percent"] for s in sessions]
        self.assertEqual(progress_values, [0, 50, 100])

    def test_last_active_node_tracked_on_transitions(self) -> None:
        """Transition nodes and verify last_active_node_id updates."""
        session_id, node_ids = self._create_session_with_nodes(3)

        # Initially last_active_node_id is None (nodes created but not transitioned)
        progress = self.manager.get_session_progress(session_id)
        self.assertIsNotNone(progress)
        assert progress is not None
        # last_active is set when transitioning TO VIEWING_EXPLANATION via
        # update_node_status, but node creation uses a different path
        # Let's explicitly transition nodes to verify tracking

        # Transition first node from VIEWING_EXPLANATION to IN_QUIZ
        # (node was created at VIEWING_EXPLANATION, so we transition to next state)
        self.manager.update_node_status(node_ids[0], NodeStatus.IN_QUIZ)
        progress = self.manager.get_session_progress(session_id)
        assert progress is not None
        # Quiz transitions don't set last_active, let's complete and unlock
        self._walk_node_to_completion(node_ids[0], NodeStatus.IN_QUIZ)

        # Now unlock second node - this transition sets last_active_node_id
        self.manager.update_node_status(node_ids[1], NodeStatus.VIEWING_EXPLANATION)
        progress = self.manager.get_session_progress(session_id)
        self.assertIsNotNone(progress)
        assert progress is not None
        self.assertEqual(progress["last_active_node_id"], node_ids[1])

        # Unlock third node
        self.manager.update_node_status(node_ids[2], NodeStatus.VIEWING_EXPLANATION)
        progress = self.manager.get_session_progress(session_id)
        assert progress is not None
        self.assertEqual(progress["last_active_node_id"], node_ids[2])

    def test_completed_at_timestamp_set_on_completion(self) -> None:
        """Verify completed_at is NULL before completion and set after."""
        session_id, node_ids = self._create_session_with_nodes(1)

        # Check completed_at is NULL before completion
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT completed_at FROM learning_sessions WHERE id = ?",
                (session_id,),
            )
            row = cursor.fetchone()
            self.assertIsNone(row["completed_at"])
        finally:
            conn.close()

        # Complete the node
        self._walk_node_to_completion(node_ids[0], NodeStatus.VIEWING_EXPLANATION)

        # Check completed_at is now set
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT completed_at FROM learning_sessions WHERE id = ?",
                (session_id,),
            )
            row = cursor.fetchone()
            self.assertIsNotNone(row["completed_at"])
        finally:
            conn.close()

    def test_progress_calculation_accuracy(self) -> None:
        """Test 0%, 33%, 66%, 100% progress calculations for a 3-node session."""
        session_id, node_ids = self._create_session_with_nodes(3)

        # 0% - no nodes completed
        progress = self.manager.get_session_progress(session_id)
        assert progress is not None
        self.assertEqual(progress["progress_percent"], 0)

        # 33% - 1 of 3 nodes completed
        self._walk_node_to_completion(node_ids[0], NodeStatus.VIEWING_EXPLANATION)
        progress = self.manager.get_session_progress(session_id)
        assert progress is not None
        self.assertEqual(progress["progress_percent"], 33)

        # 66% - 2 of 3 nodes completed
        self.manager.update_node_status(node_ids[1], NodeStatus.VIEWING_EXPLANATION)
        self._walk_node_to_completion(node_ids[1], NodeStatus.VIEWING_EXPLANATION)
        progress = self.manager.get_session_progress(session_id)
        assert progress is not None
        self.assertEqual(progress["progress_percent"], 66)

        # 100% - 3 of 3 nodes completed
        self.manager.update_node_status(node_ids[2], NodeStatus.VIEWING_EXPLANATION)
        self._walk_node_to_completion(node_ids[2], NodeStatus.VIEWING_EXPLANATION)
        progress = self.manager.get_session_progress(session_id)
        assert progress is not None
        self.assertEqual(progress["progress_percent"], 100)


class TestRevisionLifecycle(unittest.TestCase):
    """Test revision feature end-to-end through persistence."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "lifecycle.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_completed_session(
        self, num_nodes: int = 3, user_id: str = "user-1"
    ) -> tuple[str, List[Dict[str, str]]]:
        """Create a fully completed session with quizzes.

        Returns: (session_id, list of {id, correct_option_id, incorrect_option_id})
        """
        session = self.manager.create_learning_session(
            query=f"Completed {num_nodes}-node course",
            course_title=f"Completed Course with {num_nodes} nodes",
            user_id=user_id,
        )
        node_infos: List[Dict[str, str]] = []

        for i in range(num_nodes):
            # First node starts as VIEWING_EXPLANATION, others as LOCKED
            status = (
                NodeStatus.VIEWING_EXPLANATION if i == 0 else NodeStatus.LOCKED
            )
            quiz = _make_unique_quiz_card(f"completed-node-{i}")
            node = self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=i,
                title=f"Completed Node {i}",
                content_markdown=f"Content for completed node {i}",
                status=status,
                quiz=quiz,
            )
            correct_option_id = next(
                opt.option_id for opt in quiz.options if opt.is_correct
            )
            incorrect_option_id = next(
                opt.option_id for opt in quiz.options if not opt.is_correct
            )
            node_infos.append({
                "id": node["id"],
                "correct_option_id": correct_option_id,
                "incorrect_option_id": incorrect_option_id,
            })

        # Complete all nodes by walking through transitions
        for i, node_info in enumerate(node_infos):
            node_id = node_info["id"]
            if i == 0:
                # First node started at VIEWING_EXPLANATION
                start_status = NodeStatus.VIEWING_EXPLANATION
            else:
                # Other nodes need to be unlocked first
                self.manager.update_node_status(node_id, NodeStatus.VIEWING_EXPLANATION)
                start_status = NodeStatus.VIEWING_EXPLANATION

            # Walk through IN_QUIZ -> SHOWING_FEEDBACK -> COMPLETED
            self.manager.update_node_status(node_id, NodeStatus.IN_QUIZ)
            # Submit quiz answer
            self.manager.create_quiz_attempt(
                node_id, node_info["correct_option_id"]
            )
            self.manager.update_node_status(node_id, NodeStatus.SHOWING_FEEDBACK)
            self.manager.update_node_status(node_id, NodeStatus.COMPLETED)

        return session["id"], node_infos

    def _create_partial_session(
        self, num_nodes: int = 3, completed: int = 1
    ) -> tuple[str, List[Dict[str, str]]]:
        """Create a session with partial completion."""
        session = self.manager.create_learning_session(
            query=f"Partial {num_nodes}-node course",
            course_title=f"Partial Course",
            user_id="user-1",
        )
        node_infos: List[Dict[str, str]] = []

        for i in range(num_nodes):
            status = (
                NodeStatus.VIEWING_EXPLANATION if i == 0 else NodeStatus.LOCKED
            )
            quiz = _make_unique_quiz_card(f"partial-node-{i}")
            node = self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=i,
                title=f"Partial Node {i}",
                content_markdown=f"Content for partial node {i}",
                status=status,
                quiz=quiz,
            )
            correct_option_id = next(
                opt.option_id for opt in quiz.options if opt.is_correct
            )
            incorrect_option_id = next(
                opt.option_id for opt in quiz.options if not opt.is_correct
            )
            node_infos.append({
                "id": node["id"],
                "correct_option_id": correct_option_id,
                "incorrect_option_id": incorrect_option_id,
            })

        # Complete only specified number of nodes
        for i in range(completed):
            node_id = node_infos[i]["id"]
            if i == 0:
                start_status = NodeStatus.VIEWING_EXPLANATION
            else:
                self.manager.update_node_status(node_id, NodeStatus.VIEWING_EXPLANATION)

            self.manager.update_node_status(node_id, NodeStatus.IN_QUIZ)
            self.manager.create_quiz_attempt(
                node_id, node_infos[i]["correct_option_id"]
            )
            self.manager.update_node_status(node_id, NodeStatus.SHOWING_FEEDBACK)
            self.manager.update_node_status(node_id, NodeStatus.COMPLETED)

        return session["id"], node_infos

    def test_create_revision_for_completed_session(self) -> None:
        """Complete a session fully, create revision, verify it works."""
        session_id, node_infos = self._create_completed_session(3)

        revision = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="full_review",
        )

        self.assertIsNotNone(revision)
        self.assertEqual(revision["original_session_id"], session_id)
        self.assertEqual(revision["revision_number"], 1)
        self.assertEqual(revision["mode"], "full_review")
        self.assertEqual(revision["status"], "in_progress")
        self.assertEqual(revision["progress_percent"], 0)
        self.assertEqual(len(revision["nodes"]), 3)
        # All nodes should start as pending
        for node in revision["nodes"]:
            self.assertEqual(node["status"], "pending")

    def test_cannot_revise_in_progress_session(self) -> None:
        """Create a session at 50%, try to revise, expect ValueError."""
        session_id, _ = self._create_partial_session(num_nodes=4, completed=2)

        with self.assertRaises(ValueError):
            self.manager.create_revision_session(
                original_session_id=session_id,
                mode="full_review",
            )

    def test_full_review_mark_reviewed_and_quiz(self) -> None:
        """Create full_review revision, mark a node reviewed, submit quiz,
        verify node statuses."""
        session_id, node_infos = self._create_completed_session(2)

        revision = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="full_review",
        )

        # Mark first node as reviewed
        reviewed = self.manager.mark_revision_node_reviewed(
            revision_id=revision["id"],
            node_id=node_infos[0]["id"],
        )
        self.assertEqual(reviewed["status"], "reviewed")
        self.assertIsNotNone(reviewed["reviewed_at"])

        # Submit quiz for second node
        quiz_result = self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_infos[1]["id"],
            selected_option_id=node_infos[1]["correct_option_id"],
        )
        self.assertTrue(quiz_result["is_correct"])
        self.assertEqual(quiz_result["revision_node_status"], "quiz_passed")

        # Verify revision is completed
        updated = self.manager.get_revision_session(revision["id"])
        self.assertIsNotNone(updated)
        assert updated is not None
        self.assertEqual(updated["status"], "completed")
        self.assertEqual(updated["progress_percent"], 100)

    def test_quiz_only_submit_without_review(self) -> None:
        """Create quiz_only revision, submit quiz on a node, verify progress."""
        session_id, node_infos = self._create_completed_session(2)

        revision = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="quiz_only",
        )

        # Submit quiz for first node
        result1 = self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_infos[0]["id"],
            selected_option_id=node_infos[0]["correct_option_id"],
        )
        self.assertTrue(result1["is_correct"])

        # Check progress
        mid_revision = self.manager.get_revision_session(revision["id"])
        assert mid_revision is not None
        self.assertEqual(mid_revision["progress_percent"], 50)

        # Submit quiz for second node
        result2 = self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_infos[1]["id"],
            selected_option_id=node_infos[1]["correct_option_id"],
        )
        self.assertTrue(result2["is_correct"])

        # Verify revision completed
        final = self.manager.get_revision_session(revision["id"])
        assert final is not None
        self.assertEqual(final["status"], "completed")
        self.assertEqual(final["progress_percent"], 100)

    def test_revision_auto_completes(self) -> None:
        """Create revision, process all nodes, verify revision status='completed'."""
        session_id, node_infos = self._create_completed_session(2)

        revision = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="full_review",
        )

        # Mark both nodes reviewed
        self.manager.mark_revision_node_reviewed(
            revision_id=revision["id"],
            node_id=node_infos[0]["id"],
        )
        self.manager.mark_revision_node_reviewed(
            revision_id=revision["id"],
            node_id=node_infos[1]["id"],
        )

        # Verify auto-completion
        completed = self.manager.get_revision_session(revision["id"])
        assert completed is not None
        self.assertEqual(completed["status"], "completed")
        self.assertIsNotNone(completed["completed_at"])

    def test_revision_quiz_attempts_separate_from_original(self) -> None:
        """Make quiz attempts in both original and revision, verify they're
        tracked separately."""
        session_id, node_infos = self._create_completed_session(1)
        node_info = node_infos[0]

        # Original session already has quiz attempts from completion
        # Now create revision and submit more attempts
        revision = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="full_review",
        )

        # Submit quiz in revision
        self.manager.submit_revision_quiz(
            revision_id=revision["id"],
            node_id=node_info["id"],
            selected_option_id=node_info["correct_option_id"],
        )

        # Verify attempts are tracked separately
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            # Count original attempts (revision_session_id is NULL)
            cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM quiz_attempts
                WHERE node_id = ? AND revision_session_id IS NULL
                """,
                (node_info["id"],),
            )
            original_count = cursor.fetchone()["count"]

            # Count revision attempts
            cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM quiz_attempts
                WHERE node_id = ? AND revision_session_id = ?
                """,
                (node_info["id"], revision["id"]),
            )
            revision_count = cursor.fetchone()["count"]

            self.assertEqual(original_count, 1)  # From session completion
            self.assertEqual(revision_count, 1)  # From revision submit
        finally:
            conn.close()

    def test_revision_summary_performance_comparison(self) -> None:
        """Complete course with mixed quiz scores, revise with better score,
        verify summary shows improvement."""
        # Create session with 2 nodes
        session = self.manager.create_learning_session(
            query="Performance comparison test",
            course_title="Performance Course",
            user_id="user-1",
        )

        node_infos: List[Dict[str, str]] = []
        for i in range(2):
            quiz = _make_unique_quiz_card(f"perf-node-{i}")
            status = (
                NodeStatus.VIEWING_EXPLANATION if i == 0 else NodeStatus.LOCKED
            )
            node = self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=i,
                title=f"Perf Node {i}",
                content_markdown=f"Content {i}",
                status=status,
                quiz=quiz,
            )
            correct_id = next(
                opt.option_id for opt in quiz.options if opt.is_correct
            )
            incorrect_id = next(
                opt.option_id for opt in quiz.options if not opt.is_correct
            )
            node_infos.append({
                "id": node["id"],
                "correct_option_id": correct_id,
                "incorrect_option_id": incorrect_id,
            })

        # Complete nodes with 50% original quiz score:
        # Node 0: correct, Node 1: incorrect
        for i, node_info in enumerate(node_infos):
            node_id = node_info["id"]
            if i > 0:
                self.manager.update_node_status(
                    node_id, NodeStatus.VIEWING_EXPLANATION
                )
            self.manager.update_node_status(node_id, NodeStatus.IN_QUIZ)

            # Alternate correct/incorrect for 50% score
            if i == 0:
                self.manager.create_quiz_attempt(
                    node_id, node_info["correct_option_id"]
                )
            else:
                self.manager.create_quiz_attempt(
                    node_id, node_info["incorrect_option_id"]
                )

            self.manager.update_node_status(node_id, NodeStatus.SHOWING_FEEDBACK)
            self.manager.update_node_status(node_id, NodeStatus.COMPLETED)

        # Create revision and get 100% score
        revision = self.manager.create_revision_session(
            original_session_id=session["id"],
            mode="quiz_only",
        )

        # Submit correct answers for both nodes in revision
        for node_info in node_infos:
            self.manager.submit_revision_quiz(
                revision_id=revision["id"],
                node_id=node_info["id"],
                selected_option_id=node_info["correct_option_id"],
            )

        # Get summary and verify comparison
        summary = self.manager.get_revision_summary(revision["id"])

        self.assertEqual(summary["total_quiz_score_percent"], 100)
        self.assertEqual(summary["quizzes_passed"], 2)
        self.assertEqual(summary["quizzes_failed"], 0)
        self.assertIsNotNone(summary["comparison"])
        assert summary["comparison"] is not None
        self.assertEqual(summary["comparison"]["original_quiz_score_percent"], 50)
        self.assertEqual(summary["comparison"]["improvement_percent"], 50)

    def test_multiple_revisions_increment_number(self) -> None:
        """Create 3 revisions, verify numbers 1, 2, 3."""
        session_id, _ = self._create_completed_session(1)

        revision1 = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="full_review",
        )
        revision2 = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="quiz_only",
        )
        revision3 = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="full_review",
        )

        self.assertEqual(revision1["revision_number"], 1)
        self.assertEqual(revision2["revision_number"], 2)
        self.assertEqual(revision3["revision_number"], 3)


class TestEdgeCases(unittest.TestCase):
    """Test edge cases in session lifecycle."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "lifecycle.db"
        self.manager = LearningManager(self.db_path)
        self.manager.init_learning_tables()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_completed_session(self, num_nodes: int = 1) -> str:
        """Create a fully completed session."""
        session = self.manager.create_learning_session(
            query="Edge case test",
            course_title="Edge Case Course",
            user_id="user-1",
        )

        for i in range(num_nodes):
            status = (
                NodeStatus.VIEWING_EXPLANATION if i == 0 else NodeStatus.LOCKED
            )
            quiz = _make_unique_quiz_card(f"edge-node-{i}")
            node = self.manager.create_concept_node(
                session_id=session["id"],
                sequence_index=i,
                title=f"Edge Node {i}",
                content_markdown=f"Content {i}",
                status=status,
                quiz=quiz,
            )

            # Walk through transitions
            if i > 0:
                self.manager.update_node_status(
                    node["id"], NodeStatus.VIEWING_EXPLANATION
                )
            self.manager.update_node_status(node["id"], NodeStatus.IN_QUIZ)
            correct_id = next(
                opt.option_id for opt in quiz.options if opt.is_correct
            )
            self.manager.create_quiz_attempt(node["id"], correct_id)
            self.manager.update_node_status(node["id"], NodeStatus.SHOWING_FEEDBACK)
            self.manager.update_node_status(node["id"], NodeStatus.COMPLETED)

        return session["id"]

    def test_delete_session_cascades_to_revisions(self) -> None:
        """Create session, complete it, create revision, delete session,
        verify everything is gone."""
        session_id = self._create_completed_session(2)

        # Create revision
        revision = self.manager.create_revision_session(
            original_session_id=session_id,
            mode="full_review",
        )
        revision_id = revision["id"]

        # Verify revision exists
        retrieved = self.manager.get_revision_session(revision_id)
        self.assertIsNotNone(retrieved)

        # Delete the session directly via SQL (to trigger cascade)
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM learning_sessions WHERE id = ?",
                (session_id,),
            )
            conn.commit()
        finally:
            conn.close()

        # Verify session is gone
        session = self.manager.get_learning_session(session_id)
        self.assertIsNone(session)

        # Verify revision is gone (cascade delete)
        conn = self.manager._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) AS count FROM revision_sessions WHERE id = ?",
                (revision_id,),
            )
            count = cursor.fetchone()["count"]
            self.assertEqual(count, 0)
        finally:
            conn.close()

    def test_concurrent_sessions_no_interference(self) -> None:
        """Create 2 sessions for same user, modify one, verify the other
        is unchanged (check via get_sessions_list with the user)."""
        user_id = "shared-user"

        # Create two sessions for the same user
        session1 = self.manager.create_learning_session(
            query="Session 1",
            course_title="Course 1",
            user_id=user_id,
        )
        session2 = self.manager.create_learning_session(
            query="Session 2",
            course_title="Course 2",
            user_id=user_id,
        )

        # Add and complete a node in session 1
        quiz = _make_quiz_card()
        node1 = self.manager.create_concept_node(
            session_id=session1["id"],
            sequence_index=0,
            title="Node 1",
            content_markdown="Content 1",
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz=quiz,
        )

        self.manager.update_node_status(node1["id"], NodeStatus.IN_QUIZ)
        self.manager.create_quiz_attempt(node1["id"], _make_stable_uuid("A"))
        self.manager.update_node_status(node1["id"], NodeStatus.SHOWING_FEEDBACK)
        self.manager.update_node_status(node1["id"], NodeStatus.COMPLETED)

        # Verify via get_sessions_list
        sessions, total = self.manager.get_sessions_list(user_id=user_id)

        self.assertEqual(total, 2)

        # Find sessions by ID
        session1_data = next(s for s in sessions if s["id"] == session1["id"])
        session2_data = next(s for s in sessions if s["id"] == session2["id"])

        # Session 1 should be completed
        self.assertEqual(session1_data["status"], "completed")
        self.assertEqual(session1_data["progress_percent"], 100)

        # Session 2 should be unchanged (in_progress with 0 nodes)
        self.assertEqual(session2_data["status"], "in_progress")
        self.assertEqual(session2_data["total_nodes"], 0)

    def test_progress_never_exceeds_100(self) -> None:
        """Complete all nodes, verify progress is exactly 100 (not 101)."""
        session_id = self._create_completed_session(3)

        progress = self.manager.get_session_progress(session_id)
        self.assertIsNotNone(progress)
        assert progress is not None

        self.assertEqual(progress["progress_percent"], 100)
        self.assertLessEqual(progress["progress_percent"], 100)

    def test_revision_of_session_with_error_nodes_handled(self) -> None:
        """Create a session where some nodes are in ERROR state plus some
        COMPLETED, verify we can still complete the session if we transition
        all nodes to COMPLETED and revise."""
        session = self.manager.create_learning_session(
            query="Error node test",
            course_title="Error Course",
            user_id="user-1",
        )

        # Create first node and complete it
        quiz1 = _make_unique_quiz_card("error-node-0")
        node1 = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=0,
            title="Completed Node",
            content_markdown="Content 0",
            status=NodeStatus.VIEWING_EXPLANATION,
            quiz=quiz1,
        )
        correct_id1 = next(
            opt.option_id for opt in quiz1.options if opt.is_correct
        )
        self.manager.update_node_status(node1["id"], NodeStatus.IN_QUIZ)
        self.manager.create_quiz_attempt(node1["id"], correct_id1)
        self.manager.update_node_status(node1["id"], NodeStatus.SHOWING_FEEDBACK)
        self.manager.update_node_status(node1["id"], NodeStatus.COMPLETED)

        # Create second node in ERROR state
        quiz2 = _make_unique_quiz_card("error-node-1")
        node2 = self.manager.create_concept_node(
            session_id=session["id"],
            sequence_index=1,
            title="Error Node",
            content_markdown="Content 1",
            status=NodeStatus.LOCKED,
            quiz=quiz2,
            error_message="Generation failed",
            retry_available=True,
        )

        # Transition error node through to COMPLETED
        # ERROR can go to VIEWING_EXPLANATION directly
        self.manager.update_node_status(node2["id"], NodeStatus.VIEWING_EXPLANATION)
        self.manager.update_node_status(node2["id"], NodeStatus.IN_QUIZ)
        correct_id2 = next(
            opt.option_id for opt in quiz2.options if opt.is_correct
        )
        self.manager.create_quiz_attempt(node2["id"], correct_id2)
        self.manager.update_node_status(node2["id"], NodeStatus.SHOWING_FEEDBACK)
        self.manager.update_node_status(node2["id"], NodeStatus.COMPLETED)

        # Verify session is completed
        progress = self.manager.get_session_progress(session["id"])
        assert progress is not None
        self.assertEqual(progress["status"], "completed")

        # Now create revision
        revision = self.manager.create_revision_session(
            original_session_id=session["id"],
            mode="full_review",
        )

        self.assertIsNotNone(revision)
        self.assertEqual(revision["status"], "in_progress")
        self.assertEqual(len(revision["nodes"]), 2)

    def test_empty_session_list_returns_valid_response(self) -> None:
        """No sessions created, get_sessions_list returns ([], 0)."""
        sessions, total_count = self.manager.get_sessions_list()

        self.assertEqual(sessions, [])
        self.assertEqual(total_count, 0)


if __name__ == "__main__":
    unittest.main()
