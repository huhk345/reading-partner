import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup
import re

def parse_epub(file_path):
    """
    Parses an EPUB file and returns:
    1. full_text: The entire text content.
    2. sentences: A list of sentences.
    3. pages_data: Empty list for now as EPUB is reflowable.
    4. cover_image: Bytes of the cover image if found.
    """
    book = epub.read_epub(file_path)
    full_text = ""
    cover_image = None
    
    # Try to extract cover image
    # ebooklib doesn't have a very clean way to get the cover directly
    # but we can look for items with cover type
    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_COVER:
            cover_image = item.get_content()
            break
            
    if not cover_image:
        # Sometimes it's just an image named 'cover.jpg' etc.
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_IMAGE:
                name = item.get_name().lower()
                if 'cover' in name:
                    cover_image = item.get_content()
                    break
    
    # Iterate through all documents in the EPUB
    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_DOCUMENT:
            # Parse HTML content
            soup = BeautifulSoup(item.get_content(), 'html.parser')
            # Get text from the soup
            text = soup.get_text()
            full_text += text + "\n"
    
    # Clean up text
    # Replace multiple newlines with a single newline
    full_text = re.sub(r'\n+', '\n', full_text)
    
    # Sentence splitting with abbreviation protection
    clean_text = re.sub(r'\n+', ' ', full_text)
    abbreviations = [
        r'\bMrs\.', r'\bMr\.', r'\bMs\.', r'\bDr\.', r'\bProf\.', r'\bSr\.', r'\bJr\.',
        r'\bSt\.', r'\bAve\.', r'\bBlvd\.', r'\bRd\.',
        r'\betc\.', r'\bvs\.', r'\bInc\.', r'\bLtd\.', r'\bCorp\.',
        r'\bvol\.', r'\bch\.', r'\bfig\.', r'\bapprox\.',
        r'\bA\.M\.', r'\bP\.M\.', r'\ba\.m\.', r'\bp\.m\.',
        r'\bU\.S\.', r'\bU\.K\.', r'\bE\.U\.',
    ]
    abbreviation_pattern = '|'.join(abbreviations)
    protected = re.sub(f'({abbreviation_pattern})', lambda m: m.group().replace('.', '\x00'), clean_text)
    sentences = re.split(r'(?<=[.!?])\s+', protected)
    sentences = [s.replace('\x00', '.') for s in sentences]
    
    # Return empty pages_data for now
    return full_text, [s.strip() for s in sentences if s.strip()], [], cover_image
