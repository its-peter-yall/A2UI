"""Chat request and response schema models."""

from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from server.schemas.session import MessageResponse


class ChatRequest(BaseModel):
    """Schema for chat request from the client."""

    model_config = ConfigDict(from_attributes=True)

    session_id: str = Field(
        ..., description="ID of the session to continue, or empty to create new"
    )
    message: str = Field(..., description="The user's message content", min_length=1)
    model: Optional[str] = Field(
        default="gemini-2.0-flash-001",
        description="The Vertex AI model to use for the chat",
    )


class ChatResponse(BaseModel):
    """Schema for chat response from the server."""

    model_config = ConfigDict(from_attributes=True)

    session_id: str = Field(
        ..., description="ID of the session this response belongs to"
    )
    message: MessageResponse = Field(
        ..., description="The assistant's response message"
    )
    thinking_content: Optional[str] = Field(
        default=None, description="Optional thinking/reasoning content from the model"
    )


class ChatStreamResponse(BaseModel):
    """Schema for streaming chat response chunks."""

    model_config = ConfigDict(from_attributes=True)

    chunk: str = Field(..., description="A chunk of the streaming response")
    is_thinking: bool = Field(
        default=False, description="Whether this chunk is part of thinking content"
    )
    is_complete: bool = Field(
        default=False, description="Whether this is the final chunk"
    )
