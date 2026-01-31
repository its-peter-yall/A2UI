import unittest
from unittest.mock import patch

from fastapi import HTTPException

from server.routers.chat import chat
from server.schemas.chat import ChatRequest


class ChatSessionTests(unittest.TestCase):
    @patch("server.routers.chat.session_manager")
    def test_invalid_session_id_returns_404(self, session_manager_mock) -> None:
        session_manager_mock.get_session.return_value = None
        session_manager_mock.create_session.return_value = {
            "id": "new-session",
            "title": "hi",
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T00:00:00",
            "message_count": 0,
        }
        session_manager_mock.get_history.return_value = [
            {"role": "user", "content": "hi"}
        ]
        session_manager_mock.add_message.side_effect = [
            {
                "id": "m1",
                "session_id": "new-session",
                "role": "user",
                "content": "hi",
                "thinking_content": None,
                "timestamp": "2026-01-01T00:00:01",
            },
            {
                "id": "m2",
                "session_id": "new-session",
                "role": "model",
                "content": "ok",
                "thinking_content": None,
                "timestamp": "2026-01-01T00:00:02",
            },
        ]

        with self.assertRaises(HTTPException) as context:
            chat(ChatRequest(session_id="missing", message="hi"))

        self.assertEqual(context.exception.status_code, 404)
        session_manager_mock.get_session.assert_called_once_with("missing")
        session_manager_mock.create_session.assert_not_called()
