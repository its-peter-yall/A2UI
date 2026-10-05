"""
============================================================================
FILE: revision_progress.py
LOCATION: server/services/revision_progress.py
============================================================================
PURPOSE:
    Pure, authoritative projection of revision reading completion, per-quiz
    feedback, attempt counts, accuracy, and completion timestamps.
ROLE IN PROJECT:
    Shared domain layer used by both SQLite and Mongo learning adapters.
    - Consumes batched repository inputs; performs no storage or provider I/O
    - Normalizes legacy persisted selections and timestamps without mutation
    - Filters revision identity, projects latest compatible feedback per quiz
    - Computes mode-specific aggregates for GET/list/summary and write
      reconciliation; never manufactures IDs or regrades saved attempts
KEY COMPONENTS:
    - normalize_revision_timestamp/normalize_selected_option_ids: Value codecs
    - evaluate_revision_selection: Stable-ID exact-match validation
    - project_revision_node: One topic's reading, feedback, and coverage
    - project_revision: Whole-revision aggregates and completion evidence
DEPENDENCIES:
    - External: json, dataclasses, datetime, typing
    - Internal: server.schemas.learning
USAGE:
    from server.services.revision_progress import project_revision
============================================================================
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal, Optional, Sequence, Union

from server.schemas.learning import (
    QuizCard,
    RevisionMode,
    RevisionNodeProgressWithDetails,
    RevisionNodeStatus,
    RevisionNotice,
    RevisionNoticeCode,
    RevisionQuizAttemptResult,
    RevisionSessionStatus,
)


def normalize_revision_timestamp(
    value: Union[str, datetime],
) -> datetime:
    """Convert a legacy or current timestamp to aware UTC.

    Args:
        value: ISO text or datetime; naive legacy values mean UTC.
    Returns:
        The same instant represented with UTC timezone information.
    Raises:
        ValueError: ISO text cannot be parsed.
    """
    parsed = (
        datetime.fromisoformat(value.replace('Z', '+00:00'))
        if isinstance(value, str) else value
    )
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_selected_option_ids(
    value: object,
) -> Optional[tuple[str, ...]]:
    """Decode saved scalar/array selections without remapping option IDs.

    Args:
        value: SQLite scalar/JSON array or Mongo array field.
    Returns:
        Unique nonempty IDs in stored order, or None for incompatible data.
    """
    decoded = value
    if isinstance(value, str):
        if value.startswith('['):
            try:
                decoded = json.loads(value)
            except json.JSONDecodeError:
                return None
        else:
            decoded = [value]
    if not isinstance(decoded, (list, tuple)) or not decoded:
        return None
    ids: list[str] = []
    for identifier in decoded:
        if not isinstance(identifier, str) or not identifier:
            return None
        ids.append(identifier)
    if len(set(ids)) != len(ids):
        return None
    return tuple(ids)


def evaluate_revision_selection(
    quiz: QuizCard, selected_option_ids: Sequence[str],
) -> bool:
    """Validate stable option identity and evaluate an exact answer set.

    Args:
        quiz: Available quiz with stable option IDs.
        selected_option_ids: Nonempty, duplicate-free selected IDs.
    Returns:
        True only for the exact set of correct options.
    Raises:
        ValueError: Empty, duplicate, foreign, or invalid-cardinality IDs.
    """
    selected = set(selected_option_ids)
    available = {option.option_id for option in quiz.options}
    if not selected or len(selected) != len(selected_option_ids):
        raise ValueError('selection must be nonempty and unique')
    if not selected.issubset(available):
        raise ValueError('selection contains unknown option IDs')
    if quiz.question_type == 'single_choice' and len(selected) != 1:
        raise ValueError('single_choice requires one selected option')
    correct = {
        option.option_id for option in quiz.options if option.is_correct
    }
    return selected == correct


@dataclass(frozen=True)
class RevisionProjectionInput:
    """Stored revision metadata, without original-course learning state."""

    id: str
    mode: RevisionMode
    started_at: datetime
    stored_status: RevisionSessionStatus = 'in_progress'
    stored_completed_at: Optional[datetime] = None


@dataclass(frozen=True)
class RevisionNodeInput:
    """Batched node/quiz/review values supplied by a repository adapter."""

    id: str
    revision_session_id: str
    node_id: str
    node_title: str
    sequence_index: int
    quizzes: tuple[QuizCard, ...]
    stored_status: RevisionNodeStatus = 'pending'
    reviewed_at: Optional[datetime] = None
    explicit_review_present: bool = False
    content_reviewed_at: Optional[datetime] = None


@dataclass(frozen=True)
class RevisionAttemptInput:
    """A saved attempt; incompatible rows remain in repository storage."""

    id: str
    revision_session_id: Optional[str]
    node_id: str
    attempt_number: int
    quiz_index: Optional[int]
    selected_option_ids: Optional[tuple[str, ...]]
    is_correct: bool
    score_percent: int
    created_at: datetime


@dataclass(frozen=True)
class RevisionNodeProjection:
    """One topic's authoritative details and aggregate evidence."""

    node: RevisionNodeProgressWithDetails
    total_attempts: int
    correct_attempts: int
    completed_at: Optional[datetime]
    notices: tuple[RevisionNotice, ...]


