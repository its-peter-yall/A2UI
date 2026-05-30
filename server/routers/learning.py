"""
============================================================================
FILE: learning.py
LOCATION: server/routers/learning.py
============================================================================
PURPOSE:
    FastAPI router providing REST API endpoints for the adaptive learning
    system. Handles course generation, session retrieval, concept node
    management, and quiz state transitions.
ROLE IN PROJECT:
    Defines the HTTP interface for the learning feature.
    - Maps URL routes to business logic in CourseOrchestrator
    - Enforces server-authoritative state validation on all transitions
KEY COMPONENTS:
    - generate_course: Creates structured learning courses from topic queries
    - get_learning_session: Retrieves session with all concept nodes
    - get_concept_node: Fetches node with state-based content visibility
    - transition_node: Validates and applies state transitions
    - submit_quiz: Records answer and unlocks next node on mastery
    - retry_quiz: Resets node state for retry after incorrect answer
DEPENDENCIES:
    - External: fastapi
    - Internal: server.database.learning_persistence, server.schemas.learning,
              server.services.course_orchestrator
USAGE:
    ```python
    response = await client.post("/learning/generate",
        json={"query": "Python basics", "user_id": "user123"})
    ```
============================================================================
"""

import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException, Query, status, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from server.database.learning_persistence import learning_manager
from server.schemas.learning import (
    ConceptChatRequest,
    ConceptNodeResponse,
    LearningSessionResponse,
    NodeStatus,
    QuizAttemptHistory,
    QuizAttemptResponse,
    QuizSetHidden,
    RevisionCreateRequest,
    RevisionNodeProgress,
    RevisionQuizSubmissionResult,
    RevisionSessionListResponse,
    RevisionSessionResponse,
    RevisionSessionWithProgress,
    RevisionSummary,
    SessionProgress,
    SessionListResponse,
)
from server.schemas.llm import LLMContext, get_llm_context
from server.services.concept_chat import stream_concept_chat
from server.services.course_orchestrator import course_orchestrator
from server.services.quiz_randomization import (
    get_or_create_shuffle_order,
    hide_quiz_card,
    shuffle_quiz_set_with_seed,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/learning", tags=["learning"])


CONTENT_VISIBLE_STATES = {
    NodeStatus.VIEWING_EXPLANATION,
    NodeStatus.SHOWING_FEEDBACK,
    NodeStatus.COMPLETED,
}
QUIZ_VISIBLE_STATES = {
    NodeStatus.IN_QUIZ,
    NodeStatus.SHOWING_FEEDBACK,
    NodeStatus.COMPLETED,
}


class GenerateCourseRequest(BaseModel):
    """Request schema for generating a learning course."""

    query: str = Field(..., description="Topic to learn about", min_length=1)
    user_id: Optional[str] = Field(default=None, description="Optional user ID")


class LearningSessionWithNodes(LearningSessionResponse):
    """Learning session with all concept nodes."""

    nodes: List[ConceptNodeResponse] = Field(
        default_factory=list,
        description="All concept nodes in sequence order",
    )


class ConceptNodeWithVisibility(ConceptNodeResponse):
    """Node response with state-based content visibility."""

    content_visible: bool = Field(
        ...,
        description="Whether explanation content is visible in current state",
    )
    quiz_visible: bool = Field(
        ...,
        description="Whether quiz is visible in current state",
    )


class TransitionRequest(BaseModel):
    """Request to transition node to a new state."""

    target_status: NodeStatus = Field(
        ...,
        description="Target status to transition to",
    )


class QuizSubmitRequest(BaseModel):
    """Request to submit a quiz answer.

    Uses stable option_id (UUID) for secure evaluation even when options
    are shuffled. The option_id is returned with each option and persists
    across shuffles, while display_label (A, B, C, D) may change position.
    """

    selected_option_id: str = Field(
        ...,
        description="Selected option UUID (stable ID from option.option_id)",
        min_length=1,
    )
    quiz_index: int = Field(
        default=0,
        description="Index of quiz in set being answered (0-based)",
        ge=0,
    )


class LastActiveRequest(BaseModel):
    """Request to update last active node for a session."""

    node_id: str = Field(..., description="ID of the last active node")


class DeleteRevisionResponse(BaseModel):
    """Response payload for deleting a revision session."""

    deleted: bool = Field(..., description="Whether the revision was deleted")


def _apply_node_visibility(node: dict, include_flags: bool = False) -> dict:
    """Apply state-based content visibility and quiz randomization to a node."""
    status_val = NodeStatus(node["status"])

    content_visible = status_val in CONTENT_VISIBLE_STATES
    quiz_visible = status_val in QUIZ_VISIBLE_STATES

    response_node = dict(node)
    response_node["quiz_set"] = None
    response_node["quiz_hidden"] = None
    response_node["quiz_set_hidden"] = None

    if include_flags and not content_visible:
        response_node["content_markdown"] = ""

    if quiz_visible and node.get("quiz"):
        quiz_set_data = learning_manager.get_quiz_set_for_node(node["id"])
        if quiz_set_data:
            quiz_set = quiz_set_data["quiz_set"]
            existing_seed = quiz_set_data.get("shuffle_seed")
            current_index = quiz_set_data.get("current_index", 0)

            if quiz_set.quizzes:
                current_index = max(0, min(current_index, len(quiz_set.quizzes) - 1))
            else:
                current_index = 0

            if status_val == NodeStatus.IN_QUIZ and quiz_set.quizzes:
                shuffle_seed = (
                    existing_seed
                    or quiz_set.shuffle_seed
                    or _ensure_quiz_shuffle_seed(node["id"])
                )
                if shuffle_seed:
                    shuffled_set = shuffle_quiz_set_with_seed(quiz_set, shuffle_seed)
                    shuffled_quiz = shuffled_set.quizzes[current_index]
                else:
                    shuffled_quiz = quiz_set.quizzes[current_index]
                hidden_quiz = hide_quiz_card(shuffled_quiz)
                response_node["quiz_hidden"] = hidden_quiz
                response_node["quiz"] = None

                # Populate quiz_set_hidden for multi-quiz progress indicator
                if len(quiz_set.quizzes) > 1:
                    hidden_quizzes = [hide_quiz_card(q) for q in shuffled_set.quizzes]
                    response_node["quiz_set_hidden"] = QuizSetHidden(
                        quizzes=hidden_quizzes,
                        current_index=current_index,
                        total_quizzes=len(quiz_set.quizzes),
                    )
            elif quiz_set.quizzes:
                review_seed = (
                    existing_seed
                    or quiz_set.shuffle_seed
                    or _ensure_quiz_shuffle_seed(node["id"])
                )
                shuffled_set = shuffle_quiz_set_with_seed(quiz_set, review_seed)
                response_node["quiz_set"] = shuffled_set
                response_node["quiz"] = shuffled_set.quizzes[current_index]
        else:
            response_node["quiz"] = None
    else:
        response_node["quiz"] = None

    if include_flags:
        response_node["content_visible"] = content_visible
        response_node["quiz_visible"] = quiz_visible

    return response_node


def _ensure_quiz_shuffle_seed(node_id: str) -> Optional[str]:
    """Ensure a node has a persisted shuffle seed and return it."""
    quiz_set_data = learning_manager.get_quiz_set_for_node(node_id)
    if not quiz_set_data:
        return None

    quiz_set = quiz_set_data["quiz_set"]
    current_index = quiz_set_data.get("current_index", 0)

    if not quiz_set.quizzes:
        return None

    current_index = max(0, min(current_index, len(quiz_set.quizzes) - 1))
    current_quiz = quiz_set.quizzes[current_index]

    existing_seed = quiz_set_data.get("shuffle_seed")
    _, shuffle_seed = get_or_create_shuffle_order(
        current_quiz,
        existing_seed=existing_seed,
        quiz_set_seed=quiz_set.shuffle_seed,
    )

    if shuffle_seed != existing_seed:
        learning_manager.update_quiz_shuffle_seed(node_id, shuffle_seed)

    return shuffle_seed


@router.post(
    "/generate",
    response_model=LearningSessionWithNodes,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a learning course",
    description="Generate a structured learning course from a topic query.",
)
async def generate_course(
    request_body: GenerateCourseRequest,
    request: Request,
    llm_context: LLMContext = Depends(get_llm_context),
) -> LearningSessionWithNodes:
    """Generate a learning course using the Planner-Worker pattern."""
    try:
        gen_task = asyncio.create_task(
            course_orchestrator.generate_course(
                query=request_body.query,
                user_id=request_body.user_id,
                llm_context=llm_context,
            )
        )

        while not gen_task.done():
            # Check for client disconnect every 0.5 seconds
            done, pending = await asyncio.wait({gen_task}, timeout=0.5)
            if gen_task.done():
                break
            if await request.is_disconnected():
                logger.info("Client disconnected. Cancelling course generation task...")
                gen_task.cancel()
                try:
                    await gen_task
                except asyncio.CancelledError:
                    pass
                raise HTTPException(
                    status_code=499,
                    detail="Generation cancelled",
                )

        result = gen_task.result()
        session = result.get("session", {})
        nodes_data = result.get("nodes", [])
        nodes = [
            ConceptNodeResponse(**_apply_node_visibility(node)) for node in nodes_data
        ]
        return LearningSessionWithNodes(**session, nodes=nodes)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.get(
    "/sessions",
    response_model=SessionListResponse,
    summary="List learning sessions",
    description=(
        "Get a paginated, filterable learning session list with progress "
        "and revision counts."
    ),
)
def get_learning_sessions(
    user_id: Optional[str] = Query(default=None),
    status_filter: str = Query(default="all", alias="status"),
    sort_by: str = Query(default="updated_at"),
    sort_order: str = Query(default="desc"),
    limit: int = Query(default=20, ge=0),
    offset: int = Query(default=0, ge=0),
) -> SessionListResponse:
    """List learning sessions with filtering, sorting, and pagination."""
    allowed_status = {"all", "in_progress", "completed"}
    allowed_sort_by = {"updated_at", "created_at", "progress_percent"}
    allowed_sort_order = {"asc", "desc"}
    try:
        if status_filter not in allowed_status:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid status filter",
            )
        if sort_by not in allowed_sort_by:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid sort_by field",
            )
        if sort_order not in allowed_sort_order:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid sort_order field",
            )

        safe_limit = min(limit, 100)
        sessions, total_count = learning_manager.get_sessions_list(
            user_id=user_id,
            status=status_filter,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=safe_limit,
            offset=offset,
        )
        has_more = total_count > (offset + safe_limit)
        return SessionListResponse(
            sessions=sessions,
            total_count=total_count,
            has_more=has_more,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing learning sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.get(
    "/sessions/{session_id}/progress",
    response_model=SessionProgress,
    summary="Get learning session progress",
    description=(
        "Get progress summary for a learning session, including completed node "
        "counts and last active node."
    ),
)
def get_learning_session_progress(session_id: str) -> SessionProgress:
    """Get progress summary for a learning session."""
    try:
        progress = learning_manager.get_session_progress(session_id)
        if not progress:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Learning session not found: {session_id}",
            )
        return SessionProgress(**progress)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting learning session progress: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.patch(
    "/sessions/{session_id}/last-active",
    summary="Update last active node",
    description="Update the last active node for a learning session.",
)
def update_last_active(
    session_id: str,
    request: LastActiveRequest,
) -> dict:
    """Update the last active node position for resume."""
    try:
        learning_manager.update_last_active_node(session_id, request.node_id)
        return {"updated": True}
    except LookupError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(f"Learning session not found: {session_id}"),
        )
    except Exception as e:
        logger.error(f"Error updating last active node: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(f"Failed to update last active node: {str(e)}"),
        )


