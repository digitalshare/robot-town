import os
import unittest
from unittest.mock import patch

from app import cognee_recall, cognee_remember, durable_memory_text, private_memory_text, robot_session_id


class PrivateMemoryTest(unittest.TestCase):
    def test_memory_is_tagged_to_the_exact_robot(self):
        payload = [
            {
                "source": "session",
                "question": "[robot_id=UNIT-04 robot_name=UNIT-04] secret for four",
                "answer": "FOUR ONLY",
            },
            {
                "source": "session",
                "question": "[robot_id=UNIT-05 robot_name=UNIT-05] secret for five",
                "answer": "FIVE ONLY",
            },
            {"source": "graph", "text": "old cross-robot graph result"},
            {"source": "session", "question": "unattributed old memory", "answer": "IGNORE"},
        ]

        memory = private_memory_text(payload, "UNIT-04")

        self.assertIn("FOUR ONLY", memory)
        self.assertNotIn("FIVE ONLY", memory)
        self.assertNotIn("old cross-robot graph result", memory)
        self.assertNotIn("IGNORE", memory)
        self.assertEqual(robot_session_id("UNIT-04"), "robot:UNIT-04")

    def test_durable_memory_is_tagged_to_the_exact_robot(self):
        memory = durable_memory_text("UNIT-04", {"name": "Four"}, "keep this", "FOUR ONLY")

        self.assertIn("robot_id=UNIT-04", memory)
        self.assertIn("FOUR ONLY", memory)
        self.assertNotIn("UNIT-05", memory)


class DurableMemoryWriteTest(unittest.IsolatedAsyncioTestCase):
    async def test_remember_writes_one_durable_dataset_entry(self):
        calls = []

        class Response:
            def raise_for_status(self):
                return None

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, traceback):
                return False

            async def post(self, url, **kwargs):
                calls.append((url, kwargs))
                return Response()

        with patch.dict(os.environ, {"COGNEE_BASE_URL": "https://cognee.test", "COGNEE_API_KEY": "secret"}), patch(
            "app.httpx.AsyncClient", return_value=Client()
        ):
            await cognee_remember("UNIT-04", {"name": "Four"}, "keep this", "FOUR ONLY")

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0], "https://cognee.test/api/v1/remember")
        self.assertEqual(calls[0][1]["data"]["datasetName"], "robot_town")
        self.assertNotIn("session_id", calls[0][1]["data"])
        self.assertIn("robot_id=UNIT-04", calls[0][1]["data"]["raw_data"])


class RecallScopeTest(unittest.IsolatedAsyncioTestCase):
    async def test_recall_uses_exact_robot_session_and_context_only(self):
        calls = []

        class Response:
            status_code = 200

            def json(self):
                return [
                    {
                        "source": "session",
                        "question": "[robot_id=UNIT-04 robot_name=UNIT-04] private",
                        "answer": "FOUR ONLY",
                    },
                    {"source": "graph", "text": "cross-robot result"},
                ]

            def raise_for_status(self):
                return None

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, traceback):
                return False

            async def post(self, url, **kwargs):
                calls.append((url, kwargs))
                return Response()

        with patch.dict(os.environ, {"COGNEE_BASE_URL": "https://cognee.test", "COGNEE_API_KEY": "secret"}), patch(
            "app.httpx.AsyncClient", return_value=Client()
        ):
            memory = await cognee_recall("UNIT-04", "what do you remember?")

        self.assertEqual(calls[0][1]["json"], {
            "query": "what do you remember?",
            "session_id": "robot:UNIT-04",
            "datasets": ["robot_town"],
            "only_context": True,
            "scope": ["session"],
        })
        self.assertIn("FOUR ONLY", memory)
        self.assertNotIn("cross-robot result", memory)


if __name__ == "__main__":
    unittest.main()
