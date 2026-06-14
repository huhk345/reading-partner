import re
import sqlite3
import os
from difflib import SequenceMatcher

DB_PATH = os.path.join(os.path.dirname(__file__), '../data/ecdict.db')

def is_real_word(word):
    """Check if word exists in local dictionary database."""
    word_clean = re.sub(r"[^a-zA-Z']", '', word.lower())
    print(word_clean)
    if not word_clean:
        return False
    
    if not os.path.exists(DB_PATH):
        return False
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM dictionary WHERE word = ? LIMIT 1", (word_clean,))
        result = cursor.fetchone()
        conn.close()
        return result is not None
    except Exception as e:
        print(f"Error checking dictionary: {e}")
        return False

def get_word_similarity(word1, word2):
    """Calculate similarity between two words (0-1)."""
    w1 = re.sub(r"[^a-zA-Z']", '', word1.lower())
    w2 = re.sub(r"[^a-zA-Z']", '', word2.lower())
    if not w1 or not w2:
        return 0
    return SequenceMatcher(None, w1, w2).ratio()

def get_ngrams(text, n):
    """Get n-grams from text."""
    words = text.lower().split()
    if len(words) < n:
        return []
    return [' '.join(words[i:i+n]) for i in range(len(words) - n + 1)]

def find_phrase_context(clean_text, ocr_word, window=2):
    """
    Find context (surrounding words) for OCR word in clean_text.
    Returns list of (before_word, after_word) tuples.
    """
    clean_words = clean_text.lower().split()
    ocr_clean = re.sub(r"[^a-zA-Z']", '', ocr_word.lower())
    contexts = []
    
    for i, word in enumerate(clean_words):
        word_clean = re.sub(r"[^a-zA-Z']", '', word.lower())
        if word_clean == ocr_clean:
            before = clean_words[max(0, i-window):i]
            after = clean_words[i+1:min(len(clean_words), i+1+window)]
            contexts.append((before, after))
    
    return contexts

def context_similarity(ocr_before, ocr_after, clean_before, clean_after):
    """Calculate similarity between context words."""
    score = 0
    
    for ow, cw in zip(ocr_before, clean_before):
        if get_word_similarity(ow, cw) > 0.6:
            score += 1
    
    for ow, cw in zip(ocr_after, clean_after):
        if get_word_similarity(ow, cw) > 0.6:
            score += 1
    
    total_context = len(clean_before) + len(clean_after)
    if total_context == 0:
        return 0
    
    return score / max(total_context, 1)

def is_likely_ocr_error_context(ocr_word, clean_word, ocr_context, clean_contexts, threshold=0.5):
    """Check if the difference is likely an OCR error using context."""
    orig_clean = re.sub(r"[^a-zA-Z']", '', ocr_word.lower())
    corr_clean = re.sub(r"[^a-zA-Z']", '', clean_word.lower())
    
    if orig_clean == corr_clean:
        return False
    
    word_sim = get_word_similarity(ocr_word, clean_word)
    if word_sim < threshold:
        return False
    
    best_context_score = 0
    for clean_before, clean_after in clean_contexts:
        context_score = context_similarity(
            ocr_context[0], ocr_context[1],
            clean_before, clean_after
        )
        best_context_score = max(best_context_score, context_score)
    
    combined_score = (word_sim * 0.6) + (best_context_score * 0.4)
    return combined_score >= threshold

def get_word_positions(text):
    """Get word positions in text."""
    words = []
    positions = []
    for match in re.finditer(r'\b[a-zA-Z]+\b', text):
        words.append(match.group())
        positions.append(match.start())
    return words, positions

def find_best_match_position(ocr_word, ocr_context_before, ocr_context_after, clean_text):
    """Find the best matching position in clean_text considering context."""
    clean_words = clean_text.lower().split()
    ocr_clean = re.sub(r"[^a-zA-Z']", '', ocr_word.lower())
    ocr_before_clean = [re.sub(r"[^a-zA-Z']", '', w.lower()) for w in ocr_context_before]
    ocr_after_clean = [re.sub(r"[^a-zA-Z']", '', w.lower()) for w in ocr_context_after]
    
    best_pos = -1
    best_score = 0
    
    for i, word in enumerate(clean_words):
        word_clean = re.sub(r"[^a-zA-Z']", '', word.lower())
        if word_clean != ocr_clean:
            continue
        
        clean_before = clean_words[max(0, i-2):i]
        clean_after = clean_words[i+1:min(len(clean_words), i+3)]
        
        score = context_similarity(
            ocr_before_clean, ocr_after_clean,
            clean_before, clean_after
        )
        
        if score > best_score:
            best_score = score
            best_pos = i
    
    return best_pos, best_score

