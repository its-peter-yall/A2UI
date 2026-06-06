"""
============================================================================
FILE: regen.py
LOCATION: server/graph/regen.py
============================================================================
PURPOSE:
    Standalone regeneration function for failed concept nodes.
ROLE IN PROJECT:
    Provides single-node regen without invoking the full LangGraph
    course graph runtime.
    - Calls generator and quizzer agents directly
    - Updates node content via persistence layer
KEY COMPONENTS:
    - regenerate_failed_node: Async function to regenerate one node
DEPENDENCIES:
    - External: logging
    - Internal: server.agents, server.database, server.schemas
USAGE:
    from server.graph.regen import regenerate_failed_node
    result = await regenerate_failed_node(node_id, llm_context)
============================================================================
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from server.agents.generator import GeneratedContent, generator_agent
from server.agents.quizzer import quizzer_agent
from server.database.learning_persistence import learning_manager
from server.schemas.learning import (
    NodeStatus,
    QuizSet,
    TopicNode,
)
from server.schemas.llm import LLMContext

logger = logging.getLogger(__name__)


async def regenerate_failed_node(
    node_id: str,
    llm_context: Optional[LLMContext] = None,
) -> Optional[Dict[str, Any]]:
    """Re-generate content for a single failed concept node.

    Looks up the node and its session siblings, rebuilds a
    TopicNode from stored data, calls generator and quizzer
    agents, and persists the new content.

    Args:
        node_id: Identifier of the node to regenerate.
        llm_context: Optional LLM provider context.

    Returns:
        Updated node dict on success, None on failure.

    Raises:
        LookupError: If node_id does not exist.
        ValueError: If node is not eligible for regeneration.
    """
    node = learning_manager.get_concept_node(node_id)

    if not node:
        raise LookupError(f"Node not found: {node_id}")

    if node.get("status") != NodeStatus.ERROR.value:
        raise ValueError(
            f"Node {node_id} is not in ERROR status"
        )

    if not node.get("retry_available", False):
        raise ValueError(
            f"Node {node_id} does not have retry available"
        )

    session_id = node["learning_session_id"]
    sequence_index = node["sequence_index"]
    title = node["title"]

    all_nodes = learning_manager.get_session_nodes(session_id)

    prev_summary: Optional[str] = None
    next_summary: Optional[str] = None
    previous_status: Optional[str] = None

    for sibling in all_nodes:
        if sibling["sequence_index"] == sequence_index - 1:
            prev_summary = sibling["title"]
            previous_status = sibling["status"]
        elif sibling["sequence_index"] == sequence_index + 1:
            next_summary = sibling["title"]

    quiz_count = 1
    quiz_payload = node.get("quiz")
    if quiz_payload and isinstance(quiz_payload, dict):
        quizzes = quiz_payload.get("quizzes")
        if quizzes and isinstance(quizzes, list):
            quiz_count = len(quizzes)

    topic = TopicNode(
        index=sequence_index,
        title=title,
        summary_for_context=node.get("summary_for_context") or title,
        key_terms=node.get("key_terms") or ["concept", "topic"],
        complexity=node.get("complexity", "Intermediate"),
        quiz_count=quiz_count,
    )

    content: GeneratedContent = (
        await generator_agent.generate_explanation(
            topic=topic,
            prev_summary=prev_summary,
            next_summary=next_summary,
            llm_context=llm_context,
        )
    )

    quiz_set: QuizSet = await quizzer_agent.generate_quiz_set(
        topic=topic,
        content=content.content_markdown,
        quiz_count=quiz_count,
        llm_context=llm_context,
    )

    new_status = NodeStatus.LOCKED
    if sequence_index == 0:
        new_status = NodeStatus.VIEWING_EXPLANATION
    elif previous_status == NodeStatus.COMPLETED.value:
        new_status = NodeStatus.VIEWING_EXPLANATION

    updated_node = learning_manager.update_node_content(
        node_id=node_id,
        content_markdown=content.content_markdown,
        status=new_status,
        quiz_set=quiz_set,
        error_message=None,
        retry_available=False,
    )

    if not updated_node:
        logger.error("Node vanished during regen: %s", node_id)
        return None

    logger.info(
        "Regenerated node %s with %d quizzes",
        node_id,
        len(quiz_set.quizzes),
    )
    return updated_node
