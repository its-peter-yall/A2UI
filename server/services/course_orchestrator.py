# course_orchestrator.py
# Scatter-Gather orchestrator for parallel course generation

# Implements the CourseOrchestrator that coordinates planner, generator, and
# quizzer agents to create learning paths. Uses asyncio.gather for parallel
# execution with partial failure handling and performance logging.

# @see: server/agents/__init__.py - Agent implementations
# @see: server/database/learning_persistence.py - Database persistence
# @note: Uses return_exceptions=True to handle partial failures gracefully

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from server.agents import generator_agent, planner_agent, quizzer_agent
from server.agents.generator import GeneratedContent
from server.database.learning_persistence import learning_manager
from server.schemas.learning import (
    CourseOutline,
    NodeStatus,
    QuizCard,
    TopicNode,
)

logger = logging.getLogger(__name__)


class CourseOrchestrator:
    """
    Scatter-Gather orchestrator for parallel course generation.

    Coordinates the planner, generator, and quizzer agents to create complete
    learning paths. Uses asyncio.gather for parallel execution of concept unit
    generation with partial failure handling.

    The orchestration flow is:
    1. Planner agent decomposes query into CourseOutline (serial)
    2. Create learning session in database
    3. Build context injection data for each topic
    4. Scatter: Launch parallel generation for all topics
    5. Gather: Collect results, handle failures gracefully
    6. Return complete session with nodes (or SkeletonCards for failures)
    """

    def __init__(self) -> None:
        """Initialize the CourseOrchestrator."""
        logger.debug("CourseOrchestrator initialized")

    async def generate_course(
        self,
        query: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a complete course using the Scatter-Gather pattern.

        Flow:
        1. Call planner_agent.plan(query) - SERIAL (blocking)
        2. Create learning session in database
        3. Build context injection data for each topic:
           - prev_summary = topics[i-1].summary_for_context or "Start"
           - next_summary = topics[i+1].summary_for_context or "End"
        4. Scatter: Create coroutines for each topic
           - _generate_concept_unit(topic, prev_summary, next_summary, session_id)
        5. Gather: await asyncio.gather(*tasks, return_exceptions=True)
        6. Process results, handle partial failures
        7. Return complete session with nodes

        Args:
            query: The user's learning query
            user_id: Optional user identifier

        Returns:
            Dict containing session info and generated nodes
        """
        total_start = time.perf_counter()

        # 1. SERIAL: Planner generates course outline
        planner_start = time.perf_counter()
        outline: CourseOutline = await planner_agent.plan(query)
        planner_time_ms = (time.perf_counter() - planner_start) * 1000

        logger.info(
            f"Planner completed: '{outline.course_title}' with "
            f"{len(outline.topics)} topics in {planner_time_ms:.2f}ms"
        )

        # 2. Create learning session in database
        session = learning_manager.create_learning_session(
            query=query,
            course_title=outline.course_title,
            user_id=user_id,
        )
        session_id = session["id"]

        logger.info(f"Created learning session: {session_id}")

        # 3. Build context injection data and create tasks
        tasks: List[asyncio.Task] = []
        topics = outline.topics

        for i, topic in enumerate(topics):
            # Determine prev_summary and next_summary for context injection
            prev_summary = topics[i - 1].summary_for_context if i > 0 else "Start"
            next_summary = (
                topics[i + 1].summary_for_context if i < len(topics) - 1 else "End"
            )

            # Create coroutine for this topic
            task = asyncio.create_task(
                self._generate_concept_unit(
                    topic=topic,
                    prev_summary=prev_summary,
                    next_summary=next_summary,
                    session_id=session_id,
                    sequence_index=topic.index,
                )
            )
            tasks.append(task)

        # 4. SCATTER: Execute all tasks in parallel
        # 5. GATHER: Collect results with exception handling
        parallel_start = time.perf_counter()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        parallel_time_ms = (time.perf_counter() - parallel_start) * 1000

        # 6. Process results and handle partial failures
        processed_nodes = self._process_gather_results(
            results=results,
            topics=topics,
        )

        # Calculate totals
        total_time_ms = (time.perf_counter() - total_start) * 1000
        success_count = sum(
            1 for node in processed_nodes if node.get("status") != "ERROR"
        )
        failure_count = len(processed_nodes) - success_count

        # Structured performance logging
        logger.info(
            "Course generation complete",
            extra={
                "session_id": session_id,
                "planner_ms": round(planner_time_ms, 2),
                "parallel_ms": round(parallel_time_ms, 2),
                "total_ms": round(total_time_ms, 2),
                "cards_success": success_count,
                "cards_failed": failure_count,
            },
        )

        # 7. Return complete session with nodes
        return {
            "session": {
                "id": session_id,
                "user_id": user_id,
                "query": query,
                "course_title": outline.course_title,
                "created_at": session["created_at"],
                "updated_at": session["updated_at"],
                "total_nodes": len(processed_nodes),
                "completed_nodes": 0,
            },
            "nodes": processed_nodes,
            "metrics": {
                "planner_ms": round(planner_time_ms, 2),
                "parallel_ms": round(parallel_time_ms, 2),
                "total_ms": round(total_time_ms, 2),
                "cards_success": success_count,
                "cards_failed": failure_count,
            },
        }

    async def _generate_concept_unit(
        self,
        topic: TopicNode,
        prev_summary: str,
        next_summary: str,
        session_id: str,
        sequence_index: int,
    ) -> Dict[str, Any]:
        """
        Generate a single concept unit (explanation + quiz) for a topic.

        Steps:
        - Call generator_agent.generate_explanation(topic, prev_summary, next_summary)
        - Call quizzer_agent.generate_quiz(topic, content.content_markdown)
        - Create concept_node in database using learning_manager
        - Return node data or error dict (SkeletonCard)

        Args:
            topic: The TopicNode to generate content for
            prev_summary: Summary of the previous topic for context injection
            next_summary: Summary of the next topic for context injection
            session_id: The learning session ID
            sequence_index: The sequence index for this node

        Returns:
            Dict containing node data on success, or SkeletonCard on failure
        """
        try:
            # Generate educational content
            content: GeneratedContent = await generator_agent.generate_explanation(
                topic=topic,
                prev_summary=prev_summary if prev_summary != "Start" else None,
                next_summary=next_summary if next_summary != "End" else None,
            )

            # Generate quiz for the content
            quiz: QuizCard = await quizzer_agent.generate_quiz(
                topic=topic,
                content=content.content_markdown,
            )

            # Determine initial status (first node is UNLOCKED, rest are LOCKED)
            initial_status = (
                NodeStatus.UNLOCKED if sequence_index == 0 else NodeStatus.LOCKED
            )

            # Create concept node in database
            node = learning_manager.create_concept_node(
                session_id=session_id,
                sequence_index=sequence_index,
                title=topic.title,
                content_markdown=content.content_markdown,
                status=initial_status,
                quiz=quiz,
            )

            logger.info(
                f"Generated concept unit for topic {sequence_index}: '{topic.title}'"
            )

            return node

        except Exception as e:
            # Return SkeletonCard for partial failure
            logger.error(
                f"Failed to generate concept unit for topic {sequence_index} "
                f"'{topic.title}': {e}"
            )
            return self._create_skeleton_card(
                error=e,
                topic_index=topic.index,
                topic_title=topic.title,
            )

    def _process_gather_results(
        self,
        results: List[Any],
        topics: List[TopicNode],
    ) -> List[Dict[str, Any]]:
        """
        Process results from asyncio.gather and separate successes from failures.

        For each result:
        - If it's an Exception, create a SkeletonCard
        - If it's a dict with status="ERROR", log warning and keep as-is
        - Otherwise, treat as successful node data

        Args:
            results: List of results from asyncio.gather
            topics: Original list of topics for error context

        Returns:
            List of processed node dicts (success or SkeletonCards)
        """
        processed_nodes: List[Dict[str, Any]] = []

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                # asyncio.gather caught an exception (shouldn't happen often
                # since _generate_concept_unit has its own try/except)
                topic = topics[i] if i < len(topics) else None
                topic_index = topic.index if topic else i
                topic_title = topic.title if topic else f"Topic {i}"

                logger.warning(
                    f"Exception during gather for topic {topic_index}: {result}"
                )

                skeleton = self._create_skeleton_card(
                    error=result,
                    topic_index=topic_index,
                    topic_title=topic_title,
                )
                processed_nodes.append(skeleton)

            elif isinstance(result, dict):
                if result.get("status") == "ERROR":
                    # Already a SkeletonCard from _generate_concept_unit
                    logger.warning(
                        f"SkeletonCard returned for topic {result.get('topic_index')}: "
                        f"{result.get('error_message')}"
                    )
                processed_nodes.append(result)

            else:
                # Unexpected result type - log and create skeleton
                logger.error(f"Unexpected result type at index {i}: {type(result)}")
                topic = topics[i] if i < len(topics) else None
                skeleton = self._create_skeleton_card(
                    error=ValueError(f"Unexpected result type: {type(result)}"),
                    topic_index=topic.index if topic else i,
                    topic_title=topic.title if topic else f"Topic {i}",
                )
                processed_nodes.append(skeleton)

        return processed_nodes

    def _create_skeleton_card(
        self,
        error: Exception,
        topic_index: int,
        topic_title: str,
    ) -> Dict[str, Any]:
        """
        Create a SkeletonCard dict for a failed generation.

        SkeletonCards represent failed concept units that can be retried.
        They contain error information and metadata for the retry mechanism.

        Args:
            error: The exception that caused the failure
            topic_index: The index of the failed topic
            topic_title: The title of the failed topic

        Returns:
            Dict representing a SkeletonCard
        """
        return {
            "status": "ERROR",
            "error_message": str(error),
            "retry_available": True,
            "topic_index": topic_index,
            "topic_title": topic_title,
        }

    async def regenerate_node(
        self,
        node_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Re-run generation for a single failed node.

        Looks up the node and its session, retrieves topic info from the node,
        re-calls generator and quizzer agents, and updates the database with
        new content.

        Args:
            node_id: The ID of the node to regenerate

        Returns:
            Updated node dict on success, None if node not found
        """
        # NOTE: This method uses learning_manager's internal _get_node_by_id.
        # A future improvement would add a public get_node_by_id method.
        # Additionally, update_node_content is not yet implemented in learning_manager,
        # so regenerated content is returned but not persisted.

        try:
            # Get session nodes and find the target node
            # This is a workaround until we have a proper get_node_by_id method
            conn = learning_manager._get_connection()
            try:
                node = learning_manager._get_node_by_id(node_id, conn)
            finally:
                conn.close()

            if not node:
                logger.warning(f"Node not found for regeneration: {node_id}")
                return None

            session_id = node["learning_session_id"]
            sequence_index = node["sequence_index"]
            title = node["title"]

            # Get all nodes to determine prev/next summaries
            all_nodes = learning_manager.get_session_nodes(session_id)

            # Build prev_summary and next_summary from adjacent nodes
            prev_summary = "Start"
            next_summary = "End"

            for other_node in all_nodes:
                if other_node["sequence_index"] == sequence_index - 1:
                    # For previous node, we don't have summary_for_context stored
                    # We use the title as a fallback
                    prev_summary = other_node["title"]
                elif other_node["sequence_index"] == sequence_index + 1:
                    next_summary = other_node["title"]

            # Create a TopicNode from the existing node data
            # Note: We don't have key_terms stored in the node, so we use placeholders
            # The min_length for key_terms is 2, so we provide generic terms
            topic = TopicNode(
                index=sequence_index,
                title=title,
                summary_for_context=title,  # Fallback to title
                key_terms=["concept", "topic"],  # Placeholder terms (min 2 required)
            )

            # Regenerate content
            content: GeneratedContent = await generator_agent.generate_explanation(
                topic=topic,
                prev_summary=prev_summary if prev_summary != "Start" else None,
                next_summary=next_summary if next_summary != "End" else None,
            )

            # Regenerate quiz
            quiz: QuizCard = await quizzer_agent.generate_quiz(
                topic=topic,
                content=content.content_markdown,
            )

            # Update the node in database
            # NOTE: The learning_manager doesn't have an update_node_content method.
            # For a complete implementation, we'd need to add that method.
            # For now, we log a warning and return the regenerated content
            # without persisting it.
            logger.warning(
                f"Regenerated content for node {node_id}, but update_node_content "
                "method not yet implemented in learning_manager"
            )

            # Return the updated node data (not persisted)
            return {
                "id": node_id,
                "learning_session_id": session_id,
                "sequence_index": sequence_index,
                "title": title,
                "content_markdown": content.content_markdown,
                "status": node["status"],
                "created_at": node["created_at"],
                "updated_at": node["updated_at"],
                "quiz": quiz.model_dump(),
                "regenerated": True,
            }

        except Exception as e:
            logger.error(f"Failed to regenerate node {node_id}: {e}")
            return None


# Singleton instance for use throughout the application
course_orchestrator = CourseOrchestrator()
