"""
=============================================================================
FILE: planner.py
=============================================================================

PURPOSE:
Planner Agent that decomposes user learning queries into structured,
sequenced learning paths using the KLI (Knowledge-Learning-Instruction)
framework. Generates a CourseOutline with 5-7 TopicNodes that form
a coherent curriculum for retrieval-based learning. This is the first
agent in the content generation pipeline.

KEY COMPONENTS:
- PLANNER_SYSTEM_PROMPT: Detailed prompt defining curriculum design methodology
- PlannerAgent: Agent class for generating learning path outlines
- plan(): Main method to generate CourseOutline from a user query
- planner_agent: Singleton instance for application-wide use

DEPENDENCIES:
- server.agents.base.BaseAgent: Parent class providing generate() method
- server.schemas.learning.CourseOutline: Response model with course_title and topics
- KLI Framework: Pedagogical model for knowledge decomposition

USAGE PATTERN:
```python
from server.agents.planner import planner_agent

# Generate a learning path for a topic
outline = await planner_agent.plan("Newtonian Laws")
print(outline.course_title)  # "Understanding Newton's Laws of Motion"
print(len(outline.topics))   # 6

# Access individual topics
first_topic = outline.topics[0]
print(first_topic.title)  # "Forces and Motion Fundamentals"
```

ERROR HANDLING:
- Exception: Re-raised if generation fails after all retry attempts
- ValidationError: Handled internally with retry logic (inherited from BaseAgent)
- Logging: Errors logged with context for debugging

PERFORMANCE NOTES:
- Uses Gemini Pro model for higher reasoning capability in curriculum design
- Generates 5-7 topics; this range balances depth vs. learner overwhelm
- Topic prerequisites enforced: topic N only references topics 0 to N-1
- summary_for_context field is critical for downstream agent coherence

RELATED FILES:
- server/agents/base.py: BaseAgent providing inheritance and generate()
- server/schemas/learning.py: CourseOutline, TopicNode models
- server/agents/generator.py: Consumes Planner output for content generation
- server/agents/quizzer.py: Consumes Planner output for quiz generation

NOTES:
- Topics MUST be ordered with sequential indices starting from 0
- Each topic's summary_for_context is injected into Generator and Quizzer prompts
- Key terms (2-4 per topic) ensure consistent terminology across content
- Topic count is bounded (5-7) to maintain learnable chunk sizes
=============================================================================
"""

from __future__ import annotations

import logging
from typing import Optional

from server.agents.base import BaseAgent
from server.schemas.learning import CourseOutline

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

4. **5-7 Topics Optimal**: Generate between 5 and 7 sub-concepts for most queries. This provides enough depth without overwhelming learners.

5. **Summary for Context**: The `summary_for_context` field is CRITICAL. This summary will be injected into prompts for:
   - The Generator Agent (to write explanations that connect to prior topics)
   - The Quizzer Agent (to create relevant assessment questions)
   
   Write summaries that:
   - Capture the essential learning objective (1-2 sentences)
   - Include key terminology that should appear in content
   - Note any connections to adjacent topics

6. **Key Terms**: Extract 2-4 essential vocabulary terms that define the topic.

## Output Requirements

Generate a CourseOutline with:
- `course_title`: A clear, descriptive title for the learning path
- `topics`: An ordered list of TopicNode objects (minimum 5)

Each TopicNode must include:
- `index`: Sequential index starting from 0
- `title`: Short, descriptive topic title (3-6 words)
- `summary_for_context`: Context summary for downstream agents (1-2 sentences)
- `key_terms`: List of 2-4 essential vocabulary terms

## Example Decomposition

User Query: "Newtonian Laws"

Course Title: "Understanding Newton's Laws of Motion"

Topics:
1. **Index 0 - "Forces and Motion Fundamentals"**
   - Summary: "Introduces the concept of forces as interactions that cause changes in motion, establishing vocabulary for subsequent laws."
   - Key Terms: ["force", "motion", "vector", "Newton"]

2. **Index 1 - "Newton's First Law: Inertia"**
   - Summary: "Explains the principle of inertia—objects at rest stay at rest, and objects in motion stay in motion unless acted upon by an external force."
   - Key Terms: ["inertia", "equilibrium", "net force", "reference frame"]

3. **Index 2 - "Newton's Second Law: F=ma"**
   - Summary: "Quantifies the relationship between force, mass, and acceleration. Builds on inertia by showing how force overcomes it."
   - Key Terms: ["acceleration", "mass", "F=ma", "proportionality"]

4. **Index 3 - "Newton's Third Law: Action-Reaction"**
   - Summary: "Describes how forces come in pairs—every action has an equal and opposite reaction."
   - Key Terms: ["action-reaction", "force pairs", "interaction", "symmetry"]

5. **Index 4 - "Free Body Diagrams"**
   - Summary: "Visual tool for analyzing forces acting on objects. Applies all three laws to solve mechanics problems."
   - Key Terms: ["free body diagram", "normal force", "friction", "tension"]

6. **Index 5 - "Real-World Applications"**
   - Summary: "Connects Newton's laws to everyday phenomena: vehicles, sports, space travel. Synthesizes prior concepts."
   - Key Terms: ["momentum", "collision", "rocket propulsion", "friction"]

Remember: Your output directly determines the quality of the entire learning experience. Be precise, be pedagogically sound, and always prioritize learner comprehension."""


class PlannerAgent(BaseAgent):
    """
    Planner Agent for decomposing user queries into structured learning paths.

    Uses the KLI (Knowledge-Learning-Instruction) framework to break down
    complex topics into 5-7 sequenced concept nodes that form a coherent
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
    ) -> CourseOutline:
        """
        Generate a structured learning path (CourseOutline) for a user query.

        Decomposes the query into 5-7 sequenced TopicNodes following the
        KLI framework and prerequisite ordering constraints.

        Args:
            query: The user's learning query (e.g., "Newtonian Laws")
            context: Optional additional context for prompt augmentation

        Returns:
            CourseOutline containing course_title and ordered topics

        Raises:
            Exception: If generation fails after retries

        Example:
            >>> outline = await planner_agent.plan("Quantum Computing Basics")
            >>> print(outline.course_title)
            "Introduction to Quantum Computing"
            >>> print(len(outline.topics))
            6
        """
        user_message = (
            f"Create a structured learning path for the following topic:\n\n{query}"
        )

        logger.info(f"PlannerAgent generating curriculum for: {query}")

        outline = await self.generate(
            response_model=CourseOutline,
            user_message=user_message,
            context=context,
        )

        logger.info(
            f"PlannerAgent created outline: '{outline.course_title}' "
            f"with {len(outline.topics)} topics"
        )

        return outline


# Singleton instance for use throughout the application
planner_agent = PlannerAgent()
