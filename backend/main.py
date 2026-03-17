from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import shutil
import os
import re
import json
from typing import List, Optional
import datetime
from fastapi.staticfiles import StaticFiles
from urllib.parse import quote
from dotenv import load_dotenv
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

from database import SessionLocal, init_db, Book, Sentence, Word, WordOccurrence, Vocab, get_db
from parser.pdf_parser import parse_pdf
from parser.epub_parser import parse_epub
from parser.llm_parser import get_book_info_and_clean_text, split_sentences_llm
from parser.ocr_corrector import correct_ocr_errors
from dictionary.lookup import lookup_word
from dictionary.lemmatize import get_lemma
from srs.sm2 import update_sm2
from tts.generate import tts_engine

app = FastAPI(title="Reading Partner API")

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

TTS_DIR = "uploads/tts"
if not os.path.exists(TTS_DIR):
    os.makedirs(TTS_DIR)
app.mount("/tts", StaticFiles(directory=TTS_DIR), name="tts")

init_db()

def process_book_background(book_id: int):
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            logger.error(f"Book {book_id} not found for background processing")
            return
        
        book.status = "processing"
        book.progress = 0.1
        db.commit()

        file_path = os.path.join(UPLOAD_DIR, book.filename)
        filename_lower = book.filename.lower()
        
        cover_image_bytes = None
        if filename_lower.endswith('.pdf'):
            full_text, sentences, pages_data, cover_image_bytes = parse_pdf(file_path)
            book_type = "pdf"
        elif filename_lower.endswith('.epub'):
            full_text, sentences, pages_data, cover_image_bytes = parse_epub(file_path)
            book_type = "epub"
        else:
            book.status = "failed"
            book.error_message = "Unsupported file type"
            db.commit()
            return

        book.progress = 0.3
        db.commit()

        # Use LLM to extract title and clean text sample
        llm_info = get_book_info_and_clean_text(full_text)
        if llm_info:
            book.title = llm_info.get("title", book.title)
            book.clean_text = llm_info.get("cleaned_sample", full_text)
        else:
            book.clean_text = full_text
        
        book.progress = 0.5
        db.commit()

        # Correct OCR errors by comparing full_text with clean_text
        pages_data = correct_ocr_errors(full_text, book.clean_text, pages_data)
        
        book.progress = 0.7
        db.commit()

        # Improved sentence splitting via regex on cleaned text
        sentences = split_sentences_llm(book.clean_text)
        
        book.content = full_text
        book.pages_data = json.dumps(pages_data)
        
        # Save cover image if present
        if cover_image_bytes:
            cover_filename = f"cover_{book.id}.png"
            cover_path = os.path.join(UPLOAD_DIR, cover_filename)
            with open(cover_path, "wb") as f:
                f.write(cover_image_bytes)
            book.cover_image = cover_filename
        
        # Clear existing sentences if any (for reparse)
        sentence_ids = [s.id for s in book.sentences]
        if sentence_ids:
            db.query(WordOccurrence).filter(WordOccurrence.sentence_id.in_(sentence_ids)).delete(synchronize_session=False)
            db.query(Sentence).filter(Sentence.book_id == book_id).delete()
        
        for i, s_text in enumerate(sentences):
            db_sentence = Sentence(book_id=book.id, text=s_text, index=i)
            db.add(db_sentence)
        
        book.status = "completed"
        book.progress = 1.0
        db.commit()
        logger.info(f"Successfully processed book {book_id}")
    except Exception as e:
        logger.exception(f"Error processing book {book_id}")
        db.rollback()
        book = db.query(Book).filter(Book.id == book_id).first()
        if book:
            book.status = "failed"
            book.error_message = str(e)
            db.commit()
    finally:
        db.close()

@app.post("/api/upload")
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    filename_lower = file.filename.lower()
    if filename_lower.endswith('.pdf'):
        book_type = "pdf"
    elif filename_lower.endswith('.epub'):
        book_type = "epub"
    else:
        raise HTTPException(status_code=400, detail="Only PDF and EPUB files are supported")
    
    # Save book initially with pending status
    db_book = Book(
        title=file.filename, 
        filename=file.filename,
        type=book_type,
        status="pending",
        progress=0.0
    )
    db.add(db_book)
    db.commit()
    db.refresh(db_book)

    # Add parsing to background tasks
    background_tasks.add_task(process_book_background, db_book.id)
    
    return {"book_id": db_book.id, "title": db_book.title, "status": "pending"}

