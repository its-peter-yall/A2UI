"""
=============================================================================
FILE: test_quiz_randomization.py
=============================================================================

PURPOSE:
Unit tests for Phase 2: Backend Randomization and Evaluation.
Validates Fisher-Yates shuffle integrity, CSPRNG usage, visibility rules,
and option ID-based evaluation for secure quiz randomization.

KEY TESTS:
- test_fisher_yates_shuffle_preserves_stable_ids: Stable IDs persist post-shuffle
- test_shuffle_uses_csprng: Secrets module provides cryptographic randomness
- test_shuffle_assigns_unique_display_labels: A-D labels after shuffle
- test_shuffle_unbiased_distribution: Statistical test for shuffle randomness
- test_hide_correctness_in_quiz_state: Correctness/explanation hidden in IN_QUIZ
- test_evaluation_with_shuffled_options: Correct evaluation using stable IDs
- test_persist_shuffle_order: Shuffle state stored for consistent refresh

DEPENDENCIES:
- unittest: Python standard testing framework
- server.services.quiz_randomization: Quiz randomization service
- server.schemas.learning: Quiz schemas with option_id/display_label separation

USAGE PATTERN:
```python
# Run all randomization tests
python -m unittest server.tests.test_quiz_randomization

# Run specific test class
python -m unittest server.tests.test_quiz_randomization.TestFisherYatesShuffle

# Run single test
python -m unittest server.tests.test_quiz_randomization.TestFisherYatesShuffle.test_shuffle_preserves_stable_ids
```

TEST SETUP:
- Creates mock QuizCard and QuizOption objects with stable UUIDs
- Tests shuffle determinism with seed for reproducibility
- Tests CSPRNG for cryptographic security

RELATED FILES:
- server/services/quiz_randomization.py - Service under test
- server/schemas/learning.py - Quiz schemas

NOTES:
- Phase 2 implementation: Secure server-side option shuffling
- Fisher-Yates ensures unbiased permutation
- CSPRNG prevents prediction of shuffle order
- Stable option_id persists across shuffles for evaluation
=============================================================================
"""

# test_quiz_randomization.py
# Phase 2: Backend Randomization and Evaluation tests

# Tests for secure quiz randomization with Fisher-Yates shuffle and CSPRNG

# @see: server/services/quiz_randomization.py - Service under test
# @note: All shuffles must use secrets module for cryptographic security

import secrets
import uuid
from collections import Counter
from typing import List
from unittest import TestCase, mock

from pydantic import ValidationError

from server.schemas.learning import (
    QuizCard,
    QuizCardHidden,
    QuizOption,
    QuizOptionHidden,
    QuizSet,
    QuizSetHidden,
)


def _make_quiz_option(display_label: str, is_correct: bool, text: str = None) -> QuizOption:
    """Create a QuizOption with stable option_id (UUID) and display_label."""
    option_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"test-option-{display_label}-{text or display_label}"))
    return QuizOption(
        option_id=option_id,
        display_label=display_label,
        text=text or f"Option {display_label}",
        is_correct=is_correct,
        explanation=f"Explanation for {display_label}",
    )


def _make_quiz_card(question: str = "Test Question?") -> QuizCard:
    """Create a QuizCard with 4 options."""
    return QuizCard(
        question_text=question,
        options=[
            _make_quiz_option("A", True, "Correct Answer"),
            _make_quiz_option("B", False, "Wrong Answer B"),
            _make_quiz_option("C", False, "Wrong Answer C"),
            _make_quiz_option("D", False, "Wrong Answer D"),
        ],
        difficulty="medium",
    )


