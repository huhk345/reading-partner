import json
from pathlib import Path


def test_reorder_words_matches_reference():
    """
    Regression test for PDF/OCR word ordering.

    `test.response` is a captured words list with wrong order.
    `right` is the expected correct order.
    """
    repo_root = Path(__file__).resolve().parents[2]
    test_path = repo_root / "test.response"
    right_path = repo_root / "right"

    test_words = json.loads(test_path.read_text())
    right_words = json.loads(right_path.read_text())

    from backend.parser.pdf_parser import reorder_and_build_text

    ordered, _ = reorder_and_build_text(test_words, width=2000)

    assert [w["text"] for w in ordered] == [w["text"] for w in right_words]

