import g4f
import json
import re

def get_book_info_and_clean_text(text_sample):
    """
    Uses a free LLM to extract book title and clean up a text sample.
    """
    prompt = f"""
    Analyze the following text sample from a book and return a JSON object with:
    1. "title": The most likely title of the book.
    2. "cleaned_sample": A cleaned version of the text sample (fix encoding issues, remove headers/footers if obvious).

    Text sample:
    {text_sample[:2000]}
    
    Response format: {{"title": "...", "cleaned_sample": "..."}}
    """
    
    try:
        response = g4f.ChatCompletion.create(
            model=g4f.models.gpt_35_turbo,
            messages=[{"role": "user", "content": prompt}],
        )
        # Extract JSON from response
        match = re.search(r'\{.*\}', response, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        print(f"Error getting book info: {e}")
    
    return None

def split_sentences_llm(text):
    """
    Uses a free LLM to split text into real sentences.
    Since LLMs have context limits, we'll process in chunks or use a hybrid approach.
    For simplicity in this prototype, we'll use LLM to refine a chunk and return sentences.
    """
    # If text is too long, we might need a more robust strategy.
    # For now, let's use a simple regex but allow LLM to "fix" a few if needed,
    # OR just use a better library if g4f is slow.
    # But the requirement says "use free llm tools/api".
    
    chunks = [text[i:i+4000] for i in range(0, len(text), 4000)]
    all_sentences = []
    
    for chunk in chunks[:3]: # Limit to first 3 chunks for performance in prototype
        prompt = f"""
        Split the following text into a list of real, complete sentences. 
        Return ONLY a JSON list of strings.
        
        Text:
        {chunk}
        """
        try:
            response = g4f.ChatCompletion.create(
                model=g4f.models.gpt_35_turbo,
                messages=[{"role": "user", "content": prompt}],
            )
            match = re.search(r'\[.*\]', response, re.DOTALL)
            if match:
                sentences = json.loads(match.group())
                all_sentences.extend(sentences)
        except Exception as e:
            print(f"Error splitting sentences: {e}")
            # Fallback to regex
            all_sentences.extend(re.split(r'(?<=[.!?])\s+', chunk))
            
    # If we didn't process the whole book with LLM (to save time/limits),
    # process the rest with regex.
    if len(text) > 12000:
        remaining_text = text[12000:]
        all_sentences.extend(re.split(r'(?<=[.!?])\s+', remaining_text))
        
    return [s.strip() for s in all_sentences if s.strip()]
