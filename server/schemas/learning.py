"""
=============================================================================
FILE: learning.py
=============================================================================

PURPOSE:
Defines Pydantic v2 schemas for the adaptive learning system, including
learning sessions, concept nodes, and retrieval-based quiz mechanics with
progressive state management.

KEY COMPONENTS:
- NodeStatus: Enum tracking learner progress through nodes (LOCKED → COMPLETED)
- QuizOption/QuizCard: Structured quiz content with validation (4 options, 1 correct)
- CourseOutline/TopicNode: Planner agent output defining course structure
- ConceptNodeResponse: Full concept node with quiz, status, and error handling
- LearningSessionResponse: Session metadata with progress tracking
- QuizAttemptResponse: Quiz submission results with mastery determination

DEPENDENCIES:
- pydantic: Schema validation, BaseModel, Field, field_validator
- server.schemas.common: ResponseBase, TimestampMixin mixins

USAGE PATTERN:
```python
from server.schemas.learning import (
    NodeStatus, QuizCard, CourseOutline, ConceptNodeResponse,
    LearningSessionResponse, QuizSubmission, QuizAttemptResponse
)

# Create a quiz card with validation
quiz = QuizCard(
    question_text="What is 2+2?",
    options=[
        QuizOption(id="A", text="3", is_correct=False, explanation="Incorrect"),
        QuizOption(id="B", text="4", is_correct=True, explanation="Correct!"),
        QuizOption(id="C", text="5", is_correct=False, explanation="Incorrect"),
        QuizOption(id="D", text="6", is_correct=False, explanation="Incorrect"),
    ],
    difficulty="easy"
)

# Submit quiz answer
submission = QuizSubmission(node_id="node-123", selected_option_id="B")
```

ERROR HANDLING:
- field_validator raises ValueError for invalid quiz options (not exactly 4, not exactly 1 correct, invalid IDs)
- ValueError raised for CourseOutline with <5 or >7 topics, or non-contiguous indices
- Pydantic validation errors propagate as HTTP 422 in API routers

PERFORMANCE NOTES:
- QuizCard validation runs on every schema instantiation (O(n) where n=4)
- No database queries in schema layer - pure in-memory validation

RELATED FILES:
- server/database/learning_persistence.py: Persistence layer for learning data
- server/services/course_orchestrator.py: Business logic consuming these schemas
- server/routers/learning.py: REST endpoints using these schemas

NOTES:
- Quiz payloads stored as JSON in DB should conform to QuizCard structure
- Node status flow: LOCKED → VIEWING_EXPLANATION → IN_QUIZ → SHOWING_FEEDBACK → COMPLETED
- ERROR state indicates generation failure, not user error
- is_mastered only true when 100% score achieved on quiz
=============================================================================
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import List, Literal, Optional, Union

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
    """Single quiz option with correctness and explanation.

    For secure randomization:
    - option_id: Stable UUID that persists across shuffles (used for submissions)
    - display_label: User-facing label (A, B, C, D) - can be shuffled
    - text: The actual answer text shown to the user
    """

    model_config = ConfigDict(from_attributes=True)

    option_id: str = Field(
        ...,
        description="Stable unique identifier for this option (UUID), persists across shuffles",
    )
    display_label: str = Field(
        ...,
        description="User-facing label shown in UI (A, B, C, D)",
        pattern=r"^[A-D]$",
    )
    text: str = Field(..., description="Option text shown to the user", min_length=1)
    is_correct: bool = Field(..., description="Whether this option is correct")
    explanation: str = Field(
        ...,
        description="Feedback explaining why this option is correct or not",
        min_length=1,
    )

    @field_validator("display_label")
    @classmethod
    def validate_display_label(cls, v: str) -> str:
        if v not in {"A", "B", "C", "D"}:
            raise ValueError("display_label must be A, B, C, or D")
        return v


class QuizOptionHidden(BaseModel):
    """Quiz option for IN_QUIZ state - hides correctness and explanation.

    This schema is used when sending quiz to client in IN_QUIZ state
    to prevent answer leakage. The client receives option_id and display_label
    but not is_correct or explanation.
    """

    model_config = ConfigDict(from_attributes=True)

    option_id: str = Field(
        ...,
        description="Stable unique identifier for this option (UUID), used for submissions",
    )
    display_label: str = Field(
        ...,
        description="User-facing label shown in UI (A, B, C, D)",
        pattern=r"^[A-D]$",
    )
    text: str = Field(..., description="Option text shown to the user", min_length=1)

    @field_validator("display_label")
    @classmethod
    def validate_display_label(cls, v: str) -> str:
        if v not in {"A", "B", "C", "D"}:
            raise ValueError("display_label must be A, B, C, or D")
        return v


class QuizCard(BaseModel):
    """Quiz content attached to a concept node.

    Contains question and options with stable option_id for secure shuffling.
    The display_label (A, B, C, D) can be shuffled while option_id remains stable.
    """

    model_config = ConfigDict(from_attributes=True)

    question_text: str = Field(..., description="Quiz question text", min_length=1)
    options: List[QuizOption] = Field(
        ...,
        description="Answer options for the quiz (exactly 4 required)",
        min_length=4,
        max_length=4,
    )
    difficulty: str = Field(
        default="medium", description="Difficulty for the quiz (easy, medium, hard)"
    )

    @field_validator("options")
    @classmethod
    def validate_options(cls, options: List[QuizOption]) -> List[QuizOption]:
        if len(options) != 4:
            raise ValueError("QuizCard requires exactly 4 options")

        correct_count = sum(1 for opt in options if opt.is_correct)
        if correct_count != 1:
            raise ValueError(
                f"QuizCard requires exactly one correct option, found {correct_count}"
            )

        unique_labels = {opt.display_label for opt in options}
        if unique_labels != {"A", "B", "C", "D"}:
            raise ValueError(
                "QuizCard options must have display_labels A, B, C, D. "
                f"Found: {sorted(unique_labels)}"
            )

        unique_option_ids = {opt.option_id for opt in options}
        if len(unique_option_ids) != 4:
            raise ValueError("QuizCard option_ids must be unique")

        return options


class QuizCardHidden(BaseModel):
    """Quiz card for IN_QUIZ state - hides correctness and explanation.

    Used when sending quiz to client to prevent answer leakage.
    """

    model_config = ConfigDict(from_attributes=True)

    question_text: str = Field(..., description="Quiz question text", min_length=1)
    options: List[QuizOptionHidden] = Field(
        ...,
        description="Answer options for the quiz (exactly 4 required)",
        min_length=4,
        max_length=4,
    )
    difficulty: str = Field(
        default="medium", description="Difficulty for the quiz (easy, medium, hard)"
    )

    @field_validator("options")
    @classmethod
    def validate_options(
        cls, options: List[QuizOptionHidden]
    ) -> List[QuizOptionHidden]:
        if len(options) != 4:
            raise ValueError("QuizCard requires exactly 4 options")

        unique_labels = {opt.display_label for opt in options}
        if unique_labels != {"A", "B", "C", "D"}:
            raise ValueError(
                "QuizCard options must have display_labels A, B, C, D. "
                f"Found: {sorted(unique_labels)}"
            )

        unique_option_ids = {opt.option_id for opt in options}
        if len(unique_option_ids) != 4:
            raise ValueError("QuizCard option_ids must be unique")

        return options


class QuizSet(BaseModel):
    """Container for multiple quizzes per concept node.

    Supports secure server-side randomization with stable option identities.
    The quizzes array contains all quizzes; display_order determines which
    is shown first. Each quiz maintains stable option_id across shuffles.
    """

    model_config = ConfigDict(from_attributes=True)

    quizzes: List[QuizCard] = Field(
        ...,
        description="List of quizzes for this concept node (1-5 quizzes supported)",
        min_length=1,
        max_length=5,
    )
    current_index: int = Field(
        default=0,
        description="Index of the currently active quiz (0-based)",
        ge=0,
    )
    shuffle_seed: Optional[str] = Field(
        default=None,
        description="Seed for deterministic quiz/option ordering",
    )

    @field_validator("quizzes")
    @classmethod
    def validate_quizzes(cls, quizzes: List[QuizCard]) -> List[QuizCard]:
        if len(quizzes) < 1:
            raise ValueError("QuizSet requires at least 1 quiz")
        if len(quizzes) > 5:
            raise ValueError("QuizSet supports at most 5 quizzes")
        return quizzes

    @field_validator("current_index")
    @classmethod
    def validate_current_index(cls, current_index: int, info: "ModelInfo") -> int:
        quizzes = info.data.get("quizzes", [])
        if quizzes and current_index >= len(quizzes):
            raise ValueError(
                f"current_index {current_index} exceeds quizzes length {len(quizzes)}"
            )
        return current_index


class QuizSetHidden(BaseModel):
    """Quiz set for IN_QUIZ state - hides correctness and explanation."""

    model_config = ConfigDict(from_attributes=True)

    quizzes: List[QuizCardHidden] = Field(
        ...,
        description="List of quizzes for this concept node (hidden correctness)",
        min_length=1,
        max_length=5,
    )
    current_index: int = Field(
        default=0,
        description="Index of the currently active quiz (0-based)",
        ge=0,
    )
    total_quizzes: int = Field(
        ...,
        description="Total number of quizzes in the set",
        ge=1,
    )


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
    """Schema for creating a concept node.

    Supports either single QuizCard or QuizSet for multiple quizzes.
    """

    quiz: Optional[QuizCard] = Field(
        default=None, description="Optional single quiz payload for the node"
    )
    quiz_set: Optional[QuizSet] = Field(
        default=None, description="Optional quiz set for multiple quizzes"
    )


class ConceptNodeResponse(ResponseBase, TimestampMixin, ConceptNodeBase):
    """Response schema for concept nodes.

    Supports both single quiz and quiz_set. When returning to client
    in IN_QUIZ state, uses hidden versions (QuizCardHidden/QuizSetHidden)
    to prevent answer leakage. The response type should be chosen based on
    node status.
    """

    quiz: Optional[QuizCard] = Field(
        default=None, description="Single quiz payload if available"
    )
    quiz_set: Optional[QuizSet] = Field(
        default=None, description="Quiz set for multiple quizzes if available"
    )
    quiz_hidden: Optional[QuizCardHidden] = Field(
        default=None,
        description="Hidden quiz payload for IN_QUIZ state (no correctness)",
    )
    quiz_set_hidden: Optional[QuizSetHidden] = Field(
        default=None, description="Hidden quiz set for IN_QUIZ state (no correctness)"
    )
    error_message: Optional[str] = Field(
        default=None, description="Error message if generation failed"
    )
    retry_available: bool = Field(
        default=False, description="Whether retry is available"
    )

    def get_visible_quiz(
        self, status: NodeStatus
    ) -> Optional[Union[QuizCard, QuizSet]]:
        """Get quiz payload based on node status.

        For IN_QUIZ state, returns hidden version (no correctness/explanation).
        For other states, returns full quiz data.
        """
        if status == NodeStatus.IN_QUIZ:
            if self.quiz_set_hidden:
                return self.quiz_set_hidden
            if self.quiz_hidden:
                return self.quiz_hidden
        if self.quiz_set:
            return self.quiz_set
        if self.quiz:
            return self.quiz
        return None


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
    last_active_node_id: Optional[str] = Field(
        default=None,
        description="ID of the last active node for resume",
    )


class LearningSessionSummary(BaseModel):
    """Compact session summary for dashboard listing responses."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Learning session identifier")
    query: str = Field(..., description="Original learning query")
    course_title: str = Field(..., description="Generated course title")
    status: Literal["in_progress", "completed"] = Field(
        ..., description="Session status"
    )
    progress_percent: int = Field(..., description="Progress percentage", ge=0, le=100)
    total_nodes: int = Field(..., description="Total number of concept nodes", ge=0)
    completed_nodes: int = Field(
        ..., description="Number of completed concept nodes", ge=0
    )
    last_active_node_title: Optional[str] = Field(
        default=None, description="Title of the last active node for resume"
    )
    created_at: str = Field(..., description="Session creation timestamp (ISO)")
    updated_at: str = Field(..., description="Session update timestamp (ISO)")
    completed_at: Optional[str] = Field(
        default=None, description="Completion timestamp (ISO) if completed"
    )
    revision_count: int = Field(
        default=0, description="Number of revision sessions", ge=0
    )


