"""
============================================================================
FILE: planner.py
LOCATION: server/agents/planner.py
============================================================================
PURPOSE:
    Planner Agent that decomposes user learning queries into
    structured, sequenced learning paths using the KLI framework.
ROLE IN PROJECT:
    First agent in the content generation pipeline.
    - Generates CourseOutline consumed by Generator and Quizzer
    - Applies KLI framework for pedagogically-sound curriculum design
KEY COMPONENTS:
    - PlannerAgent: Agent class for generating learning path outlines
    - plan(): Main method to generate CourseOutline from a user query
    - validate_complexity_distribution(): Validates topic complexity spread
    - planner_agent: Singleton instance for application-wide use
DEPENDENCIES:
    - External: None
    - Internal: server.agents.base, server.schemas.learning
USAGE:
    ```python
    from server.agents.planner import planner_agent
    outline = await planner_agent.plan('Newtonian Laws')
    print(outline.course_title)
    ```
============================================================================
"""

from __future__ import annotations

import logging
from typing import Optional

from server.agents.base import BaseAgent
from server.schemas.learning import CourseOutline
from server.schemas.llm import LLMContext


logger = logging.getLogger(__name__)


PLANNER_SYSTEM_PROMPT = """You are an expert instructional designer and curriculum architect specializing in retrieval-based learning methodologies.

## Your Role
Your goal is to decompose complex user queries into structured, sequential learning paths that maximize knowledge retention through active recall. You apply the Knowledge-Learning-Instruction (KLI) framework to design effective educational experiences.

## The KLI Framework

The Knowledge-Learning-Instruction framework guides your curriculum design:

1. **Knowledge Components (KCs)**: Identify atomic units of information that form the building blocks of understanding. Each topic should represent a single, focused concept.

2. **Learning Events**: Structure topics so learners build knowledge incrementally. Earlier topics provide scaffolding for later ones.

3. **Assessment Readiness**: Each topic should be self-contained enough that a learner can be tested on it immediately after studying.

## Decomposition Guidelines

When breaking down a user's query into sub-concepts:

1. **Hierarchical Decomposition**: Start with foundational concepts and progress to advanced applications. Think: "What must be understood first?"

2. **Prerequisite Ordering**: Every topic at index N should only require knowledge from topics 0 through N-1. Never reference forward concepts.

3. **Atomic Focus**: Each topic should cover ONE key idea. If a topic has multiple sub-components, it should be split.

4. **Minimum 5 Topics, No Upper Limit**: Generate at least 5 sub-concepts. Complex domains may require 15-20 topics for proper depth. Do not artificially limit breadth.

5. **Summary for Context**: The `summary_for_context` field is CRITICAL. This summary will be injected into prompts for:
   - The Generator Agent (to write explanations that connect to prior topics)
   - The Quizzer Agent (to create relevant assessment questions)
   
   Write summaries that:
   - Capture the essential learning objective (1-2 sentences)
   - Include key terminology that should appear in content
   - Note any connections to adjacent topics

6. **Key Terms**: Extract 2-4 essential vocabulary terms that define the topic.

## Complexity Assessment

Assess each topic's inherent complexity and assign one of three ratings:

- **Basic**: Vocabulary, definitions, straightforward facts, introductory concepts that establish terminology. Example: "What is a force?" or "Defining key terms."
- **Intermediate**: Processes, cause-and-effect relationships, comparisons, multi-factor concepts. Example: "How does acceleration relate to force and mass?" or "Comparing elastic vs inelastic collisions."
- **Advanced**: Deep synthesis, multi-step reasoning, counter-intuitive concepts, abstract theory requiring integration of multiple prior topics. Example: "Deriving orbital mechanics from Newton's laws" or "Quantum tunneling paradoxes."

A well-designed learning path should have VARIED complexity — typically starting with Basic foundational topics, progressing through Intermediate process topics, and ending with Advanced synthesis topics. Not all topics should have the same rating.

## Quiz Count Mapping

Map each topic's complexity to a quiz_count value:

- **Basic** → `quiz_count: 1` — Single recall quiz sufficient for definitions and facts
- **Intermediate** → `quiz_count: 2` or `quiz_count: 3` — Multiple quizzes test understanding of processes and relationships
- **Advanced** → `quiz_count: 3`, `quiz_count: 4`, or `quiz_count: 5` — Progressive quiz chain tests depth: recall → application → synthesis

The quiz_count determines how many assessment questions the learner must pass before mastering the topic. Higher counts create a difficulty gradient following Bloom's taxonomy (Recall → Application → Synthesis).

## Output Requirements

Generate a CourseOutline with:
- `course_title`: A clear, descriptive title for the learning path
- `topics`: An ordered list of TopicNode objects (minimum 5)

Each TopicNode must include:
- `index`: Sequential index starting from 0
- `title`: Short, descriptive topic title (3-6 words)
- `summary_for_context`: Context summary for downstream agents (1-2 sentences)
- `key_terms`: List of 2-4 essential vocabulary terms
- `complexity`: Complexity rating (Basic, Intermediate, or Advanced) based on the assessment criteria above
- `quiz_count`: Number of quizzes (1-5) based on the quiz count mapping above

## Example Decomposition

User Query: "Newtonian Laws"

Course Title: "Understanding Newton's Laws of Motion"

Topics:
1. **Index 0 - "Forces and Motion Fundamentals"**
   - Summary: "Introduces the concept of forces as interactions that cause changes in motion, establishing vocabulary for subsequent laws."
   - Key Terms: ["force", "motion", "vector", "Newton"]
   - Complexity: "Basic"
   - Quiz Count: 1

2. **Index 1 - "Newton's First Law: Inertia"**
   - Summary: "Explains the principle of inertia—objects at rest stay at rest, and objects in motion stay in motion unless acted upon by an external force."
   - Key Terms: ["inertia", "equilibrium", "net force", "reference frame"]
   - Complexity: "Basic"
   - Quiz Count: 1

3. **Index 2 - "Newton's Second Law: F=ma"**
   - Summary: "Quantifies the relationship between force, mass, and acceleration. Builds on inertia by showing how force overcomes it."
   - Key Terms: ["acceleration", "mass", "F=ma", "proportionality"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

4. **Index 3 - "Newton's Third Law: Action-Reaction"**
   - Summary: "Describes how forces come in pairs—every action has an equal and opposite reaction."
   - Key Terms: ["action-reaction", "force pairs", "interaction", "symmetry"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

5. **Index 4 - "Free Body Diagrams"**
   - Summary: "Visual tool for analyzing forces acting on objects. Applies all three laws to solve mechanics problems."
   - Key Terms: ["free body diagram", "normal force", "friction", "tension"]
   - Complexity: "Advanced"
   - Quiz Count: 3

6. **Index 5 - "Real-World Applications"**
   - Summary: "Connects Newton's laws to everyday phenomena: vehicles, sports, space travel. Synthesizes prior concepts."
   - Key Terms: ["momentum", "collision", "rocket propulsion", "friction"]
   - Complexity: "Advanced"
   - Quiz Count: 4

Remember: Your output directly determines the quality of the entire learning experience. Be precise, be pedagogically sound, and always prioritize learner comprehension."""


