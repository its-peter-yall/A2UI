"""
============================================================================
FILE: session_event_stream.py
LOCATION: server/services/session_event_stream.py
============================================================================
PURPOSE:
    Replay-then-tail SSE framing for durable generation progress events.
ROLE IN PROJECT:
    Lets clients reconnect with Last-Event-ID without owning generation lifetime.
    - Replays rows after cursor, then polls for new events
    - Emits keepalives; never cancels jobs or deletes sessions on disconnect
KEY COMPONENTS:
    - stream_session_events: Async SSE frame generator
    - format_sse_frame: Single-event SSE encoder
DEPENDENCIES:
    - External: asyncio, json, typing
    - Internal: server.schemas.generation
USAGE:
    async for frame in stream_session_events(session_id, cursor, ...):
        yield frame
============================================================================
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from typing import (
    Any,
    AsyncIterator,
    Awaitable,
    Callable,
    Literal,
    Optional,
)

from pydantic import BaseModel

from server.schemas.generation import GenerationStage
from server.schemas.progress import (
    LIVE_EVENT_TYPES,
    PAYLOAD_BY_EVENT_TYPE,
    DraftSnapshot,
    LiveDraftEvent,
    ProgressEventType,
    TargetDraftResetPayload,
)

TERMINAL_STAGES = frozenset(
    {
        GenerationStage.COMPLETE.value,
        GenerationStage.COMPLETE_DEGRADED.value,
        GenerationStage.CANCELLED.value,
        GenerationStage.FAILED.value,
        "COMPLETE",
        "COMPLETE_DEGRADED",
        "CANCELLED",
        "FAILED",
    }
)

TERMINAL_EVENT_TYPES = frozenset(
    {
        "generation_complete",
        "generation_cancelled",
    }
)

SleepFn = Callable[[float], Awaitable[None]]


def _event_type_value(event: Any) -> str:
    event_type = getattr(event, "event_type", None)
    if event_type is None:
        return ""
    value = getattr(event_type, "value", event_type)
    return str(value)


def _payload_dict(event: Any) -> dict[str, Any]:
    payload = getattr(event, "payload", None)
    if payload is None:
        return {}
    if hasattr(payload, "model_dump"):
        dumped = payload.model_dump(mode="json")
        return dumped if isinstance(dumped, dict) else {"value": dumped}
    if isinstance(payload, dict):
        return payload
    return {}


def _created_at_str(event: Any) -> str:
    created = getattr(event, "created_at", None)
    if isinstance(created, datetime):
        return created.isoformat()
    if created is None:
        return ""
    return str(created)


def _stage_from_public(public: Any) -> Optional[str]:
    if public is None:
        return None
    if isinstance(public, dict):
        stage = public.get("stage")
        return stage.value if hasattr(stage, "value") else stage
    stage = getattr(public, "stage", None)
    if stage is None:
        return None
    return stage.value if hasattr(stage, "value") else str(stage)


def format_sse_frame(
    *,
    event_id: int,
    event_type: str,
    data: dict[str, Any],
    retry_ms: int = 2000,
) -> str:
    """Encode one SSE event frame."""
    body = json.dumps(data, separators=(",", ":"), default=str)
    return (
        f"id: {event_id}\n"
        f"event: {event_type}\n"
        f"retry: {retry_ms}\n"
        f"data: {body}\n\n"
    )


@dataclass
class _DraftEntry:
    event: LiveDraftEvent
    draft: DraftSnapshot = field(default_factory=DraftSnapshot)


class LiveSubscription:
    def __init__(self, snapshots: list[LiveDraftEvent]) -> None:
        self.snapshots = snapshots
        self.queue: asyncio.Queue[LiveDraftEvent] = asyncio.Queue()

    async def next_event(self) -> LiveDraftEvent:
        return await self.queue.get()

    def push(
        self,
        event: LiveDraftEvent,
        snapshots: list[LiveDraftEvent],
    ) -> None:
        self.queue.put_nowait(event)


def _target_key(
    target_type: str,
    target_id: str,
    sequence_index: Optional[int],
) -> str:
    return json.dumps(
        [target_type, target_id, sequence_index],
        separators=(",", ":"),
    )


def _payload_target(
    session_id: str,
    event_type: ProgressEventType,
    payload: BaseModel,
) -> tuple[str, str, Optional[int]]:
    if event_type == ProgressEventType.RESEARCH_SOURCES_UPDATED:
        return "research", session_id, None
    if event_type == ProgressEventType.RESEARCH_TEXT_DELTA:
        return "research", payload.report_id, payload.sequence_index
    if event_type == ProgressEventType.OUTLINE_TEXT_DELTA:
        return "outline", session_id, None
    if event_type in (
        ProgressEventType.TOPIC_CONTENT_DELTA,
        ProgressEventType.TOPIC_EXPLANATION_READY,
    ):
        return "topic", payload.node_id, payload.sequence_index
    return payload.target_type, payload.target_id, payload.sequence_index


class SessionLiveStreamBroadcaster:
    def __init__(
        self,
        *,
        max_draft_bytes: int = 96_000,
        subscriber_limit: int = 64,
    ) -> None:
        self._max_draft_bytes = max_draft_bytes
        self._subscriber_limit = subscriber_limit
        self._lock = asyncio.Lock()
        self._entries: dict[tuple[str, str], _DraftEntry] = {}
        self._subscribers: dict[str, set[LiveSubscription]] = {}
        self._jobs: dict[str, str] = {}

    def _snapshots_locked(
        self, session_id: str
    ) -> list[LiveDraftEvent]:
        return [
            entry.event.model_copy(deep=True, update={
                "snapshot": entry.draft.model_copy(deep=True),
            })
            for (session, _), entry in self._entries.items()
            if session == session_id
        ]

    def _broadcast_locked(
        self,
        session_id: str,
        event: LiveDraftEvent,
    ) -> None:
        for subscriber in self._subscribers.get(session_id, set()):
            subscriber.push(
                event, self._snapshots_locked(session_id)
            )

    def _replace_job_locked(
        self, session_id: str, job_id: str
    ) -> None:
        if self._jobs.get(session_id) not in (None, job_id):
            for key in list(self._entries):
                if key[0] == session_id:
                    del self._entries[key]
        self._jobs[session_id] = job_id

    @asynccontextmanager
    async def subscribe(
        self, session_id: str
    ) -> AsyncIterator[LiveSubscription]:
        async with self._lock:
            subscriber = LiveSubscription(
                self._snapshots_locked(session_id)
            )
            self._subscribers.setdefault(session_id, set()).add(
                subscriber
            )
        try:
            yield subscriber
        finally:
            async with self._lock:
                subscribers = self._subscribers.get(session_id, set())
                subscribers.discard(subscriber)
                if not subscribers:
                    self._subscribers.pop(session_id, None)

    async def snapshots(
        self, session_id: str
    ) -> list[LiveDraftEvent]:
        async with self._lock:
            return self._snapshots_locked(session_id)

    async def retire_target(
        self,
        *,
        session_id: str,
        target_type: Literal["research", "outline", "topic"],
        target_id: str,
        sequence_index: Optional[int] = None,
    ) -> None:
        async with self._lock:
            self._entries.pop((session_id, _target_key(
                target_type, target_id, sequence_index,
            )), None)

    async def clear_session(self, session_id: str) -> None:
        async with self._lock:
            for key in list(self._entries):
                if key[0] == session_id:
                    del self._entries[key]
            self._jobs.pop(session_id, None)

    async def begin_target(
        self,
        *,
        session_id: str,
        job_id: str,
        stage: GenerationStage,
        target_type: Literal["research", "outline", "topic"],
        target_id: str,
        attempt: int,
        sequence_index: Optional[int] = None,
        reason: Literal[
            "started", "retry", "replan", "correction", "resumed"
        ] = "started",
    ) -> None:
        payload = TargetDraftResetPayload(
            target_type=target_type,
            target_id=target_id,
            sequence_index=sequence_index,
            attempt=attempt,
            reason=reason,
        )
        target = _target_key(target_type, target_id, sequence_index)
        async with self._lock:
            self._replace_job_locked(session_id, job_id)
            old = self._entries.get((session_id, target))
            if old is not None and old.event.attempt >= attempt:
                return
            event = LiveDraftEvent(
                session_id=session_id,
                job_id=job_id,
                stage=stage,
                target=target,
                attempt=attempt,
                sequence=1,
                event_type=ProgressEventType.TARGET_DRAFT_RESET,
                payload=payload,
            )
            self._entries[(session_id, target)] = _DraftEntry(event)
            self._broadcast_locked(session_id, event)

    async def publish(
        self,
        *,
        session_id: str,
        job_id: str,
        stage: GenerationStage,
        event_type: ProgressEventType,
        payload: BaseModel,
    ) -> None:
        if event_type not in LIVE_EVENT_TYPES:
            raise ValueError(
                "Use the repository for durable milestones"
            )
        if not isinstance(
            payload, PAYLOAD_BY_EVENT_TYPE[event_type]
        ):
            raise ValueError("Wrong live payload class")
        if event_type == ProgressEventType.TARGET_DRAFT_RESET:
            await self.begin_target(
                session_id=session_id,
                job_id=job_id,
                stage=stage,
                target_type=payload.target_type,
                target_id=payload.target_id,
                sequence_index=payload.sequence_index,
                attempt=payload.attempt,
                reason=payload.reason,
            )
            return
        kind, target_id, index = _payload_target(
            session_id, event_type, payload
        )
        target = _target_key(kind, target_id, index)
        async with self._lock:
            self._replace_job_locked(session_id, job_id)
            key = (session_id, target)
            old = self._entries.get(key)
            attempt = getattr(payload, "attempt", 1)
            if (
                old is None
                and event_type
                != ProgressEventType.RESEARCH_SOURCES_UPDATED
            ):
                raise ValueError(
                    "Begin the target before publishing text"
                )
            if old is not None and attempt < old.event.attempt:
                return
            if old is not None and attempt != old.event.attempt:
                raise ValueError(
                    "Begin a new attempt before publishing"
                )
            event = LiveDraftEvent(
                session_id=session_id,
                job_id=job_id,
                stage=stage,
                target=target,
                attempt=attempt,
                sequence=(
                    old.event.sequence + 1 if old else 1
                ),
                event_type=event_type,
                payload=payload.model_copy(deep=True),
            )
            draft = (
                old.draft.model_copy(deep=True)
                if old
                else DraftSnapshot()
            )
            if event_type in (
                ProgressEventType.RESEARCH_TEXT_DELTA,
                ProgressEventType.TOPIC_CONTENT_DELTA,
            ):
                draft.text += payload.text_delta
            elif event_type == ProgressEventType.OUTLINE_TEXT_DELTA:
                draft.course_title += payload.course_title_delta or ""
                if payload.topic_index is not None:
                    draft.topics[payload.topic_index] = (
                        draft.topics.get(payload.topic_index, "")
                        + payload.topic_title_delta
                    )
            elif event_type == (
                ProgressEventType.TOPIC_EXPLANATION_READY
            ):
                draft.explanation_ready = True
            elif event_type == (
                ProgressEventType.RESEARCH_SOURCES_UPDATED
            ):
                draft.unique_source_count = (
                    payload.unique_source_count
                )
                draft.new_sources_count = payload.new_sources_count
                draft.provider_id = payload.provider_id
            self._entries[key] = _DraftEntry(event, draft)
            self._broadcast_locked(session_id, event)


session_live_stream = SessionLiveStreamBroadcaster()


def format_live_sse_frame(event: LiveDraftEvent) -> str:
    envelope = event.model_dump(mode="json")
    envelope["payload"] = event.payload.model_dump(mode="json")
    body = json.dumps(envelope, separators=(",", ":"))
    return (
        f"event: {event.event_type.value}\n"
        "retry: 2000\n"
        f"data: {body}\n\n"
    )


async def _retire_completed_target(
    hub: SessionLiveStreamBroadcaster,
    session_id: str,
    event: Any,
) -> None:
    kind = _event_type_value(event)
    payload = _payload_dict(event)
    if kind == "outline_ready":
        await hub.retire_target(
            session_id=session_id,
            target_type="outline",
            target_id=session_id,
        )
    elif kind == "module_ready":
        await hub.retire_target(
            session_id=session_id,
            target_type="topic",
            target_id=payload["node_id"],
            sequence_index=payload.get("sequence_index"),
        )
    elif kind == "research_section_ready":
        await hub.retire_target(
            session_id=session_id,
            target_type="research",
            target_id=payload["report_id"],
            sequence_index=payload["sequence_index"],
        )


def _draft_relevant(draft: LiveDraftEvent, public: Any) -> bool:
    if public is None:
        return False
    public_id = (
        public.get("id") if isinstance(public, dict)
        else getattr(public, "id", None)
    )
    if public_id is not None and public_id != draft.job_id:
        return False
    stage = _stage_from_public(public)
    target_type = json.loads(draft.target)[0]
    if stage in ("PAUSED", "FAILED", "CANCELLED"):
        return True
    if target_type == "outline":
        return stage == "OUTLINING"
    if target_type == "research":
        return stage == "RESEARCHING"
    return stage in (
        "GENERATING_PREVIEW",
        "GENERATING_BATCH",
        "PLANNING_BATCH",
    )


async def stream_session_events(
    *,
    session_id: str,
    cursor: int,
    event_store: Any,
    job_store: Any,
    sleep: Optional[SleepFn] = None,
    heartbeat_seconds: float = 15.0,
    poll_seconds: float = 0.5,
    broadcaster: Optional[SessionLiveStreamBroadcaster] = None,
) -> AsyncIterator[str]:
    """Replay events after cursor, then tail until terminal stage/event.

    Never cancels generation tasks or deletes sessions on client disconnect.
    """
    hub = broadcaster or session_live_stream
    sleeper = sleep or asyncio.sleep
    current = cursor
    last_heartbeat = asyncio.get_running_loop().time()
    watermarks: dict[tuple[str, int], int] = {}
    snapshot_pending = True
    waiter: Optional[asyncio.Task[LiveDraftEvent]] = None
    try:
        async with hub.subscribe(session_id) as subscription:
            while True:
                rows = event_store.list_after(
                    session_id, current, limit=100
                )
                if rows:
                    for event in rows:
                        event_id = int(event.id)
                        event_type = _event_type_value(event)
                        public = job_store.to_public_by_session(
                            session_id
                        )
                        generation = (
                            public.model_dump(mode="json")
                            if hasattr(public, "model_dump")
                            else public
                        )
                        envelope = {
                            "id": event_id,
                            "session_id": session_id,
                            "event_type": event_type,
                            "payload": _payload_dict(event),
                            "generation": generation,
                            "created_at": _created_at_str(event),
                        }
                        yield format_sse_frame(
                            event_id=event_id,
                            event_type=event_type,
                            data=envelope,
                        )
                        current = event_id
                        await _retire_completed_target(
                            hub, session_id, event
                        )
                        if event_type in TERMINAL_EVENT_TYPES:
                            # Do not lose last output on cancellation;
                            # emit only retained drafts for the current
                            # job, then close.
                            for draft in await hub.snapshots(
                                session_id
                            ):
                                if event_type == "generation_cancelled":
                                    yield format_live_sse_frame(draft)
                            await hub.clear_session(session_id)
                            return
                    continue

                public = job_store.to_public_by_session(session_id)
                stage = _stage_from_public(public)
                if snapshot_pending:
                    for draft in await hub.snapshots(session_id):
                        if _draft_relevant(draft, public):
                            yield format_live_sse_frame(draft)
                            watermarks[
                                (draft.target, draft.attempt)
                            ] = draft.sequence
                    snapshot_pending = False
                if stage in TERMINAL_STAGES:
                    if stage not in ("FAILED", "failed"):
                        await hub.clear_session(session_id)
                    return

                # Drain without advancing the durable cursor, even
                # when polls report a newer last_event_id.
                if waiter is not None and waiter.done():
                    draft = waiter.result()
                    waiter = None
                    key = (draft.target, draft.attempt)
                    if draft.sequence > watermarks.get(key, 0):
                        if _draft_relevant(draft, public):
                            yield format_live_sse_frame(draft)
                            watermarks[key] = draft.sequence
                while not subscription.queue.empty():
                    draft = subscription.queue.get_nowait()
                    key = (draft.target, draft.attempt)
                    if draft.sequence > watermarks.get(key, 0):
                        if _draft_relevant(draft, public):
                            yield format_live_sse_frame(draft)
                            watermarks[key] = draft.sequence

                now = asyncio.get_running_loop().time()
                if (
                    heartbeat_seconds <= 0
                    or now - last_heartbeat >= heartbeat_seconds
                ):
                    yield ": keepalive\n\n"
                    last_heartbeat = now
                if waiter is None:
                    waiter = asyncio.create_task(
                        subscription.next_event()
                    )
                timer = asyncio.create_task(sleeper(
                    poll_seconds if heartbeat_seconds > 0 else 0,
                ))
                try:
                    done, _ = await asyncio.wait(
                        {waiter, timer},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if timer in done:
                        timer.result()
                    if waiter in done:
                        draft = waiter.result()
                        waiter = None
                        key = (draft.target, draft.attempt)
                        latest_public = (
                            job_store.to_public_by_session(session_id)
                        )
                        if draft.sequence > watermarks.get(key, 0):
                            if _draft_relevant(draft, latest_public):
                                yield format_live_sse_frame(draft)
                                watermarks[key] = draft.sequence
                finally:
                    if not timer.done():
                        timer.cancel()
                    await asyncio.gather(
                        timer, return_exceptions=True
                    )
    except asyncio.CancelledError:
        return
    finally:
        if waiter is not None:
            if not waiter.done():
                waiter.cancel()
            await asyncio.gather(waiter, return_exceptions=True)
