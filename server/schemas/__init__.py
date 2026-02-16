"""
=============================================================================
FILE: __init__.py
=============================================================================

PURPOSE:
Public API surface for the AgUI schema models module. Exports commonly used
schemas and mixins for consumption by routers, services, and external modules.

KEY COMPONENTS:
- Exports from common.py: ResponseBase, TimestampMixin base classes
- Exports from learning.py: Learning, quiz, and session schemas

DEPENDENCIES:
- server.schemas.common: Base mixins and response foundations
- server.schemas.learning: Domain-specific learning schemas

USAGE PATTERN:
```python
# Preferred import pattern for consuming modules
from server.schemas import (
    # Common mixins
    ResponseBase,
    TimestampMixin,
    # Learning schemas
    NodeStatus,
    QuizCard,
    CourseOutline,
    ConceptNodeResponse,
    LearningSessionResponse,
    QuizAttemptResponse,
)
```

ERROR HANDLING:
- No runtime errors - this is purely an export/namespace module
- Import errors will surface missing schemas at application startup

PERFORMANCE NOTES:
- No runtime overhead - pure Python module imports
- Lazy imports not needed for this small module footprint

RELATED FILES:
- server/schemas/common.py: Source for base classes
- server/schemas/learning.py: Source for domain schemas
- server/routers/learning.py: Primary consumer of these exports
- server/routers/chat.py: May consume common mixins

NOTES:
- This module defines the public contract for schema types
- When adding new schemas to submodules, update exports here
- Avoid circular imports by importing at module level (not inside functions)
=============================================================================
"""

from server.schemas.common import ResponseBase, TimestampMixin
from server.schemas.learning import (
    NodeStatus,
    QuizDifficulty,
    QuizOption,
    QuizCard,
    TopicNode,
    CourseOutline,
    ConceptNodeBase,
    ConceptNodeCreate,
    ConceptNodeResponse,
    LearningSessionBase,
    LearningSessionCreate,
    LearningSessionResponse,
    RevisionMode,
    RevisionCreateRequest,
    RevisionSessionResponse,
    RevisionNodeProgress,
    RevisionNodeProgressWithDetails,
    RevisionSessionWithProgress,
    QuizSubmission,
    QuizResult,
    QuizAttemptBase,
    QuizAttemptCreate,
    QuizAttemptResponse,
    QuizAttemptHistory,
)
