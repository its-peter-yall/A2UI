"""Session and Message schema models."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from server.schemas.common import TimestampMixin, ResponseBase


class MessageBase(BaseModel):
    """Base model for chat messages."""

    model_config = ConfigDict(from_attributes=True)

    role: str = Field(
        ...,
        description="Role of the message sender (user or model)",
        pattern="^(user|model)$",
    )
    content: str = Field(..., description="The message content", min_length=1)
    thinking_content: Optional[str] = Field(
        default=None, description="Optional thinking/reasoning content from the model"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="When the message was sent"
    )


class MessageCreate(MessageBase):
    """Schema for creating a new message."""

    pass


class MessageResponse(MessageBase):
    """Schema for message responses."""

    id: str = Field(..., description="Unique identifier for the message")
    session_id: str = Field(
        ..., description="ID of the session this message belongs to"
    )


class SessionBase(BaseModel):
    """Base model for chat sessions."""

    model_config = ConfigDict(from_attributes=True)

    title: str = Field(
        ..., description="Title of the session", min_length=1, max_length=200
    )


class SessionCreate(SessionBase):
    """Schema for creating a new session."""

    pass


class SessionUpdate(BaseModel):
    """Schema for updating a session."""

    model_config = ConfigDict(from_attributes=True)

    title: Optional[str] = Field(
        default=None,
        description="New title for the session",
        min_length=1,
        max_length=200,
    )


class SessionResponse(ResponseBase, TimestampMixin, SessionBase):
    """Schema for session responses including metadata."""

    message_count: Optional[int] = Field(
        default=0, description="Number of messages in this session"
    )


class SessionWithMessages(SessionResponse):
    """Schema for session responses including full message history."""

    messages: List[MessageResponse] = Field(
        default_factory=list, description="List of messages in this session"
    )
