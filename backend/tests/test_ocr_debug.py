"""
OCR Diagnostic Tool
===================
Identifies why OCR returns empty results for preprocessed images.

Usage:
    python -m backend.tests.test_ocr_debug                       # All debug_images
    python -m backend.tests.test_ocr_debug --page 3              # Specific page
    python -m backend.tests.test_ocr_debug --pdf "Loose Tooth.pdf"  # From source PDF
    python -m backend.tests.test_ocr_debug --page 3 --pdf "Loose Tooth.pdf"

What it tests:
    1. Image quality analysis (dimensions, pixel distribution, contrast)
    2. Each preprocessing step isolated (which step breaks OCR?)
    3. Tesseract PSM/OEM mode sweep
    4. Original PDF image vs preprocessed comparison
    5. Inverted image test (sometimes Tesseract expects dark-on-light)
    6. DPI metadata test
    7. Tesseract version and installed languages
"""

import os
import argparse
import io
import warnings

import numpy as np
from PIL import Image, ImageFilter, ImageOps
from scipy.ndimage import gaussian_filter

# Suppress noisy warnings
warnings.filterwarnings("ignore")

# ── Paths ───────────────────────────────────────────────────────────
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEBUG_DIR = os.path.join(BACKEND_DIR, "debug_images")
UPLOADS_DIR = os.path.join(BACKEND_DIR, "uploads")


# ═══════════════════════════════════════════════════════════════════
# 1. IMAGE QUALITY ANALYSIS
# ═══════════════════════════════════════════════════════════════════

def analyze_image_quality(img, label="Image"):
    """Analyze image properties that affect OCR accuracy."""
    print(f"\n{'='*60}")
    print(f"  IMAGE QUALITY: {label}")
    print(f"{'='*60}")

    arr = np.array(img)
    print(f"  Mode:           {img.mode}")
    print(f"  Size:           {img.size[0]} x {img.size[1]} px")
    print(f"  DPI:            {img.info.get('dpi', 'NOT SET')}")
    print(f"  Array shape:    {arr.shape}")
    print(f"  Dtype:          {arr.dtype}")
    print(f"  Pixel range:    {arr.min()} - {arr.max()}")
    print(f"  Mean intensity: {arr.mean():.1f}")
    print(f"  Std deviation:  {arr.std():.1f}")

    if arr.ndim == 2:
        unique = np.unique(arr)
        print(f"  Unique values:  {len(unique)} {'(BINARY!)' if len(unique) <= 2 else ''}")
        if len(unique) <= 5:
            print(f"  Values:         {unique.tolist()}")

        pct_black = (arr == 0).sum() / arr.size * 100
        pct_white = (arr == 255).sum() / arr.size * 100
        print(f"  Black pixels:   {pct_black:.1f}%")
        print(f"  White pixels:   {pct_white:.1f}%")

        # Contrast ratio
        if arr.std() < 10:
            print(f"  ⚠️  VERY LOW CONTRAST (std={arr.std():.1f}) — OCR will struggle")
        elif arr.std() < 30:
            print(f"  ⚠️  LOW CONTRAST (std={arr.std():.1f}) — OCR may have issues")

        # Check if image is mostly one color
        if pct_white > 95:
            print("  ⚠️  IMAGE IS >95% WHITE — text may be lost")
        if pct_black > 95:
            print("  ⚠️  IMAGE IS >95% BLACK — text may be lost")

    # Histogram
    if arr.ndim == 2:
        hist, bins = np.histogram(arr.ravel(), bins=16, range=(0, 256))
        print("\n  Histogram (16 bins):")
        max_h = max(hist) if max(hist) > 0 else 1
        for i, (h, b) in enumerate(zip(hist, bins)):
            bar = "█" * int(h / max_h * 30)
            print(f"    {int(b):3d}-{int(bins[i+1]):3d}: {bar} ({h})")

    # OCR-relevant issues
    issues = []
    if img.info.get('dpi') is None:
        issues.append("No DPI metadata — Tesseract may assume 70 DPI (too low)")
    if arr.ndim == 2 and len(np.unique(arr)) <= 2:
        issues.append("Binary image — thresholding may have destroyed text pixels")
    if arr.mean() > 250:
        issues.append("Image almost entirely white")
    if arr.mean() < 5:
        issues.append("Image almost entirely black")
    if img.size[0] < 300 or img.size[1] < 300:
        issues.append("Image too small for reliable OCR")

    if issues:
        print("\n  ⚠️  ISSUES DETECTED:")
        for issue in issues:
            print(f"    - {issue}")

    return issues


