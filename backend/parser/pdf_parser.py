import fitz
import re
import pytesseract
from pytesseract import Output
from PIL import Image
import io

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
            
            # Get text content
            page_text = pytesseract.image_to_string(img)
            full_text += page_text + "\n"
            
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
            
            # Update the existing page data with OCR results
            pages_data[page_num]["words"] = page_words

    # Simple sentence splitting logic
    clean_text = re.sub(r'\n+', ' ', full_text)
    sentences = re.split(r'(?<=[.!?])\s+', clean_text)
    
    return full_text, [s.strip() for s in sentences if s.strip()], pages_data, cover_image
