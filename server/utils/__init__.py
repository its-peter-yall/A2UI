"""
============================================================================
FILE: utils/__init__.py
LOCATION: server/utils/__init__.py
============================================================================
PURPOSE:
    Package initializer for the server utility modules. Exports AI
    client wrappers and shared utilities used by the learning system.
ROLE IN PROJECT:
    Namespace package marker for the utils module.
    - Exposes instructor_client submodules
    - Provides a clean import surface for AI client utilities
KEY COMPONENTS:
    - instructor_client: Module for Instructor structured output generation
DEPENDENCIES:
    - External: None
    - Internal: server.utils.instructor_client
USAGE:
    ```python
    from server.utils import instructor_client
    ```
============================================================================
"""
