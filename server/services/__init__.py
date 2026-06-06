"""
============================================================================
FILE: __init__.py
LOCATION: server/services/__init__.py
============================================================================
PURPOSE:
    Package initialization for server services.
ROLE IN PROJECT:
    Aggregates service exports into a single importable namespace.
    - Exposes quiz randomization utilities
KEY COMPONENTS:
    - Quiz randomization functions for deterministic shuffling
DEPENDENCIES:
    - External: None
    - Internal: server.services.quiz_randomization
USAGE:
    from server.services import shuffle_quiz_set_with_seed
============================================================================
"""

from server.services.quiz_randomization import (
    evaluate_quiz_answer,
    get_or_create_shuffle_order,
    hide_quiz_card,
    hide_quiz_set,
    shuffle_quiz_options,
    shuffle_quiz_options_with_seed,
    shuffle_quiz_set,
    shuffle_quiz_set_with_seed,
)

__all__ = [
    "shuffle_quiz_options",
    "shuffle_quiz_options_with_seed",
    "shuffle_quiz_set",
    "shuffle_quiz_set_with_seed",
    "hide_quiz_card",
    "hide_quiz_set",
    "evaluate_quiz_answer",
    "get_or_create_shuffle_order",
]