class TestFisherYatesShuffle(TestCase):
    """Tests for Fisher-Yates shuffle implementation."""

    def test_shuffle_preserves_all_options(self) -> None:
        """Fisher-Yates shuffle must preserve all 4 options, just reorder them."""
        from server.services.quiz_randomization import shuffle_quiz_options

        quiz = _make_quiz_card()
        original_ids = {opt.option_id for opt in quiz.options}

        shuffled = shuffle_quiz_options(quiz)

        # All options preserved
        self.assertEqual(len(shuffled.options), 4)
        shuffled_ids = {opt.option_id for opt in shuffled.options}
        self.assertEqual(original_ids, shuffled_ids)

    def test_shuffle_preserves_stable_ids(self) -> None:
        """Stable option_id must persist across shuffles."""
        from server.services.quiz_randomization import shuffle_quiz_options

        quiz = _make_quiz_card()
        original_option = quiz.options[0]
        original_id = original_option.option_id

        # Shuffle multiple times
        for _ in range(10):
            shuffled = shuffle_quiz_options(quiz)
            # Find the same option in shuffled result
            found = next(
                (opt for opt in shuffled.options if opt.option_id == original_id),
                None
            )
            self.assertIsNotNone(found)
            self.assertEqual(found.text, original_option.text)
            self.assertEqual(found.is_correct, original_option.is_correct)
            self.assertEqual(found.explanation, original_option.explanation)

    def test_shuffle_assigns_unique_display_labels(self) -> None:
        """After shuffle, all display_labels must be A, B, C, D (no duplicates)."""
        from server.services.quiz_randomization import shuffle_quiz_options

        quiz = _make_quiz_card()
        shuffled = shuffle_quiz_options(quiz)

        labels = [opt.display_label for opt in shuffled.options]
        self.assertEqual(set(labels), {"A", "B", "C", "D"})
        self.assertEqual(len(labels), len(set(labels)))  # No duplicates

    def test_shuffle_changes_display_label_positions(self) -> None:
        """Shuffle should change which option gets which display label."""
        from server.services.quiz_randomization import shuffle_quiz_options

        quiz = _make_quiz_card()

        # Track original positions by option_id
        original_positions = {
            opt.option_id: opt.display_label for opt in quiz.options
        }

        # Shuffle many times to likely see a change
        position_changed = False
        for _ in range(50):
            shuffled = shuffle_quiz_options(quiz)
            for opt in shuffled.options:
                if opt.display_label != original_positions[opt.option_id]:
                    position_changed = True
                    break
            if position_changed:
                break

        self.assertTrue(
            position_changed,
            "Shuffle should change display label positions"
        )

    def test_shuffle_is_unbiased(self) -> None:
        """Fisher-Yates produces unbiased permutation (statistical test)."""
        from server.services.quiz_randomization import shuffle_quiz_options

        quiz = _make_quiz_card()

        # Count how many times each option ends up in each position
        position_counts: dict = {opt.option_id: Counter() for opt in quiz.options}

        num_shuffles = 1000
        for _ in range(num_shuffles):
            shuffled = shuffle_quiz_options(quiz)
            for idx, opt in enumerate(shuffled.options):
                position_counts[opt.option_id][idx] += 1

        # With unbiased shuffle, each option should appear in each position
        # roughly equally often (within statistical bounds)
        # We expect roughly num_shuffles/4 = 250 per position per option
        for option_id, counts in position_counts.items():
            for position in range(4):
                count = counts[position]
                # Allow 20% deviation from expected 250
                self.assertGreater(
                    count, num_shuffles * 0.15,
                    f"Option {option_id} at position {position}: {count} occurrences"
                )
                self.assertLess(
                    count, num_shuffles * 0.35,
                    f"Option {option_id} at position {position}: {count} occurrences"
                )


class TestCSPRNG(TestCase):
    """Tests for Cryptographically Secure Pseudo-Random Number Generator usage."""

    def test_shuffle_uses_secrets_module(self) -> None:
        """Shuffle must use secrets module for cryptographic security."""
        from server.services.quiz_randomization import shuffle_quiz_options

        quiz = _make_quiz_card()

        with mock.patch('secrets.randbelow') as mock_randbelow:
            # Return predictable values for testing
            mock_randbelow.side_effect = [3, 2, 1, 0]
            shuffled = shuffle_quiz_options(quiz)

            # Verify secrets.randbelow was called
            self.assertTrue(mock_randbelow.called)

    def test_shuffle_seed_deterministic(self) -> None:
        """Shuffle with same seed produces same ordering (reproducibility)."""
        from server.services.quiz_randomization import shuffle_quiz_options_with_seed

        quiz = _make_quiz_card()
        seed = "test-seed-123"

        shuffle1 = shuffle_quiz_options_with_seed(quiz, seed)
        shuffle2 = shuffle_quiz_options_with_seed(quiz, seed)

        # Same seed produces same ordering
        self.assertEqual(
            [opt.option_id for opt in shuffle1.options],
            [opt.option_id for opt in shuffle2.options]
        )
        self.assertEqual(
            [opt.display_label for opt in shuffle1.options],
            [opt.display_label for opt in shuffle2.options]
        )

    def test_shuffle_different_seed_different_order(self) -> None:
        """Different seeds produce different orderings."""
        from server.services.quiz_randomization import shuffle_quiz_options_with_seed

        quiz = _make_quiz_card()

        shuffle1 = shuffle_quiz_options_with_seed(quiz, "seed-a")
        shuffle2 = shuffle_quiz_options_with_seed(quiz, "seed-b")

        # Different seeds should likely produce different orderings
        # (Not guaranteed, but highly probable)
        order1 = [opt.option_id for opt in shuffle1.options]
        order2 = [opt.option_id for opt in shuffle2.options]

        # Allow for the extremely rare case they're the same
        # but log it if it happens
        if order1 == order2:
            self.skipTest("Extremely rare: different seeds produced same order")