@router.get(
    "/sessions/{session_id}",
    response_model=LearningSessionWithNodes,
    summary="Get learning session",
    description="Get a learning session with all its concept nodes.",
)
def get_learning_session(session_id: str) -> LearningSessionWithNodes:
    """Get a learning session by ID with all nodes."""
    try:
        session = learning_manager.get_learning_session(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Learning session not found: {session_id}",
            )

        nodes_data = learning_manager.get_session_nodes(session_id)
        nodes = [
            ConceptNodeResponse(**_apply_node_visibility(node)) for node in nodes_data
        ]

        return LearningSessionWithNodes(**session, nodes=nodes)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting learning session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post(
    "/sessions/{session_id}/revisions",
    response_model=RevisionSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create revision session",
    description=("Create a revision session for a completed learning session."),
)
def create_revision(
    session_id: str,
    request: RevisionCreateRequest,
) -> RevisionSessionResponse:
    """Create a new revision session for a completed learning session."""
    try:
        revision = learning_manager.create_revision_session(
            session_id,
            request.mode,
        )
        return RevisionSessionResponse(**revision)
    except LookupError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error creating revision session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.get(
    "/sessions/{session_id}/revisions",
    response_model=RevisionSessionListResponse,
    summary="List revision sessions",
    description=("Get revision sessions for a learning session with pagination."),
)
def get_revisions_for_session(
    session_id: str,
    limit: int = Query(default=20, ge=0),
    offset: int = Query(default=0, ge=0),
) -> RevisionSessionListResponse:
    """List revision sessions for an original learning session."""
    try:
        safe_limit = min(limit, 100)
        revisions, total_count = learning_manager.get_revisions_for_session(
            session_id=session_id,
            limit=safe_limit,
            offset=offset,
        )
        return RevisionSessionListResponse(
            revisions=revisions,
            total_count=total_count,
        )
    except Exception as e:
        logger.error(f"Error listing revision sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.get(
    "/revisions/{revision_id}",
    response_model=RevisionSessionWithProgress,
    summary="Get revision session",
    description="Get a revision session with node-level progress details.",
)
def get_revision(revision_id: str) -> RevisionSessionWithProgress:
    """Get a revision session by ID."""
    try:
        revision = learning_manager.get_revision_session(revision_id)
        if not revision:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Revision session not found: {revision_id}",
            )
        return RevisionSessionWithProgress(**revision)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting revision session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.delete(
    "/revisions/{revision_id}",
    response_model=DeleteRevisionResponse,
    summary="Delete revision session",
    description="Delete a revision session and its node progress records.",
)
def delete_revision(revision_id: str) -> DeleteRevisionResponse:
    """Delete a revision session by ID."""
    try:
        deleted = learning_manager.delete_revision_session(revision_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Revision session not found: {revision_id}",
            )
        return DeleteRevisionResponse(deleted=True)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting revision session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


