import fitz
import re
import pytesseract
from pytesseract import Output
from PIL import Image
import io
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter1d

def reorder_and_build_text(page_words, width):
    """
    Reorder words based on column projection profile and reconstruct text.
    Handles both 1-column and 2-column layouts robustly.
    """
    if not page_words:
        return [], ""
    
    data = []
    for i, w in enumerate(page_words):
        bbox = w['bbox']
        data.append({
            'index': i,
            'left': bbox[0],
            'top': bbox[1],
            'right': bbox[2],
            'bottom': bbox[3],
            'width': bbox[2] - bbox[0],
            'height': bbox[3] - bbox[1]
        })
    df = pd.DataFrame(data)

    # 1. Projection profile
    w_int = int(width)
    if w_int <= 0:
        w_int = 1000
    projection = np.zeros(w_int)

    for _, r in df.iterrows():
        x1 = max(0, int(r.left))
        x2 = min(w_int, int(r.right))
        if x1 < x2:
            projection[x1:x2] += 1

    projection = gaussian_filter1d(projection, sigma=10)

    # 2. Detect column separator
    center_region = projection[w_int//3 : 2*w_int//3]
    
    if len(center_region) > 0:
        gap_min = np.min(center_region)
        gap_idx = np.argmin(center_region)
        separator = gap_idx + w_int//3

        left_peak = np.max(projection[:separator]) if separator > 0 else 0
        right_peak = np.max(projection[separator:]) if separator < w_int else 0

        # Robustness: Check if it's actually 2 columns
        # Gap should be significantly lower than the peaks
        is_two_columns = (left_peak > 0 and right_peak > 0 and gap_min < 0.2 * min(left_peak, right_peak))
    else:
        is_two_columns = False
        separator = w_int // 2

    if is_two_columns:
        # 3. Split columns
        left_df = df[df.left < separator].copy()
        right_df = df[df.left >= separator].copy()
        
        ordered_indices = left_df['index'].tolist() + right_df['index'].tolist()
        
        # Build text
        page_text = " ".join(page_words[i]['text'] for i in left_df['index'])
        page_text += "\n\n" # separate columns
        page_text += " ".join(page_words[i]['text'] for i in right_df['index'])
            
    else:
        ordered_indices = df['index'].tolist()
        page_text = " ".join(page_words[i]['text'] for i in df['index'])

    ordered_words = [page_words[i] for i in ordered_indices]
    return ordered_words, page_text

def parse_pdf(file_path):
    """
    Parses a PDF file and returns:
    1. full_text: The entire text content.
    2. sentences: A list of sentences.
    3. pages_data: A list of pages, each with words and their bounding boxes.
    4. cover_image: Bytes of the first page as a PNG.
    """
    doc = fitz.open(file_path)
    full_text = ""
    pages_data = []
    cover_image = None
    
    if len(doc) > 0:
        page0 = doc.load_page(0)
        pix = page0.get_pixmap()
        cover_image = pix.tobytes("png")
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        
        # Get words with coordinates: (x0, y0, x1, y1, "word", block_no, line_no, word_no)
        words = page.get_text("words")
        page_words = []
        for w in words:
            page_words.append({
                "text": w[4],
                "bbox": [w[0], w[1], w[2], w[3]],
                "block": w[5],
                "line": w[6]
            })
        
        page_text = page.get_text()
        full_text += page_text + "\n"
        
        pages_data.append({
            "page_index": page_num,
            "width": page.rect.width,
            "height": page.rect.height,
            "words": page_words
        })
    
    # If no text found via regular extraction, attempt OCR
    if not full_text.strip():
        print(f"No text found in {file_path}, attempting OCR...")
        full_text = ""
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            zoom = 2
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            
            # Get detailed data including bounding boxes
            data = pytesseract.image_to_data(img, output_type=Output.DICT)
            
            page_words = []
            n_boxes = len(data['text'])
            for i in range(n_boxes):
                # Filter out empty text and low confidence results if needed
                if data['text'][i].strip():
                    # Coordinates are in pixels of the zoomed image
                    # Need to scale back to PDF points
                    x = data['left'][i] / zoom
                    y = data['top'][i] / zoom
                    w = data['width'][i] / zoom
                    h = data['height'][i] / zoom
                    
                    page_words.append({
                        "text": data['text'][i],
                        "bbox": [x, y, x + w, y + h], # x0, y0, x1, y1
                        "block": data['block_num'][i],
                        "line": data['line_num'][i]
                    })
            
            # Reorder words and build text using projection profile
            ordered_words, page_text = reorder_and_build_text(page_words, page.rect.width)
            
            full_text += page_text + "\n"
            
            # Update the existing page data with OCR results
            pages_data[page_num]["words"] = ordered_words

    # Sentence splitting with abbreviation protection
    clean_text = re.sub(r'\n+', ' ', full_text)
    abbreviations = [
        r'Mrs\.', r'Mr\.', r'Ms\.', r'Dr\.', r'Prof\.', r'Sr\.', r'Jr\.',
        r'St\.', r'Ave\.', r'Blvd\.', r'Rd\.',
        r'etc\.', r'vs\.', r'Inc\.', r'Ltd\.', r'Corp\.',
        r'vol\.', r'ch\.', r'fig\.', r'approx\.',
        r'A\.M\.', r'P\.M\.', r'a\.m\.', r'p\.m\.',
        r'U\.S\.', r'U\.K\.', r'E\.U\.',
    ]
    abbreviation_pattern = '|'.join(abbreviations)
    protected = re.sub(f'({abbreviation_pattern})', lambda m: m.group().replace('.', '\x00'), clean_text)
    sentences = re.split(r'(?<=[.!?])\s+', protected)
    sentences = [s.replace('\x00', '.') for s in sentences]
    
    return full_text, [s.strip() for s in sentences if s.strip()], pages_data, cover_image