def get_book_url(book):
    filename = book.filename or book.title
    if book.type == "pdf" and not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    elif book.type == "epub" and not filename.lower().endswith(".epub"):
        filename += ".epub"
    return f"http://localhost:8000/uploads/{quote(filename)}"

@app.get("/api/books")
def list_books(db: Session = Depends(get_db)):
    books = db.query(Book).order_by(Book.id.desc()).all()
    return [{
        "id": book.id,
        "title": book.title,
        "type": book.type,
        "cover_image": book.cover_image,
        "pdf_url": get_book_url(book),
        "status": book.status,
        "progress": book.progress
    } for book in books]

@app.get("/api/books/{book_id}")
def get_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    if book.status != "completed":
        return {
            "id": book.id,
            "title": book.title,
            "type": book.type,
            "status": book.status,
            "progress": book.progress,
            "error_message": book.error_message
        }

    sentences = db.query(Sentence).filter(Sentence.book_id == book_id).order_by(Sentence.index).all()
    
    return {
        "id": book.id, 
        "title": book.title, 
        "type": book.type,
        "sentences": sentences,
        "clean_text": book.clean_text,
        "pages_data": json.loads(book.pages_data) if book.pages_data else None,
        "cover_image": book.cover_image,
        "pdf_url": get_book_url(book),
        "status": book.status,
        "progress": book.progress
    }