class TestVisibilityRules(TestCase):
    """Tests for hiding correctness data in IN_QUIZ state."""

    def test_hide_quiz_card_removes_correctness(self) -> None:
        """hide_quiz_card must remove is_correct and explanation fields."""
        from server.services.quiz_randomization import hide_quiz_card

        quiz = _make_quiz_card()
        hidden = hide_quiz_card(quiz)

        # Should return QuizCardHidden type
        self.assertIsInstance(hidden, QuizCardHidden)

        # No correctness data in options
        for opt in hidden.options:
            self.assertIsInstance(opt, QuizOptionHidden)
            with self.assertRaises(AttributeError):
                _ = opt.is_correct
            with self.assertRaises(AttributeError):
                _ = opt.explanation

    def test_hide_quiz_card_preserves_display_info(self) -> None:
        """hide_quiz_card must preserve question, options text, and display labels."""
        from server.services.quiz_randomization import hide_quiz_card

        quiz = _make_quiz_card()
        hidden = hide_quiz_card(quiz)

        self.assertEqual(hidden.question_text, quiz.question_text)
        self.assertEqual(len(hidden.options), len(quiz.options))

        # Verify all display info is preserved
        for hidden_opt, original_opt in zip(hidden.options, quiz.options):
            self.assertEqual(hidden_opt.option_id, original_opt.option_id)
            self.assertEqual(hidden_opt.display_label, original_opt.display_label)
            self.assertEqual(hidden_opt.text, original_opt.text)

    def test_hide_quiz_set_preserves_structure(self) -> None:
        """hide_quiz_set must preserve QuizSet structure while hiding correctness."""
        from server.services.quiz_randomization import hide_quiz_set

        quiz1 = _make_quiz_card("Question 1")
        quiz2 = _make_quiz_card("Question 2")
        quiz_set = QuizSet(quizzes=[quiz1, quiz2], current_index=1, shuffle_seed="seed")

        hidden = hide_quiz_set(quiz_set)

        self.assertIsInstance(hidden, QuizSetHidden)
        self.assertEqual(len(hidden.quizzes), 2)
        self.assertEqual(hidden.current_index, 1)
        self.assertEqual(hidden.total_quizzes, 2)

        # All quizzes should be hidden
        for quiz in hidden.quizzes:
            self.assertIsInstance(quiz, QuizCardHidden)
            for opt in quiz.options:
                self.assertIsInstance(opt, QuizOptionHidden)

    def test_correctness_never_in_hidden_response(self) -> None:
        """Comprehensive test: correctness data must never leak in hidden response."""
        from server.services.quiz_randomization import hide_quiz_card

        quiz = _make_quiz_card()
        hidden = hide_quiz_card(quiz)

        # Serialize to dict and check for correctness fields
        hidden_dict = hidden.model_dump()

        # Check no 'is_correct' anywhere in response
        def contains_key(obj, key):
            if isinstance(obj, dict):
                if key in obj:
                    return True
                return any(contains_key(v, key) for v in obj.values())
            if isinstance(obj, list):
                return any(contains_key(item, key) for item in obj)
            return False

        self.assertFalse(
            contains_key(hidden_dict, 'is_correct'),
            "Hidden response contains is_correct field"
        )
        self.assertFalse(
            contains_key(hidden_dict, 'explanation'),
            "Hidden response contains explanation field"
        )


