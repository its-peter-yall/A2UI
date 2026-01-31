# __init__.py
# Package exports for the services module

# Exports the CourseOrchestrator for coordinating agent-based course generation.

# @see: server/services/course_orchestrator.py - Orchestrator implementation

from server.services.course_orchestrator import CourseOrchestrator, course_orchestrator

__all__ = [
    "CourseOrchestrator",
    "course_orchestrator",
]
