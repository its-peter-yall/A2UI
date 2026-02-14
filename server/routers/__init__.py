"""
=============================================================================
FILE: __init__.py
=============================================================================

PURPOSE:
API routers module entry point. Re-exports the learning router for easy
inclusion in the main FastAPI application.

KEY COMPONENTS:
- learning_router: FastAPI APIRouter from server/routers/learning.py

DEPENDENCIES:
- server.routers.learning: Contains the learning API router definition

USAGE PATTERN:
```python
# In server/main.py or server/routers/__init__.py
from server.routers import learning_router

app.include_router(learning_router)
```

ERROR HANDLING:
- No error handling needed in this module (pure re-export)

PERFORMANCE NOTES:
- Minimal overhead - just imports and re-exports the router object

RELATED FILES:
- server/routers/learning.py: Primary router with all learning endpoints

NOTES:
- This module exists for clean import patterns and future router expansion
- Currently minimal; additional routers (chat, admin, etc.) would be added here
================================================================================
"""

from server.routers.learning import router as learning_router

__all__ = ["learning_router"]
