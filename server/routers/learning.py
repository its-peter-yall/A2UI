"""
=============================================================================
FILE: learning.py
=============================================================================

PURPOSE:
FastAPI router providing REST API endpoints for the adaptive learning system.
Handles course generation, session retrieval, concept node management, and
quiz state transitions with server-authoritative validation.

KEY COMPONENTS:
- generate_course: Creates structured learning courses from topic queries
- get_learning_session: Retrieves session with all concept nodes
- get_concept_node: Fetches node with state-based content visibility flags
- transition_node: Validates and applies state transitions
- submit_quiz: Records answer, provides feedback, unlocks next node on mastery
- retry_quiz: Resets node state for retry after incorrect answer
- get_quiz_attempts: Retrieves quiz attempt history for a node

DEPENDENCIES:
- fastapi: Web framework for API router and HTTPException
- pydantic: Request/response schema validation
- server.database.learning_persistence: Learning data access layer
- server.schemas.learning: Response models (ConceptNodeResponse, etc.)
- server.services.course_orchestrator: Course generation orchestration

USAGE PATTERN:
```python
# Generate a new learning course
response = await client.post("/learning/generate", json={
    "query": "Python basics",
    "user_id": "user123"
})

# Get session with nodes
session = client.get("/learning/sessions/{session_id}")

# Get node with visibility flags
node = client.get("/learning/nodes/{node_id}")

# Transition node state
client.post("/learning/nodes/{node_id}/transition", json={
    "target_status": "VIEWING_EXPLANATION"
})

# Submit quiz answer
result = client.post("/learning/nodes/{node_id}/submit-quiz", json={
    "selected_option_id": "A"
})
```

ERROR HANDLING:
- HTTPException 404: Session, node, or concept not found
- HTTPException 400: Invalid state transition (ValueError from validation)
- HTTPException 500: Unexpected errors during processing
- All endpoints log errors before raising HTTPException

PERFORMANCE NOTES:
- Database connections are obtained and closed per-request
- get_concept_node filters sensitive content server-side based on state
- Quiz submission auto-unlocks next node only when mastered (reduces latency)

RELATED FILES:
- server/services/course_orchestrator.py: Planner-Worker pattern for course generation
- server/database/learning_persistence.py: Learning data access (sessions, nodes, attempts)
- server/schemas/learning.py: Pydantic models for requests/responses

NOTES:
- Content visibility is enforced server-side: content_hidden in VIEWING_EXPLANATION,
  quiz_hidden in LOCKED state to prevent cheating
- Node states: LOCKED -> VIEWING_EXPLANATION -> IN_QUIZ -> SHOWING_FEEDBACK -> COMPLETED
- Mastery triggers automatic unlock of next node (if exists)
=============================================================================
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from server.database.learning_persistence import learning_manager
from server.schemas.learning import (
    ConceptNodeResponse,
    LearningSessionResponse,
    NodeStatus,
    QuizAttemptHistory,
    QuizAttemptResponse,
)
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
            elif quiz_set.quizzes:
                review_seed = (
                    existing_seed
                    or quiz_set.shuffle_seed
                    or f"review-{node['id']}"
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
        nodes = [
            ConceptNodeResponse(**_apply_node_visibility(node))
            for node in nodes_data
        ]

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

        response_node = _apply_node_visibility(node, include_flags=True)
        return ConceptNodeWithVisibility(**response_node)
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

        if request.target_status == NodeStatus.IN_QUIZ:
            _ensure_quiz_shuffle_seed(node_id)

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
            detail=f"Failed to get quiz attempts: {str(e)}",
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

        # If mastered, transition to SHOWING_FEEDBACK and unlock next node
        # User stays in SHOWING_FEEDBACK to review, clicks Continue to go to COMPLETED
        next_node_unlocked = False
        if result.get("is_mastered"):
            # Transition to SHOWING_FEEDBACK so user can see the feedback
            learning_manager.update_node_status(
                node_id=node_id,
                status=NodeStatus.SHOWING_FEEDBACK,
            )

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
            detail=f"Failed to submit quiz: {str(e)}",
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


@router.post(
    "/nodes/{node_id}/regenerate",
    response_model=ConceptNodeResponse,
    summary="Regenerate node",
    description="Regenerate content for a failed/error node.",
)
async def regenerate_node_endpoint(node_id: str) -> ConceptNodeResponse:
    """Regenerate content for a failed node using the orchestrator."""
    try:
        result = await course_orchestrator.regenerate_node(node_id=node_id)

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

        return ConceptNodeResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error regenerating node: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate node: {str(e)}",
        )
