import unittest
from typing import get_args

from server.routers import sessions as sessions_router


class SessionMessagesTests(unittest.TestCase):
    def test_get_session_messages_limit_annotation_optional(self) -> None:
        annotation = sessions_router.get_session_messages.__annotations__.get("limit")
        self.assertIsNotNone(annotation)
        args = get_args(annotation)
        self.assertIn(int, args)
        self.assertIn(type(None), args)
