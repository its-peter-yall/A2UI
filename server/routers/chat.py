"""Chat API endpoints for Vertex AI integration."""

from typing import List
from fastapi import APIRouter, HTTPException, status
import logging

from server.schemas.chat import ChatRequest, ChatResponse
from server.schemas.session import MessageResponse
from server.database.persistence import session_manager
from server.utils.vertex_client import generate_chat_response, get_vertex_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


def build_context(history: List[dict]) -> List[dict]:
    """
    Build and format message history for Vertex AI.

    Args:
        history: List of message records from the database

    Returns:
        List of formatted message dicts with 'role' and 'content' keys
    """
    formatted = []
    for msg in history:
        formatted.append({"role": msg["role"], "content": msg["content"]})
    return formatted


@router.post(
    "",
    response_model=ChatResponse,
    summary="Send a chat message",
    description="Send a message to the chat endpoint and get a response from Vertex AI.",
)
def chat(request: ChatRequest) -> ChatResponse:
    """
    Process a chat message and return the AI response.

    Workflow:
    1. Validate session exists
    2. Save user message to DB
    3. Fetch recent history
    4. Call Vertex AI
    5. Save assistant response to DB
    6. Return response
    """
    try:
        # Step 1: Validate session exists or create new one when session_id is empty
        session_id = request.session_id

        if session_id:
            session = session_manager.get_session(session_id)
            if not session:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Session not found: {session_id}",
                )
        else:
            # Create new session with title from first message (truncated to 50 chars)
            title = (
                request.message[:50] + "..."
                if len(request.message) > 50
                else request.message
            )
            session_data = session_manager.create_session(title=title)
            session_id = session_data["id"]

        # Step 2: Save user message to DB
        user_message = session_manager.add_message(
            session_id=session_id, role="user", content=request.message
        )

        # Step 3: Fetch recent history for context
        history = session_manager.get_history(session_id, limit=50)
        formatted_history = build_context(history)

        # Step 4: Call Vertex AI (if initialized)
        if get_vertex_status():
            try:
                response_text, thinking_content = generate_chat_response(
                    messages=formatted_history, model=request.model
                )
            except Exception as e:
                logger.error(f"Vertex AI error: {e}")
                response_text = "I'm sorry, but I'm unable to generate a response at this time. Please try again later."
                thinking_content = None
        else:
            # Fallback when Vertex AI is not available
            response_text = "[Vertex AI not configured] This is a placeholder response. Please configure Vertex AI to get real responses."
            thinking_content = None
            logger.warning("Vertex AI not initialized, returning placeholder response")

        # Step 5: Save assistant response to DB
        assistant_message = session_manager.add_message(
            session_id=session_id,
            role="model",
            content=response_text,
            thinking_content=thinking_content,
        )

        # Step 6: Return response
        return ChatResponse(
            session_id=session_id,
            message=MessageResponse(**assistant_message),
            thinking_content=thinking_content,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process chat: {str(e)}",
        )
