"""
============================================================================
FILE: smoke_phase3.py
LOCATION: server/tests/smoke_phase3.py
============================================================================
PURPOSE:
    Runs Phase 3 cutover smoke assertions against a live FastAPI HTTP server.
ROLE IN PROJECT:
    Verifies graph-only routing, response shape, and live ASGI serialization.
    - Sends POST /learning/generate over HTTP
    - Checks contract keys without logging secrets or full LLM output
KEY COMPONENTS:
    - main: Executes HTTP smoke request and prints compact result
DEPENDENCIES:
    - External: json, os, sys, urllib
    - Internal: None
USAGE:
    python server/tests/smoke_phase3.py
============================================================================
"""

from __future__ import annotations

import json
import os
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main() -> int:
    base_url = os.getenv(
        "A2UI_SMOKE_BASE_URL",
        "http://127.0.0.1:8000",
    )
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    model = os.getenv(
        "OPENROUTER_MODEL",
        "google/gemini-2.5-flash",
    )
    if not api_key:
        print("OPENROUTER_API_KEY missing")
        return 2

    payload = json.dumps(
        {"query": "Photosynthesis basics"},
    ).encode("utf-8")
    request = Request(
        f"{base_url}/learning/generate",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-OpenRouter-Key": api_key,
            "X-OpenRouter-Model": model,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=300) as response:
            status_code = response.status
            body = json.loads(
                response.read().decode("utf-8"),
            )
    except HTTPError as exc:
        print(f"status={exc.code}")
        print(exc.read().decode("utf-8")[:500])
        return 1

    required = {"id", "query", "course_title", "nodes"}
    missing = sorted(required - set(body))
    if status_code != 201 or missing:
        print(f"status={status_code}")
        print(f"missing={missing}")
        return 1

    nodes = body["nodes"]
    if not isinstance(nodes, list) or not nodes:
        print("nodes invalid")
        return 1

    first_node = nodes[0]
    node_required = {
        "id", "title", "status", "sequence_index",
    }
    node_missing = sorted(node_required - set(first_node))
    if node_missing:
        print(f"node_missing={node_missing}")
        return 1

    print(f"status={status_code}")
    print(f"session_id={body['id']}")
    print(f"node_count={len(nodes)}")
    print(f"first_status={first_node['status']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
