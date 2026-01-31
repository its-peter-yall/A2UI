# learning.py
# Learning session API endpoints for retrieval-based courses
#
# Provides endpoints to generate courses, retrieve learning sessions and nodes,
# and transition node states with server-authoritative validation.
#
# @see: server/services/course_orchestrator.py - Course generation logic
# @note: Response models enforce state-based content visibility

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from server.database.learning_persistence import learning_manager
from server.schemas.learning import (
    ConceptNodeResponse,
    LearningSessionResponse,
    NodeStatus,
    QuizAttemptHistory,
)
from server.services.course_orchestrator import course_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/learning", tags=["learning"])


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
    """Request to submit a quiz answer."""

    selected_option_id: str = Field(
        ...,
        description="Selected option ID (A, B, C, or D)",
        pattern=r"^[A-D]$",
    )


class QuizSubmitResponse(BaseModel):
    """Response after submitting a quiz answer."""

    model_config = ConfigDict(from_attributes=True)

    node_id: str = Field(..., description="Concept node ID")
    attempt_number: int = Field(..., description="Attempt number")
    is_correct: bool = Field(..., description="Whether answer was correct")
    score_percent: int = Field(..., description="Score percentage (0 or 100)")
    correct_option_id: str = Field(..., description="Correct option ID")
    selected_option_id: str = Field(..., description="Selected option ID")
    explanation: str = Field(..., description="Explanation for selected answer")
    is_mastered: bool = Field(..., description="Whether 100% achieved")
    next_node_unlocked: bool = Field(
        ...,
        description="Whether next node was unlocked",
    )
    node_status: NodeStatus = Field(..., description="Updated node status")


@router.post(
    "/generate",
    response_model=LearningSessionWithNodes,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a learning course",
    description="Generate a structured learning course from a topic query.",
)
async def generate_course(
    request: GenerateCourseRequest,
) -> LearningSessionWithNodes:
    """Generate a learning course using the Planner-Worker pattern."""
    try:
        result = await course_orchestrator.generate_course(
            query=request.query,
            user_id=request.user_id,
        )
        session = result.get("session", {})
        nodes = result.get("nodes", [])
        return LearningSessionWithNodes(**session, nodes=nodes)
    except Exception as e:
        logger.error(f"Error generating course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate course: {str(e)}",
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
        nodes = [ConceptNodeResponse(**node) for node in nodes_data]

        return LearningSessionWithNodes(**session, nodes=nodes)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting learning session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get learning session: {str(e)}",
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

        status_val = NodeStatus(node["status"])

        content_visible = status_val in {
            NodeStatus.VIEWING_EXPLANATION,
            NodeStatus.SHOWING_FEEDBACK,
            NodeStatus.COMPLETED,
        }
        quiz_visible = status_val in {
            NodeStatus.IN_QUIZ,
            NodeStatus.SHOWING_FEEDBACK,
            NodeStatus.COMPLETED,
        }

        response_node = dict(node)
        if not content_visible:
            response_node["content_markdown"] = ""
        if not quiz_visible:
            response_node["quiz"] = None

        return ConceptNodeWithVisibility(
            **response_node,
            content_visible=content_visible,
            quiz_visible=quiz_visible,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting concept node: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get concept node: {str(e)}",
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

        return ConceptNodeResponse(**updated_node)
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
            detail=f"Failed to transition node: {str(e)}",
        )


@router.post(
    "/nodes/{node_id}/submit-quiz",
    response_model=QuizSubmitResponse,
    summary="Submit quiz answer",
    description="Submit a quiz answer and get feedback. Transitions state automatically.",
)
def submit_quiz(node_id: str, request: QuizSubmitRequest) -> QuizSubmitResponse:
    """Submit a quiz answer, record attempt, and handle state transitions."""
    try:
        # Verify node exists and is in IN_QUIZ state
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

        current_status = NodeStatus(node["status"])
        if current_status != NodeStatus.IN_QUIZ:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Node must be in IN_QUIZ state to submit. Current: {current_status.value}",
            )

        # Record the attempt
        attempt = learning_manager.create_quiz_attempt(
            node_id=node_id,
            selected_option_id=request.selected_option_id,
        )

        # Transition to SHOWING_FEEDBACK
        learning_manager.update_node_status(node_id, NodeStatus.SHOWING_FEEDBACK)

        # If mastered, unlock next node (if exists)
        next_node_unlocked = False
        if attempt["is_mastered"]:
            # Transition current to COMPLETED
            learning_manager.update_node_status(node_id, NodeStatus.COMPLETED)

            # Unlock next node
            next_node = learning_manager.get_next_node(
                session_id=node["learning_session_id"],
                sequence_index=node["sequence_index"],
            )
            if next_node and NodeStatus(next_node["status"]) == NodeStatus.LOCKED:
                learning_manager.update_node_status(
                    next_node["id"],
                    NodeStatus.VIEWING_EXPLANATION,
                )
                next_node_unlocked = True

        # Determine final node status
        final_status = (
            NodeStatus.COMPLETED
            if attempt["is_mastered"]
            else NodeStatus.SHOWING_FEEDBACK
        )

        return QuizSubmitResponse(
            node_id=node_id,
            attempt_number=attempt["attempt_number"],
            is_correct=attempt["is_correct"],
            score_percent=attempt["score_percent"],
            correct_option_id=attempt["correct_option_id"],
            selected_option_id=request.selected_option_id,
            explanation=attempt["explanation"],
            is_mastered=attempt["is_mastered"],
            next_node_unlocked=next_node_unlocked,
            node_status=final_status,
        )
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
            detail=f"Failed to submit quiz: {str(e)}",
        )


