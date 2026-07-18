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
from typing import Literal, Optional

from server.agents.base import BaseAgent
from server.schemas.learning import (
    CourseOutline,
    MODE_TOPIC_BOUNDS,
    validate_topic_count_for_mode,
)
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

4. **Mode Constraints** (authoritative for topic count — override any other count guidance):
{mode_template}

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
- `topics`: An ordered list of TopicNode objects (count MUST follow Mode Constraints)

Each TopicNode must include:
- `index`: Sequential index starting from 0
- `title`: Short, descriptive topic title (3-6 words)
- `summary_for_context`: Context summary for downstream agents (1-2 sentences)
- `key_terms`: List of 2-4 essential vocabulary terms
- `complexity`: Complexity rating (Basic, Intermediate, or Advanced) based on the assessment criteria above
- `quiz_count`: Number of quizzes (1-5) based on the quiz count mapping above

## Example: Simple Query Decomposition

User Query: "Photosynthesis"

Course Title: "Understanding Photosynthesis"

Topics (6):
1. **Index 0 - "What is Photosynthesis?"**
   - Summary: "Introduces photosynthesis as the process by which plants convert light energy into chemical energy, establishing foundational vocabulary."
   - Key Terms: ["photosynthesis", "chlorophyll", "glucose", "carbon dioxide"]
   - Complexity: "Basic"
   - Quiz Count: 1