# ═══════════════════════════════════════════════════════════════════
# 2. PREPROCESSING STEP ISOLATION
# ═══════════════════════════════════════════════════════════════════

def test_preprocessing_steps(original_img):
    """Run each preprocessing step in isolation to find which one breaks OCR."""
    try:
        import pytesseract
        from pytesseract import Output
    except ImportError:
        print("  ⚠️  pytesseract not installed — skipping OCR tests")
        return

    print(f"\n{'='*60}")
    print("  PREPROCESSING STEP ISOLATION")
    print(f"{'='*60}")

    steps = [
        ("0. Original (no preprocessing)", lambda img: img.copy()),
        ("1. Grayscale only", lambda img: ImageOps.grayscale(img.copy())),
        ("2. Grayscale + autocontrast", lambda img: ImageOps.autocontrast(ImageOps.grayscale(img.copy()), cutoff=2)),
        ("3. Grayscale + autocontrast + median", lambda img: img.copy().filter(ImageFilter.MedianFilter(size=3)) if img.mode == 'L' else ImageOps.autocontrast(ImageOps.grayscale(img.copy()), cutoff=2).filter(ImageFilter.MedianFilter(size=3))),
        ("4. Full pipeline (current code)", lambda img: _full_preprocess(img.copy())),
        ("5. Grayscale + Otsu only (skip local mean)", lambda img: _otsu_only(img.copy())),
        ("6. Grayscale + simple threshold 128", lambda img: _simple_threshold(img.copy())),
        ("7. Grayscale + adaptive threshold (PIL)", lambda img: _pil_adaptive(img.copy())),
        ("8. Original + DPI=300", lambda img: _with_dpi(img.copy())),
        ("9. Original inverted", lambda img: ImageOps.invert(img.copy().convert('RGB'))),
    ]

    results = []
    for name, transform in steps:
        try:
            processed = transform(original_img)
            raw = pytesseract.image_to_string(processed).strip()

            # Also get confidence data
            data = pytesseract.image_to_data(processed, output_type=Output.DICT)
            confs = [int(c) for c in data['conf'] if int(c) >= 0]
            texts = [str(t) for t in data['text'] if str(t).strip()]
            avg_conf = np.mean(confs) if confs else -1
            n_words = len(texts)

            status = "✓" if raw else "✗ EMPTY"
            results.append({
                "name": name,
                "length": len(raw),
                "words": n_words,
                "avg_conf": avg_conf,
                "preview": raw[:80].replace('\n', ' ')
            })

            print(f"\n  {name}")
            print(f"    Result: {status}  |  chars={len(raw)}  |  words={n_words}  |  avg_conf={avg_conf:.0f}")
            if raw:
                print(f"    Preview: {repr(raw[:80])}")
            else:
                print("    Preview: (empty)")

        except Exception as e:
            print(f"\n  {name}")
            print(f"    ERROR: {e}")
            results.append({"name": name, "length": -1, "words": 0, "avg_conf": -1, "preview": str(e)})

    # Summary
    print(f"\n  {'─'*56}")
    print("  SUMMARY — ranked by chars extracted:")
    ranked = sorted(results, key=lambda r: r['length'], reverse=True)
    for r in ranked:
        marker = " ◀ BEST" if r == ranked[0] and r['length'] > 0 else ""
        marker = " ◀ FAILS" if r['length'] == 0 else marker
        print(f"    {r['length']:5d} chars | {r['words']:3d} words | conf={r['avg_conf']:5.0f} | {r['name']}{marker}")

    return results


