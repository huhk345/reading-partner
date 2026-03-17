import spacy
import logging

logger = logging.getLogger(__name__)

try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    logger.warning("spaCy model 'en_core_web_sm' not found. Run: python -m spacy download en_core_web_sm")
    nlp = None

def get_lemma(word: str) -> str:
    """
    Returns the lemma (root form) of a word using spaCy.
    If spaCy is not available or fails, returns the original word.
    """
    if not word or not nlp:
        return word
    
    try:
        doc = nlp(word.strip().lower())
        if doc and len(doc) > 0:
            lemma = doc[0].lemma_
            if lemma and lemma != word.strip().lower():
                return lemma
    except Exception as e:
        logger.warning(f"Error getting lemma for '{word}': {e}")
    
    return word