class SessionListResponse(BaseModel):
    """Paginated response payload for session listing endpoint."""

    model_config = ConfigDict(from_attributes=True)

    sessions: List[LearningSessionSummary] = Field(
        default_factory=list,
        description="Session summaries for current page",
    )
    total_count: int = Field(..., description="Total matching sessions", ge=0)
    has_more: bool = Field(..., description="Whether more pages are available")


class SessionProgress(BaseModel):
    """Progress payload for a single learning session."""

    model_config = ConfigDict(from_attributes=True)

    progress_percent: int = Field(
        ..., description="Session progress percentage", ge=0, le=100
    )
    status: str = Field(..., description="Session status")
    completed_nodes: int = Field(..., description="Completed concept nodes", ge=0)
    total_nodes: int = Field(..., description="Total concept nodes", ge=0)
    last_active_node_id: Optional[str] = Field(
        default=None,
        description="Identifier of the last active node",
    )
    last_active_node_title: Optional[str] = Field(
        default=None,
        description="Title of the last active node",
    )


RevisionMode = Literal["full_review", "quiz_only"]
RevisionSessionStatus = Literal["in_progress", "completed"]
RevisionNodeStatus = Literal["pending", "reviewed", "quiz_passed", "quiz_failed"]


class RevisionCreateRequest(BaseModel):
    """Schema for creating a revision session."""

    model_config = ConfigDict(from_attributes=True)

    mode: RevisionMode = Field(
        default="full_review", description="Revision mode selection"
    )


