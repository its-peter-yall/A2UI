"""
============================================================================
FILE: generator.py
LOCATION: server/agents/generator.py
============================================================================
PURPOSE:
    Generator Agent that creates engaging, pedagogically-sound
    educational content for each topic in a learning path.
ROLE IN PROJECT:
    Second agent in the content generation pipeline.
    - Receives TopicNodes from PlannerAgent
    - Produces GeneratedContent consumed by the learning UI
KEY COMPONENTS:
    - GeneratedContent: Pydantic model with content_markdown and takeaways
    - GeneratorAgent: Agent class for generating educational explanations
    - generate_explanation(): Main method with adjacent-topic context
    - generator_agent: Singleton instance for application-wide use
DEPENDENCIES:
    - External: pydantic
    - Internal: server.agents.base, server.schemas.learning
USAGE:
    ```python
    from server.agents.generator import generator_agent
    content = await generator_agent.generate_explanation(
        topic=topic, prev_summary='...', next_summary='...'
    )
    ```
============================================================================
"""

from __future__ import annotations

import logging
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from server.agents.base import BaseAgent
from server.schemas.learning import TopicNode
from server.schemas.llm import LLMContext


logger = logging.getLogger(__name__)


class GeneratedContent(BaseModel):
    """Output model for generated educational content."""

    model_config = ConfigDict(from_attributes=True, extra="allow")

    content_markdown: str = Field(
        ...,
        description="The full educational content in Markdown format",
        min_length=300,
    )
    key_takeaways: List[str] = Field(
        ...,
        description="3-5 key takeaways the learner should remember",
        min_length=3,
        max_length=5,
    )
    thinking_content: Optional[str] = Field(
        default=None,
        description="Thinking/reasoning content from models that support it (e.g., Claude)",
    )


GENERATOR_SYSTEM_PROMPT = """You are an expert educational content creator specializing in engaging, learner-centered explanations.

## Your Role
Your goal is to create concise, targeted explanations that maximize comprehension and retention. You transform abstract concepts into clear, memorable content using analogies, examples, and active learning prompts.

## Content Guidelines

### Depth and Thoroughness
- There is NO word limit. Adjust depth naturally based on topic complexity
- Simple concepts may need 2-3 paragraphs. Complex topics may need multiple pages
- Complex topics require meticulous explanation with trivial, real-world examples
- Use multiple examples and analogies — one example is rarely enough for complex ideas
- Address common misconceptions explicitly — this prevents lingering doubts
- The learner should finish each topic with ZERO remaining confusion
- The goal is expert-level understanding, not surface-level overview

### Pedagogical Framework (5E Model)
Structure your explanations using this proven educational approach:

1. **Engage**: Open with a hook—a relatable scenario, surprising fact, or thought-provoking question
2. **Explore**: Present the core concept with clear examples and analogies
3. **Explain**: Define key terminology and relationships precisely
4. **Elaborate**: Show how this concept connects to prior knowledge or real-world applications
5. **Evaluate**: End with a reflection prompt or check-for-understanding question

### Context Injection for Narrative Coherence
You will receive context about adjacent topics in the learning path:
- **Previous Topic Summary**: Bridge from this concept—assume the learner just finished it
- **Next Topic Summary**: Foreshadow this concept—create anticipation for what's coming

Use these summaries to:
- Reference prior knowledge ("Building on what we learned about...")
- Create smooth transitions ("Now that we understand X, let's explore Y...")
- Plant seeds for upcoming concepts ("This foundation will be essential when we...")

### Scaffolding Principles
- **Build on prior knowledge**: Assume the learner has completed previous topics
- **Start simple, increase complexity**: Lead with intuition before formalism
- **Chunk information**: Break complex ideas into digestible pieces
- **Use concrete before abstract**: Examples first, then generalizations

### Active Learning Integration
- Include **1-2 reflection prompts** within the content (e.g., "Think about...", "Consider why...")
- Pose questions that encourage the learner to pause and think
- Avoid passive consumption—make the learner an active participant

### Markdown Formatting Requirements
Structure your content for readability:
- Use **headers** (##, ###) to organize sections
- **Bold** key terms when first introduced
- Use *italics* for emphasis on important points
- Create **bulleted lists** for key points or examples
- Keep paragraphs short (3-4 sentences maximum)

### Tone and Voice
- Be **enthusiastic and encouraging**—learning should feel exciting
- Use "you" and "we" to create connection
- Avoid jargon unless defining it as a key term
- Be precise but approachable—like a knowledgeable friend explaining

## Topic Summary and Curiosity Spark

After the main content and key takeaways, end each topic with:

1. **Summary**: A brief recap of what was covered — the 3-5 most important ideas restated concisely. This reinforces learning and gives the learner a quick reference.

2. **Curiosity Spark**: End with 2-3 open-ended, thought-provoking questions that:
   - Connect the topic to the learner's real world
   - Hint at deeper complexities not yet covered
   - Create genuine wonder and desire to explore further
   - These questions should be phrased naturally, as if a curious learner would ask them

Example ending:
> ### Summary
> In this topic, you learned how neural networks adjust weights through backpropagation. The key ideas were: (1) the chain rule enables gradient computation, (2) gradients flow backward from output to input, (3) learning rate controls step size, and (4) vanishing gradients are a real challenge for deep networks.
>
> ### Curious to explore more?
> - How do neural networks decide which weights to adjust first?
> - What happens when a network gets stuck in a local minimum?
> - Can backpropagation work with non-differentiable functions?

## Key Takeaways Generation
After generating content, extract **3-5 key takeaways**:
- Each should be a single, memorable sentence
- Focus on the most important concepts
- These serve as quick review points for the learner

## Example Content Structure

```markdown
## [Topic Title]

[Hook: Engaging opening question or scenario]

### Understanding [Core Concept]

[Clear explanation with analogy or example]

**Key Term**: [Definition]

[Deeper exploration with examples]

> Think about: [Reflection prompt]

### Connecting the Dots

[How this relates to previous/next topics]

### Key Points

- [Bullet point 1]
- [Bullet point 2]
- [Bullet point 3]

### Summary
[Brief recap of the 3-5 most important ideas from this topic]

### Curious to explore more?
- [Open-ended question 1 that sparks deeper interest]
- [Open-ended question 2 connecting to real-world applications]
- [Open-ended question 3 hinting at advanced concepts]
```

Remember: Your content will be read by learners eager to understand. Leave them feeling like an expert on this topic — with zero remaining doubts and genuine curiosity to explore further."""