2. **Index 1 - "Light-Dependent Reactions"**
   - Summary: "Explains how light energy is captured and converted into ATP and NADPH in the thylakoid membrane."
   - Key Terms: ["ATP", "NADPH", "thylakoid", "electron transport chain"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

3. **Index 2 - "The Calvin Cycle"**
   - Summary: "Describes the light-independent reactions where CO2 is fixed into glucose using ATP and NADPH."
   - Key Terms: ["Calvin cycle", "RuBisCO", "G3P", "carbon fixation"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

4. **Index 3 - "Chloroplast Structure and Function"**
   - Summary: "Maps the physical structure of chloroplasts to their functional roles in photosynthesis."
   - Key Terms: ["chloroplast", "stroma", "grana", "double membrane"]
   - Complexity: "Basic"
   - Quiz Count: 1

5. **Index 4 - "Factors Affecting Photosynthesis"**
   - Summary: "Analyzes how light intensity, CO2 concentration, and temperature affect the rate of photosynthesis."
   - Key Terms: ["limiting factor", "light intensity", "compensation point", "saturation"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

6. **Index 5 - "Photosynthesis in the Global Carbon Cycle"**
   - Summary: "Connects photosynthesis to global carbon cycling, climate, and ecosystem energy flow."
   - Key Terms: ["carbon cycle", "primary producer", "biomass", "ecosystem"]
   - Complexity: "Advanced"
   - Quiz Count: 3

## Example: Complex Query Decomposition

User Query: "Quantum Computing"

Course Title: "Quantum Computing: From Fundamentals to Architecture"

Topics (20):
1. **Index 0 - "Classical Bits vs Quantum Bits"**
   - Summary: "Contrasts classical binary computing with quantum computing fundamentals."
   - Key Terms: ["bit", "qubit", "binary", "quantum state"]
   - Complexity: "Basic"
   - Quiz Count: 1

2. **Index 1 - "Qubits and Superposition"**
   - Summary: "Explains how qubits can exist in multiple states simultaneously through superposition."
   - Key Terms: ["superposition", "probability amplitude", "Bloch sphere", "basis state"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

3. **Index 2 - "Quantum Entanglement"**
   - Summary: "Describes how qubits can be correlated in ways that have no classical equivalent."
   - Key Terms: ["entanglement", "Bell state", "non-locality", "correlation"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

4. **Index 3 - "Dirac Notation and Quantum States"**
   - Summary: "Introduces the mathematical formalism used to represent quantum states."
   - Key Terms: ["ket", "bra", "inner product", "state vector"]
   - Complexity: "Basic"
   - Quiz Count: 1

5. **Index 4 - "Single-Qubit Gates"**
   - Summary: "Covers the fundamental quantum gates that operate on individual qubits."
   - Key Terms: ["Pauli-X", "Hadamard", "rotation gate", "unitary"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

6. **Index 5 - "Multi-Qubit Gates"**
   - Summary: "Explains CNOT, Toffoli, and other gates that create entanglement between qubits."
   - Key Terms: ["CNOT", "Toffoli", "controlled gate", "entangling gate"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

7. **Index 6 - "Quantum Circuits and Diagrams"**
   - Summary: "Teaches how to read and construct quantum circuit diagrams."
   - Key Terms: ["quantum circuit", "wire", "measurement", "circuit depth"]
   - Complexity: "Intermediate"
   - Quiz Count: 2

8. **Index 7 - "Measurement and Probability"**
   - Summary: "Explains how quantum measurement collapses superposition to classical outcomes."
   - Key Terms: ["measurement", "collapse", "Born rule", "probability"]
   - Complexity: "Basic"
   - Quiz Count: 1

9. **Index 8 - "No-Cloning Theorem"**
   - Summary: "Proves why quantum states cannot be perfectly copied and its implications."
   - Key Terms: ["no-cloning", "unitarity", "quantum cryptography", "copy"]
   - Complexity: "Advanced"
   - Quiz Count: 3

10. **Index 9 - "Quantum Interference"**
    - Summary: "Shows how interference enables quantum algorithms to amplify correct answers."
    - Key Terms: ["interference", "constructive", "destructive", "amplitude amplification"]
    - Complexity: "Advanced"
    - Quiz Count: 3

11. **Index 10 - "Deutsch-Jozsa Algorithm"**
    - Summary: "Presents the first quantum algorithm demonstrating exponential speedup over classical."
    - Key Terms: ["Deutsch-Jozsa", "oracle", "exponential speedup", "balanced function"]
    - Complexity: "Advanced"
    - Quiz Count: 3

12. **Index 11 - "Grover's Search Algorithm"**
    - Summary: "Explains quadratic speedup for unstructured search using amplitude amplification."
    - Key Terms: ["Grover's algorithm", "oracle", "diffusion operator", "quadratic speedup"]
    - Complexity: "Advanced"
    - Quiz Count: 4

13. **Index 12 - "Shor's Factoring Algorithm"**
    - Summary: "Describes the quantum algorithm for integer factorization with exponential speedup."
    - Key Terms: ["Shor's algorithm", "period finding", "quantum Fourier transform", "RSA"]
    - Complexity: "Advanced"
    - Quiz Count: 4

14. **Index 13 - "Quantum Error Correction"**
    - Summary: "Introduces the need for error correction and the principles behind quantum error correcting codes."
    - Key Terms: ["quantum error correction", "syndrome", "logical qubit", "noise"]
    - Complexity: "Advanced"
    - Quiz Count: 3

15. **Index 14 - "Surface Codes and Logical Qubits"**
    - Summary: "Explains the leading error correction approach using surface codes."
    - Key Terms: ["surface code", "topological", "threshold theorem", "stabilizer"]
    - Complexity: "Advanced"
    - Quiz Count: 4

16. **Index 15 - "Quantum Noise and Decoherence"**
    - Summary: "Describes how environmental interactions cause quantum information to degrade."
    - Key Terms: ["decoherence", "T1", "T2", "noise channel"]
    - Complexity: "Intermediate"
    - Quiz Count: 2

17. **Index 16 - "NISQ Devices and Limitations"**
    - Summary: "Covers the current state of noisy intermediate-scale quantum computers."
    - Key Terms: ["NISQ", "noise", "limited depth", "variational algorithm"]
    - Complexity: "Advanced"
    - Quiz Count: 3

18. **Index 17 - "Quantum Supremacy vs Advantage"**
    - Summary: "Distinguishes between quantum supremacy and practical quantum advantage."
    - Key Terms: ["quantum supremacy", "quantum advantage", "benchmark", "practical utility"]
    - Complexity: "Advanced"
    - Quiz Count: 3

19. **Index 18 - "Topological Quantum Computing"**
    - Summary: "Explores an alternative approach using topological states for inherently protected qubits."
    - Key Terms: ["topological", "anyon", "braiding", "fault-tolerant"]
    - Complexity: "Advanced"
    - Quiz Count: 4

20. **Index 19 - "Quantum Computing Applications"**
    - Summary: "Surveys real-world applications: cryptography, drug discovery, optimization, machine learning."
    - Key Terms: ["cryptography", "optimization", "drug discovery", "machine learning"]
    - Complexity: "Advanced"
    - Quiz Count: 3

Remember: Your output directly determines the quality of the entire learning experience. Be precise, be pedagogically sound, and always prioritize learner comprehension. When in doubt, decompose further — more focused topics always beat fewer overloaded ones."""


LITE_TEMPLATE = """
You are in LITE mode.
- Produce between 3 and 10 topics (inclusive).
- Prefer 3–7 for very small concepts; use up to 10 only if needed for clarity.
- Favor Basic/Intermediate complexity; Advanced only if essential.
- Prefer quiz_count 1–2.
- Goal: complete coverage of a narrow subject without over-expansion.
"""

FULL_TEMPLATE = """
You are in FULL mode.
- Produce between 10 and 30 topics (inclusive).
- Prefer atomic, granular topics for complete mastery.
- Use varied complexity (Basic → Intermediate → Advanced).
- Map quiz_count to complexity as in base rules.
- Goal: thorough near-expert path with no foundational gaps.
"""

MODE_TEMPLATES: dict[str, str] = {
    "lite": LITE_TEMPLATE.strip(),
    "full": FULL_TEMPLATE.strip(),
}


class OutlineTopicCountError(ValueError):
    """Raised when course outline topic count is outside mode bounds."""

    def __init__(
        self,
        mode: str,
        count: int,
        min_topics: int,
        max_topics: int,
    ) -> None:
        self.mode = mode
        self.count = count
        self.min_topics = min_topics
        self.max_topics = max_topics
        super().__init__(
            f"Course outline has {count} topics; {mode} mode requires "
            f"{min_topics}-{max_topics} topics"
        )


def build_planner_system_prompt(mode: Literal["lite", "full"]) -> str:
    """Return base planner prompt with mode template injected."""
    template = MODE_TEMPLATES[mode]
    marker = "{mode_template}"
    if marker not in PLANNER_SYSTEM_PROMPT:
        return (
            f"{PLANNER_SYSTEM_PROMPT}\n\n## Mode Constraints\n{template}"
        )
    return PLANNER_SYSTEM_PROMPT.replace(marker, template)


class PlannerAgent(BaseAgent):
    """
    Planner Agent for decomposing user queries into structured learning paths.

    Uses the KLI (Knowledge-Learning-Instruction) framework to break down
    complex topics into sequenced concept nodes that form a coherent
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
        mode: Literal["lite", "full"] = "full",
    ) -> CourseOutline:
        """Generate CourseOutline for query under resolved depth mode.

        Args:
            query: User learning query.
            context: Optional prompt context.
            llm_context: OpenRouter/provider context.
            mode: Resolved depth mode (lite or full). Never auto.

        Returns:
            Valid CourseOutline within mode topic bounds.

        Raises:
            OutlineTopicCountError: After one replan still out of bounds.
            Exception: Upstream generation failures.
        """
        if mode not in MODE_TEMPLATES:
            raise ValueError(f"Invalid planner mode: {mode}")

        system_prompt = build_planner_system_prompt(mode)
        user_message = (
            "Create a structured learning path for the following topic:\n\n"
            f"{query}\n\n"
            f"Mode: {mode}. Follow Mode Constraints for topic count."
        )

        logger.info(
            "PlannerAgent generating curriculum for: %s (mode=%s)",
            query,
            mode,
        )

        outline = await self._generate_outline(
            system_prompt=system_prompt,
            user_message=user_message,
            context=context,
            llm_context=llm_context,
        )

        if validate_topic_count_for_mode(outline, mode):
            logger.info(
                "PlannerAgent created outline: '%s' with %s topics",
                outline.course_title,
                len(outline.topics),
            )
            return outline

        min_t, max_t = MODE_TOPIC_BOUNDS[mode]
        count = len(outline.topics)
        logger.warning(
            "Outline topic count %s out of bounds for %s (%s-%s); replan",
            count,
            mode,
            min_t,
            max_t,
        )
        replan_message = (
            f"{user_message}\n\n"
            f"STRICT MODE CONSTRAINTS: You previously produced {count} "
            f"topics. You MUST produce between {min_t} and {max_t} "
            f"topics inclusive for {mode} mode. No fewer, no more."
        )
        outline = await self._generate_outline(
            system_prompt=system_prompt,
            user_message=replan_message,
            context=context,
            llm_context=llm_context,
        )

        if validate_topic_count_for_mode(outline, mode):
            logger.info(
                "PlannerAgent replan ok: '%s' with %s topics",
                outline.course_title,
                len(outline.topics),
            )
            return outline

        final_count = len(outline.topics)
        raise OutlineTopicCountError(mode, final_count, min_t, max_t)

    async def _generate_outline(
        self,
        system_prompt: str,
        user_message: str,
        context: Optional[dict],
        llm_context: Optional[LLMContext],
    ) -> CourseOutline:
        """Generate outline using an explicit system prompt override."""
        original_build = self._build_system_prompt

        def _build_override(
            ctx: Optional[dict] = None,
        ) -> str:
            base = system_prompt
            if ctx:
                return f"{base}\n\n{self._format_context(ctx)}"
            return base

        self._build_system_prompt = _build_override  # type: ignore[method-assign]
        try:
            return await self.generate(
                response_model=CourseOutline,
                user_message=user_message,
                context=context,
                llm_context=llm_context,
            )
        finally:
            self._build_system_prompt = original_build  # type: ignore[method-assign]



def validate_complexity_distribution(
    outline: CourseOutline,
) -> dict:
    """Validate complexity distribution and quiz_count correlation
    in a CourseOutline.

    Detects degenerate LLM outputs where all topics share the same
    complexity rating or quiz_count values don't match their
    complexity band. Returns actionable diagnostics for the
    LangGraph course graph to decide whether to accept or retry.

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