class PlannerAgent(BaseAgent):
    """
    Planner Agent for decomposing user queries into structured learning paths.

    Uses the KLI (Knowledge-Learning-Instruction) framework to break down
    complex topics into sequenced concept nodes (minimum 5) that form a coherent
    curriculum for retrieval-based learning.

    The Planner is the first agent in the generation pipeline. Its output
    (CourseOutline) is consumed by the Generator and Quizzer agents to
    produce content and assessments for each topic node.
    """

    def __init__(self) -> None:
        """Initialize the PlannerAgent with the 'planner' role."""
        super().__init__(role="planner")
        logger.debug("PlannerAgent initialized")

    @property
    def system_prompt(self) -> str:
        """
        Return the system prompt for the Planner Agent.

        The prompt defines the agent's role as an instructional designer,
        explains the KLI framework, and provides decomposition guidelines.

        Returns:
            The PLANNER_SYSTEM_PROMPT constant
        """
        return PLANNER_SYSTEM_PROMPT

    async def plan(
        self,
        query: str,
        context: Optional[dict] = None,
        llm_context: Optional[LLMContext] = None,
    ) -> CourseOutline:
        """
        Generate a structured learning path (CourseOutline) for a user query.

        Decomposes the query into sequenced TopicNodes (minimum 5) following the
        KLI framework and prerequisite ordering constraints.

        Args:
            query: The user's learning query (e.g., "Newtonian Laws")
            context: Optional additional context for prompt augmentation
            llm_context: Optional OpenRouter context

        Returns:
            CourseOutline containing course_title and ordered topics

        Raises:
            Exception: If generation fails after retries
        """
        user_message = (
            "Create a structured learning path for the following topic:\n\n"
            f"{query}"
        )

        logger.info(f"PlannerAgent generating curriculum for: {query}")

        outline = await self.generate(
            response_model=CourseOutline,
            user_message=user_message,
            context=context,
            llm_context=llm_context,
        )

        logger.info(
            f"PlannerAgent created outline: '{outline.course_title}' "
            f"with {len(outline.topics)} topics"
        )

        return outline



