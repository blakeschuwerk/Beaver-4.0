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

    def test_orphan_heading_is_merged_not_standalone(self):
        """A bare heading line separated from its body by a blank line must not
        become its own context-free child chunk (regression for false-positive
        classification on boilerplate headers — see DEBUG-LOG.md)."""
        text = (
            "## Commissioner's Agenda Information Sheet\n\n"
            + ("Description of the actual agenda item content goes here. " * 5)
        )
        chunks = hybrid_chunk_from_markdown(text, "doc-test-3")
        children = [c for c in chunks if c["chunk_type"] == "child"]
        self.assertEqual(len(children), 1)
        self.assertIn("Commissioner's Agenda Information Sheet", children[0]["text"])
        self.assertIn("Description of the actual agenda item", children[0]["text"])

    def test_trailing_orphan_heading_with_no_body_is_dropped(self):
        text = "## Empty Section Heading"
        chunks = hybrid_chunk_from_markdown(text, "doc-test-4")
        children = [c for c in chunks if c["chunk_type"] == "child"]
        self.assertEqual(len(children), 0)

    def test_noise_paragraph_is_dropped(self):
        text = (
            "## Signature Page\n\n"
            + ("Approved by the board on this date with full quorum present. " * 3)
            + "\n\n"
            + "_" * 60
        )
        chunks = hybrid_chunk_from_markdown(text, "doc-test-5")
        children = [c for c in chunks if c["chunk_type"] == "child"]
        self.assertEqual(len(children), 1)
        self.assertNotIn("_" * 10, children[0]["text"])


if __name__ == "__main__":
    unittest.main()
