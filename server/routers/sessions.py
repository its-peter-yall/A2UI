"""Session management API endpoints."""

from typing import List
from fastapi import APIRouter, HTTPException, status
import logging

from server.schemas.session import (
    SessionCreate,
    SessionUpdate,
    SessionResponse,
    SessionWithMessages,
    MessageResponse,
)
from server.database.persistence import session_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post(
    "",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new session",
    description="Create a new chat session with the given title.",
)
async def create_session(request: SessionCreate) -> SessionResponse:
    """Create a new chat session."""
    try:
        session_data = session_manager.create_session(title=request.title)
        return SessionResponse(**session_data)
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create session: {str(e)}",
        )


@router.get(
    "",
    response_model=List[SessionResponse],
    summary="List all sessions",
    description="Get a list of all sessions sorted by most recently updated.",
)
async def list_sessions(limit: int = 50, offset: int = 0) -> List[SessionResponse]:
    """List all sessions."""
    try:
        sessions_data = session_manager.list_sessions(limit=limit, offset=offset)
        return [SessionResponse(**session) for session in sessions_data]
    except Exception as e:
        logger.error(f"Error listing sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list sessions: {str(e)}",
        )


@router.get(
    "/{session_id}",
    response_model=SessionWithMessages,
    summary="Get session by ID",
    description="Get a specific session including its message history.",
)
async def get_session(session_id: str) -> SessionWithMessages:
    """Get a session by ID with its message history."""
    try:
        # Get session metadata
        session_data = session_manager.get_session(session_id)
        if not session_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session not found: {session_id}",
            )

        # Get message history
        messages_data = session_manager.get_history(session_id)
        messages = [MessageResponse(**msg) for msg in messages_data]

        return SessionWithMessages(**session_data, messages=messages)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get session: {str(e)}",
        )


@router.patch(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Update session",
    description="Update a session's title.",
)
async def update_session(session_id: str, request: SessionUpdate) -> SessionResponse:
    """Update a session's title."""
    try:
        if not request.title:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Title is required for update",
            )

        session_data = session_manager.update_session(session_id, title=request.title)
        if not session_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session not found: {session_id}",
            )

        return SessionResponse(**session_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update session: {str(e)}",
        )


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete session",
    description="Delete a session and all its messages.",
)
async def delete_session(session_id: str) -> None:
    """Delete a session and all its messages."""
    try:
        deleted = session_manager.delete_session(session_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session not found: {session_id}",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session: {str(e)}",
        )


@router.get(
    "/{session_id}/messages",
    response_model=List[MessageResponse],
    summary="Get session messages",
    description="Get all messages for a specific session.",
)
async def get_session_messages(
    session_id: str, limit: int = 100
) -> List[MessageResponse]:
    """Get all messages for a session."""
    try:
        # First check if session exists
        session_data = session_manager.get_session(session_id)
        if not session_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session not found: {session_id}",
            )

        messages_data = session_manager.get_history(session_id, limit=limit)
        return [MessageResponse(**msg) for msg in messages_data]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session messages: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get messages: {str(e)}",
        )