class RevisionSessionResponse(BaseModel):
    """Response schema for revision sessions."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Revision session identifier")
    original_session_id: str = Field(
        ..., description="Original learning session identifier"
    )
    revision_number: int = Field(..., description="Revision iteration number", ge=1)
    mode: RevisionMode = Field(..., description="Revision mode")
    status: RevisionSessionStatus = Field(..., description="Revision session status")
    progress_percent: int = Field(..., description="Revision progress percentage")
    total_quiz_score_percent: Optional[int] = Field(
        default=None,
        description="Overall quiz accuracy for the revision session",
    )
    started_at: datetime = Field(..., description="Revision start timestamp")
    completed_at: Optional[datetime] = Field(
        default=None, description="Revision completion timestamp"
    )


class RevisionNodeProgress(BaseModel):
    """Progress status for a node within a revision session."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Revision node progress identifier")
    revision_session_id: str = Field(..., description="Revision session identifier")
    node_id: str = Field(..., description="Concept node identifier")
    status: RevisionNodeStatus = Field(..., description="Revision node status")
    reviewed_at: Optional[datetime] = Field(
        default=None, description="Timestamp when node was reviewed"
    )


class RevisionNodeProgressWithDetails(BaseModel):
    """Revision node progress enriched with concept node metadata."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Revision node progress identifier")
    node_id: str = Field(..., description="Concept node identifier")
    node_title: str = Field(..., description="Concept node title")
    sequence_index: int = Field(..., description="Concept node order", ge=0)
    status: RevisionNodeStatus = Field(..., description="Revision node status")
    reviewed_at: Optional[datetime] = Field(
        default=None, description="Timestamp when node was reviewed"
    )


class RevisionSessionWithProgress(RevisionSessionResponse):
    """Revision session response with node-level progress details."""

    nodes: List[RevisionNodeProgressWithDetails] = Field(
        default_factory=list,
        description="Node-level revision progress list",
    )


class RevisionSessionListResponse(BaseModel):
    """Paginated response payload for revision session listings."""

    model_config = ConfigDict(from_attributes=True)

    revisions: List[RevisionSessionResponse] = Field(
        default_factory=list,
        description="Revision sessions for the requested original session",
    )
    total_count: int = Field(..., description="Total matching revisions", ge=0)


class RevisionComparison(BaseModel):
    """Performance comparison between revision and original attempts."""

    model_config = ConfigDict(from_attributes=True)

    original_quiz_score_percent: int = Field(
        ...,
        description="Original attempt quiz score percentage",
        ge=0,
        le=100,
    )
    improvement_percent: int = Field(
        ...,
        description="Signed percentage point improvement from original attempt",
    )


class RevisionSummary(BaseModel):
    """Summary metrics for a revision session."""

    model_config = ConfigDict(from_attributes=True)

    revision_id: str = Field(..., description="Revision session identifier")
    mode: RevisionMode = Field(..., description="Revision mode")
    progress_percent: int = Field(..., description="Revision progress percentage")
    total_quiz_score_percent: Optional[int] = Field(
        default=None,
        description="Overall quiz score percentage for revision attempts",
    )
    nodes_reviewed: int = Field(..., description="Completed revision nodes", ge=0)
    nodes_total: int = Field(..., description="Total revision nodes", ge=0)
    quizzes_passed: int = Field(..., description="Correct revision quiz attempts", ge=0)
    quizzes_failed: int = Field(
        ..., description="Incorrect revision quiz attempts", ge=0
    )
    quizzes_total: int = Field(..., description="Total revision quiz attempts", ge=0)
    time_spent_seconds: Optional[int] = Field(
        default=None,
        description="Seconds between revision start and completion",
        ge=0,
    )
    comparison: Optional[RevisionComparison] = Field(
        default=None,
        description="Optional performance comparison against original attempts",
    )


class RevisionQuizSubmissionResult(BaseModel):
    """Result payload for revision quiz submissions."""

    model_config = ConfigDict(from_attributes=True)

    is_correct: bool = Field(..., description="Whether selected option is correct")
    correct_option_id: Optional[str] = Field(
        default=None,
        description="Correct option identifier",
    )
    explanation: Optional[str] = Field(
        default=None,
        description="Explanation for selected option",
    )
    revision_node_status: RevisionNodeStatus = Field(
        ...,
        description="Updated revision node status after submission",
    )


class QuizSubmission(BaseModel):
    """Payload for submitting quiz answers.

    Uses stable option_id (UUID) for submission, not display_label.
    This allows correct evaluation even when options are shuffled.
    """

    model_config = ConfigDict(from_attributes=True)

    node_id: str = Field(..., description="Concept node identifier")
    selected_option_id: str = Field(
        ...,
        description="Selected option ID (stable UUID from option_id field)",
    )
    quiz_index: Optional[int] = Field(
        default=0,
        description="Index of quiz in set being answered (0-based)",
        ge=0,
    )


class QuizResult(BaseModel):
    """Result of a quiz submission."""

    model_config = ConfigDict(from_attributes=True)

    node_id: str = Field(..., description="Concept node identifier")
    is_correct: bool = Field(..., description="Whether the answer was correct")
    correct_option_id: Optional[str] = Field(
        default=None, description="Correct option identifier (stable UUID)"
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
        description="Selected option ID (stable UUID)",
    )
    quiz_index: int = Field(
        default=0,
        description="Index of quiz in set being answered (0-based)",
        ge=0,
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
    correct_option_id: Optional[str] = Field(
        default=None,
        description="The correct option identifier (only revealed when answer is correct)",
    )
    explanation: str = Field(
        default="",
        description="Explanation for the correct answer (only revealed when answer is correct)",
    )
    selected_explanation: Optional[str] = Field(
        default=None,
        description="Explanation for the selected answer (only when incorrect, for learning why it's wrong)",
    )
    quiz_index: int = Field(
        default=0,
        description="Index of quiz in set (for multi-quiz nodes)",
        ge=0,
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


def convert_legacy_quiz_option(legacy: dict) -> QuizOption:
    """Convert legacy option format (id: str) to new format (option_id: UUID).

    Legacy format: {"id": "A", "text": "...", "is_correct": true, "explanation": "..."}
    New format: {"option_id": "uuid-...", "display_label": "A", "text": "...", "is_correct": true, "explanation": "..."}

    BACKWARD COMPATIBILITY:
    - Generates stable UUID from legacy id for option_id
    - Maps legacy id to display_label
    - Preserves text, is_correct, explanation
    """
    import uuid

    legacy_id = legacy.get("id", "A")
    stable_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"option-{legacy_id}"))

    return QuizOption(
        option_id=stable_uuid,
        display_label=legacy_id,
        text=legacy.get("text", ""),
        is_correct=legacy.get("is_correct", False),
        explanation=legacy.get("explanation", ""),
    )


def convert_legacy_quiz_card(legacy_quiz: dict) -> QuizCard:
    """Convert legacy QuizCard to new format with stable option IDs.

    BACKWARD COMPATIBILITY:
    - Converts legacy options using convert_legacy_quiz_option
    - Generates UUIDs based on legacy IDs for deterministic option_id
    """
    legacy_options = legacy_quiz.get("options", [])
    new_options = [convert_legacy_quiz_option(opt) for opt in legacy_options]

    return QuizCard(
        question_text=legacy_quiz.get("question_text", ""),
        options=new_options,
        difficulty=legacy_quiz.get("difficulty", "medium"),
    )


def convert_legacy_to_quiz_set(legacy_quiz: dict) -> QuizSet:
    """Convert legacy single quiz to QuizSet (single quiz in set).

    BACKWARD COMPATIBILITY:
    - Wraps legacy QuizCard in a QuizSet with single quiz
    """
    return QuizSet(quizzes=[convert_legacy_quiz_card(legacy_quiz)], current_index=0)