def _full_preprocess(img):
    """Exact replica of preprocess_for_ocr from pdf_parser.py."""
    img = ImageOps.grayscale(img)
    img = ImageOps.autocontrast(img, cutoff=2)
    img = img.filter(ImageFilter.MedianFilter(size=3))
    arr = np.array(img, dtype=np.float32)
    local_mean = gaussian_filter(arr, sigma=25)
    arr = arr - local_mean + 128.0
    arr = np.clip(arr, 0, 255).astype(np.uint8)
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
    img = img.filter(ImageFilter.SHARPEN)
    return img


def _otsu_only(img):
    """Grayscale + Otsu threshold without local mean subtraction."""
    img = ImageOps.grayscale(img)
    img = ImageOps.autocontrast(img, cutoff=2)
    arr = np.array(img, dtype=np.float32)
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
    return Image.fromarray(binary, mode="L")


def _simple_threshold(img):
    """Grayscale + fixed threshold at 128."""
    img = ImageOps.grayscale(img)
    arr = np.array(img)
    binary = ((arr > 128).astype(np.uint8)) * 255
    return Image.fromarray(binary, mode="L")


def _pil_adaptive(img):
    """Grayscale + PIL-based local contrast enhancement (no binarization)."""
    img = ImageOps.grayscale(img)
    img = ImageOps.autocontrast(img, cutoff=2)
    # Local contrast: sharpen + equalize
    img = img.filter(ImageFilter.SHARPEN)
    img = ImageOps.equalize(img)
    return img


def _with_dpi(img):
    """Set DPI metadata to 300 (Tesseract default assumption)."""
    if img.mode != 'RGB':
        img = img.convert('RGB')
    img.info['dpi'] = (300, 300)
    return img


# ═══════════════════════════════════════════════════════════════════
# 3. TESSERACT CONFIGURATION SWEEP
# ═══════════════════════════════════════════════════════════════════

def test_tesseract_configs(img, label="preprocessed"):
    """Try different Tesseract PSM and OEM modes."""
    try:
        import pytesseract
    except ImportError:
        print("  ⚠️  pytesseract not installed")
        return

    print(f"\n{'='*60}")
    print(f"  TESSERACT CONFIG SWEEP — {label}")
    print(f"{'='*60}")

    psm_names = {
        0: "OSD only",
        1: "Auto with OSD",
        2: "Auto with OSD, no OCR",
        3: "Fully auto (DEFAULT)",
        4: "Single column",
        5: "Single vertical block",
        6: "Single uniform block",
        7: "Single line",
        8: "Single word",
        9: "Single word in circle",
        10: "Single character",
        11: "Sparse text",
        12: "Sparse text with OSD",
        13: "Raw line",
    }

    oem_names = {
        0: "Legacy engine",
        1: "Neural nets LSTM",
        2: "Legacy + LSTM",
        3: "Default (Legacy + LSTM)",
    }

    results = []
    for psm in [3, 4, 6, 7, 11, 13]:
        for oem in [1, 3]:
            config = f"--psm {psm} --oem {oem}"
            try:
                raw = pytesseract.image_to_string(img, config=config).strip()
                status = "✓" if raw else "✗"
                results.append((psm, oem, len(raw), raw[:60].replace('\n', ' ')))
                if raw:
                    print(f"  {status} PSM={psm} ({psm_names.get(psm, '?'):20s}) OEM={oem} ({oem_names.get(oem, '?'):20s}) | {len(raw):4d} chars | {repr(raw[:100])}")
            except Exception as e:
                print(f"  ✗ PSM={psm} OEM={oem} | ERROR: {e}")

    if not any(r[2] > 0 for r in results):
        print(f"\n  ⚠️  ALL CONFIGS RETURNED EMPTY for {label}")
        print("      The image preprocessing has destroyed text readability.")
    else:
        best = max(results, key=lambda r: r[2])
        print(f"\n  Best config: PSM={best[0]} OEM={best[1]} → {best[2]} chars")


# ═══════════════════════════════════════════════════════════════════
# 4. ORIGINAL PDF vs PREPROCESSED COMPARISON
# ═══════════════════════════════════════════════════════════════════