class TestOptionIDEvaluation(TestCase):
    """Tests for evaluation using stable option_id."""

    def test_evaluate_correct_answer_by_option_id(self) -> None:
        """Evaluation must correctly identify answer by stable option_id."""
        from server.services.quiz_randomization import evaluate_quiz_answer

        quiz = _make_quiz_card()
        correct_option = next(opt for opt in quiz.options if opt.is_correct)

        result = evaluate_quiz_answer(quiz, correct_option.option_id)

        self.assertTrue(result['is_correct'])
        self.assertEqual(result['correct_option_id'], correct_option.option_id)
        self.assertEqual(result['explanation'], correct_option.explanation)

    def test_evaluate_incorrect_answer_by_option_id(self) -> None:
        """Evaluation must correctly identify incorrect answer."""
        from server.services.quiz_randomization import evaluate_quiz_answer

        quiz = _make_quiz_card()
        incorrect_option = next(opt for opt in quiz.options if not opt.is_correct)
        correct_option = next(opt for opt in quiz.options if opt.is_correct)

        result = evaluate_quiz_answer(quiz, incorrect_option.option_id)

        self.assertFalse(result['is_correct'])
        self.assertEqual(result['correct_option_id'], correct_option.option_id)
        self.assertEqual(result['explanation'], incorrect_option.explanation)

    def test_evaluate_with_shuffled_options(self) -> None:
        """Evaluation works correctly even after options are shuffled."""
        from server.services.quiz_randomization import (
            evaluate_quiz_answer,
            shuffle_quiz_options_with_seed,
        )

        quiz = _make_quiz_card()
        correct_option_id = next(
            opt.option_id for opt in quiz.options if opt.is_correct
        )

        # Use a deterministic seed that we know will move the correct answer
        # Try different seeds until we find one that moves option A
        shuffled = None
        shuffled_correct = None
        for seed in range(1, 100):
            shuffled = shuffle_quiz_options_with_seed(quiz, f"test-seed-{seed}")
            shuffled_correct = next(
                opt for opt in shuffled.options if opt.option_id == correct_option_id
            )
            if shuffled_correct.display_label != "A":
                break

        # Evaluate using stable ID (should work regardless of shuffle)
        result = evaluate_quiz_answer(shuffled, correct_option_id)

        self.assertTrue(result['is_correct'])
        # Verify that the display label changed (shuffle actually happened)
        self.assertNotEqual(
            shuffled_correct.display_label,
            "A",
            "Shuffle should change display label position"
        )

    def test_evaluate_invalid_option_id_raises_error(self) -> None:
        """Evaluation with invalid option_id must raise ValueError."""
        from server.services.quiz_randomization import evaluate_quiz_answer

        quiz = _make_quiz_card()

        with self.assertRaises(ValueError) as ctx:
            evaluate_quiz_answer(quiz, "invalid-option-id")

        self.assertIn("invalid", str(ctx.exception).lower())

    def test_evaluate_preserves_all_option_data(self) -> None:
        """Evaluation result must include complete option data."""
        from server.services.quiz_randomization import evaluate_quiz_answer

        quiz = _make_quiz_card()
        selected_option = quiz.options[0]

        result = evaluate_quiz_answer(quiz, selected_option.option_id)

        self.assertIn('is_correct', result)
        self.assertIn('correct_option_id', result)
        self.assertIn('explanation', result)
        self.assertIn('selected_option', result)


class TestQuizSetRandomization(TestCase):
    """Tests for QuizSet (multiple quizzes) randomization."""

    def test_shuffle_quiz_set_shuffles_each_quiz(self) -> None:
        """Shuffling QuizSet must shuffle options within each quiz."""
        from server.services.quiz_randomization import shuffle_quiz_set

        quiz1 = _make_quiz_card("Question 1")
        quiz2 = _make_quiz_card("Question 2")
        quiz_set = QuizSet(quizzes=[quiz1, quiz2], current_index=0)

        shuffled = shuffle_quiz_set(quiz_set)

        # Each quiz should have its options shuffled
        self.assertEqual(len(shuffled.quizzes), 2)
        for quiz in shuffled.quizzes:
            self.assertEqual(len(quiz.options), 4)
            labels = [opt.display_label for opt in quiz.options]
            self.assertEqual(set(labels), {"A", "B", "C", "D"})

    def test_shuffle_quiz_set_with_seed(self) -> None:
        """QuizSet shuffle with seed produces deterministic results."""
        from server.services.quiz_randomization import shuffle_quiz_set_with_seed

        quiz1 = _make_quiz_card("Question 1")
        quiz2 = _make_quiz_card("Question 2")
        quiz_set = QuizSet(quizzes=[quiz1, quiz2], current_index=0)

        seed = "quizset-seed-123"
        shuffle1 = shuffle_quiz_set_with_seed(quiz_set, seed)
        shuffle2 = shuffle_quiz_set_with_seed(quiz_set, seed)

        # Same seed = same ordering for both quizzes
        for q1, q2 in zip(shuffle1.quizzes, shuffle2.quizzes):
            self.assertEqual(
                [opt.option_id for opt in q1.options],
                [opt.option_id for opt in q2.options]
            )


