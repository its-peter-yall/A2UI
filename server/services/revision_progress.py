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
from datetime import datetime, timezone
from typing import Optional, Sequence, Union

from server.schemas.learning import QuizCard


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