class DeleteLearningSessionResponse(BaseModel):
    """Response payload for deleting a learning session."""

    deleted: bool = Field(..., description="Whether the session was deleted")


@router.delete(
    "/sessions/{session_id}",
    response_model=DeleteLearningSessionResponse,
    summary="Delete learning session",
    description=(
        "Delete a learning session and all related data including "
        "concept nodes, quiz attempts, and revision sessions."
    ),
)
def delete_learning_session(session_id: str) -> DeleteLearningSessionResponse:
    """Delete a learning session by ID with cascade deletion."""
    try:
        deleted = learning_manager.delete_learning_session(session_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Learning session not found: {session_id}",
            )
        return DeleteLearningSessionResponse(deleted=True)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting learning session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post(
    "/revisions/{revision_id}/nodes/{node_id}/mark-reviewed",
    response_model=RevisionNodeProgress,
    summary="Mark revision node reviewed",
    description="Mark a revision node as reviewed in full_review mode.",
)
def mark_revision_node_reviewed(
    revision_id: str,
    node_id: str,
) -> RevisionNodeProgress:
    """Mark a revision node as reviewed."""
    try:
        progress = learning_manager.mark_revision_node_reviewed(
            revision_id=revision_id,
            node_id=node_id,
        )
        return RevisionNodeProgress(**progress)
    except LookupError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error marking revision node reviewed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post(
    "/revisions/{revision_id}/nodes/{node_id}/submit-quiz",
    response_model=RevisionQuizSubmissionResult,
    summary="Submit revision quiz answer",
    description="Submit a quiz answer for a node in a revision session.",
)
def submit_revision_quiz(
    revision_id: str,
    node_id: str,
    request: QuizSubmitRequest,
) -> RevisionQuizSubmissionResult:
    """Submit a revision quiz answer and return evaluation result."""
    try:
        result = learning_manager.submit_revision_quiz(
            revision_id=revision_id,
            node_id=node_id,
            selected_option_id=request.selected_option_id,
            quiz_index=request.quiz_index,
        )
        return RevisionQuizSubmissionResult(**result)
    except LookupError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error submitting revision quiz: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.get(
    "/revisions/{revision_id}/summary",
    response_model=RevisionSummary,
    summary="Get revision summary",
    description="Get aggregate progress and quiz metrics for a revision session.",
)
def get_revision_summary(revision_id: str) -> RevisionSummary:
    """Get summary metrics for a revision session."""
    try:
        summary = learning_manager.get_revision_summary(revision_id)
        return RevisionSummary(**summary)
    except LookupError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error getting revision summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.get(
    "/nodes/{node_id}",
    response_model=ConceptNodeWithVisibility,
    summary="Get concept node",
    description="Get a concept node with state-based content visibility.",
)
def get_concept_node(node_id: str) -> ConceptNodeWithVisibility:
    """Get a concept node with visibility flags based on state."""
    try:
        conn = learning_manager._get_connection()
        try:
            node = learning_manager._get_node_by_id(node_id, conn)
        finally:
            conn.close()

        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Concept node not found: {node_id}",
            )

        response_node = _apply_node_visibility(node, include_flags=True)
        return ConceptNodeWithVisibility(**response_node)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting concept node: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post(
    "/nodes/{node_id}/transition",
    response_model=ConceptNodeResponse,
    summary="Transition node state",
    description="Transition a concept node to a new state.",
)
def transition_node(
    node_id: str,
    request: TransitionRequest,
) -> ConceptNodeResponse:
    """Transition a node to a new state if valid."""
    try:
        updated_node = learning_manager.update_node_status(
            node_id=node_id,
            status=request.target_status,
        )

        if not updated_node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Concept node not found: {node_id}",
            )

        if request.target_status == NodeStatus.IN_QUIZ:
            _ensure_quiz_shuffle_seed(node_id)

        response_node = _apply_node_visibility(updated_node)
        return ConceptNodeResponse(**response_node)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error transitioning node: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.get(
    "/nodes/{node_id}/attempts",
    response_model=QuizAttemptHistory,
    summary="Get quiz attempts",
    description="Get all quiz attempts for a concept node with history.",
)
def get_quiz_attempts(node_id: str) -> QuizAttemptHistory:
    """Retrieve quiz attempt history for a node."""
    try:
        history = learning_manager.get_quiz_attempts(node_id)
        return QuizAttemptHistory(**history)
    except Exception as e:
        logger.error(f"Error getting quiz attempts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post(
    "/nodes/{node_id}/submit-quiz",
    response_model=QuizAttemptResponse,
    summary="Submit quiz answer",
    description="Submit a quiz answer and get immediate feedback. If mastered, unlocks next node.",
)
def submit_quiz(
    node_id: str,
    request: QuizSubmitRequest,
) -> QuizAttemptResponse:
    """Submit a quiz answer and record the attempt."""
    try:
        # Get current node info for session and sequence
        conn = learning_manager._get_connection()
        try:
            node = learning_manager._get_node_by_id(node_id, conn)
            if not node:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Concept node not found: {node_id}",
                )
        finally:
            conn.close()

        # Create the quiz attempt
        result = learning_manager.create_quiz_attempt(
            node_id=node_id,
            selected_option_id=request.selected_option_id,
            quiz_index=request.quiz_index,
        )

        # Advance quiz-set progress after a correct answer when mastery is not
        # yet achieved. This enables sequential multi-quiz flow.
        if result.get("is_correct") and not result.get("is_mastered"):
            quiz_set_data = learning_manager.get_quiz_set_for_node(node_id)
            if quiz_set_data is not None:
                total_quizzes = len(quiz_set_data["quiz_set"].quizzes)
                next_index = request.quiz_index + 1
                if next_index < total_quizzes:
                    learning_manager.update_quiz_set_progress(
                        node_id=node_id,
                        current_index=next_index,
                    )

        # Always transition to SHOWING_FEEDBACK after quiz submission
        # User sees feedback, then either retries (if not mastered) or continues (if mastered)
        next_node_unlocked = False
        learning_manager.update_node_status(
            node_id=node_id,
            status=NodeStatus.SHOWING_FEEDBACK,
        )

        # If mastered, unlock the next node
        if result.get("is_mastered"):
            # Check if there's a next node to unlock
            next_node = learning_manager.get_next_node(
                session_id=node["learning_session_id"],
                sequence_index=node["sequence_index"],
            )
            if next_node and NodeStatus(next_node["status"]) == NodeStatus.LOCKED:
                # Unlock the next node
                learning_manager.update_node_status(
                    node_id=next_node["id"],
                    status=NodeStatus.VIEWING_EXPLANATION,
                )
                next_node_unlocked = True

        # Add next_node_unlocked to result
        result["next_node_unlocked"] = next_node_unlocked

        return QuizAttemptResponse(**result)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting quiz: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post(
    "/nodes/{node_id}/retry-quiz",
    response_model=ConceptNodeResponse,
    summary="Retry quiz",
    description="Transition node from SHOWING_FEEDBACK back to IN_QUIZ to retry.",
)
def retry_quiz(node_id: str) -> ConceptNodeResponse:
    """Transition node to IN_QUIZ state for retry after incorrect answer."""
    try:
        updated_node = learning_manager.update_node_status(
            node_id=node_id,
            status=NodeStatus.IN_QUIZ,
        )

        if not updated_node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Concept node not found: {node_id}",
            )

        _ensure_quiz_shuffle_seed(node_id)

        response_node = _apply_node_visibility(updated_node)
        return ConceptNodeResponse(**response_node)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrying quiz: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post(
    "/nodes/{node_id}/previous-quiz",
    response_model=ConceptNodeResponse,
    summary="Previous quiz",
    description="Transition to the previous quiz in a quiz set.",
)
def previous_quiz(node_id: str) -> ConceptNodeResponse:
    """Decrement the current quiz index for a node's quiz set."""
    try:
        updated_node = learning_manager.decrement_quiz_set_progress(node_id)

        if not updated_node:
            # Check if node exists to distinguish 404 from "cannot decrement"
            conn = learning_manager._get_connection()
            try:
                node = learning_manager._get_node_by_id(node_id, conn)
                if not node:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Concept node not found: {node_id}",
                    )
                # If node exists but decrement returned None (e.g. legacy quiz), just return node
                updated_node = node
            finally:
                conn.close()

        # Ensure we are in IN_QUIZ state for the returned node
        if NodeStatus(updated_node["status"]) != NodeStatus.IN_QUIZ:
            learning_manager.update_node_status(node_id, NodeStatus.IN_QUIZ)
            updated_node["status"] = NodeStatus.IN_QUIZ.value

        _ensure_quiz_shuffle_seed(node_id)
        response_node = _apply_node_visibility(updated_node)
        return ConceptNodeResponse(**response_node)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error going to previous quiz: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post(
    "/nodes/{node_id}/regenerate",
    response_model=ConceptNodeResponse,
    summary="Regenerate node",
    description="Regenerate content for a failed/error node.",
)
async def regenerate_node_endpoint(
    node_id: str,
    request: Request,
    llm_context: LLMContext = Depends(get_llm_context),
) -> ConceptNodeResponse:
    """Regenerate content for a failed node using the orchestrator."""
    try:
        gen_task = asyncio.create_task(
            course_orchestrator.regenerate_node(
                node_id=node_id,
                llm_context=llm_context,
            )
        )

        while not gen_task.done():
            # Check for client disconnect every 0.5 seconds
            done, pending = await asyncio.wait({gen_task}, timeout=0.5)
            if gen_task.done():
                break
            if await request.is_disconnected():
                logger.info(f"Client disconnected. Cancelling node regeneration task for node {node_id}...")
                gen_task.cancel()
                try:
                    await gen_task
                except asyncio.CancelledError:
                    pass
                raise HTTPException(
                    status_code=499,
                    detail="Regeneration cancelled",
                )

        result = gen_task.result()

        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Cannot regenerate node: not found, not in ERROR status, or retry unavailable",
            )

        if not result.get("regenerated", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result.get("error", "Regeneration failed"),
            )

        response_node = _apply_node_visibility(result)
        return ConceptNodeResponse(**response_node)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error regenerating node: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post(
    "/sessions/{session_id}/nodes/{node_id}/chat",
    summary="Concept chat assistant",
    description=(
        "Stream a chat response for a concept node using the concept content "
        "as context. Returns SSE text/event-stream."
    ),
)
async def concept_chat(
    session_id: str,
    node_id: str,
    request_body: ConceptChatRequest,
    x_provider_api_key: Optional[str] = Header(None, alias="X-Provider-Api-Key"),
    x_model: str = Header(None, alias="X-Model"),
    x_chat_model: str = Header(None, alias="X-Chat-Model"),
) -> StreamingResponse:
    """Stream a context-aware chat response for a concept node."""
    if not x_provider_api_key or not x_provider_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Provider-Api-Key header is required",
        )

    effective_model = x_chat_model or x_model
    if not effective_model or not effective_model.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Chat-Model or X-Model header is required",
        )

    conn = learning_manager._get_connection()
    try:
        session = learning_manager.get_learning_session(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Learning session not found: {session_id}",
            )

        node = learning_manager._get_node_by_id(node_id, conn)
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Concept node not found: {node_id}",
            )

        if node.get("learning_session_id") != session_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Node {node_id} does not belong to "
                    f"session {session_id}"
                ),
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating chat session/node: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )
    finally:
        conn.close()

    return StreamingResponse(
        stream_concept_chat(
            api_key=x_provider_api_key.strip(),
            model_slug=effective_model.strip(),
            message=request_body.message,
            history=request_body.history,
            content_markdown=node["content_markdown"],
            selected_heading_ids=request_body.selected_heading_ids,
            node_title=node["title"],
        ),
        media_type="text/event-stream",
    )
