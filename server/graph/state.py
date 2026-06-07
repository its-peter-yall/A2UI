"""
============================================================================
FILE: state.py
LOCATION: server/graph/state.py
============================================================================
PURPOSE:
    Defines TypedDict state contracts for LangGraph course generation.
ROLE IN PROJECT:
    Shared state schema for graph nodes in the learning feature.
    - Keeps persisted graph data explicit and serializable
    - Uses a reducer to merge parallel topic worker results
KEY COMPONENTS:
    - TopicResult: Per-topic worker result shape
    - GeneratorResult: Per-generator result shape
    - CourseMetrics: Final timing and success metrics
    - CourseState: Main graph state schema
DEPENDENCIES:
    - External: operator, typing_extensions
    - Internal: None
USAGE:
    from server.graph.state import CourseState
============================================================================
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Optional

from typing_extensions import NotRequired, TypedDict

from server.schemas.llm import LLMContext


class TopicResult(TypedDict):
    """Result returned by one topic worker."""

    node: dict[str, Any]
    generation_ms: float
    error_message: Optional[str]


class GeneratorResult(TypedDict):
    """Result returned by one generator node."""

    topic_data: dict[str, Any]
    content_markdown: str
    generation_ms: float
    error_message: Optional[str]
    sequence_index: int
    session_id: str


class CourseMetrics(TypedDict):
    """Timing and success metrics for course generation."""

    planner_ms: float
    parallel_ms: float
    serial_estimate_ms: float
    latency_savings_ms: float
    total_ms: float
    cards_success: int
    cards_failed: int


class CourseGraphContext(TypedDict):
    """Runtime-only context for graph execution."""

    llm_context: LLMContext
    session_ref: dict[str, str]


class CourseState(TypedDict):
    """State schema for LangGraph course generation."""

    query: str
    user_id: Optional[str]

    outline: NotRequired[dict[str, Any]]
    session: NotRequired[dict[str, Any]]
    nodes: NotRequired[list[dict[str, Any]]]
    metrics: NotRequired[CourseMetrics]

    planner_ms: NotRequired[float]
    total_start_time: NotRequired[float]
    parallel_start_time: NotRequired[float]

    topic_results: Annotated[list[TopicResult], operator.add]
    generator_results: Annotated[list[GeneratorResult], operator.add]

    topic_data: NotRequired[dict[str, Any]]
    prev_summary: NotRequired[str]
    next_summary: NotRequired[str]
    session_id: NotRequired[str]
    sequence_index: NotRequired[int]
