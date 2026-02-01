# learning.py
# Pydantic schema models for retrieval-based learning features

# Longer description (2-4 lines):
# - Defines enums and structured models for learning sessions and concept nodes.
# - Captures planner output (CourseOutline) and quiz payload structures.
# - Provides request/response schemas for session and quiz operations.

# @see: server/database/learning_persistence.py - Persistence layer for learning data
# @note: Quiz payloads stored as JSON should conform to QuizCard structure

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from server.schemas.common import ResponseBase, TimestampMixin


class NodeStatus(str, Enum):
    """Status values for learning concept nodes.

    State Flow:
        LOCKED → VIEWING_EXPLANATION → IN_QUIZ → SHOWING_FEEDBACK → COMPLETED
                        ↓                              ↓
                      ERROR                        (retry loop back to IN_QUIZ)

    States:
        LOCKED: Cannot access yet; previous node not completed
        VIEWING_EXPLANATION: Reading content, quiz hidden
        IN_QUIZ: Taking quiz, explanation hidden (pure retrieval)
        SHOWING_FEEDBACK: Showing results and explanations
        COMPLETED: 100% quiz score achieved, can review
        ERROR: Generation or system error occurred
    """

    LOCKED = "LOCKED"
    VIEWING_EXPLANATION = "VIEWING_EXPLANATION"
    IN_QUIZ = "IN_QUIZ"
    SHOWING_FEEDBACK = "SHOWING_FEEDBACK"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"


