"""
=============================================================================
FILE: __init__.py
=============================================================================

PURPOSE:
Package initialization file that exports the CourseOrchestrator and its
singleton instance for use throughout the application. Provides a clean
public interface to the services module without exposing internal
implementation details.

KEY COMPONENTS:
- CourseOrchestrator: Main orchestrator class for coordinating agent-based
  course generation using the Scatter-Gather pattern
- course_orchestrator: Pre-instantiated singleton instance for application-wide use

DEPENDENCIES:
- server.services.course_orchestrator: Imports the CourseOrchestrator class
  and its singleton instance from the orchestrator implementation

USAGE PATTERN:
```python
# Import the orchestrator class for dependency injection or testing
from server.services import CourseOrchestrator

# Create a new orchestrator instance
orchestrator = CourseOrchestrator()

# Or use the pre-configured singleton for quick access
from server.services import course_orchestrator
result = await course_orchestrator.generate_course(query="Learn React hooks")
```

ERROR HANDLING:
- All error handling is delegated to the CourseOrchestrator implementation
- This file simply re-exports the existing classes without adding new
  error handling logic

PERFORMANCE NOTES:
- Importing this module triggers instantiation of the singleton, which
  has minimal overhead (logging setup only)
- The singleton pattern avoids repeated initialization costs

RELATED FILES:
- server/services/course_orchestrator.py: Main orchestrator implementation
  containing all business logic for course generation

NOTES:
- Follows Python package initialization best practices
- __all__ defines the public API to prevent accidental imports of
  internal modules
- Singleton instance is created at module import time for convenience
=============================================================================
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
