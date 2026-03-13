import json
import re
import requests
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env'))

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "stepfun/step-3.5-flash:free"

def call_openrouter(messages, model=DEFAULT_MODEL, temperature=0.7, max_tokens=50000):
    if not OPENROUTER_API_KEY:
        print("Warning: OPENROUTER_API_KEY not found in environment.")
        return None
    
    try:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        response = requests.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Reading Partner",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=60
        )
        if response.status_code == 200:
            print(f"OpenRouter API response: {response.json()}")
            return response.json()['choices'][0]['message']['content']
        else:
            print(f"OpenRouter API error: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error calling OpenRouter: {e}")
        return None

def get_book_info_and_clean_text(text_sample):
    """
    Uses OpenRouter free LLM to extract book title and clean up a text sample.
    Focuses on extracting the 'real content' - the actual narrative text.
    """
    prompt = f"""
    You are an expert book editor. Analyze the following text sample from a book.
    
    Tasks:
    1. Identify the "title" of the book.
    2. Extract the "cleaned_sample": This should be the REAL narrative content that a reader cares about. 
       - REMOVE: Page numbers, headers, footers, copyright notices, ISBNs, publisher info, and tables of contents.
       - KEEP: The actual story, dialogue, and main text.
       - DO NOT summarize. Keep the original wording exactly as it is, just filter out the non-book elements.
       - Fix any obvious encoding or PDF-extraction artifacts (like words split across lines).

    Text sample:
    {text_sample[:5000]}
    
    Response format: {{"title": "...", "cleaned_sample": "..."}}
    Return ONLY the JSON.
    """
    
    response = call_openrouter([{"role": "user", "content": prompt}], temperature=0.1)
    if response:
        # Extract JSON from response
        match = re.search(r'\{.*\}', response, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
                return data
            except json.JSONDecodeError as e:
                print(f"Failed to decode JSON from OpenRouter response: {e}")
    
    return None

def split_sentences_regex(text):
    """
    Splits text into sentences using regex based on '.', '?', '!' and other sentence-ending symbols.
    """
    if not text:
        return []
    
    # Pre-cleaning: replace multiple spaces and newlines
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Split by '.', '?', '!' followed by space or end of string
    # We use a lookbehind to keep the punctuation
    # Symbols: . ! ? … (ellipsis)
    sentence_endings = r'(?<=[.!?…])\s+'
    sentences = re.split(sentence_endings, text)
    
    return [s.strip() for s in sentences if s.strip()]

# Maintain compatibility with main.py for now
def split_sentences_llm(text):
    """
    Now just a wrapper for regex splitting to avoid redundant LLM calls.
    """
    return split_sentences_regex(text)
