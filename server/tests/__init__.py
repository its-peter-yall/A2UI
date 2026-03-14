"""
============================================================================
FILE: __init__.py
LOCATION: server/tests/__init__.py
============================================================================
PURPOSE:
    Package initialization for server tests. Makes the tests/ directory
    a Python package, enabling test discovery and imports.
ROLE IN PROJECT:
    Package marker that enables unittest discovery across all test modules.
    - Allows 'from server.tests import ...' syntax
    - Required for python -m unittest server.tests to work
KEY COMPONENTS:
    - Package marker: Empty file enabling test discovery
DEPENDENCIES:
    - External: None
    - Internal: None
USAGE:
    ```python
    # Run all tests in package
    python -m unittest server.tests
    ```
============================================================================
"""