@router.post(
    "/nodes/{node_id}/retry-quiz",
    response_model=ConceptNodeResponse,
    summary="Retry quiz",
    description="Transition from SHOWING_FEEDBACK back to IN_QUIZ for another attempt.",
)
def retry_quiz(node_id: str) -> ConceptNodeResponse:
    """Retry the quiz for a node that's in SHOWING_FEEDBACK state."""
    try:
        # Verify node exists and is in SHOWING_FEEDBACK state
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

        current_status = NodeStatus(node["status"])
        if current_status != NodeStatus.SHOWING_FEEDBACK:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Node must be in SHOWING_FEEDBACK state to retry. Current: {current_status.value}",
            )

        # Check if already mastered (shouldn't retry if mastered)
        if learning_manager.check_mastery(node_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quiz already mastered. Cannot retry.",
            )

        # Transition back to IN_QUIZ
        updated_node = learning_manager.update_node_status(
            node_id=node_id,
            status=NodeStatus.IN_QUIZ,
        )

        return ConceptNodeResponse(**updated_node)
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
            detail=f"Failed to retry quiz: {str(e)}",
        )


@router.get(
    "/nodes/{node_id}/attempts",
    response_model=QuizAttemptHistory,
    summary="Get quiz attempts",
    description="Get quiz attempt history and stats for a concept node.",
)
def get_quiz_attempts(node_id: str) -> QuizAttemptHistory:
    """Get quiz attempt history for a node."""
    try:
        # Verify node exists
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

        attempts_data = learning_manager.get_quiz_attempts(node_id)
        return QuizAttemptHistory(**attempts_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting quiz attempts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get quiz attempts: {str(e)}",
        )


@router.post(
    "/nodes/{node_id}/regenerate",
    response_model=ConceptNodeResponse,
    summary="Regenerate failed node",
    description="Regenerate a concept node that has ERROR status.",
)
async def regenerate_node(node_id: str) -> ConceptNodeResponse:
    """Regenerate a failed concept node."""
    try:
        # Verify node exists and is in ERROR state
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

        current_status = NodeStatus(node["status"])
        if current_status != NodeStatus.ERROR:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only ERROR nodes can be regenerated. Current: {current_status.value}",
            )

        # Call orchestrator to regenerate
        updated_node = await course_orchestrator.regenerate_node(node_id)

        if not updated_node:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Regeneration failed",
            )

        return ConceptNodeResponse(**updated_node)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error regenerating node: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate node: {str(e)}",
        )
