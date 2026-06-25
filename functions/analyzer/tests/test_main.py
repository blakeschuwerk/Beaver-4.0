"""Unit tests for analyzer extract_text fail-loud behavior (see DEBUG-LOG.md)."""

import importlib
import os
import unittest
from unittest.mock import patch


def _reload_main():
    """main.py reads MOCK_MODE/USE_DOCLING as module-level consts at import
    time, so tests that change those env vars must reload the module."""
    import src.main as main_mod

    return importlib.reload(main_mod)


class TestExtractTextFailLoud(unittest.TestCase):
    def test_docling_failure_raises_when_mock_mode_off(self):
        with patch.dict(os.environ, {"USE_DOCLING": "true", "MOCK_MODE": "false"}):
            main_mod = _reload_main()
            with patch.object(main_mod, "extract_with_docling", side_effect=ValueError("corrupt PDF")):
                with self.assertRaises(main_mod.DoclingExtractionError):
                    main_mod.extract_text(b"not-a-real-pdf", "doc-test-1")

    def test_docling_failure_falls_back_to_mock_when_mock_mode_on(self):
        with patch.dict(os.environ, {"USE_DOCLING": "true", "MOCK_MODE": "true"}):
            main_mod = _reload_main()
            with patch.object(main_mod, "extract_with_docling", side_effect=ValueError("corrupt PDF")):
                text, used_docling = main_mod.extract_text(b"not-a-real-pdf", "doc-test-2")
                self.assertFalse(used_docling)
                self.assertTrue(len(text) > 0)

    def test_docling_success_returns_real_text(self):
        with patch.dict(os.environ, {"USE_DOCLING": "true", "MOCK_MODE": "false"}):
            main_mod = _reload_main()
            with patch.object(main_mod, "extract_with_docling", return_value="# Real extracted text"):
                text, used_docling = main_mod.extract_text(b"real-pdf-bytes", "doc-test-3")
                self.assertTrue(used_docling)
                self.assertEqual(text, "# Real extracted text")

    def test_docling_disabled_and_mock_off_raises(self):
        with patch.dict(os.environ, {"USE_DOCLING": "false", "MOCK_MODE": "false"}):
            main_mod = _reload_main()
            with self.assertRaises(main_mod.DoclingExtractionError):
                main_mod.extract_text(b"anything", "doc-test-4")


if __name__ == "__main__":
    unittest.main()
