"""
============================================================================
FILE: common.py
LOCATION: server/schemas/common.py
============================================================================
PURPOSE:
    Provides reusable Pydantic v2 base classes and mixins for all domain
    schemas in the A2UI backend. Establishes consistent field patterns
    across response models.
ROLE IN PROJECT:
    Foundation layer for all Pydantic response schemas.
    - Ensures every resource response has a consistent id field
    - Standardizes timestamp fields across all domain models
KEY COMPONENTS:
    - TimestampMixin: Adds created_at (required) and updated_at (optional)
    - ResponseBase: Adds required id string field for all resource responses
DEPENDENCIES:
    - External: pydantic
    - Internal: None
USAGE:
    ```python
    from server.schemas.common import ResponseBase, TimestampMixin
    class MyResponse(ResponseBase, TimestampMixin):
        name: str
    ```
============================================================================
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