class QuizDifficulty(str, Enum):
    """Difficulty levels for quiz cards."""

    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class QuizOption(BaseModel):
    """Single quiz option with correctness and explanation."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(
        ...,
        description="Stable identifier for this option (A, B, C, or D)",
        pattern=r"^[A-D]$",
    )
    text: str = Field(..., description="Option text shown to the user", min_length=1)
    is_correct: bool = Field(..., description="Whether this option is correct")
    explanation: str = Field(
        ...,
        description="Feedback explaining why this option is correct or not",
        min_length=1,
    )


class QuizCard(BaseModel):
    """Quiz content attached to a concept node."""

    model_config = ConfigDict(from_attributes=True)

    question_text: str = Field(..., description="Quiz question text", min_length=1)
    options: List[QuizOption] = Field(
        ...,
        description="Answer options for the quiz (exactly 4 required: A, B, C, D)",
        min_length=4,
        max_length=4,
    )
    difficulty: str = Field(
        default="medium", description="Difficulty for the quiz (easy, medium, hard)"
    )

    @field_validator("options")
    @classmethod
    def validate_options(cls, options: List[QuizOption]) -> List[QuizOption]:
        # Validate exactly 4 options
        if len(options) != 4:
            raise ValueError("QuizCard requires exactly 4 options (A, B, C, D)")

        # Validate exactly one correct option
        correct_count = sum(1 for opt in options if opt.is_correct)
        if correct_count != 1:
            raise ValueError(
                f"QuizCard requires exactly one correct option, found {correct_count}"
            )

        # Validate option IDs are A, B, C, D
        expected_ids = {"A", "B", "C", "D"}
        actual_ids = {opt.id for opt in options}
        if actual_ids != expected_ids:
            raise ValueError(
                "QuizCard options must have IDs A, B, C, D. "
                f"Found: {sorted(actual_ids)}"
            )

        # Validate unique IDs
        if len(actual_ids) != 4:
            raise ValueError("QuizCard option IDs must be unique")

        return options


class TopicNode(BaseModel):
    """Planner output node describing a course topic."""

    model_config = ConfigDict(from_attributes=True)

    index: int = Field(..., description="Sequence index for this topic", ge=0)
    title: str = Field(..., description="Short topic title", min_length=1)
    summary_for_context: str = Field(
        ...,
        description="Summary used for context injection when generating content",
        min_length=1,
    )
    key_terms: List[str] = Field(
        ...,
        description="Key terms to emphasize (2-4 terms required)",
        min_length=2,
        max_length=4,
    )


class CourseOutline(BaseModel):
    """Planner output model describing the course outline."""

    model_config = ConfigDict(from_attributes=True)

    course_title: str = Field(..., description="Title of the course", min_length=1)
    topics: List[TopicNode] = Field(
        ...,
        description="Ordered list of topic nodes (5-7 topics required)",
        min_length=5,
        max_length=7,
    )

    @field_validator("topics")
    @classmethod
    def validate_topics(cls, topics: List[TopicNode]) -> List[TopicNode]:
        if len(topics) < 5:
            raise ValueError("CourseOutline requires at least 5 topics")
        if len(topics) > 7:
            raise ValueError("CourseOutline requires at most 7 topics")
        # Validate contiguous indices (0, 1, 2, ...) match list order
        for i, topic in enumerate(topics):
            if topic.index != i:
                raise ValueError(
                    f"Topic at position {i} has index {topic.index}, expected {i}. "
                    "Indices must be contiguous and match list order."
                )
        return topics


class ConceptNodeBase(BaseModel):
    """Base fields for concept nodes."""

    model_config = ConfigDict(from_attributes=True)

    learning_session_id: str = Field(
        ..., description="Learning session identifier for this node"
    )
    sequence_index: int = Field(..., description="Order of the node", ge=0)
    title: str = Field(..., description="Concept title", min_length=1)
    content_markdown: str = Field(
        ..., description="Markdown content for the concept", min_length=1
    )
    status: NodeStatus = Field(
        default=NodeStatus.LOCKED, description="Current status of the node"
    )


class ConceptNodeCreate(ConceptNodeBase):
    """Schema for creating a concept node."""

    quiz: Optional[QuizCard] = Field(
        default=None, description="Optional quiz payload for the node"
    )


class ConceptNodeResponse(ResponseBase, TimestampMixin, ConceptNodeBase):
    """Response schema for concept nodes."""

    quiz: Optional[QuizCard] = Field(
        default=None, description="Quiz payload if available"
    )
    error_message: Optional[str] = Field(
        default=None, description="Error message if generation failed"
    )
    retry_available: bool = Field(
        default=False, description="Whether retry is available"
    )


class LearningSessionBase(BaseModel):
    """Base fields for learning sessions."""

    model_config = ConfigDict(from_attributes=True)

    user_id: Optional[str] = Field(default=None, description="User identifier")
    query: str = Field(..., description="Original user query", min_length=1)
    course_title: str = Field(..., description="Generated course title", min_length=1)


class LearningSessionCreate(LearningSessionBase):
    """Schema for creating a learning session."""

    pass


class LearningSessionResponse(ResponseBase, TimestampMixin, LearningSessionBase):
    """Response schema for learning sessions."""

    total_nodes: int = Field(default=0, description="Total nodes in the session")
    completed_nodes: int = Field(default=0, description="Number of completed nodes")


class QuizSubmission(BaseModel):
    """Payload for submitting quiz answers."""

    model_config = ConfigDict(from_attributes=True)

    node_id: str = Field(..., description="Concept node identifier")
    selected_option_id: str = Field(..., description="Selected option identifier")


class QuizResult(BaseModel):
    """Result of a quiz submission."""

    model_config = ConfigDict(from_attributes=True)

    node_id: str = Field(..., description="Concept node identifier")
    is_correct: bool = Field(..., description="Whether the answer was correct")
    correct_option_id: Optional[str] = Field(
        default=None, description="Correct option identifier"
    )
    explanation: Optional[str] = Field(
        default=None, description="Explanation for the selected answer"
    )
    submitted_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Submission timestamp",
    )


class QuizAttemptBase(BaseModel):
    """Base fields for quiz attempts."""

    model_config = ConfigDict(from_attributes=True)

    node_id: str = Field(..., description="Concept node identifier")
    selected_option_id: str = Field(
        ...,
        description="Selected option identifier (A, B, C, or D)",
        pattern=r"^[A-D]$",
    )


class QuizAttemptCreate(QuizAttemptBase):
    """Schema for creating a quiz attempt."""

    pass


class QuizAttemptResponse(ResponseBase, TimestampMixin, QuizAttemptBase):
    """Response schema for quiz attempts with result details."""

    attempt_number: int = Field(..., description="Attempt number (1-indexed)", ge=1)
    is_correct: bool = Field(..., description="Whether the selected answer was correct")
    score_percent: int = Field(
        ...,
        description="Score as percentage (0 or 100 for single-question quiz)",
        ge=0,
        le=100,
    )
    correct_option_id: str = Field(
        ...,
        description="The correct option identifier",
        pattern=r"^[A-D]$",
    )
    explanation: str = Field(
        ...,
        description="Explanation for the selected answer",
    )
    is_mastered: bool = Field(
        ...,
        description="Whether 100% score was achieved (can proceed)",
    )
    next_node_unlocked: bool = Field(
        default=False,
        description="Whether the next node was unlocked (only true if mastered and next node exists)",
    )


class QuizAttemptHistory(BaseModel):
    """History of all quiz attempts for a node."""

    model_config = ConfigDict(from_attributes=True)

    node_id: str = Field(..., description="Concept node identifier")
    total_attempts: int = Field(..., description="Total number of attempts", ge=0)
    is_mastered: bool = Field(..., description="Whether quiz is mastered (100%)")
    best_score: int = Field(..., description="Best score achieved", ge=0, le=100)
    attempts: List[QuizAttemptResponse] = Field(
        default_factory=list,
        description="List of all attempts in order",
    )
