"""
=============================================================================
FILE: __init__.py
=============================================================================

PURPOSE:
Package initialization and exports for the agents module. Provides a clean
public API for importing agent classes and singleton instances used throughout
the adaptive learning system. Coordinates the three-agent pipeline: Plan ->
Generate -> Quiz.

KEY COMPONENTS:
- BaseAgent: Abstract base class for all agent implementations
- PlannerAgent: Decomposes queries into learning path outlines
- GeneratorAgent: Creates educational content for each topic
- QuizzerAgent: Generates diagnostic assessment questions
- Singleton instances: planner_agent, generator_agent, quizzer_agent
- GeneratedContent: Pydantic model for Generator output

DEPENDENCIES:
- server.agents.base: BaseAgent abstract class
- server.agents.planner: PlannerAgent and singleton
- server.agents.generator: GeneratorAgent, GeneratedContent, singleton
- server.agents.quizzer: QuizzerAgent and singleton

USAGE PATTERN:
```python
# Import specific agents as needed
from server.agents import (
    PlannerAgent,     # For curriculum design
    GeneratorAgent,   # For content creation
    QuizzerAgent,     # For assessment generation
    BaseAgent,        # For creating custom agents
)

# Or use pre-configured singletons
from server.agents import planner_agent, generator_agent, quizzer_agent

# Pipeline usage
outline = await planner_agent.plan("Python Basics")
content = await generator_agent.generate_explanation(topic, prev, next)
quiz = await quizzer_agent.generate_quiz(topic, content_markdown)
```

ERROR HANDLING:
- Import errors: Ensure all dependencies are installed (pydantic, instructor)
- All agent methods may raise Exception on generation failure

PERFORMANCE NOTES:
- Singleton instances avoid repeated agent initialization
- Each agent handles its own retry logic internally
- Pipeline is sequential: Plan -> Generate -> Quiz (not parallelizable)

RELATED FILES:
- server/agents/base.py: BaseAgent abstract class
- server/agents/planner.py: PlannerAgent implementation
- server/agents/generator.py: GeneratorAgent implementation
- server/agents/quizzer.py: QuizzerAgent implementation
- server/services/course_orchestrator.py: Orchestrates the agent pipeline

NOTES:
- All public classes exported via __all__ for clean imports
- GeneratorAgent also exports GeneratedContent for type hints
- Singleton instances are pre-initialized for convenience
- Agent pipeline order: Planner -> Generator -> Quizzer
=============================================================================
"""

from server.agents.base import BaseAgent
from server.agents.generator import GeneratedContent, GeneratorAgent, generator_agent
from server.agents.planner import PlannerAgent, planner_agent
from server.agents.quizzer import QuizzerAgent, quizzer_agent

__all__ = [
    "BaseAgent",
    "GeneratedContent",
    "GeneratorAgent",
    "generator_agent",
    "PlannerAgent",
    "planner_agent",
    "QuizzerAgent",
    "quizzer_agent",
]