def validate_complexity_distribution(
    outline: CourseOutline,
) -> dict:
    """Validate complexity distribution and quiz_count correlation
    in a CourseOutline.

    Detects degenerate LLM outputs where all topics share the same
    complexity rating or quiz_count values don't match their
    complexity band. Returns actionable diagnostics for the
    CourseOrchestrator to decide whether to accept or retry.

    Args:
        outline: A CourseOutline with topics containing complexity
            and quiz_count fields.

    Returns:
        Dict with keys:
            valid (bool): True if distribution is acceptable.
            warnings (list[str]): Non-blocking issues.
            errors (list[str]): Blocking issues.
            distribution (dict): Count per complexity level,
                e.g. {"Basic": 2, "Intermediate": 2, "Advanced": 2}.

    Example:
        >>> result = validate_complexity_distribution(outline)
        >>> if not result["valid"]:
        ...     for err in result["errors"]:
        ...         logger.error(err)
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Build distribution counts
    distribution: dict[str, int] = {
        "Basic": 0,
        "Intermediate": 0,
        "Advanced": 0,
    }
    for topic in outline.topics:
        if topic.complexity in distribution:
            distribution[topic.complexity] += 1

    total = len(outline.topics)

    # --- Error checks ---

    # 1. Uniform complexity: all topics same rating
    unique_complexities = {t.complexity for t in outline.topics}
    if len(unique_complexities) == 1:
        only = next(iter(unique_complexities))
        errors.append(
            f"All {total} topics have complexity "
            f"'{only}' — expected varied distribution"
        )

    # 2. Quiz count out of range for complexity band
    for topic in outline.topics:
        if topic.complexity == "Basic" and topic.quiz_count != 1:
            errors.append(
                f"Topic '{topic.title}' is Basic but has "
                f"quiz_count={topic.quiz_count} (expected 1)"
            )
        elif topic.complexity == "Intermediate" and (
            topic.quiz_count < 2 or topic.quiz_count > 3
        ):
            errors.append(
                f"Topic '{topic.title}' is Intermediate but has "
                f"quiz_count={topic.quiz_count} (expected 2-3)"
            )
        elif topic.complexity == "Advanced" and (
            topic.quiz_count < 3 or topic.quiz_count > 5
        ):
            errors.append(
                f"Topic '{topic.title}' is Advanced but has "
                f"quiz_count={topic.quiz_count} (expected 3-5)"
            )

    # --- Warning checks ---

    # 1. Skewed distribution: >80% same complexity
    if len(unique_complexities) > 1:
        for level, count in distribution.items():
            if total > 0 and (count / total) >= 0.8:
                pct = round((count / total) * 100)
                warnings.append(
                    f"{pct}% of topics are '{level}' — consider more variety"
                )

    valid = len(errors) == 0

    return {
        "valid": valid,
        "warnings": warnings,
        "errors": errors,
        "distribution": distribution,
    }


# Singleton instance for use throughout the application
planner_agent = PlannerAgent()
