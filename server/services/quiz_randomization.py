"""
============================================================================
FILE: quiz_randomization.py
LOCATION: server/services/quiz_randomization.py
============================================================================
PURPOSE:
    Secure quiz randomization service implementing Fisher-Yates
    shuffle with CSPRNG. Provides stable option identity across
    shuffles, response filtering for IN_QUIZ state, and option
    ID-based evaluation.
ROLE IN PROJECT:
    Service layer component for the learning feature's quiz delivery.
    - Provides stable option identity across shuffles via option_id
    - Filters correctness data for IN_QUIZ state to prevent leakage
KEY COMPONENTS:
    - shuffle_quiz_options(): Fisher-Yates shuffle using secrets.randbelow()
    - shuffle_quiz_options_with_seed(): Deterministic shuffle for reproducibility
    - hide_quiz_card(): Remove correctness/explanation for IN_QUIZ state
    - hide_quiz_set(): Hide correctness for QuizSet with multiple quizzes
    - evaluate_quiz_answer(): Evaluate submission using stable option_id
    - get_or_create_shuffle_order(): Persist shuffle state for consistent refresh
DEPENDENCIES:
    - External: secrets, hashlib, random
    - Internal: server.schemas.learning
USAGE:
    ```python
    from server.services.quiz_randomization import (
        shuffle_quiz_options, hide_quiz_card, evaluate_quiz_answer,
    )
    shuffled = shuffle_quiz_options(quiz_card)
    hidden = hide_quiz_card(shuffled)
        result = evaluate_quiz_answer(quiz_card, [selected_option_id])
    ```
============================================================================
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from typing import List, Optional, Tuple

from server.schemas.learning import (
    QuizCard,
    QuizCardHidden,
    QuizOption,
    QuizOptionHidden,
    QuizSet,
    QuizSetHidden,
)

logger = logging.getLogger(__name__)

# Display labels for assignment after shuffle
DISPLAY_LABELS = ["A", "B", "C", "D"]


def shuffle_quiz_options(quiz: QuizCard) -> QuizCard:
    """Shuffle quiz options using Fisher-Yates with CSPRNG.

    Implements the Fisher-Yates shuffle algorithm using Python's secrets module
    for cryptographically secure random number generation. Preserves stable
    option_id while changing display_label positions.

    Args:
        quiz: Original QuizCard with options in original order.

    Returns:
        New QuizCard with shuffled options and reassigned display_labels.

    Example:
        >>> shuffled = shuffle_quiz_options(quiz)
        >>> shuffled.options[0].display_label  # Could be any of A, B, C, D
        'C'
        >>> shuffled.options[0].option_id  # Original stable ID preserved
        'uuid-123-...'
    """
    options = list(quiz.options)  # Create a copy to avoid mutating original
    n = len(options)

    # Fisher-Yates shuffle using CSPRNG
    for i in range(n - 1, 0, -1):
        # secrets.randbelow provides cryptographically secure randomness
        j = secrets.randbelow(i + 1)
        options[i], options[j] = options[j], options[i]

    # Reassign display labels A, B, C, D based on new positions
    shuffled_options = []
    for idx, opt in enumerate(options):
        shuffled_options.append(
            QuizOption(
                option_id=opt.option_id,
                display_label=DISPLAY_LABELS[idx],
                text=opt.text,
                is_correct=opt.is_correct,
                explanation=opt.explanation,
            )
        )

    return QuizCard(
        question_text=quiz.question_text,
        options=shuffled_options,
        difficulty=quiz.difficulty,
        question_type=quiz.question_type,
    )


def shuffle_quiz_options_with_seed(quiz: QuizCard, seed: str) -> QuizCard:
    """Deterministic shuffle using a seed for reproducible ordering.

    Uses SHA-256 to hash the seed string, then uses the hash as input to
    Python's Random for deterministic but unpredictable shuffle order.

    Args:
        quiz: Original QuizCard with options in original order.
        seed: Seed string for deterministic shuffle (e.g., session ID + node ID).

    Returns:
        New QuizCard with deterministically shuffled options.

    Example:
        >>> shuffled1 = shuffle_quiz_options_with_seed(quiz, "seed-123")
        >>> shuffled2 = shuffle_quiz_options_with_seed(quiz, "seed-123")
        >>> shuffled1.options[0].option_id == shuffled2.options[0].option_id
        True
    """
    import random

    options = list(quiz.options)

    # Hash seed with SHA-256 for consistent length and entropy
    seed_hash = hashlib.sha256(seed.encode()).digest()
    seed_int = int.from_bytes(seed_hash, "big")

    # Use Random for deterministic shuffle based on seed
    rng = random.Random(seed_int)

    # Fisher-Yates shuffle with seeded RNG
    n = len(options)
    for i in range(n - 1, 0, -1):
        j = rng.randrange(i + 1)
        options[i], options[j] = options[j], options[i]

    # Reassign display labels based on new positions
    shuffled_options = [
        QuizOption(
            option_id=opt.option_id,
            display_label=DISPLAY_LABELS[idx],
            text=opt.text,
            is_correct=opt.is_correct,
            explanation=opt.explanation,
        )
        for idx, opt in enumerate(options)
    ]

    return QuizCard(
        question_text=quiz.question_text,
        options=shuffled_options,
        difficulty=quiz.difficulty,
        question_type=quiz.question_type,
    )


def hide_quiz_card(quiz: QuizCard) -> QuizCardHidden:
    """Hide correctness and explanation for IN_QUIZ state.

    Transforms a QuizCard into QuizCardHidden, removing is_correct and
    explanation fields to prevent answer leakage before submission.

    Args:
        quiz: Original QuizCard with full correctness data.

    Returns:
        QuizCardHidden with only display-safe fields.

    Example:
        >>> hidden = hide_quiz_card(quiz)
        >>> hidden.options[0].option_id  # Stable ID preserved
        'uuid-123-...'
        >>> hidden.options[0].is_correct  # AttributeError - field removed
        AttributeError
    """
    hidden_options = [
        QuizOptionHidden(
            option_id=opt.option_id,
            display_label=opt.display_label,
            text=opt.text,
        )
        for opt in quiz.options
    ]

    return QuizCardHidden(
        question_text=quiz.question_text,
        options=hidden_options,
        difficulty=quiz.difficulty,
        question_type=quiz.question_type,
    )


def hide_quiz_set(quiz_set: QuizSet) -> QuizSetHidden:
    """Hide correctness for QuizSet with multiple quizzes.

    Transforms a QuizSet into QuizSetHidden, hiding correctness data for
    all quizzes while preserving structure and adding total_quizzes count.

    Args:
        quiz_set: Original QuizSet with full correctness data.

    Returns:
        QuizSetHidden with hidden correctness for all quizzes.

    Example:
        >>> hidden = hide_quiz_set(quiz_set)
        >>> hidden.total_quizzes  # UI can show progress
        3
        >>> hidden.quizzes[0].options[0].is_correct  # AttributeError
        AttributeError
    """
    hidden_quizzes = [hide_quiz_card(quiz) for quiz in quiz_set.quizzes]

    return QuizSetHidden(
        quizzes=hidden_quizzes,
        current_index=quiz_set.current_index,
        total_quizzes=len(quiz_set.quizzes),
    )


def evaluate_quiz_answer(
    quiz: QuizCard, selected_option_ids: List[str]
) -> dict:
    """Evaluate a quiz answer using stable option_id.

    Looks up the selected option(s) by their stable option_id(s) and determines
    correctness. Returns complete result information including explanation.

    Args:
        quiz: QuizCard with options (shuffled or original).
        selected_option_ids: Stable UUID(s) of the selected option(s).

    Returns:
        Dict with:
        - is_correct: bool - Whether the selected answer is correct
        - correct_option_ids: list - The correct option(s)' stable IDs
        - explanation: str - Explanation for the selected answer
        - selected_options: list - The selected option objects

    Raises:
        ValueError: If any selected_option_id is not found in quiz options.

    Example:
        >>> result = evaluate_quiz_answer(quiz, ["uuid-123-..."])
        >>> result['is_correct']
        True
        >>> result['explanation']
        'Correct! 2 + 2 equals 4.'
    """
    question_type = getattr(quiz, 'question_type', 'single_choice')
    correct_options = [opt for opt in quiz.options if opt.is_correct]
    correct_option_ids_set = {opt.option_id for opt in correct_options}

    selected_options = []
    for opt_id in selected_option_ids:
        found = False
        for opt in quiz.options:
            if opt.option_id == opt_id:
                selected_options.append(opt)
                found = True
                break
        if not found:
            raise ValueError(
                f"Invalid option_id: {opt_id}. "
                "Option not found in quiz."
            )

    selected_option_id_set = set(selected_option_ids)

    if question_type == "single_choice":
        is_correct = len(selected_options) == 1 and selected_options[0].is_correct
    else:  # multiple_choice
        is_correct = (correct_option_ids_set == selected_option_id_set)

    return {
        "is_correct": is_correct,
        "correct_option_ids": list(correct_option_ids_set),
        "explanation": selected_options[0].explanation if selected_options else "",
        "selected_options": selected_options,
    }


def shuffle_quiz_set(quiz_set: QuizSet) -> QuizSet:
    """Shuffle options within each quiz in a QuizSet.

    Applies Fisher-Yates shuffle independently to each quiz in the set.
    Each quiz gets its own random shuffle using CSPRNG.

    Args:
        quiz_set: Original QuizSet with unshuffled quizzes.

    Returns:
        New QuizSet with each quiz's options shuffled.

    Example:
        >>> shuffled = shuffle_quiz_set(quiz_set)
        >>> shuffled.quizzes[0].options[0].display_label  # Random position
        'B'
    """
    shuffled_quizzes = [shuffle_quiz_options(quiz) for quiz in quiz_set.quizzes]

    return QuizSet(
        quizzes=shuffled_quizzes,
        current_index=quiz_set.current_index,
        shuffle_seed=quiz_set.shuffle_seed,
    )


def shuffle_quiz_set_with_seed(quiz_set: QuizSet, seed: str) -> QuizSet:
    """Deterministic shuffle for QuizSet using a seed.

    Each quiz gets a derived seed (base_seed + quiz_index) so that
    each quiz has a different but deterministic shuffle.

    Args:
        quiz_set: Original QuizSet with unshuffled quizzes.
        seed: Base seed string for deterministic shuffle.

    Returns:
        New QuizSet with deterministically shuffled quizzes.

    Example:
        >>> shuffled = shuffle_quiz_set_with_seed(quiz_set, "session-123")
        >>> # Same seed always produces same ordering for all quizzes
    """
    shuffled_quizzes = [
        shuffle_quiz_options_with_seed(quiz, f"{seed}-quiz-{idx}")
        for idx, quiz in enumerate(quiz_set.quizzes)
    ]

    return QuizSet(
        quizzes=shuffled_quizzes,
        current_index=quiz_set.current_index,
        shuffle_seed=seed,
    )


def get_or_create_shuffle_order(
    quiz: QuizCard,
    existing_seed: Optional[str] = None,
    quiz_set_seed: Optional[str] = None,
) -> Tuple[QuizCard, str]:
    """Get shuffled quiz, creating new shuffle or using existing seed.

    Implements shuffle persistence for consistent refresh behavior. If an
    existing seed is provided, uses it for deterministic shuffle. Otherwise,
    generates a new cryptographically secure seed.

    Priority order for seed selection:
    1. existing_seed (from database/storage)
    2. quiz_set_seed (from parent QuizSet)
    3. Generate new CSPRNG seed

    Args:
        quiz: Original QuizCard to shuffle.
        existing_seed: Previously stored shuffle seed (optional).
        quiz_set_seed: Seed from parent QuizSet (optional).

    Returns:
        Tuple of (shuffled_quiz, shuffle_seed) where shuffle_seed can be
        persisted for consistent future shuffles.

    Example:
        >>> shuffled, seed = get_or_create_shuffle_order(quiz)
        >>> # Store seed for consistent refresh
        >>> shuffled2, seed2 = get_or_create_shuffle_order(quiz, existing_seed=seed)
        >>> shuffled.options[0].option_id == shuffled2.options[0].option_id
        True
    """
    # Determine which seed to use (priority: existing > quiz_set > new)
    if existing_seed is not None:
        shuffle_seed = existing_seed
    elif quiz_set_seed is not None:
        shuffle_seed = quiz_set_seed
    else:
        # Generate new CSPRNG seed (16 bytes = 32 hex chars)
        shuffle_seed = secrets.token_hex(16)

    # Perform deterministic shuffle with selected seed
    shuffled = shuffle_quiz_options_with_seed(quiz, shuffle_seed)

    return shuffled, shuffle_seed
