"""
=============================================================================
FILE: __init__.py
=============================================================================

PURPOSE:
Package initialization for server tests. This file makes the tests/
directory a Python package, enabling test discovery and imports.

KEY COMPONENTS:
- Test discovery: unittest discovers tests in this package
- Import aliasing: Enables 'from server.tests import ...' syntax

USAGE PATTERN:
```python
# Import test modules
from server.tests import test_planner_agent
from server.tests import test_generator_agent

# Run all tests in package
python -m unittest server.tests
```

DEPENDENCIES:
- None - this is a package marker file

RELATED FILES:
- server/tests/test_*.py - All test modules in this package

NOTES:
- Empty file is intentional - serves only as package marker
- All test code lives in test_*.py modules
=============================================================================
"""