def _score_candidate(ocr_word_clean, clean_word_clean, ocr_before, ocr_after, clean_words, clean_idx):
    """
    Score a candidate correction using both word similarity and context similarity.
    Returns (combined_score, word_sim, context_sim).
    """
    word_sim = get_word_similarity(ocr_word_clean, clean_word_clean)
    if word_sim < 0.4:
        return (0, word_sim, 0)

    window = 2
    clean_before = clean_words[max(0, clean_idx - window):clean_idx]
    clean_after = clean_words[clean_idx + 1:min(len(clean_words), clean_idx + 1 + window)]

    ocr_before_clean = [re.sub(r"[^a-zA-Z']", '', w.lower()) for w in ocr_before]
    ocr_after_clean = [re.sub(r"[^a-zA-Z']", '', w.lower()) for w in ocr_after]
    clean_before_clean = [re.sub(r"[^a-zA-Z']", '', w.lower()) for w in clean_before]
    clean_after_clean = [re.sub(r"[^a-zA-Z']", '', w.lower()) for w in clean_after]

    ctx_sim = context_similarity(ocr_before_clean, ocr_after_clean,
                                 clean_before_clean, clean_after_clean)

    combined = word_sim * 0.55 + ctx_sim * 0.45
    return (combined, word_sim, ctx_sim)


def correct_ocr_errors(full_text, clean_text, pages_data):
    """
    Context-aware OCR error correction.
    Compares full_text (with OCR errors) with clean_text (from LLM).
    Uses surrounding words as context and word similarity to find the best correction.
    """
    if not pages_data or not clean_text:
        return pages_data

    all_page_words = []
    for page in pages_data:
        for word_data in page.get('words', []):
            all_page_words.append(word_data.get('text', ''))

    if not all_page_words:
        return pages_data

    ocr_corrections = {}
    clean_words = clean_text.lower().split()
    # Pre-compute clean word list (stripped) for fast lookup
    clean_words_stripped = [re.sub(r"[^a-zA-Z']", '', w) for w in clean_words]

    # Build index: stripped_clean_word -> [positions in clean_words]
    clean_index = {}
    for i, cw in enumerate(clean_words_stripped):
        clean_index.setdefault(cw, []).append(i)

    # Simple glyph-level fixes
    for word_text in all_page_words:
        if word_text.lower() == '|':
            ocr_corrections['|'] = 'I'

    # Build position index for all_page_words (stripped)
    word_positions = {}
    for i, pw in enumerate(all_page_words):
        pw_clean = re.sub(r"[^a-zA-Z']", '', pw.lower())
        if pw_clean:
            word_positions.setdefault(pw_clean, []).append(i)

    seen = set()

    for word_text in all_page_words:
        word_clean = re.sub(r"[^a-zA-Z']", '', word_text.lower())
        if not word_clean or word_clean in seen:
            continue
        seen.add(word_clean)

        # If the OCR word matches a clean word exactly, no correction needed
        if word_clean in clean_index:
            continue

        # Find all positions of this OCR word in the page word list
        positions_in_pages = word_positions.get(word_clean, [])
        if not positions_in_pages:
            continue

        # Collect context from the first occurrence
        idx = positions_in_pages[0]
        context_before = all_page_words[max(0, idx - 2):idx]
        context_after = all_page_words[idx + 1:idx + 3]

        # --- Phase 1: Search all clean_words for best candidate ---
        best_candidate = None
        best_score = 0

        for ci, cw_stripped in enumerate(clean_words_stripped):
            if cw_stripped == word_clean:
                continue

            combined, word_sim, ctx_sim = _score_candidate(
                word_clean, cw_stripped,
                context_before, context_after,
                clean_words, ci
            )

            if combined > best_score:
                best_score = combined
                best_candidate = clean_words[ci]

        # --- Phase 2: Validate with dictionary if candidate found ---
        # If the OCR word is a real word and the best candidate score is low,
        # the OCR word is probably correct as-is (not an OCR error).
        if best_candidate and best_score >= 0.5:
            # If OCR word is a real dictionary word, require higher confidence
            if is_real_word(word_clean) and best_score < 0.65:
                continue
            ocr_corrections[word_clean] = best_candidate

    if not ocr_corrections:
        return pages_data

    corrected_pages = []
    for page in pages_data:
        corrected_page = page.copy()
        corrected_words = []
        for word_data in page.get('words', []):
            word_text = word_data.get('text', '')
            word_lower = re.sub(r"[^a-zA-Z']", '', word_text.lower())
            if word_lower in ocr_corrections:
                corrected_word = word_data.copy()
                corrected_word['text'] = ocr_corrections[word_lower]
                corrected_word['original_text'] = word_text
                corrected_words.append(corrected_word)
            elif word_text.lower() in ocr_corrections:
                corrected_word = word_data.copy()
                corrected_word['text'] = ocr_corrections[word_text.lower()]
                corrected_word['original_text'] = word_text
                corrected_words.append(corrected_word)
            else:
                corrected_words.append(word_data)
        corrected_page['words'] = corrected_words
        corrected_pages.append(corrected_page)

    return corrected_pages