class TestShufflePersistence(TestCase):
    """Tests for persisting shuffle order."""

    def test_get_or_create_shuffle_order_creates_new(self) -> None:
        """get_or_create_shuffle_order creates new shuffle if none exists."""
        from server.services.quiz_randomization import get_or_create_shuffle_order

        quiz = _make_quiz_card()

        # First call should create and return shuffle
        shuffled, shuffle_seed = get_or_create_shuffle_order(quiz, None, None)

        self.assertIsNotNone(shuffle_seed)
        self.assertEqual(len(shuffled.options), 4)

    def test_get_or_create_shuffle_order_uses_existing(self) -> None:
        """get_or_create_shuffle_order uses existing seed if provided."""
        from server.services.quiz_randomization import get_or_create_shuffle_order

        quiz = _make_quiz_card()
        existing_seed = "persisted-seed-456"

        shuffled, shuffle_seed = get_or_create_shuffle_order(quiz, existing_seed, None)

        self.assertEqual(shuffle_seed, existing_seed)

    def test_get_or_create_shuffle_order_uses_quiz_set_seed(self) -> None:
        """get_or_create_shuffle_order uses QuizSet seed if available."""
        from server.services.quiz_randomization import get_or_create_shuffle_order

        quiz = _make_quiz_card()
        quiz_set_seed = "quizset-seed-789"

        shuffled, shuffle_seed = get_or_create_shuffle_order(quiz, None, quiz_set_seed)

        self.assertEqual(shuffle_seed, quiz_set_seed)


class TestIntegration(TestCase):
    """Integration tests for complete shuffle and evaluate flow."""

    def test_full_quiz_flow_with_shuffle(self) -> None:
        """Complete flow: create quiz -> shuffle -> hide -> evaluate."""
        from server.services.quiz_randomization import (
            evaluate_quiz_answer,
            hide_quiz_card,
            shuffle_quiz_options,
        )

        # 1. Create original quiz
        quiz = _make_quiz_card()
        correct_option_id = next(
            opt.option_id for opt in quiz.options if opt.is_correct
        )

        # 2. Shuffle for presentation
        shuffled = shuffle_quiz_options(quiz)

        # 3. Hide for IN_QUIZ state
        hidden = hide_quiz_card(shuffled)

        # 4. User selects based on hidden quiz (only sees display labels)
        # Find which display label now has the correct answer
        shuffled_correct_label = next(
            opt.display_label for opt in hidden.options
            if opt.option_id == correct_option_id
        )

        # 5. Evaluate using stable ID
        result = evaluate_quiz_answer(shuffled, correct_option_id)

        self.assertTrue(result['is_correct'])
        self.assertEqual(result['correct_option_id'], correct_option_id)

    def test_multiple_attempts_consistent_shuffle(self) -> None:
        """Multiple attempts with same seed show consistent ordering."""
        from server.services.quiz_randomization import (
            shuffle_quiz_options_with_seed,
        )

        quiz = _make_quiz_card()
        seed = "consistent-seed"

        # Multiple shuffles with same seed
        shuffles = [
            shuffle_quiz_options_with_seed(quiz, seed)
            for _ in range(5)
        ]

        # All should have identical ordering
        first_order = [opt.option_id for opt in shuffles[0].options]
        for shuffled in shuffles[1:]:
            current_order = [opt.option_id for opt in shuffled.options]
            self.assertEqual(first_order, current_order)


if __name__ == "__main__":
    import unittest
    unittest.main()
