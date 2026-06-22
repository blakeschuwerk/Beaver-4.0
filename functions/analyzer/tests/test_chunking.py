"""Unit tests for analyzer chunking."""

import unittest

from src.chunking import hybrid_chunk, hybrid_chunk_from_markdown


class TestChunking(unittest.TestCase):
    def test_hybrid_chunk_creates_parent_and_children(self):
        text = "Short.\n\n" + ("This is a long paragraph about infrastructure. " * 5) + "\n\n" + (
            "Another long paragraph about drainage improvements. " * 5
        )
        chunks = hybrid_chunk(text, "doc-test-1")
        types = {c["chunk_type"] for c in chunks}
        self.assertIn("parent", types)
        self.assertIn("child", types)
        self.assertGreaterEqual(len(chunks), 2)

    def test_hybrid_chunk_from_markdown_sections(self):
        text = (
            "# Capital Projects\n\n"
            + ("Roadway resurfacing budget allocation details here. " * 5)
            + "\n\n"
            + "## Drainage\n\n"
            + ("Stormwater drainage pipe replacement scope. " * 5)
        )
        chunks = hybrid_chunk_from_markdown(text, "doc-test-2")
        parents = [c for c in chunks if c["chunk_type"] == "parent"]
        self.assertGreaterEqual(len(parents), 2)


if __name__ == "__main__":
    unittest.main()
