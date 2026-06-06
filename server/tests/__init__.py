"""
============================================================================
FILE: __init__.py
LOCATION: server/tests/__init__.py
============================================================================
PURPOSE:
    Marks server tests as a package for unittest discovery.
ROLE IN PROJECT:
    Enables backend test modules to import each other and run under unittest.
    - Keeps test discovery stable across local and CI runs
KEY COMPONENTS:
    - Package marker: Supports unittest module imports
DEPENDENCIES:
    - External: None
    - Internal: None
USAGE:
    Import test modules via `python -m unittest server.tests.<module>`.
============================================================================
"""
