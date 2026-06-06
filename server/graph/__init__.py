"""
============================================================================
FILE: __init__.py
LOCATION: server/graph/__init__.py
============================================================================
PURPOSE:
    LangGraph package for adaptive course generation.
ROLE IN PROJECT:
    Holds state schema, node wrappers, and graph build helpers.
    - Keeps migration code isolated from fallback orchestrator
KEY COMPONENTS:
    - state: TypedDict graph state contracts
DEPENDENCIES:
    - External: None
    - Internal: server.graph.state
USAGE:
    from server.graph.state import CourseState
============================================================================
"""

from server.graph.state import (
    CourseGraphContext,
    CourseMetrics,
    CourseState,
    TopicResult,
)

__all__ = [
    "CourseGraphContext",
    "CourseMetrics",
    "CourseState",
    "TopicResult",
]
