import re
from typing import Optional, Pattern


def compile_whole_token_pattern(word: str) -> Optional[Pattern[str]]:
    """
    Build a conservative "whole token" regex pattern for matching a vocab word/phrase
    inside a sentence.

    We intentionally avoid `\\b` boundaries because vocab can contain non-word characters
    (e.g. "C++"), and `\\b` fails when a token ends with non-word characters.

    Whole-token definition:
      - The match must NOT have a `\\w` character immediately before or after it.
      - This prevents substring matches like: "age" matching inside "image".
    """
    w = (word or "").strip().lower()
    if not w:
        return None
    try:
        return re.compile(rf"(?<!\w){re.escape(w)}(?!\w)", re.IGNORECASE)
    except re.error:
        return None


def whole_token_match(word: str, sentence: str) -> bool:
    """Return True if `word` matches `sentence` as a whole token."""
    if not word or not sentence:
        return False
    pattern = compile_whole_token_pattern(word)
    if not pattern:
        return False
    return bool(pattern.search(sentence))


def pick_sentence_matches(word: str, candidate_sentences: list[str]) -> list[str]:
    """
    Match strategy (Word Wall):
      1) Try strict whole-token matches first (prevents "age" -> "image").
      2) If strict finds nothing, fall back to substring matches so the node
         doesn't become isolated.
    """
    strict = [s for s in candidate_sentences if whole_token_match(word, s)]
    return strict if strict else candidate_sentences
