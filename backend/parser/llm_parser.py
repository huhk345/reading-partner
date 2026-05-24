import json
import re
import requests
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env'))

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
# Get default model(s) from environment. Support comma-separated list for failover.
DEFAULT_MODEL_ENV = os.getenv("DEFAULT_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")
DEFAULT_MODELS = [m.strip() for m in DEFAULT_MODEL_ENV.split(",") if m.strip()]
if not DEFAULT_MODELS:
    DEFAULT_MODELS = ["nvidia/nemotron-3-super-120b-a12b:free"]
# Maintain DEFAULT_MODEL for compatibility, use the first one from the list
DEFAULT_MODEL = DEFAULT_MODELS[0]

def call_openrouter(messages, model=None, temperature=0.7, max_tokens=50000):
    """
    Calls OpenRouter API with optional model override. 
    If model is not provided, it cycles through DEFAULT_MODELS on failure.
    Retries up to 3 times (4 attempts total).
    """
    if not OPENROUTER_API_KEY:
        print("Warning: OPENROUTER_API_KEY not found in environment.")
        return None
    
    # Use specified model or fallback to default models list
    models_to_try = [model] if model else DEFAULT_MODELS
    # Retry at most 3 times means 4 total attempts
    max_attempts = 4
    
    for attempt in range(max_attempts):
        current_model = models_to_try[attempt % len(models_to_try)]
        try:
            payload = {
                "model": current_model,
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
                return response.json()['choices'][0]['message']['content']
            else:
                print(f"OpenRouter API error (attempt {attempt + 1}, model {current_model}): {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Error calling OpenRouter (attempt {attempt + 1}, model {current_model}): {e}")
            
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
    print("Calling OpenRouter to extract book info and clean text...")
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
    Splits text into sentences by sentence-ending punctuation (.!?…).
    - Splits at . or ? or ! or … followed by whitespace, quotes, or end of string.
    - Handles common abbreviations to avoid false splits.
    """
    if not text:
        return []

    text = re.sub(r'\s+', ' ', text).strip()

    abbreviations = [
        r'\bMrs\.', r'\bMr\.', r'\bMs\.', r'\bDr\.', r'\bProf\.', r'\bSr\.', r'\bJr\.',
        r'\bSt\.', r'\bAve\.', r'\bBlvd\.', r'\bRd\.',
        r'\betc\.', r'\bvs\.', r'\bInc\.', r'\bLtd\.', r'\bCorp\.',
        r'\bvol\.', r'\bch\.', r'\bfig\.', r'\bapprox\.',
        r'\bA\.M\.', r'\bP\.M\.', r'\ba\.m\.', r'\bp\.m\.',
        r'\bU\.S\.', r'\bU\.K\.', r'\bE\.U\.',
    ]
    abbreviation_pattern = '|'.join(abbreviations)
    protected = re.sub(f'({abbreviation_pattern})', lambda m: m.group().replace('.', '\x00'), text)

    quote_chars = '"“”\''
    sentences = []
    current = []
    chars = list(protected)
    i = 0
    while i < len(chars):
        c = chars[i]
        current.append(c)

        should_split = False
        if c in '.!?…':
            if i + 1 == len(chars):
                should_split = True
            elif chars[i+1] in quote_chars:
                current.append(chars[i+1])
                i += 1
                should_split = True
            elif chars[i+1].isspace():
                should_split = True

        if should_split:
            s = "".join(current).replace('\x00', '.').strip()
            if s:
                sentences.append(s)
            current = []
            while i + 1 < len(chars) and chars[i+1].isspace():
                i += 1

        i += 1

    if current:
        s = "".join(current).replace('\x00', '.').strip()
        if s:
            sentences.append(s)

    return sentences
# Maintain compatibility with main.py for now
def split_sentences_llm(text):
    """
    Now just a wrapper for regex splitting to avoid redundant LLM calls.
    """
    return split_sentences_regex(text)
