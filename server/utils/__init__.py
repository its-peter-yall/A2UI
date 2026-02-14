"""
=============================================================================
FILE: utils/__init__.py
=============================================================================

PURPOSE:
Package initializer for the server utility modules. Exports AI client
wrappers and shared utilities used by the learning system and agent
architecture for Google Vertex AI integration.

KEY COMPONENTS:
- vertex_client: Module for Vertex AI SDK initialization and status checking
- instructor_client: Module for Instructor-based structured output generation

DEPENDENCIES:
- server.utils.vertex_client: Google Vertex AI SDK wrapper
- server.utils.instructor_client: Instructor library integration

USAGE PATTERN:
```python
# Import specific utilities as needed
from server.utils import vertex_client, instructor_client

# Initialize at startup
vertex_client.init_vertex()
instructor_client.instructor_client.init()

# Use throughout application
if vertex_client.get_vertex_status():
    response = await instructor_client.instructor_client.create_structured(...)
```

ERROR HANDLING:
- See individual module documentation for specific error behavior

PERFORMANCE NOTES:
- Lazy initialization pattern - modules initialize on first use
- Global singletons avoid repeated instantiation overhead

RELATED FILES:
- server/utils/vertex_client.py: Vertex AI SDK wrapper module
- server/utils/instructor_client.py: Instructor client module
- server/main.py: Imports and initializes utilities at startup
- server/services/course_orchestrator.py: Uses utilities for AI operations

NOTES:
- This __init__.py serves as a namespace package marker
- All actual functionality lives in the submodules
- Import directly from submodules for type hints and IDE support
=============================================================================
"""
