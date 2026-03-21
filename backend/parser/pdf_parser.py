import fitz
import re
import pytesseract
from pytesseract import Output
from PIL import Image, ImageFilter, ImageOps
import io
import os
import sys
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter1d

# Ensure backend root is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dictionary.lookup import get_ecdict_entry

def preprocess_for_ocr(pil_image):
    """
    Preprocess PIL image for better OCR accuracy.
    
    Steps:
    1. Convert to grayscale
    2. Increase contrast
    3. Apply slight denoising (median filter)
    4. Adaptive thresholding via local contrast normalization
    5. Sharpen text edges
    
    Returns preprocessed PIL.Image in mode 'L'.
    """
    img = pil_image.copy()

    # 1. Grayscale
    img = ImageOps.grayscale(img)

    # 2. Increase contrast
    img = ImageOps.autocontrast(img, cutoff=2)

    # 3. Denoise — median filter (better than Gaussian for salt-and-pepper noise)
    img = img.filter(ImageFilter.MedianFilter(size=3))

    # 4. Adaptive-like thresholding using numpy
    arr = np.array(img, dtype=np.float32)
    # Local mean via Gaussian blur; subtract from original → high-pass
    from scipy.ndimage import gaussian_filter
    local_mean = gaussian_filter(arr, sigma=25)
    arr = arr - local_mean + 128.0
    arr = np.clip(arr, 0, 255).astype(np.uint8)

    # 5. Otsu-like global threshold on the contrast-enhanced image
    hist, _ = np.histogram(arr.ravel(), bins=256, range=(0, 256))
    total = arr.size
    sum_all = np.sum(np.arange(256) * hist)
    sum_bg, weight_bg, threshold = 0.0, 0.0, 0
    max_var = 0.0
    for t in range(256):
        weight_bg += hist[t]
        if weight_bg == 0:
            continue
        weight_fg = total - weight_bg
        if weight_fg == 0:
            break
        sum_bg += t * hist[t]
        mean_bg = sum_bg / weight_bg
        mean_fg = (sum_all - sum_bg) / weight_fg
        var = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
        if var > max_var:
            max_var = var
            threshold = t

    binary = (arr > threshold).astype(np.uint8) * 255
    img = Image.fromarray(binary, mode="L")

    # 6. Sharpen edges
    img = img.filter(ImageFilter.SHARPEN)

    return img

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

def _ocr_extract(img, zoom, page_width, config='--psm 3'):
    """Run Tesseract OCR on an image and return (words, text, data)."""
    data = pytesseract.image_to_data(img, output_type=Output.DICT, config=config)

    page_words = []
    for i in range(len(data['text'])):
        if data['text'][i].strip() and int(data['conf'][i]) >= 0:
            x = data['left'][i] / zoom
            y = data['top'][i] / zoom
            w = data['width'][i] / zoom
            h = data['height'][i] / zoom

            page_words.append({
                "text": data['text'][i],
                "bbox": [x, y, x + w, y + h],
                "block": data['block_num'][i],
                "line": data['line_num'][i]
            })

    ordered_words, page_text = reorder_and_build_text(page_words, page_width)
    return ordered_words, page_text, data

def calculate_ocr_score(words, data):
    """
    Calculate a score for the OCR result based on:
    1. Average confidence (from Tesseract)
    2. Real word ratio (using local dictionary)
    """
    # 1. Average confidence
    confs = [int(c) for c in data['conf'] if int(c) >= 0]
    avg_conf = np.mean(confs) if confs else 0

    # 2. Real word ratio
    unique_words = set(w['text'].lower() for w in words if w['text'].isalpha() and len(w['text']) > 1)
    if not unique_words:
        # If no valid words found, rely solely on confidence (scaled down)
        return avg_conf * 0.1

    real_word_count = 0
    for w in unique_words:
        if get_ecdict_entry(w):
            real_word_count += 1
    
    real_word_ratio = real_word_count / len(unique_words)

    # Heuristic: Score = real_word_ratio * 70 + (avg_conf / 100) * 30
    # Prioritize getting real words over high-confidence garbage
    score = (real_word_ratio * 70) + (avg_conf * 0.3)
    return score

def best_ocr_extract(img, zoom, page_width):
    """
    Run OCR with both --psm 3 and --psm 4, and choose the better result.
    Returns: (words, text, score)
    """
    # Try PSM 3 (Fully automatic page segmentation, but no OSD)
    words_3, text_3, data_3 = _ocr_extract(img, zoom, page_width, config='--psm 3')
    # print(' '.join(w['text'] for w in words_3))
    score_3 = calculate_ocr_score(words_3, data_3)
    print(f"PSM 3 Score: {score_3:.2f}")
    # Try PSM 4 (Assume a single column of text of variable sizes)
    words_4, text_4, data_4 = _ocr_extract(img, zoom, page_width, config='--psm 4')
    # print(' '.join(w['text'] for w in words_4))
    score_4 = calculate_ocr_score(words_4, data_4)
    print(f"PSM 4 Score: {score_4:.2f}")
    
    # print(f"OCR Comparison - PSM 3 Score: {score_3:.2f}, PSM 4 Score: {score_4:.2f}")

    if score_4 > score_3:
        return words_4, text_4, score_4
    else:
        return words_3, text_3, score_3


def parse_pdf(file_path, debug=False):
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
            if w[4] == "|":
                w = list(w)
                w[4] = "I"
                w = tuple(w)
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
            img_original = Image.open(io.BytesIO(img_data))

            # Preprocess image for better OCR
            img = preprocess_for_ocr(img_original)
            if debug:
                debug_dir = "debug_images"
                os.makedirs(debug_dir, exist_ok=True)
                debug_path = os.path.join(debug_dir, f"page_{page_num + 1}_preprocessed.png")
                img.save(debug_path)

            # Primary OCR attempt with preprocessed image
            page_words, page_text, score = best_ocr_extract(img, zoom, page.rect.width)

            # If score is low, try original image
            if score < 95:
                print(f"Page {page_num}: Preprocessed OCR score {score:.2f} < 95. Trying original image...")
                words_orig, text_orig, score_orig = best_ocr_extract(img_original, zoom, page.rect.width)
                
                if score_orig > score:
                    print(f"Page {page_num}: Original image score {score_orig:.2f} is better. Using original.")
                    page_words = words_orig
                    page_text = text_orig
                    # score = score_orig
                else:
                    print(f"Page {page_num}: Preprocessed image score {score:.2f} is better (or equal). Keeping preprocessed.")

            full_text += page_text + "\n"

            # Update the existing page data with OCR results
            pages_data[page_num]["words"] = page_words

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
