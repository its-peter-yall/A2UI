"""
============================================================================
FILE: __init__.py
LOCATION: server/services/__init__.py
============================================================================
PURPOSE:
    Package initialization file that exports the CourseOrchestrator and its
    singleton instance for use throughout the application.
ROLE IN PROJECT:
    Aggregates service exports into a single importable namespace.
    - Exposes CourseOrchestrator class for dependency injection or testing
    - Provides pre-instantiated singleton for application-wide use
KEY COMPONENTS:
    - CourseOrchestrator: Main orchestrator class for agent-based course
      generation using the Scatter-Gather pattern
    - course_orchestrator: Pre-instantiated singleton instance
DEPENDENCIES:
    - External: None
    - Internal: server.services.course_orchestrator
USAGE:
    ```python
    from server.services import course_orchestrator
    result = await course_orchestrator.generate_course(query="Learn React")
    ```
============================================================================
"""

from server.services.course_orchestrator import CourseOrchestrator, course_orchestrator
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
    "CourseOrchestrator",
    "course_orchestrator",
    "shuffle_quiz_options",
    "shuffle_quiz_options_with_seed",
    "shuffle_quiz_set",
    "shuffle_quiz_set_with_seed",
    "hide_quiz_card",
    "hide_quiz_set",
    "evaluate_quiz_answer",
    "get_or_create_shuffle_order",
]
