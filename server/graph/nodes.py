"""
============================================================================
FILE: nodes.py
LOCATION: server/graph/nodes.py
============================================================================
PURPOSE:
    Provides LangGraph node functions for adaptive course generation.
ROLE IN PROJECT:
    Wraps the existing Planner, Generator, and Quizzer agents for graph use.
    - Preserves original course generation business behavior
    - Adds graph-native fan-out and fan-in support
KEY COMPONENTS:
    - planner_node: Creates course outline and learning session
    - fan_out_topics: Sends each topic to a parallel worker
    - topic_worker: Generates content and quizzes for one topic
    - build_response_node: Builds final response and metrics
DEPENDENCIES:
    - External: asyncio, logging, time, langgraph
    - Internal: server.agents, server.database, server.schemas
USAGE:
    from server.graph.nodes import planner_node, topic_worker
============================================================================
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

from langgraph.runtime import Runtime
from langgraph.types import Send

from server.agents.generator import GeneratedContent, generator_agent
from server.agents.planner import planner_agent, validate_complexity_distribution
from server.agents.quizzer import quizzer_agent
from server.database.learning_persistence import learning_manager
from server.graph.state import CourseGraphContext, CourseState, TopicResult
from server.schemas.learning import CourseOutline, NodeStatus, QuizSet, TopicNode
from server.schemas.llm import LLMContext

logger = logging.getLogger(__name__)


def _context_payload(runtime: Any) -> dict[str, Any]:
    """Return runtime context payload."""
    if runtime is None:
        return {}
    if isinstance(runtime, dict):
        if "llm_context" in runtime or "session_ref" in runtime:
            return runtime
        context = runtime.get("context", {})
        if isinstance(context, dict):
            return context
    if hasattr(runtime, "context"):
        value = getattr(runtime, "context")
        if isinstance(value, dict):
            return value
        if hasattr(value, "model_dump"):
            dumped = value.model_dump()
            if isinstance(dumped, dict):
                return dumped
    if hasattr(runtime, "get"):
        value = runtime.get("context", {})
        if isinstance(value, dict):
            return value
        value = runtime.get("configurable", {})
        if isinstance(value, dict):
            return value
    value = getattr(runtime, "configurable", {})
    if isinstance(value, dict):
        return value
    return {}


def _get_llm_context(runtime: Any) -> LLMContext:
    """Extract request-scoped LLM context from runtime context."""
    context = _context_payload(runtime).get("llm_context")
    if isinstance(context, LLMContext):
        return context
    if isinstance(context, dict):
        return LLMContext.model_validate(context)
    if context is not None:
        return LLMContext.model_validate(context)
    raise ValueError("llm_context is required in graph config.")


def _record_session_id(
    runtime: Any,
    session_id: str,
) -> None:
    """Record session id in runtime-only config for cancellation cleanup."""
    session_ref = _context_payload(runtime).get("session_ref")
    if isinstance(session_ref, dict):
        session_ref["session_id"] = session_id


async def planner_node(
    state: CourseState,
    runtime: Runtime[CourseGraphContext] | dict[str, Any],
) -> dict[str, Any]:
    """Generate course outline and create the learning session."""
    llm_context = _get_llm_context(runtime)
    total_start = state.get("total_start_time", time.perf_counter())

    planner_start = time.perf_counter()
    outline: CourseOutline = await planner_agent.plan(
        state["query"],
        llm_context=llm_context,
    )
    planner_ms = (time.perf_counter() - planner_start) * 1000

    distribution = validate_complexity_distribution(outline)
    if not distribution["valid"]:
        logger.warning(
            "Planner complexity distribution issues detected",
            extra={
                "errors": distribution["errors"],
                "distribution": distribution["distribution"],
            },
        )
    elif distribution["warnings"]:
        logger.info(
            "Planner complexity distribution warnings",
            extra={
                "warnings": distribution["warnings"],
                "distribution": distribution["distribution"],
            },
        )

    session = learning_manager.create_learning_session(
        query=state["query"],
        course_title=outline.course_title,
        user_id=state.get("user_id"),
    )
    _record_session_id(runtime, session["id"])

    logger.info(
        "Planner completed: '%s' with %s topics in %.2fms",
        outline.course_title,
        len(outline.topics),
        planner_ms,
    )

    return {
        "outline": outline.model_dump(),
        "session": session,
        "planner_ms": planner_ms,
        "topic_results": [],
        "total_start_time": total_start,
        "parallel_start_time": time.perf_counter(),
    }


def fan_out_topics(state: CourseState) -> list[Send]:
    """Fan out one Send packet per topic for parallel generation."""
    outline = CourseOutline(**state["outline"])
    session_id = state["session"]["id"]
    sends: list[Send] = []

    for index, topic in enumerate(outline.topics):
        if topic.index != index:
            logger.warning(
                "Topic index mismatch: list index does not match topic index",
                extra={
                    "session_id": session_id,
                    "list_index": index,
                    "topic_index": topic.index,
                    "topic_title": topic.title,
                },
            )

        prev_summary = (
            outline.topics[index - 1].summary_for_context
            if index > 0
            else "Start"
        )
        next_summary = (
            outline.topics[index + 1].summary_for_context
            if index < len(outline.topics) - 1
            else "End"
        )
        sends.append(
            Send(
                "topic_worker",
                {
                    "topic_data": topic.model_dump(),
                    "prev_summary": prev_summary,
                    "next_summary": next_summary,
                    "session_id": session_id,
                    "sequence_index": index,
                },
            )
        )

    return sends


async def topic_worker(
    state: CourseState,
    runtime: Runtime[CourseGraphContext] | dict[str, Any],
) -> dict[str, list[TopicResult]]:
    """Generate content and quiz data for one topic."""
    llm_context = _get_llm_context(runtime)
    topic = TopicNode(**state["topic_data"])
    prev_summary = state.get("prev_summary", "Start")
    next_summary = state.get("next_summary", "End")
    session_id = state["session_id"]
    sequence_index = state["sequence_index"]
    start_time = time.perf_counter()

    try:
        content: GeneratedContent = await generator_agent.generate_explanation(
            topic=topic,
            prev_summary=prev_summary if prev_summary != "Start" else None,
            next_summary=next_summary if next_summary != "End" else None,
            llm_context=llm_context,
        )
        quiz_set: QuizSet = await quizzer_agent.generate_quiz_set(
            topic=topic,
            content=content.content_markdown,
            quiz_count=topic.quiz_count,
            llm_context=llm_context,
        )
        initial_status = (
            NodeStatus.VIEWING_EXPLANATION
            if sequence_index == 0
            else NodeStatus.LOCKED
        )
        node = learning_manager.create_concept_node(
            session_id=session_id,
            sequence_index=sequence_index,
            title=topic.title,
            content_markdown=content.content_markdown,
            status=initial_status,
            quiz_set=quiz_set,
            complexity=topic.complexity,
            summary_for_context=topic.summary_for_context,
            key_terms=topic.key_terms,
        )
        generation_ms = (time.perf_counter() - start_time) * 1000
        return {
            "topic_results": [
                {
                    "node": node,
                    "generation_ms": generation_ms,
                    "error_message": None,
                }
            ]
        }
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        generation_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            "Failed to generate concept unit for topic %s '%s': %s",
            sequence_index,
            topic.title,
            exc,
        )
        node = learning_manager.create_concept_node(
            session_id=session_id,
            sequence_index=sequence_index,
            title=topic.title,
            content_markdown="Content generation failed. Retry is available.",
            status=NodeStatus.ERROR,
            quiz=None,
            error_message=str(exc),
            retry_available=True,
            complexity=topic.complexity,
            summary_for_context=topic.summary_for_context,
            key_terms=topic.key_terms,
        )
        return {
            "topic_results": [
                {
                    "node": node,
                    "generation_ms": generation_ms,
                    "error_message": str(exc),
                }
            ]
        }


def build_response_node(state: CourseState) -> dict[str, Any]:
    """Build final response payload and old orchestrator-compatible metrics."""
    now = time.perf_counter()
    topic_results = state.get("topic_results", [])
    sorted_results = sorted(
        topic_results,
        key=lambda item: item["node"].get("sequence_index", 0),
    )
    nodes = [item["node"] for item in sorted_results]

    serial_estimate_ms = sum(
        float(item.get("generation_ms", 0.0)) for item in sorted_results
    )
    parallel_start = state.get("parallel_start_time", now)
    total_start = state.get("total_start_time", now)
    parallel_ms = (now - parallel_start) * 1000
    total_ms = (now - total_start) * 1000
    latency_savings_ms = max(serial_estimate_ms - parallel_ms, 0.0)
    success_count = sum(
        1 for node in nodes if node.get("status") != NodeStatus.ERROR.value
    )
    failure_count = len(nodes) - success_count

    session = dict(state["session"])
    session["total_nodes"] = len(nodes)
    session["completed_nodes"] = 0

    metrics = {
        "planner_ms": round(state.get("planner_ms", 0.0), 2),
        "parallel_ms": round(parallel_ms, 2),
        "serial_estimate_ms": round(serial_estimate_ms, 2),
        "latency_savings_ms": round(latency_savings_ms, 2),
        "total_ms": round(total_ms, 2),
        "cards_success": success_count,
        "cards_failed": failure_count,
    }

    logger.info(
        "Course generation complete",
        extra={"session_id": session["id"], **metrics},
    )

    return {
        "session": session,
        "nodes": nodes,
        "metrics": metrics,
    }
