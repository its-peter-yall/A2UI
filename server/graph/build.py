"""
============================================================================
FILE: build.py
LOCATION: server/graph/build.py
============================================================================
PURPOSE:
    Builds and caches LangGraph course generation graph.
ROLE IN PROJECT:
    Creates compiled graph used by adaptive learning flow.
    - Keeps graph assembly isolated from routers and entrypoints
    - Stores compiled graph on app state for reuse
KEY COMPONENTS:
    - CHECKPOINT_DB_PATH: Default checkpoint database path
    - build_graph: Compiles graph with optional checkpointer
    - get_graph: Returns cached graph from app state or builds one
DEPENDENCIES:
    - External: pathlib, typing, langgraph
    - Internal: server.graph.nodes, server.graph.state
USAGE:
    from server.graph.build import build_graph, get_graph
============================================================================
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from langgraph.graph import END, START, StateGraph

from server.graph.nodes import (
    build_response_node,
    fan_out_topics,
    planner_node,
    topic_worker,
)
from server.graph.state import CourseGraphContext, CourseState, TopicResult

CHECKPOINT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "checkpoints.db"


def _build_response_node(state: CourseState) -> dict[str, Any]:
    return build_response_node(state)


def build_graph(checkpointer: Any | None = None) -> Any:
    """Compile course generation graph."""
    workflow = StateGraph(CourseState, context_schema=CourseGraphContext)
    workflow.add_node("planner_node", planner_node)
    workflow.add_node("topic_worker", topic_worker)
    workflow.add_node("build_response_node", _build_response_node)
    workflow.add_edge(START, "planner_node")
    workflow.add_conditional_edges(
        "planner_node",
        fan_out_topics,
    )
    workflow.add_edge("topic_worker", "build_response_node")
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
