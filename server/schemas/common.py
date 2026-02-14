"""
=============================================================================
FILE: common.py
=============================================================================

PURPOSE:
Provides reusable Pydantic v2 base classes and mixins for all domain schemas
in the AgUI backend. Establishes consistent field patterns across response models.

KEY COMPONENTS:
- TimestampMixin: Adds created_at (required) and updated_at (optional) datetime fields
- ResponseBase: Adds required id string field for all resource responses

DEPENDENCIES:
- pydantic: BaseModel, Field, ConfigDict for schema definition
- datetime: datetime class for timestamp fields

USAGE PATTERN:
```python
from server.schemas.common import ResponseBase, TimestampMixin
from pydantic import Field

class MyResourceResponse(ResponseBase, TimestampMixin):
    name: str = Field(..., description="Resource name")
    description: str = Field(..., description="Resource description")

# Automatically provides: id, created_at, updated_at fields
```

ERROR HANDLING:
- No runtime exceptions from these mixins - pure field definitions
- Pydantic validates datetime formats on instantiation

PERFORMANCE NOTES:
- Zero runtime overhead - these are simple field definitions
- Uses default_factory for created_at to avoid mutable default argument issues

RELATED FILES:
- server/schemas/learning.py: Extends ResponseBase and TimestampMixin
- server/schemas/session.py: Likely uses these mixins for chat sessions
- server/database/models.py: SQLAlchemy models may mirror these fields

NOTES:
- Uses Pydantic v2 ConfigDict(from_attributes=True) for ORM compatibility
- TimestampMixin uses datetime.utcnow (not timezone-aware) for SQLite compatibility
- All response schemas should inherit from ResponseBase for consistent ID handling
=============================================================================
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class TimestampMixin(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp when the record was created",
    )
    updated_at: Optional[datetime] = Field(
        default=None, description="Timestamp when the record was last updated"
    )


class ResponseBase(BaseModel):
    """Base class for all response models."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Unique identifier for the resource")