def test_pdf_vs_preprocessed(pdf_path, page_num):
    """Compare OCR on original PDF page vs preprocessed image."""
    try:
        import fitz
        import pytesseract
    except ImportError as e:
        print(f"  ⚠️  Missing dependency: {e}")
        return

    print(f"\n{'='*60}")
    print("  PDF vs PREPROCESSED COMPARISON")
    print(f"  PDF: {os.path.basename(pdf_path)}  Page: {page_num}")
    print(f"{'='*60}")

    doc = fitz.open(pdf_path)
    if page_num >= len(doc):
        print(f"  ⚠️  Page {page_num} not found (PDF has {len(doc)} pages)")
        doc.close()
        return

    page = doc.load_page(page_num)

    # Original at different zoom levels
    for zoom in [1, 2, 3]:
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        raw = pytesseract.image_to_string(img).strip()
        print(f"\n  Original PDF @ {zoom}x zoom ({img.size[0]}x{img.size[1]}):")
        print(f"    Chars: {len(raw)}  |  {repr(raw[:100])}")

    # Preprocessed
    preprocessed_path = os.path.join(DEBUG_DIR, f"page_{page_num + 1}_preprocessed.png")
    if os.path.exists(preprocessed_path):
        img_pre = Image.open(preprocessed_path)
        raw_pre = pytesseract.image_to_string(img_pre).strip()
        print(f"\n  Preprocessed ({img_pre.size[0]}x{img_pre.size[1]}):")
        print(f"    Chars: {len(raw_pre)}  |  {repr(raw_pre[:100]) if raw_pre else 'EMPTY'}")
    else:
        print(f"\n  ⚠️  Preprocessed image not found: {preprocessed_path}")

    doc.close()


# ═══════════════════════════════════════════════════════════════════
# 5. TESSERACT ENVIRONMENT CHECK
# ═══════════════════════════════════════════════════════════════════

def check_tesseract_env():
    """Check Tesseract installation and available languages."""
    print(f"\n{'='*60}")
    print("  TESSERACT ENVIRONMENT")
    print(f"{'='*60}")

    try:
        import pytesseract
        version = pytesseract.get_tesseract_version()
        print(f"  Version:  {version}")
    except Exception as e:
        print(f"  ⚠️  Tesseract not found: {e}")
        print("      Install: brew install tesseract  (macOS)")
        return

    try:
        langs = pytesseract.get_languages()
        print(f"  Languages: {langs}")
        if 'eng' not in langs:
            print("  ⚠️  English language data not installed!")
    except Exception as e:
        print(f"  ⚠️  Could not get languages: {e}")

    try:
        cmd = pytesseract.tesseract_cmd
        print(f"  Binary:    {cmd}")
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════════
# 6. DIAGNOSIS SUMMARY
# ═══════════════════════════════════════════════════════════════════

