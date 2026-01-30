"""Common base models and mixins for Pydantic schemas."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class TimestampMixin(BaseModel):
    """Mixin that adds created_at and updated_at timestamp fields."""

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