def _notice(
    code: RevisionNoticeCode,
    node_id: Optional[str],
    count: int = 0,
) -> RevisionNotice:
    """Build one presentation notice for a node or the whole revision."""
    return RevisionNotice(
        code=code, node_id=node_id, attempt_count=count,
    )


def _compatible_quiz_index(
    node: RevisionNodeInput, attempt: RevisionAttemptInput,
) -> Optional[int]:
    """Resolve the current quiz an attempt belongs to, or None if stale."""
    index = attempt.quiz_index
    if index is None and len(node.quizzes) == 1:
        index = 0
    if (
        index is None
        or index < 0
        or index >= len(node.quizzes)
        or not attempt.id
        or attempt.attempt_number < 1
        or attempt.selected_option_ids is None
    ):
        return None
    try:
        correct = evaluate_revision_selection(
            node.quizzes[index], attempt.selected_option_ids,
        )
    except ValueError:
        return None
    if correct != attempt.is_correct:
        return None
    if attempt.score_percent != (100 if attempt.is_correct else 0):
        return None
    return index


def _attempt_result(
    revision_id: str,
    quiz_index: int,
    quiz: QuizCard,
    attempt: RevisionAttemptInput,
    quiz_attempt_count: int,
) -> RevisionQuizAttemptResult:
    """Assemble one disclosed result from a saved compatible attempt."""
    selected_ids = list(attempt.selected_option_ids or ())
    selected = [
        option
        for option in quiz.options
        if option.option_id in selected_ids
    ]
    correct = [option for option in quiz.options if option.is_correct]
    score: Literal[0, 100] = 100 if attempt.is_correct else 0
    return RevisionQuizAttemptResult(
        id=attempt.id,
        revision_session_id=revision_id,
        node_id=attempt.node_id,
        quiz_index=quiz_index,
        attempt_number=attempt.attempt_number,
        quiz_attempt_count=quiz_attempt_count,
        selected_option_ids=selected_ids,
        is_correct=attempt.is_correct,
        score_percent=score,
        correct_option_ids=(
            [option.option_id for option in correct]
            if attempt.is_correct else []
        ),
        explanation=correct[0].explanation if attempt.is_correct else '',
        selected_explanation=(
            selected[0].explanation if not attempt.is_correct else None
        ),
        created_at=normalize_revision_timestamp(attempt.created_at),
    )


def project_revision_node(
    revision: RevisionProjectionInput,
    node: RevisionNodeInput,
    attempts: Sequence[RevisionAttemptInput],
) -> RevisionNodeProjection:
    """Project one topic from explicit reading and its own saved attempts.

    Args:
        revision: Owning revision identity, mode, and metadata.
        node: Batched quiz and explicit-review values for this topic.
        attempts: Batched attempts; foreign revisions/nodes are ignored.
    Returns:
        Independent reading, latest quiz feedback, and completion evidence.
    Raises:
        ValueError: Node does not belong to this revision.
    """
    if node.revision_session_id != revision.id:
        raise ValueError('node belongs to another revision')
    notices: list[RevisionNotice] = []
    content_reviewed_at = node.content_reviewed_at
    if revision.mode == 'full_review':
        if (
            not node.explicit_review_present
            and node.stored_status == 'reviewed'
        ):
            content_reviewed_at = node.reviewed_at or revision.started_at
            notices.append(
                _notice('legacy_review_inferred', node.node_id)
            )
        elif (
            content_reviewed_at is None
            and node.stored_status in ('quiz_passed', 'quiz_failed')
        ):
            notices.append(
                _notice('legacy_review_required', node.node_id)
            )
    if content_reviewed_at is not None:
        content_reviewed_at = normalize_revision_timestamp(
            content_reviewed_at
        )
    groups: dict[int, list[RevisionAttemptInput]] = {}
    incompatible = 0
    for attempt in attempts:
        if (
            attempt.revision_session_id != revision.id
            or attempt.node_id != node.node_id
        ):
            continue
        index = _compatible_quiz_index(node, attempt)
        if index is None:
            incompatible += 1
            continue
        groups.setdefault(index, []).append(attempt)
    if incompatible:
        notices.append(
            _notice('incompatible_attempts', node.node_id, incompatible)
        )
    results: list[RevisionQuizAttemptResult] = []
    for index, group in sorted(groups.items()):
        latest = max(group, key=lambda row: (row.attempt_number, row.id))
        results.append(
            _attempt_result(
                revision.id,
                index,
                node.quizzes[index],
                latest,
                len(group),
            )
        )
    completed_at: Optional[datetime] = None
    status: RevisionNodeStatus = 'pending'
    if revision.mode == 'full_review' and content_reviewed_at is not None:
        status = 'reviewed'
        completed_at = content_reviewed_at
    elif (
        revision.mode == 'quiz_only'
        and node.quizzes
        and len(groups) == len(node.quizzes)
    ):
        status = (
            'quiz_passed'
            if all(result.is_correct for result in results)
            else 'quiz_failed'
        )
        completed_at = max(
            min(
                normalize_revision_timestamp(row.created_at)
                for row in group
            )
            for group in groups.values()
        )
    details = RevisionNodeProgressWithDetails(
        id=node.id,
        node_id=node.node_id,
        node_title=node.node_title,
        sequence_index=node.sequence_index,
        status=status,
        reviewed_at=(
            normalize_revision_timestamp(node.reviewed_at)
            if node.reviewed_at is not None else None
        ),
        content_reviewed_at=content_reviewed_at,
        quiz_count=len(node.quizzes),
        quiz_results=results,
    )
    return RevisionNodeProjection(
        node=details,
        total_attempts=sum(len(g) for g in groups.values()),
        correct_attempts=sum(
            row.is_correct for group in groups.values() for row in group
        ),
        completed_at=completed_at,
        notices=tuple(notices),
    )