def print_diagnosis(step_results):
    """Print a human-readable diagnosis based on test results."""
    print(f"\n{'='*60}")
    print("  DIAGNOSIS")
    print(f"{'='*60}")

    if not step_results:
        print("  No results to analyze.")
        return

    original = next((r for r in step_results if "Original" in r['name']), None)
    full = next((r for r in step_results if "Full pipeline" in r['name']), None)
    gray_only = next((r for r in step_results if "Grayscale only" in r['name']), None)
    gray_auto = next((r for r in step_results if "Grayscale + autocontrast" in r['name'] and "median" not in r['name']), None)
    otsu_only = next((r for r in step_results if "Otsu only" in r['name']), None)
    best = max(step_results, key=lambda r: r['length'])

    if original and original['length'] > 0:
        print(f"\n  ✓ Original image works ({original['length']} chars, conf={original['avg_conf']:.0f})")
    elif original:
        print("\n  ✗ Even the original image fails — Tesseract installation issue?")

    if gray_only and gray_only['length'] == 0:
        print("  ✗ Grayscale conversion ALONE breaks OCR (0 chars)")
        print("    → Tesseract cannot read the grayscale version of this image")
        if gray_auto and gray_auto['length'] > 0:
            print(f"    → But adding autocontrast fixes it ({gray_auto['length']} chars)")
        elif gray_auto and gray_auto['length'] == 0:
            print("    → Autocontrast also fails — Otsu thresholding makes it worse")

    if otsu_only and otsu_only['length'] == 0:
        print("  ✗ Otsu binarization (without local mean) also DESTROYS OCR")
        print("    → The threshold chosen by Otsu is wrong for this image content")

    if full and full['length'] == 0:
        print("  ✗ Full preprocessing pipeline DESTROYS OCR (0 chars)")
        if gray_only and gray_only['length'] == 0:
            print("    → Root cause: grayscale conversion (step 1) already kills OCR")
            print("    → The local-mean + Otsu (steps 4-5) can't recover from that")
        else:
            print("    → The local-mean subtraction + Otsu binarization is too aggressive.")

    if best['length'] > 0:
        print(f"\n  Best approach: {best['name']}")
        print(f"    → {best['length']} chars, {best['words']} words")

    print("\n  RECOMMENDED FIXES:")
    if original and original['length'] > 0 and full and full['length'] == 0:
        print("  1. SKIP PREPROCESSING — use the original RGB image directly")
        print(f"     Original: {original['length']} chars @ conf={original['avg_conf']:.0f}")
        print("     Pipeline: 0 chars")
        print("  2. If preprocessing needed, use grayscale + simple threshold 128")
        simple = next((r for r in step_results if "simple threshold" in r['name']), None)
        if simple:
            print(f"     Simple threshold: {simple['length']} chars @ conf={simple['avg_conf']:.0f}")
        print("  3. Grayscale + autocontrast + median (no binarization) also works")
        median = next((r for r in step_results if "median" in r['name']), None)
        if median:
            print(f"     Median approach: {median['length']} chars @ conf={median['avg_conf']:.0f}")
    print("  4. Try PSM 6 (single block) instead of default PSM 3")
    print("  5. Increase PDF render zoom from 2x to 3x for higher resolution")


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

def find_pdf_for_page(page_num, preprocessed_path=None):
    """
    Find which PDF in uploads corresponds to the preprocessed image.
    If preprocessed_path is given, matches by pixel similarity.
    Otherwise returns first PDF with enough pages.
    """
    import fitz

    if preprocessed_path and os.path.exists(preprocessed_path):
        saved = Image.open(preprocessed_path)
        saved_arr = np.array(saved)

        best_match = None
        best_diff = float('inf')

        for fname in sorted(os.listdir(UPLOADS_DIR)):
            if not fname.endswith('.pdf'):
                continue
            path = os.path.join(UPLOADS_DIR, fname)
            try:
                doc = fitz.open(path)
                idx = page_num - 1
                if idx >= len(doc):
                    doc.close()
                    continue
                page = doc.load_page(idx)
                mat = fitz.Matrix(2, 2)
                pix = page.get_pixmap(matrix=mat)
                img_data = pix.tobytes('png')
                img = Image.open(io.BytesIO(img_data))
                processed = _full_preprocess(img)
                proc_arr = np.array(processed)
                doc.close()

                if proc_arr.shape == saved_arr.shape:
                    diff = (proc_arr != saved_arr).sum() / proc_arr.size * 100
                    if diff < best_diff:
                        best_diff = diff
                        best_match = path
                    if diff < 0.01:
                        return path  # exact match
            except Exception:
                continue

        if best_match:
            return best_match

    # Fallback: first PDF with enough pages
    for fname in sorted(os.listdir(UPLOADS_DIR)):
        if not fname.endswith('.pdf'):
            continue
        path = os.path.join(UPLOADS_DIR, fname)
        try:
            doc = fitz.open(path)
            n_pages = len(doc)
            doc.close()
            if n_pages >= page_num:
                return path
        except Exception:
            continue
    return None


