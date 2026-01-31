# __init__.py
# Package exports for the agents module

# Exports the BaseAgent abstract class for use by concrete agent implementations.
# Future agents (PlannerAgent, GeneratorAgent, QuizzerAgent) will also be exported here.

# @see: server/agents/base.py - BaseAgent implementation

from server.agents.base import BaseAgent

__all__ = ["BaseAgent"]
