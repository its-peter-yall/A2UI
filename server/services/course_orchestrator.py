"""
============================================================================
FILE: course_orchestrator.py
LOCATION: server/services/course_orchestrator.py
============================================================================
PURPOSE:
    Coordinates the generation of adaptive learning paths using a
    Scatter-Gather pattern. Manages planner, generator, and quizzer agents
    to produce complete courses with parallel topic processing.
ROLE IN PROJECT:
    Central orchestration service for the learning feature.
    - Runs serial planning then parallel content generation per topic
    - Handles partial failures via SkeletonCards to allow course retry
KEY COMPONENTS:
    - CourseOrchestrator: Main class implementing the scatter-gather pattern
    - generate_course(): Coordinates full course generation flow
    - _generate_concept_unit(): Generates explanation + quiz for one topic
    - _process_gather_results(): Creates SkeletonCards for failed nodes
    - regenerate_node(): Retries generation for a single failed node
DEPENDENCIES:
    - External: asyncio
    - Internal: server.agents, server.database.learning_persistence,
              server.schemas.learning
USAGE:
    ```python
    from server.services.course_orchestrator import course_orchestrator
    result = await course_orchestrator.generate_course(
        query="Python async", user_id="user123")
    ```
============================================================================
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from server.agents import generator_agent, planner_agent, quizzer_agent
from server.agents.planner import validate_complexity_distribution
from server.agents.generator import GeneratedContent
from server.database.learning_persistence import learning_manager
from server.schemas.learning import (
    CourseOutline,
    NodeStatus,
    QuizSet,
    TopicNode,
)
from server.schemas.llm import LLMContext

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
        llm_context: Optional[LLMContext] = None,
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
            llm_context: Optional OpenRouter context

        Returns:
            Dict containing session info and generated nodes
        """
        total_start = time.perf_counter()

        # Log model and thinking configuration at course generation start
        model_used = llm_context.model if llm_context else None
        thinking_enabled = llm_context.thinking_enabled if llm_context else False
        thinking_effort = llm_context.thinking_effort if llm_context else None
        logger.info(
            f"Course generation started | Model: {model_used or 'default'} "
            f"| Thinking enabled: {thinking_enabled} | Thinking effort: {thinking_effort or 'N/A'}"
        )

        # 1. SERIAL: Planner generates course outline
        planner_start = time.perf_counter()
        outline: CourseOutline = await planner_agent.plan(
            query, llm_context=llm_context
        )
        planner_time_ms = (time.perf_counter() - planner_start) * 1000

        distribution_result = validate_complexity_distribution(outline)
        if not distribution_result["valid"]:
            logger.warning(
                "Planner complexity distribution issues detected",
                extra={
                    "errors": distribution_result["errors"],
                    "distribution": distribution_result["distribution"],
                },
            )
        elif distribution_result["warnings"]:
            logger.info(
                "Planner complexity distribution warnings",
                extra={
                    "warnings": distribution_result["warnings"],
                    "distribution": distribution_result["distribution"],
                },
            )

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
            if topic.index != i:
                logger.warning(
                    "Topic index mismatch: list index does not match topic index",
                    extra={
                        "session_id": session_id,
                        "list_index": i,
                        "topic_index": topic.index,
                        "topic_title": topic.title,
                    },
                )
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
                    sequence_index=i,
                    llm_context=llm_context,
                )
            )
            tasks.append(task)


        # 4. SCATTER: Execute all tasks in parallel
        # 5. GATHER: Collect results with exception handling
        parallel_start = time.perf_counter()
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
        except asyncio.CancelledError:
            logger.info(f"Course generation task cancelled for session {session_id}. Cancelling topics...")
            for task in tasks:
                if not task.done():
                    task.cancel()
            logger.info(f"Cleaning up partial session {session_id} from database...")
            learning_manager.delete_learning_session(session_id)
            raise
        parallel_time_ms = (time.perf_counter() - parallel_start) * 1000

        # 6. Process results and handle partial failures
        processed_nodes = self._process_gather_results(
            results=results,
            topics=topics,
            session_id=session_id,
        )
        nodes, serial_estimate_ms = processed_nodes

        # Calculate totals
        total_time_ms = (time.perf_counter() - total_start) * 1000
        success_count = sum(
            1 for node in nodes if node.get("status") != NodeStatus.ERROR.value
        )
        failure_count = len(nodes) - success_count
        latency_savings_ms = max(serial_estimate_ms - parallel_time_ms, 0)

        # Structured performance logging
        logger.info(
            "Course generation complete",
            extra={
                "session_id": session_id,
                "planner_ms": round(planner_time_ms, 2),
                "parallel_ms": round(parallel_time_ms, 2),
                "serial_estimate_ms": round(serial_estimate_ms, 2),
                "latency_savings_ms": round(latency_savings_ms, 2),
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
                "total_nodes": len(nodes),
                "completed_nodes": 0,
            },
            "nodes": nodes,
            "metrics": {
                "planner_ms": round(planner_time_ms, 2),
                "parallel_ms": round(parallel_time_ms, 2),
                "serial_estimate_ms": round(serial_estimate_ms, 2),
                "latency_savings_ms": round(latency_savings_ms, 2),
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
        llm_context: Optional[LLMContext] = None,
    ) -> Dict[str, Any]:
        """
        Generate a single concept unit (explanation + quiz) for a topic.

        Steps:
        - Call generator_agent.generate_explanation(topic, prev_summary, next_summary)
        - Call quizzer_agent.generate_quiz_set(topic, content.content_markdown)
        - Create concept_node in database using learning_manager
        - Return node data or error dict (SkeletonCard)

        Args:
            topic: The TopicNode to generate content for
            prev_summary: Summary of the previous topic for context injection
            next_summary: Summary of the next topic for context injection
            session_id: The learning session ID
            sequence_index: The sequence index for this node
            llm_context: Optional OpenRouter context

        Returns:
            Dict containing node data on success, or SkeletonCard on failure
        """
        start_time = time.perf_counter()
        success = False
        error_message = None
        node: Optional[Dict[str, Any]] = None
        model_used = llm_context.model if llm_context else None
        thinking_enabled = llm_context.thinking_enabled if llm_context else False
        thinking_effort = llm_context.thinking_effort if llm_context else None

        # Log model and thinking configuration for this content generation
        logger.info(
            f"Generating content for topic {sequence_index}: '{topic.title}' "
            f"| Model: {model_used or 'default'} "
            f"| Thinking enabled: {thinking_enabled} "
            f"| Thinking effort: {thinking_effort or 'N/A'}"
        )

        try:
            # Generate educational content
            content: GeneratedContent = await generator_agent.generate_explanation(
                topic=topic,
                prev_summary=prev_summary if prev_summary != "Start" else None,
                next_summary=next_summary if next_summary != "End" else None,
                llm_context=llm_context,
            )

            # Log thinking configuration for this generation
            logger.info(
                f"Generator completed for topic {sequence_index}: '{topic.title}' "
                f"| Model: {model_used or 'default'} "
                f"| Thinking requested: {thinking_enabled}"
            )

            # Generate quiz for the content
            quiz_set: QuizSet = await quizzer_agent.generate_quiz_set(
                topic=topic,
                content=content.content_markdown,
                quiz_count=topic.quiz_count,
                llm_context=llm_context,
            )

            logger.info(
                f"Quizzer completed for topic {sequence_index}: '{topic.title}' "
                f"| Model: {model_used or 'default'} "
                f"| Quizzes generated: {len(quiz_set.quizzes)}"
            )

            # Determine initial status (first node is VIEWING_EXPLANATION, rest are LOCKED)
            initial_status = (
                NodeStatus.VIEWING_EXPLANATION
                if sequence_index == 0
                else NodeStatus.LOCKED
            )

            # Create concept node in database
            node = learning_manager.create_concept_node(
                session_id=session_id,
                sequence_index=sequence_index,
                title=topic.title,
                content_markdown=content.content_markdown,
                status=initial_status,
                quiz_set=quiz_set,
                complexity=topic.complexity,
            )

            logger.info(
                f"Generated concept unit for topic {sequence_index}: '{topic.title}'"
            )
            success = True
        except Exception as e:
            # Return SkeletonCard for partial failure
            error_message = str(e)
            logger.error(
                f"Failed to generate concept unit for topic {sequence_index} "
                f"'{topic.title}': {e}"
            )
            node = self._create_skeleton_card(
                error=e,
                session_id=session_id,
                sequence_index=sequence_index,
                title=topic.title,
                complexity=topic.complexity,
            )
        finally:
            generation_ms = (time.perf_counter() - start_time) * 1000
            logger.info(
                "Concept unit generation completed",
                extra={
                    "session_id": session_id,
                    "topic_index": sequence_index,
                    "topic_title": topic.title,
                    "generation_ms": round(generation_ms, 2),
                    "success": success,
                },
            )

        return {
            "node": node,
            "generation_ms": generation_ms,
            "error_message": error_message,
        }

    def _process_gather_results(
        self,
        results: List[Any],
        topics: List[TopicNode],
        session_id: str,
    ) -> Tuple[List[Dict[str, Any]], float]:
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
            Tuple of processed node dicts and serial time estimate in ms
        """
        processed_nodes: List[Dict[str, Any]] = []
        generation_times: List[float] = []

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                # asyncio.gather caught an exception (shouldn't happen often
                # since _generate_concept_unit has its own try/except)
                topic = topics[i] if i < len(topics) else None
                topic_index = i
                topic_title = topic.title if topic else f"Topic {i}"

                logger.warning(
                    f"Exception during gather for topic {topic_index}: {result}"
                )

                skeleton = self._create_skeleton_card(
                    error=result,
                    session_id=session_id,
                    sequence_index=topic_index,
                    title=topic_title,
                    complexity=topic.complexity if topic else "Intermediate",
                )
                processed_nodes.append(skeleton)
                generation_times.append(0.0)

            elif isinstance(result, dict) and "node" in result:
                node = result.get("node")
                generation_ms = result.get("generation_ms", 0.0)
                if (
                    isinstance(node, dict)
                    and node.get("status") == NodeStatus.ERROR.value
                ):
                    logger.warning(
                        "SkeletonCard returned for topic",
                        extra={
                            "session_id": session_id,
                            "topic_index": node.get("sequence_index"),
                            "topic_title": node.get("title"),
                            "error_message": node.get("error_message"),
                        },
                    )
                if isinstance(node, dict):
                    processed_nodes.append(node)
                generation_times.append(float(generation_ms))

            else:
                # Unexpected result type - log and create skeleton
                logger.error(f"Unexpected result type at index {i}: {type(result)}")
                topic = topics[i] if i < len(topics) else None
                skeleton = self._create_skeleton_card(
                    error=ValueError(f"Unexpected result type: {type(result)}"),
                    session_id=session_id,
                    sequence_index=i,
                    title=topic.title if topic else f"Topic {i}",
                    complexity=topic.complexity if topic else "Intermediate",
                )
                processed_nodes.append(skeleton)
                generation_times.append(0.0)

        return processed_nodes, sum(generation_times)

    def _create_skeleton_card(
        self,
        error: Exception,
        session_id: str,
        sequence_index: int,
        title: str,
        complexity: str = "Intermediate",
    ) -> Dict[str, Any]:
        """
        Create a SkeletonCard dict for a failed generation.

        SkeletonCards represent failed concept units that can be retried.
        They contain error information and metadata for the retry mechanism.

        Args:
            error: The exception that caused the failure
            session_id: The learning session identifier
            sequence_index: The index of the failed topic
            title: The title of the failed topic
            complexity: Complexity level to persist for retry context

        Returns:
            Dict representing a SkeletonCard
        """
        placeholder_content = "Content generation failed. Retry is available."
        node = learning_manager.create_concept_node(
            session_id=session_id,
            sequence_index=sequence_index,
            title=title,
            content_markdown=placeholder_content,
            status=NodeStatus.ERROR,
            quiz=None,
            error_message=str(error),
            retry_available=True,
            complexity=complexity,
        )
        return {
            "id": node["id"],
            "learning_session_id": node["learning_session_id"],
            "sequence_index": node["sequence_index"],
            "title": node["title"],
            "content_markdown": node["content_markdown"],
            "status": node["status"],
            "error_message": node.get("error_message"),
            "retry_available": node.get("retry_available", True),
            "complexity": node.get("complexity"),
            "created_at": node["created_at"],
            "updated_at": node["updated_at"],
            "quiz": node.get("quiz"),
            "topic_index": sequence_index,
            "topic_title": title,
        }

    async def regenerate_node(
        self,
        node_id: str,
        llm_context: Optional[LLMContext] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Re-run generation for a single failed node.

        Looks up the node and its session, retrieves topic info from the node,
        re-calls generator and quizzer agents, and updates the database with
        new content.

        Args:
            node_id: The ID of the node to regenerate
            llm_context: Optional OpenRouter context

        Returns:
            Updated node dict on success, None if node not found
        """
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

            if node.get("status") != NodeStatus.ERROR.value:
                logger.warning(
                    "Node regeneration skipped; node is not in ERROR status",
                    extra={
                        "node_id": node_id,
                        "status": node.get("status"),
                    },
                )
                return None

            if not node.get("retry_available", False):
                logger.warning(
                    "Node regeneration skipped; retry not available",
                    extra={
                        "node_id": node_id,
                    },
                )
                return None

            session_id = node["learning_session_id"]
            sequence_index = node["sequence_index"]
            title = node["title"]
            previous_status = None

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
                    previous_status = other_node["status"]
                elif other_node["sequence_index"] == sequence_index + 1:
                    next_summary = other_node["title"]

            quiz_count = 1
            quiz_payload = node.get("quiz")
            if quiz_payload and isinstance(quiz_payload, dict):
                quizzes = quiz_payload.get("quizzes")
                if quizzes and isinstance(quizzes, list):
                    quiz_count = len(quizzes)

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
                llm_context=llm_context,
            )

            # Regenerate quiz
            quiz_set: QuizSet = await quizzer_agent.generate_quiz_set(
                topic=topic,
                content=content.content_markdown,
                quiz_count=quiz_count,
                llm_context=llm_context,
            )


            logger.debug(
                "Regenerated quiz set with %s quizzes for node '%s' (quiz_count=%s)",
                len(quiz_set.quizzes),
                node_id,
                quiz_count,
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
                logger.warning(f"Node not found for regeneration update: {node_id}")
                return None
            updated_node["regenerated"] = True
            return updated_node

        except Exception as e:
            logger.error(f"Failed to regenerate node {node_id}: {e}")
            return None


# Singleton instance for use throughout the application
course_orchestrator = CourseOrchestrator()
