import unittest

from app import private_memory_text, robot_session_id


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


if __name__ == "__main__":
    unittest.main()