def run_diagnostic(page=None, pdf_path=None):
    """Run the full OCR diagnostic suite."""
    print("╔══════════════════════════════════════════════════════════╗")
    print("║              OCR DIAGNOSTIC TOOL                        ║")
    print("╚══════════════════════════════════════════════════════════╝")

    # Environment check
    check_tesseract_env()

    if page is not None:
        pages = [page]
    else:
        # Find all preprocessed pages
        pages = []
        for f in sorted(os.listdir(DEBUG_DIR)):
            if f.startswith("page_") and f.endswith("_preprocessed.png"):
                try:
                    num = int(f.split("_")[1])
                    pages.append(num)
                except Exception:
                    pass

    for page_num in pages:
        preprocessed_path = os.path.join(DEBUG_DIR, f"page_{page_num}_preprocessed.png")
        if not os.path.exists(preprocessed_path):
            print(f"\n  ⚠️  File not found: {preprocessed_path}")
            print("      Attempting to generate it from source PDF...")

            # Find which PDF to use
            source_pdf = pdf_path
            if source_pdf is None:
                source_pdf = find_pdf_for_page(page_num)

            if not source_pdf or not os.path.exists(source_pdf):
                print(f"      ❌ Could not find source PDF for page {page_num}. Please provide it with --pdf.")
                continue

            try:
                import fitz
                doc = fitz.open(source_pdf)
                idx = page_num - 1
                if idx < 0 or idx >= len(doc):
                    print(f"      ❌ Page {page_num} is out of range for {os.path.basename(source_pdf)}")
                    doc.close()
                    continue

                page = doc.load_page(idx)
                mat = fitz.Matrix(2, 2)
                pix = page.get_pixmap(matrix=mat)
                img_data = pix.tobytes("png")
                orig_img = Image.open(io.BytesIO(img_data))

                # Save to debug directory
                if not os.path.exists(DEBUG_DIR):
                    os.makedirs(DEBUG_DIR)
                
                # Save the raw image directly as requested
                orig_img.save(preprocessed_path)
                print(f"      ✅ Successfully generated raw image: {os.path.basename(preprocessed_path)}")
                doc.close()
            except Exception as e:
                print(f"      ❌ Failed to generate preprocessed image: {e}")
                continue

        print(f"\n{'#'*60}")
        print(f"  PAGE {page_num}")
        print(f"{'#'*60}")

        img = Image.open(preprocessed_path)

        # 1. Quality analysis
        analyze_image_quality(img, f"page_{page_num}_preprocessed.png")

        # 2. Preprocessing step isolation
        # Need original image for comparison
        if pdf_path is None:
            pdf_path = find_pdf_for_page(page_num, preprocessed_path)
            if pdf_path:
                print(f"\n  Auto-detected source PDF: {os.path.basename(pdf_path)}")

        original_img = None
        if pdf_path and os.path.exists(pdf_path):
            try:
                import fitz
                doc = fitz.open(pdf_path)
                idx = page_num - 1
                if idx < len(doc):
                    page = doc.load_page(idx)
                    mat = fitz.Matrix(2, 2)
                    pix = page.get_pixmap(matrix=mat)
                    img_data = pix.tobytes("png")
                    original_img = Image.open(io.BytesIO(img_data))
                doc.close()
            except Exception as e:
                print(f"\n  ⚠️  Could not load original PDF page: {e}")

        if original_img:
            step_results = test_preprocessing_steps(original_img)

            # 3. Config sweep on preprocessed
            test_tesseract_configs(img, f"preprocessed page {page_num}")

            # 4. PDF vs preprocessed
            if pdf_path:
                test_pdf_vs_preprocessed(pdf_path, page_num - 1)

            # 5. Diagnosis
            print_diagnosis(step_results)
        else:
            print("\n  ⚠️  No original PDF found — testing preprocessed image only")
            try:
                import pytesseract
                raw = pytesseract.image_to_string(img).strip()
                print(f"  OCR result: {'EMPTY' if not raw else f'{len(raw)} chars'}")
                if raw:
                    print(f"  Preview: {repr(raw[:200])}")
            except Exception:
                pass
            test_tesseract_configs(img, f"preprocessed page {page_num}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OCR Diagnostic Tool")
    parser.add_argument("--page", type=int, default=None, help="Page number to test (default: all)")
    parser.add_argument("--pdf", type=str, default=None, help="Path to source PDF (auto-detected if not given)")
    args = parser.parse_args()

    pdf_path = args.pdf
    if pdf_path and not os.path.isabs(pdf_path):
        pdf_path = os.path.join(UPLOADS_DIR, pdf_path)
        print(f"Resolved PDF path: {pdf_path}")
    run_diagnostic(page=args.page, pdf_path=pdf_path)
