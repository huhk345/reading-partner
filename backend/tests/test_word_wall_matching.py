import os
import sys

# Ensure the backend folder is importable regardless of how pytest is invoked.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from matching import whole_token_match, pick_sentence_matches


def test_whole_token_match_does_not_match_substrings():
    # "age" should NOT match inside "image"
    assert whole_token_match("age", "It's a big image.") is False


def test_whole_token_match_matches_real_token():
    assert whole_token_match("age", "We are the same age.") is True
    assert whole_token_match("age", "We are the same age!") is True


def test_pick_sentence_matches_falls_back_when_strict_finds_nothing():
    # Strict match fails for "age" in "image", so we fall back to substring/contains matches.
    # This matches the requested behavior: only use the fallback mode when strict returns nothing.
    candidates = ["It's a big image."]
    assert pick_sentence_matches("age", candidates) == candidates