class GeneratorAgent(BaseAgent):
    """
    Generator Agent for creating educational content with context injection.

    Produces engaging, pedagogically-sound explanations for each topic in a
    learning path. Uses context from adjacent topics (prev_summary, next_summary)
    to maintain narrative coherence throughout the course.

    The Generator is the second agent in the pipeline. It receives TopicNodes
    from the Planner and produces GeneratedContent for display to learners.
    """

    def __init__(self) -> None:
        """Initialize the GeneratorAgent with the 'generator' role."""
        super().__init__(role="generator")
        logger.debug("GeneratorAgent initialized")

    @property
    def system_prompt(self) -> str:
        """
        Return the system prompt for the Generator Agent.

        The prompt defines the agent's role as an educational content creator,
        specifies formatting requirements, and provides pedagogical guidelines.

        Returns:
            The GENERATOR_SYSTEM_PROMPT constant
        """
        return GENERATOR_SYSTEM_PROMPT

    async def generate_explanation(
        self,
        topic: TopicNode,
        prev_summary: Optional[str] = None,
        next_summary: Optional[str] = None,
        llm_context: Optional[LLMContext] = None,
    ) -> GeneratedContent:
        """
        Generate educational content for a topic with context injection.

        Injects context from adjacent topics to maintain narrative coherence
        across the learning path. The prev_summary helps bridge from prior
        knowledge, while next_summary enables foreshadowing.

        Args:
            topic: The TopicNode to generate content for
            prev_summary: Summary of the previous topic (None if first topic)
            next_summary: Summary of the next topic (None if last topic)
            llm_context: Optional OpenRouter context

        Returns:
            GeneratedContent containing content_markdown and key_takeaways

        Raises:
            Exception: If generation fails after retries
        """
        # Build the user message with context injection
        user_message = self._build_user_message(
            topic, prev_summary, next_summary
        )

        logger.info(
            f"GeneratorAgent generating content for topic {topic.index}: "
            f"'{topic.title}'"
        )

        content = await self.generate(
            response_model=GeneratedContent,
            user_message=user_message,
            llm_context=llm_context,
        )

        logger.info(
            f"GeneratorAgent created content for '{topic.title}' "
            f"with {len(content.key_takeaways)} takeaways"
        )


        return content

    def _build_user_message(
        self,
        topic: TopicNode,
        prev_summary: Optional[str],
        next_summary: Optional[str],
    ) -> str:
        """
        Build the user message with context injection from adjacent topics.

        Args:
            topic: The TopicNode to generate content for
            prev_summary: Summary of the previous topic
            next_summary: Summary of the next topic

        Returns:
            Formatted user message with context injected
        """
        parts = [
            f"Create educational content for the following topic:\n",
            f"## Topic: {topic.title}",
            f"**Summary**: {topic.summary_for_context}",
            f"**Key Terms to Emphasize**: {', '.join(topic.key_terms)}",
        ]

        # Context injection section
        parts.append("\n## Adjacent Topic Context")

        if prev_summary:
            parts.append(
                f"\n**Previous Topic Summary**: {prev_summary}\n"
                f"- Bridge this explanation from the previous topic\n"
                f"- Assume the learner just completed this content"
            )
        else:
            parts.append(
                "\n**Previous Topic**: None (this is the first topic)\n"
                "- This is the learner's entry point\n"
                "- Provide foundational context and motivate the learning journey"
            )

        if next_summary:
            parts.append(
                f"\n**Next Topic Summary**: {next_summary}\n"
                f"- Foreshadow the next topic in your closing\n"
                f"- Create anticipation for what's coming next"
            )
        else:
            parts.append(
                "\n**Next Topic**: None (this is the final topic)\n"
                "- This is the concluding topic\n"
                "- Synthesize the learning journey and celebrate completion"
            )

        parts.append(
            "\n## Requirements"
            "\n- Target 300-500 words (2-3 minutes reading time)"
            "\n- Use the 5E pedagogical model"
            "\n- Include 1-2 reflection prompts"
            "\n- Bold all key terms"
            "\n- Extract 3-5 key takeaways"
        )

        return "\n".join(parts)


# Singleton instance for use throughout the application
generator_agent = GeneratorAgent()
