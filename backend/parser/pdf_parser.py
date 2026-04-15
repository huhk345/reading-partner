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
    Reorder words into correct reading order and reconstruct text.

    Key goals:
    - Robust against bad `block` / `line` numbering order (common in PDF extraction / OCR).
    - Order should be applied *within a column* (avoid interleaving multi-column layouts).
    - Within a line: order left-to-right (x).
    - Between lines: order top-to-bottom (y).
    """
    if not page_words:
        return [], ""

    def _median(values, default=0.0):
        if not values:
            return default
        s = sorted(values)
        return float(s[len(s) // 2])

    def _build_segments(words_in_column, median_h):
        """
        Build 'segments' from (block,line) groups, and split within a group
        if it accidentally contains multiple far-apart lines.
        """
        groups = {}
        for w in words_in_column:
            groups.setdefault((w.get("block"), w.get("line")), []).append(w)

        # Split within a (block,line) group by y-gaps, but only for *big* gaps.
        # This preserves slanted lines (small gradual y drift) while separating
        # genuinely different lines that got the same `line` id.
        y_split = max(5.0, median_h * 1.3)
        segments = []
        for (b, l), ws in groups.items():
            ws_sorted = sorted(ws, key=lambda ww: (ww["bbox"][1], ww["bbox"][0]))
            if not ws_sorted:
                continue
            cluster = [ws_sorted[0]]
            for ww in ws_sorted[1:]:
                if (ww["bbox"][1] - cluster[-1]["bbox"][1]) > y_split:
                    segments.append((b, l, cluster))
                    cluster = [ww]
                else:
                    cluster.append(ww)
            segments.append((b, l, cluster))

        def _seg_box(seg_words):
            x0 = min(w["bbox"][0] for w in seg_words)
            y0 = min(w["bbox"][1] for w in seg_words)
            x1 = max(w["bbox"][2] for w in seg_words)
            y1 = max(w["bbox"][3] for w in seg_words)
            return x0, y0, x1, y1

        seg_objs = []
        for b, l, seg_words in segments:
            x0, y0, x1, y1 = _seg_box(seg_words)
            seg_objs.append(
                {
                    "words": seg_words,
                    "x0": x0,
                    "y0": y0,
                    "x1": x1,
                    "y1": y1,
                    "yc": (y0 + y1) / 2.0,
                    "block": b,
                    "line": l,
                }
            )
        return seg_objs

    class _DSU:
        def __init__(self, n):
            self.p = list(range(n))

        def find(self, a):
            while self.p[a] != a:
                self.p[a] = self.p[self.p[a]]
                a = self.p[a]
            return a

        def union(self, a, b):
            ra, rb = self.find(a), self.find(b)
            if ra != rb:
                self.p[rb] = ra

    def _reorder_single_column(words_in_column):
        if not words_in_column:
            return [], ""

        heights = [(w["bbox"][3] - w["bbox"][1]) for w in words_in_column]
        median_h = _median(heights, default=10.0)

        segs = _build_segments(words_in_column, median_h)
        if not segs:
            return [], ""

        # Cluster segments into physical text lines.
        #
        # Important: only merge segments if their `line` id matches.
        # This prevents accidental merges across different text lines that happen
        # to be close (especially in complex layouts).
        n = len(segs)
        dsu = _DSU(n)
        order = sorted(range(n), key=lambda i: segs[i]["yc"])

        line_tol = median_h * 1.1
        overlap_req = 0.1
        x_gap_tol = median_h * 4.0
        # When PDF extraction assigns different `line` ids to the *same* physical
        # text line (common near wrapped lines / right-edge spillover), allow
        # a stricter "left-to-right continuation" merge.
        continuation_overlap_req = 0.45
        continuation_x_gap_tol = median_h * 1.8

        for pos, i in enumerate(order):
            yi = segs[i]["yc"]
            for j in order[pos + 1 :]:
                if (segs[j]["yc"] - yi) > line_tol:
                    break

                a, b = segs[i], segs[j]
                same_line_id = a.get("line") == b.get("line")

                overlap = min(a["y1"], b["y1"]) - max(a["y0"], b["y0"])
                min_h = min(a["y1"] - a["y0"], b["y1"] - b["y0"])
                if min_h <= 0:
                    continue
                overlap_ratio = overlap / min_h
                if overlap_ratio < overlap_req:
                    continue

                # Horizontal distance between the two segments (0 if overlapping).
                is_continuation = False
                if not same_line_id:
                    # a -> b
                    if a["x1"] <= (b["x0"] + 1.0):
                        gap = b["x0"] - a["x1"]
                        if gap <= continuation_x_gap_tol and overlap_ratio >= continuation_overlap_req:
                            is_continuation = True
                    # b -> a
                    elif b["x1"] <= (a["x0"] + 1.0):
                        gap = a["x0"] - b["x1"]
                        if gap <= continuation_x_gap_tol and overlap_ratio >= continuation_overlap_req:
                            is_continuation = True

                # Primary path: same line id. Fallback: strict left-right continuation.
                if same_line_id or is_continuation:
                    # Additional guard: if they are too far apart vertically, don't merge.
                    if overlap_ratio >= overlap_req:
                        dsu.union(i, j)

        # Build line clusters
        clusters = {}
        for i in range(n):
            clusters.setdefault(dsu.find(i), []).append(segs[i])

        lines = []
        for seg_list in clusters.values():
            x0 = min(s["x0"] for s in seg_list)
            y0 = min(s["y0"] for s in seg_list)
            x1 = max(s["x1"] for s in seg_list)
            y1 = max(s["y1"] for s in seg_list)
            lines.append({"segs": seg_list, "x0": x0, "y0": y0, "x1": x1, "y1": y1})

        # Top-to-bottom; if tied, left-to-right
        lines.sort(key=lambda l: (l["y0"], l["x0"]))

        ordered_words = []
        text_lines = []
        for line in lines:
            line["segs"].sort(key=lambda s: s["x0"])
            line_words = []
            for seg in line["segs"]:
                seg["words"].sort(key=lambda w: w["bbox"][0])
                line_words.extend(seg["words"])
                ordered_words.extend(seg["words"])
            text_lines.append(" ".join(w["text"] for w in line_words))

        return ordered_words, "\n".join(text_lines)

    # ---- Column detection (keep existing projection approach) ----
    data = []
    for w in page_words:
        x0, y0, x1, y1 = w["bbox"]
        data.append({"left": x0, "top": y0, "right": x1, "bottom": y1})
    df = pd.DataFrame(data)

    w_int = int(width) if width else 0
    if w_int <= 0:
        w_int = int(max(df["right"].max(), 1000))

    projection = np.zeros(w_int, dtype=np.float32)
    for _, r in df.iterrows():
        x1 = max(0, int(r.left))
        x2 = min(w_int, int(r.right))
        if x1 < x2:
            projection[x1:x2] += 1
    projection = gaussian_filter1d(projection, sigma=10)

    center_region = projection[w_int // 3 : 2 * w_int // 3]
    if len(center_region) > 0:
        gap_min = float(np.min(center_region))
        gap_idx = int(np.argmin(center_region))
        separator = gap_idx + w_int // 3
        left_peak = float(np.max(projection[:separator])) if separator > 0 else 0.0
        right_peak = float(np.max(projection[separator:])) if separator < w_int else 0.0
        is_two_columns = (
            left_peak > 0
            and right_peak > 0
            and gap_min < 0.2 * min(left_peak, right_peak)
        )
    else:
        is_two_columns = False
        separator = w_int // 2

    if is_two_columns:
        left_words = [w for w in page_words if w["bbox"][0] < separator]
        right_words = [w for w in page_words if w["bbox"][0] >= separator]

        left_ordered, left_text = _reorder_single_column(left_words)
        right_ordered, right_text = _reorder_single_column(right_words)
        page_text = (left_text + "\n\n" + right_text).strip()
        return left_ordered + right_ordered, page_text

    ordered_words, page_text = _reorder_single_column(page_words)
    return ordered_words, page_text

def _ocr_extract(img, zoom, page_width, config='--psm 3'):
    """Run Tesseract OCR on an image and return (words, text, data)."""
    data = pytesseract.image_to_data(img, output_type=Output.DICT, config=config)

    page_words = []
    for i in range(len(data['text'])):
        if data['text'][i].strip() and int(data['conf'][i]) >= 0:
            if data['text'][i].strip() in ("|", "｜"):
                data['text'][i] = "I"
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
    Run OCR with --psm 3, --psm 4, and --psm 11, and choose the best result.
    Returns: (words, text, score)
    """
    # Try PSM 3 (Fully automatic page segmentation, but no OSD)
    words_3, text_3, data_3 = _ocr_extract(img, zoom, page_width, config='--psm 3')
    score_3 = calculate_ocr_score(words_3, data_3)
    print(f"PSM 3 Score: {score_3:.2f}")

    # Try PSM 4 (Assume a single column of text of variable sizes)
    words_4, text_4, data_4 = _ocr_extract(img, zoom, page_width, config='--psm 4')
    score_4 = calculate_ocr_score(words_4, data_4)
    print(f"PSM 4 Score: {score_4:.2f}")

    # Try PSM 11 (Sparse text. Find as much text as possible in no particular order.)
    words_11, text_11, data_11 = _ocr_extract(img, zoom, page_width, config='--psm 11')
    score_11 = calculate_ocr_score(words_11, data_11)
    print(f"PSM 11 Score: {score_11:.2f}")

    results = [
        (words_3, text_3, score_3),
        (words_4, text_4, score_4),
        (words_11, text_11, score_11)
    ]

    return max(results, key=lambda x: x[2])

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

        # Fix word order for API consumers (pages_data.words).
        page_words, _ = reorder_and_build_text(page_words, page.rect.width)
        
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
    
    return full_text, [s.strip() for s in sentences if s.strip()], pages_data, cover_image
