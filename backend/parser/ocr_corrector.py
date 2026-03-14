import re
from difflib import SequenceMatcher

def get_word_similarity(word1, word2):
    """Calculate similarity between two words (0-1)."""
    w1 = re.sub(r'[^a-zA-Z]', '', word1.lower())
    w2 = re.sub(r'[^a-zA-Z]', '', word2.lower())
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
    ocr_clean = re.sub(r'[^a-zA-Z]', '', ocr_word.lower())
    contexts = []
    
    for i, word in enumerate(clean_words):
        word_clean = re.sub(r'[^a-zA-Z]', '', word.lower())
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
    orig_clean = re.sub(r'[^a-zA-Z]', '', ocr_word.lower())
    corr_clean = re.sub(r'[^a-zA-Z]', '', clean_word.lower())
    
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
    ocr_clean = re.sub(r'[^a-zA-Z]', '', ocr_word.lower())
    ocr_before_clean = [re.sub(r'[^a-zA-Z]', '', w.lower()) for w in ocr_context_before]
    ocr_after_clean = [re.sub(r'[^a-zA-Z]', '', w.lower()) for w in ocr_context_after]
    
    best_pos = -1
    best_score = 0
    
    for i, word in enumerate(clean_words):
        word_clean = re.sub(r'[^a-zA-Z]', '', word.lower())
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

def correct_ocr_errors(full_text, clean_text, pages_data):
    """
    Context-aware OCR error correction.
    Compares full_text (with OCR errors) with clean_text (from LLM).
    Uses surrounding words as context for more accurate matching.
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
    
    for word_text in all_page_words:
        word_clean = re.sub(r'[^a-zA-Z]', '', word_text.lower())
        if not word_clean:
            continue
        
        if word_clean in [re.sub(r'[^a-zA-Z]', '', w.lower()) for w in clean_words]:
            continue
        
        idx = None
        for i, pw in enumerate(all_page_words):
            pw_clean = re.sub(r'[^a-zA-Z]', '', pw.lower())
            if pw_clean == word_clean:
                idx = i
                break
        
        context_before = all_page_words[max(0, idx-2):idx] if idx is not None else []
        context_after = all_page_words[idx+1:idx+3] if idx is not None else []
        
        pos, context_score = find_best_match_position(
            word_text, context_before, context_after, clean_text
        )
        
        if pos >= 0 and context_score > 0.3:
            matched_word = clean_words[pos]
            word_sim = get_word_similarity(word_clean, matched_word)
            if word_sim >= 0.5:
                ocr_corrections[word_clean] = matched_word
                continue
        
        for clean_word in clean_words:
            clean_clean = re.sub(r'[^a-zA-Z]', '', clean_word.lower())
            if clean_clean == word_clean:
                continue
            
            word_sim = get_word_similarity(word_clean, clean_clean)
            if word_sim >= 0.6:
                ocr_corrections[word_clean] = clean_clean
                break
    
    if not ocr_corrections:
        return pages_data
    
    corrected_pages = []
    for page in pages_data:
        corrected_page = page.copy()
        corrected_words = []
        for word_data in page.get('words', []):
            word_text = word_data.get('text', '')
            word_lower = re.sub(r'[^a-zA-Z]', '', word_text.lower())
            if word_lower in ocr_corrections:
                corrected_word = word_data.copy()
                corrected_word['text'] = ocr_corrections[word_lower]
                corrected_word['original_text'] = word_text
                corrected_words.append(corrected_word)
            else:
                corrected_words.append(word_data)
        corrected_page['words'] = corrected_words
        corrected_pages.append(corrected_page)
    
    return corrected_pages
