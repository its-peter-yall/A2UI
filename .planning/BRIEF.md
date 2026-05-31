# Project Brief: Retrieval-Based Learning Feature

## Vision Statement

Transform A2UI from a basic chat application into an **Agent-Generated User Interface (A2UI)** that implements **retrieval-based learning** - a pedagogical approach where active recall (testing) strengthens learning more effectively than passive review.

The system decomposes complex user queries (e.g., "Newtonian Laws") into structured, sequential learning paths with gated progression, where users must pass quizzes to unlock subsequent content.

## Core Problem

Current A2UI is a passive chat interface. Users consume information without active engagement. Research shows retrieval practice strengthens neural pathways more effectively than passive review. We need to operationalize this principle through AI-driven adaptive learning.

## Solution Architecture

### Planner-Worker Agent Pattern

1. **Planner Agent** (Gemini 1.5 Pro): Decomposes macro-concepts into ordered sub-topics with context metadata
2. **Generator Agent** (Gemini 1.5 Flash): Creates concise, targeted explanations with narrative bridging
3. **Quizzer Agent** (Gemini 1.5 Flash): Generates strict JSON-formatted assessments with plausible distractors

### Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript, React Query, Framer Motion |
| Backend | FastAPI + Python, asyncio for parallel execution |
| AI | Google Vertex AI (Gemini models), Instructor library |
| Database | SQLite (existing) with schema extensions |
| Validation | Pydantic models for strict structured output |

## Current State

- **Backend**: FastAPI app with Vertex AI (basic chat), SQLite with sessions/messages
- **Frontend**: React chat interface with session management
- **Missing**: Learning-specific infrastructure, agent orchestration, structured output, quiz logic

## Success Criteria

1. User submits a topic (e.g., "Newtonian Laws") and receives a structured learning path
2. Each concept card has explanation + quiz
3. Cards are locked until previous quiz is passed (server-side validation)
4. Parallel agent generation with <15s perceived latency via skeleton loaders
5. Gamified unlock animations create rewarding experience
6. All quiz answers validated server-side (no frontend bypass)

## Constraints

- Must integrate with existing FastAPI/React codebase
- Use existing SQLite database (extend schema, don't replace)
- Vertex AI is already configured and working
- Maintain existing chat functionality alongside new learning feature

## Reference Document

See: `Implementing Retrieval-Based Learning Feature.md` for complete technical blueprint

## Out of Scope (v1.0)

- RAG (Retrieval-Augmented Generation) for factuality
- Adaptive difficulty based on performance
- Multi-modal generation (images/diagrams)
- Semantic caching for similar queries
- LLM-as-Judge evaluation pipeline