@app.post("/api/books/{book_id}/reparse")
async def reparse_book(book_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    book.status = "pending"
    book.progress = 0.0
    book.error_message = None
    db.commit()

    background_tasks.add_task(process_book_background, book.id)
    
    return {"status": "pending", "book_id": book.id}

@app.get("/api/books/{book_id}/status")
def get_book_status(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return {
        "id": book.id,
        "status": book.status,
        "progress": book.progress,
        "error_message": book.error_message
    }


@app.get("/api/dict")
def get_definition(word: str, book_id: Optional[int] = None, sentence_id: Optional[int] = None, skip_lemma: bool = False, force_refresh: bool = False, db: Session = Depends(get_db)):
    original_word = word.lower().strip()
    
    # Get lemma if not skipped (REQ-001, REQ-002)
    lemma = None
    if not skip_lemma:
        lemma = get_lemma(original_word)
        # Only return lemma if different from original word (CON-002)
        if lemma == original_word:
            lemma = None
    
    # 1. Check if word is already in our DB
    db_word = db.query(Word).filter(Word.word == original_word).first()
    
    if not db_word or force_refresh:
        # 2. Lookup word from external API
        result = lookup_word(original_word)
        if result:
            if db_word:
                # Update existing word
                db_word.phonetic = result.get("phonetic")
                db_word.meaning = result.get("meaning")
                db_word.audio_url = result.get("audio_url")
            else:
                # Create new word
                db_word = Word(
                    word=original_word, 
                    phonetic=result.get("phonetic"), 
                    meaning=result.get("meaning"),
                    audio_url=result.get("audio_url")
                )
                db.add(db_word)
            
            try:
                db.commit()
                db.refresh(db_word)
            except IntegrityError:
                db.rollback()
                # If another request inserted/updated it while we were looking it up
                db_word = db.query(Word).filter(Word.word == original_word).first()
        else:
            if not db_word:
                return {"word": word, "error": "Not found"}
    
    # 3. Track occurrence if book/sentence info provided
    if book_id and sentence_id:
        existing_occ = db.query(WordOccurrence).filter(
            WordOccurrence.word_id == db_word.id,
            WordOccurrence.sentence_id == sentence_id
        ).first()
        if not existing_occ:
            occ = WordOccurrence(word_id=db_word.id, sentence_id=sentence_id, book_id=book_id)
            try:
                db.add(occ)
                db.commit()
            except IntegrityError:
                db.rollback()
                # If already tracked, just continue
                pass
            
    # 4. Fetch previous occurrences for context
    occurrences = db.query(WordOccurrence).filter(WordOccurrence.word_id == db_word.id).all()
    occurrence_contexts = []
    for occ in occurrences:
        s = db.query(Sentence).filter(Sentence.id == occ.sentence_id).first()
        b = db.query(Book).filter(Book.id == occ.book_id).first()
        if s and b:
            occurrence_contexts.append({"book": b.title, "sentence": s.text})
            
    return {
        "id": db_word.id,
        "word": db_word.word,
        "lemma": lemma,
        "phonetic": db_word.phonetic,
        "meaning": db_word.meaning,
        "audio_url": db_word.audio_url,
        "occurrences": occurrence_contexts[:5] # Limit to 5 for UI simplicity
    }

@app.post("/api/vocab")
def add_to_vocab(word_id: int, db: Session = Depends(get_db)):
    # Check if already in vocab
    db_vocab = db.query(Vocab).filter(Vocab.word_id == word_id).first()
    if not db_vocab:
        db_vocab = Vocab(word_id=word_id)
        try:
            db.add(db_vocab)
            db.commit()
        except IntegrityError:
            db.rollback()
            # Already added by another request, just continue
            pass
    return {"status": "success"}

@app.get("/api/vocab/review")
def get_review_list(db: Session = Depends(get_db)):
    # Get words due for review or new words
    now = datetime.datetime.utcnow()
    reviews = db.query(Vocab).filter(Vocab.next_review <= now).all()
    
    result = []
    for r in reviews:
        w = db.query(Word).filter(Word.id == r.word_id).first()
        if w:
            # Fetch occurrences for context
            occurrences = db.query(WordOccurrence).filter(WordOccurrence.word_id == w.id).all()
            occurrence_contexts = []
            for occ in occurrences:
                s = db.query(Sentence).filter(Sentence.id == occ.sentence_id).first()
                b = db.query(Book).filter(Book.id == occ.book_id).first()
                if s and b:
                    occurrence_contexts.append({"book": b.title, "sentence": s.text})
                    
            result.append({
                "vocab_id": r.id,
                "word_id": w.id,
                "word": w.word,
                "phonetic": w.phonetic,
                "meaning": w.meaning,
                "audio_url": w.audio_url,
                "interval": r.interval,
                "repetition": r.repetition,
                "ef": r.ef,
                "occurrences": occurrence_contexts[:3] # Limit to 3 for review context
            })
    return result

@app.get("/api/vocab/all")
def get_all_vocab(db: Session = Depends(get_db)):
    # Get all words in the vocabulary
    reviews = db.query(Vocab).order_by(Vocab.added_time.desc()).all()
    
    result = []
    for r in reviews:
        w = db.query(Word).filter(Word.id == r.word_id).first()
        if w:
            # Fetch occurrences for context
            occurrences = db.query(WordOccurrence).filter(WordOccurrence.word_id == w.id).all()
            occurrence_contexts = []
            for occ in occurrences:
                s = db.query(Sentence).filter(Sentence.id == occ.sentence_id).first()
                b = db.query(Book).filter(Book.id == occ.book_id).first()
                if s and b:
                    occurrence_contexts.append({"book": b.title, "sentence": s.text})
                    
            result.append({
                "vocab_id": r.id,
                "word_id": w.id,
                "word": w.word,
                "phonetic": w.phonetic,
                "meaning": w.meaning,
                "audio_url": w.audio_url,
                "interval": r.interval,
                "repetition": r.repetition,
                "ef": r.ef,
                "occurrences": occurrence_contexts[:3]
            })
    return result

@app.post("/api/vocab/review")
def submit_review(vocab_id: int, quality: int, db: Session = Depends(get_db)):
    vocab = db.query(Vocab).filter(Vocab.id == vocab_id).first()
    if not vocab:
        raise HTTPException(status_code=404, detail="Vocab item not found")
        
    next_review, interval, repetition, ef = update_sm2(
        quality, vocab.interval, vocab.repetition, vocab.ef
    )
    
    vocab.next_review = next_review
    vocab.interval = interval
    vocab.repetition = repetition
    vocab.ef = ef
    
    db.commit()
    return {"next_review": next_review}

@app.post("/api/tts")
def generate_tts(text: str):
    try:
        audio_path = tts_engine.synthesize(text)
        audio_filename = os.path.basename(audio_path)
        return {"audio_url": f"http://localhost:8000/tts/{audio_filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")
