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
    - Exposes vertex_client and instructor_client submodules
    - Provides a clean import surface for AI client utilities
KEY COMPONENTS:
    - vertex_client: Module for Vertex AI SDK initialization and status
    - instructor_client: Module for Instructor structured output generation
DEPENDENCIES:
    - External: None
    - Internal: server.utils.vertex_client, server.utils.instructor_client
USAGE:
    ```python
    from server.utils import vertex_client, instructor_client
    vertex_client.init_vertex()
    ```
============================================================================
"""
