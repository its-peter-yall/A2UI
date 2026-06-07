"""
============================================================================
FILE: build.py
LOCATION: server/graph/build.py
============================================================================
PURPOSE:
    Builds and caches LangGraph course generation graph with split
    generator/quizzer nodes, retry policies, and error handlers.
ROLE IN PROJECT:
    Creates compiled graph used by adaptive learning flow.
    - Assembles graph with split generator and quizzer stages
    - Applies RetryPolicy and error_handler to LLM-bound nodes
    - Stores compiled graph on app state for reuse
KEY COMPONENTS:
    - CHECKPOINT_DB_PATH: Default checkpoint database path
    - build_graph: Compiles graph with optional checkpointer
    - get_graph: Returns cached graph from app state or builds one
DEPENDENCIES:
    - External: pathlib, typing, langgraph, pydantic
    - Internal: server.graph.nodes, server.graph.state
USAGE:
    from server.graph.build import build_graph, get_graph
============================================================================
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.types import RetryPolicy
from pydantic import ValidationError

from server.graph.nodes import (
    build_response_node,
    fan_out_generators,
    fan_out_quizzers,
    generator_error_handler,
    generator_node,
    planner_node,
    quizzer_error_handler,
    quizzer_node,
)
from server.graph.state import CourseGraphContext, CourseState

CHECKPOINT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "checkpoints.db"


def _build_response_node(state: CourseState) -> dict[str, Any]:
    return build_response_node(state)


def build_graph(checkpointer: Any | None = None) -> Any:
    """Compile course generation graph with split generator/quizzer nodes."""
    retry = RetryPolicy(max_attempts=2, retry_on=ValidationError)

    workflow = StateGraph(CourseState, context_schema=CourseGraphContext)

    workflow.add_node("planner_node", planner_node)
    workflow.add_node(
        "generator_node",
        generator_node,
        retry_policy=retry,
        error_handler=generator_error_handler,
    )
    workflow.add_node(
        "quizzer_node",
        quizzer_node,
        retry_policy=retry,
        error_handler=quizzer_error_handler,
    )
    workflow.add_node("build_response_node", _build_response_node)

    workflow.add_edge(START, "planner_node")
    workflow.add_conditional_edges("planner_node", fan_out_generators)
    workflow.add_conditional_edges("generator_node", fan_out_quizzers)
    workflow.add_edge("quizzer_node", "build_response_node")
    workflow.add_edge("build_response_node", END)

    return workflow.compile(checkpointer=checkpointer)


def get_graph(app_state: Any) -> Any:
    """Return cached compiled graph from app state."""
    graph = getattr(app_state, "course_graph", None)
    if graph is None:
        checkpointer = getattr(app_state, "checkpointer", None)
        graph = build_graph(checkpointer=checkpointer)
        setattr(app_state, "course_graph", graph)
    return graph
