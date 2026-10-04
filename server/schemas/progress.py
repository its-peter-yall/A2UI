"""
============================================================================
FILE: progress.py
LOCATION: server/schemas/progress.py
============================================================================
PURPOSE:
    Closed progress-event type set with secret-safe typed payload contracts.
ROLE IN PROJECT:
    Defines replayable generation progress events for persistence and SSE.
    - Maps each event type to exactly one payload class
    - Forbids unknown fields so credentials and raw provider bodies fail
KEY COMPONENTS:
    - ProgressEventType: The fifteen locked event values
    - Payload models: Typed per-event payload contracts
    - ProgressEvent: Discriminated event envelope
DEPENDENCIES:
    - External: pydantic
    - Internal: server.schemas.generation
USAGE:
    from server.schemas.progress import ProgressEvent, ProgressEventType
============================================================================
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional, Type

from pydantic import BaseModel, ConfigDict, Field, model_validator

from server.schemas.generation import (
    GenerationCounts,
    GenerationStage,
    GenerationWarning,
    GroundingStatus,
)


class ProgressEventType(str, Enum):
    STAGE_CHANGED = "stage_changed"
    RESEARCH_SECTION_READY = "research_section_ready"
    RESEARCH_DEGRADED = "research_degraded"
    OUTLINE_READY = "outline_ready"
    MODULE_READY = "module_ready"
    MODULE_FAILED = "module_failed"
    GENERATION_PAUSED = "generation_paused"
    GENERATION_CANCELLED = "generation_cancelled"
    GENERATION_COMPLETE = "generation_complete"
    RESEARCH_SOURCES_UPDATED = "research_sources_updated"
    RESEARCH_TEXT_DELTA = "research_text_delta"
    OUTLINE_TEXT_DELTA = "outline_text_delta"
    TOPIC_CONTENT_DELTA = "topic_content_delta"
    TOPIC_EXPLANATION_READY = "topic_explanation_ready"
    TARGET_DRAFT_RESET = "target_draft_reset"


class StageChangedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    previous_stage: GenerationStage
    stage: GenerationStage


class ResearchSectionReadyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    report_id: str = Field(min_length=1)
    section_id: str = Field(min_length=1)
    sequence_index: int = Field(ge=0)
    source_count: int = Field(ge=0)


class ResearchDegradedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    warning: GenerationWarning


class OutlineReadyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    course_title: str = Field(min_length=1)
    topic_count: int = Field(ge=0)


class ModuleReadyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    node_id: str = Field(min_length=1)
    sequence_index: int = Field(ge=0)


class ModuleFailedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    node_id: str = Field(min_length=1)
    sequence_index: int = Field(ge=0)
    failed_step: str = Field(min_length=1)
    warning: GenerationWarning


class GenerationPausedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    stage: GenerationStage
    warning: GenerationWarning


class GenerationCancelledPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    stage: GenerationStage


class GenerationCompletePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    stage: GenerationStage
    counts: GenerationCounts
    grounding_status: GroundingStatus


PAYLOAD_BY_EVENT_TYPE: dict[ProgressEventType, Type[BaseModel]] = {
    ProgressEventType.STAGE_CHANGED: StageChangedPayload,
    ProgressEventType.RESEARCH_SECTION_READY: ResearchSectionReadyPayload,
    ProgressEventType.RESEARCH_DEGRADED: ResearchDegradedPayload,
    ProgressEventType.OUTLINE_READY: OutlineReadyPayload,
    ProgressEventType.MODULE_READY: ModuleReadyPayload,
    ProgressEventType.MODULE_FAILED: ModuleFailedPayload,
    ProgressEventType.GENERATION_PAUSED: GenerationPausedPayload,
    ProgressEventType.GENERATION_CANCELLED: GenerationCancelledPayload,
    ProgressEventType.GENERATION_COMPLETE: GenerationCompletePayload,
}


class ResearchSourcesUpdatedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    unique_source_count: int = Field(ge=0, le=50)
    new_sources_count: int = Field(ge=0, le=50)
    provider_id: Optional[str] = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def valid_source_counts(self):
        if self.new_sources_count > self.unique_source_count:
            raise ValueError(
                "New sources cannot exceed unique sources"
            )
        return self


class ResearchTextDeltaPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    report_id: str = Field(min_length=1, max_length=100)
    theme: str = Field(min_length=1, max_length=100)
    sequence_index: int = Field(ge=0, le=20)
    text_delta: str = Field(min_length=1, max_length=4000)
    attempt: int = Field(default=1, ge=1, le=5)


class OutlineTextDeltaPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    course_title_delta: Optional[str] = Field(
        default=None, max_length=300
    )
    topic_index: Optional[int] = Field(default=None, ge=0, le=30)
    topic_title_delta: Optional[str] = Field(
        default=None, max_length=300
    )
    attempt: int = Field(default=1, ge=1, le=5)

    @model_validator(mode="after")
    def valid_outline_delta(self):
        if (self.topic_index is None) != (
            self.topic_title_delta is None
        ):
            raise ValueError(
                "Topic index and title must be supplied together"
            )
        if not self.course_title_delta and not self.topic_title_delta:
            raise ValueError("A display delta is required")
        return self


class TopicContentDeltaPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    node_id: str = Field(min_length=1, max_length=100)
    sequence_index: int = Field(ge=0, le=30)
    text_delta: str = Field(min_length=1, max_length=4000)
    attempt: int = Field(default=1, ge=1, le=5)


class TopicExplanationReadyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    node_id: str = Field(min_length=1, max_length=100)
    sequence_index: int = Field(ge=0, le=30)
    attempt: int = Field(default=1, ge=1, le=5)


class TargetDraftResetPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    target_type: Literal["research", "outline", "topic"]
    target_id: str = Field(min_length=1, max_length=100)
    sequence_index: Optional[int] = Field(default=None, ge=0, le=30)
    attempt: int = Field(ge=1, le=5)
    reason: str = Field(min_length=1, max_length=200)


PAYLOAD_BY_EVENT_TYPE.update({
    ProgressEventType.RESEARCH_SOURCES_UPDATED: (
        ResearchSourcesUpdatedPayload
    ),
    ProgressEventType.RESEARCH_TEXT_DELTA: ResearchTextDeltaPayload,
    ProgressEventType.OUTLINE_TEXT_DELTA: OutlineTextDeltaPayload,
    ProgressEventType.TOPIC_CONTENT_DELTA: TopicContentDeltaPayload,
    ProgressEventType.TOPIC_EXPLANATION_READY: (
        TopicExplanationReadyPayload
    ),
    ProgressEventType.TARGET_DRAFT_RESET: TargetDraftResetPayload,
})


LIVE_EVENT_TYPES = frozenset({
    ProgressEventType.RESEARCH_SOURCES_UPDATED,
    ProgressEventType.RESEARCH_TEXT_DELTA,
    ProgressEventType.OUTLINE_TEXT_DELTA,
    ProgressEventType.TOPIC_CONTENT_DELTA,
    ProgressEventType.TOPIC_EXPLANATION_READY,
    ProgressEventType.TARGET_DRAFT_RESET,
})


class ProgressEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(ge=1)
    session_id: str = Field(min_length=1)
    event_type: ProgressEventType
    payload: BaseModel
    created_at: datetime

    @model_validator(mode="after")
    def payload_matches_event_type(self) -> "ProgressEvent":
        expected = PAYLOAD_BY_EVENT_TYPE[self.event_type]
        if not isinstance(self.payload, expected):
            raise ValueError(
                "Payload type does not match event type "
                f"{self.event_type.value}"
            )
        return self


class DraftSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    text: str = ""
    text_offset: int = Field(default=0, ge=0)
    truncated: bool = False
    course_title: str = ""
    topics: dict[int, str] = Field(default_factory=dict)
    explanation_ready: bool = False
    unique_source_count: Optional[int] = Field(
        default=None, ge=0, le=50
    )
    new_sources_count: Optional[int] = Field(
        default=None, ge=0, le=50
    )
    provider_id: Optional[str] = Field(default=None, max_length=50)


class LiveDraftEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    id: Literal[0] = 0
    session_id: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    stage: GenerationStage
    target: str = Field(min_length=1)
    attempt: int = Field(ge=1, le=5)
    sequence: int = Field(ge=1)
    event_type: ProgressEventType
    payload: BaseModel
    snapshot: Optional[DraftSnapshot] = None

    @model_validator(mode="after")
    def valid_live_payload(self):
        if self.event_type not in LIVE_EVENT_TYPES:
            raise ValueError(
                "Durable events cannot use the live envelope"
            )
        expected = PAYLOAD_BY_EVENT_TYPE[self.event_type]
        if not isinstance(self.payload, expected):
            raise ValueError("Payload does not match live event type")
        if getattr(self.payload, "attempt", self.attempt) != self.attempt:
            raise ValueError("Payload attempt does not match envelope")
        return self
