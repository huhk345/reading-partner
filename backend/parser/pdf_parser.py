import fitz
import re
import pytesseract
from pytesseract import Output
from PIL import Image, ImageFilter, ImageOps
import io
import os
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter1d

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

def _ocr_extract(img, zoom, page_width):
    """Run Tesseract OCR on an image and return (words, text)."""
    data = pytesseract.image_to_data(img, output_type=Output.DICT)

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
    return ordered_words, page_text


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

            # Primary OCR attempt
            page_words, page_text = _ocr_extract(img, zoom, page.rect.width)

            # Fallback: if preprocessing produced empty result, try alternatives
            if not page_words:
                # Fallback 1: grayscale + simple threshold (avoids Otsu issues)
                img_gray = ImageOps.grayscale(img_original)
                arr = np.array(img_gray)
                binary = ((arr > 128).astype(np.uint8)) * 255
                img_thresh = Image.fromarray(binary, mode="L")
                page_words, page_text = _ocr_extract(img_thresh, zoom, page.rect.width)

            if not page_words:
                # Fallback 2: original image with no preprocessing
                page_words, page_text = _ocr_extract(img_original, zoom, page.rect.width)

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