@dataclass(frozen=True)
class RevisionProjection:
    """Shared metrics for session GET/list, summary, and write reconciliation."""

    nodes: tuple[RevisionNodeProgressWithDetails, ...]
    status: RevisionSessionStatus
    progress_percent: int
    total_quiz_score_percent: Optional[int]
    nodes_completed: int
    nodes_total: int
    correct_attempts: int
    incorrect_attempts: int
    total_attempts: int
    completed_at: Optional[datetime]
    time_spent_seconds: Optional[int]
    notices: tuple[RevisionNotice, ...]
    completion_reconciled: bool


def project_revision(
    *,
    revision: RevisionProjectionInput,
    nodes: Sequence[RevisionNodeInput],
    attempts: Sequence[RevisionAttemptInput],
) -> RevisionProjection:
    """Derive all revision metrics from batched inputs without I/O.

    Args:
        revision: Stored identity, mode, start, and historical completion.
        nodes: Participating progress rows and their available quiz payloads.
        attempts: Batched saved attempts, including any caller-supplied extras.
    Returns:
        One authoritative view for response and metadata reconciliation.
    Raises:
        ValueError: Node ownership or unique membership is invalid.
    """
    node_ids = {node.node_id for node in nodes}
    if len(node_ids) != len(nodes):
        raise ValueError('duplicate revision node membership')
    if any(node.revision_session_id != revision.id for node in nodes):
        raise ValueError('node belongs to another revision')
    attempts_by_node: dict[str, list[RevisionAttemptInput]] = {}
    orphan_count = 0
    for attempt in attempts:
        if attempt.revision_session_id != revision.id:
            continue
        if attempt.node_id not in node_ids:
            orphan_count += 1
            continue
        attempts_by_node.setdefault(attempt.node_id, []).append(attempt)
    projections = [
        project_revision_node(
            revision, node, attempts_by_node.get(node.node_id, []),
        )
        for node in sorted(
            nodes, key=lambda row: (row.sequence_index, row.node_id)
        )
    ]
    participating = [
        projection
        for projection in projections
        if revision.mode == 'full_review' or projection.node.quiz_count > 0
    ]
    completion_times = [
        projection.completed_at
        for projection in participating
        if projection.completed_at is not None
    ]
    total = len(participating)
    completed = len(completion_times)
    status: RevisionSessionStatus = (
        'completed' if total > 0 and completed == total else 'in_progress'
    )
    started = normalize_revision_timestamp(revision.started_at)
    stored_completed = (
        normalize_revision_timestamp(revision.stored_completed_at)
        if revision.stored_completed_at is not None else None
    )
    completed_at: Optional[datetime] = None
    if status == 'completed':
        evidence_time = max(started, max(completion_times))
        completed_at = (
            stored_completed
            if stored_completed is not None
            and stored_completed >= evidence_time
            else evidence_time
        )
    total_attempts = sum(p.total_attempts for p in projections)
    correct_attempts = sum(p.correct_attempts for p in projections)
    notices = [notice for p in projections for notice in p.notices]
    if orphan_count:
        notices.append(_notice('incompatible_attempts', None, orphan_count))
    reconciled = (
        status != revision.stored_status or completed_at != stored_completed
    )
    if revision.stored_status == 'completed' and reconciled:
        notices.append(_notice('completion_recalculated', None))
    return RevisionProjection(
        nodes=tuple(p.node for p in projections),
        status=status,
        progress_percent=(completed * 100) // total if total else 0,
        total_quiz_score_percent=(
            (correct_attempts * 100) // total_attempts
            if total_attempts else None
        ),
        nodes_completed=completed,
        nodes_total=total,
        correct_attempts=correct_attempts,
        incorrect_attempts=total_attempts - correct_attempts,
        total_attempts=total_attempts,
        completed_at=completed_at,
        time_spent_seconds=(
            max(0, int((completed_at - started).total_seconds()))
            if completed_at is not None else None
        ),
        notices=tuple(notices),
        completion_reconciled=reconciled,
    )
