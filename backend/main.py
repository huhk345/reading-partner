from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
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

# Load environment variables
load_dotenv()

from database import SessionLocal, init_db, Book, Sentence, Word, WordOccurrence, Vocab, get_db
from parser.pdf_parser import parse_pdf
from parser.epub_parser import parse_epub
from parser.llm_parser import get_book_info_and_clean_text, split_sentences_llm
from dictionary.lookup import lookup_word
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

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    filename_lower = file.filename.lower()
    cover_image_bytes = None
    if filename_lower.endswith('.pdf'):
        full_text, sentences, pages_data, cover_image_bytes = parse_pdf(file_path)
        book_type = "pdf"
    elif filename_lower.endswith('.epub'):
        full_text, sentences, pages_data, cover_image_bytes = parse_epub(file_path)
        book_type = "epub"
    else:
        raise HTTPException(status_code=400, detail="Only PDF and EPUB files are supported")
    
    # Use LLM to extract title and clean text sample
    llm_info = get_book_info_and_clean_text(full_text)
    title = file.filename
    clean_text = full_text
    
    if llm_info:
        title = llm_info.get("title", file.filename)
        clean_text = llm_info.get("cleaned_sample", full_text)
    
    # Improved sentence splitting via regex on cleaned text
    sentences = split_sentences_llm(clean_text)
    
    # Save book initially to get ID
    db_book = Book(
        title=title, 
        filename=file.filename,
        type=book_type, 
        content=full_text,
        clean_text=clean_text,
        pages_data=json.dumps(pages_data)
    )
    db.add(db_book)
    db.commit()
    db.refresh(db_book)

    # Save cover image if present
    if cover_image_bytes:
        cover_filename = f"cover_{db_book.id}.png"
        cover_path = os.path.join(UPLOAD_DIR, cover_filename)
        with open(cover_path, "wb") as f:
            f.write(cover_image_bytes)
        db_book.cover_image = cover_filename
        db.commit()
    
    for i, s_text in enumerate(sentences):
        db_sentence = Sentence(book_id=db_book.id, text=s_text, index=i)
        db.add(db_sentence)
    
    db.commit()
    return {"book_id": db_book.id, "title": db_book.title}

def get_book_url(book):
    filename = book.filename or book.title
    if book.type == "pdf" and not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    elif book.type == "epub" and not filename.lower().endswith(".epub"):
        filename += ".epub"
    return f"http://localhost:8000/uploads/{quote(filename)}"

@app.get("/api/books")
def list_books(db: Session = Depends(get_db)):
    books = db.query(Book).all()
    return [{
        "id": book.id,
        "title": book.title,
        "type": book.type,
        "cover_image": book.cover_image,
        "pdf_url": get_book_url(book)
    } for book in books]

@app.get("/api/books/{book_id}")
def get_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    sentences = db.query(Sentence).filter(Sentence.book_id == book_id).order_by(Sentence.index).all()
    
    return {
        "id": book.id, 
        "title": book.title, 
        "type": book.type,
        "sentences": sentences,
        "clean_text": book.clean_text,
        "pages_data": json.loads(book.pages_data) if book.pages_data else None,
        "cover_image": book.cover_image,
        "pdf_url": get_book_url(book)
    }

@app.post("/api/books/{book_id}/reparse")
async def reparse_book(book_id: int, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    filename = book.filename or book.title
    if book.type == "pdf" and not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    elif book.type == "epub" and not filename.lower().endswith(".epub"):
        filename += ".epub"
        
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Source file not found at {file_path}")
    
    if book.type == "pdf":
        full_text, sentences, pages_data, cover_image_bytes = parse_pdf(file_path)
    elif book.type == "epub":
        full_text, sentences, pages_data, cover_image_bytes = parse_epub(file_path)
    else:
        raise HTTPException(status_code=400, detail="Unsupported book type")

    # Use LLM to re-extract title and clean text sample
    llm_info = get_book_info_and_clean_text(full_text)
    if llm_info:
        book.title = llm_info.get("title", book.title)
        book.clean_text = llm_info.get("cleaned_sample", full_text)
    else:
        book.clean_text = full_text

    # Improved sentence splitting via regex on cleaned text
    sentences = split_sentences_llm(book.clean_text)
    
    # Update book content
    book.content = full_text
    book.pages_data = json.dumps(pages_data)
    
    # Update cover if present
    if cover_image_bytes:
        cover_filename = f"cover_{book.id}.png"
        cover_path = os.path.join(UPLOAD_DIR, cover_filename)
        with open(cover_path, "wb") as f:
            f.write(cover_image_bytes)
        book.cover_image = cover_filename
    
    # Remove old sentences and their word occurrences
    # Since word occurrences are linked to sentences, we should handle them.
    # Actually, word occurrences might be important to keep if the user already studied them.
    # But if sentences change significantly, old occurrences might become orphaned or misplaced.
    # For now, let's just delete them to be safe, but in a real app we'd try to re-map.
    
    # Delete word occurrences for sentences of this book
    sentence_ids = [s.id for s in book.sentences]
    db.query(WordOccurrence).filter(WordOccurrence.sentence_id.in_(sentence_ids)).delete(synchronize_session=False)
    
    # Delete old sentences
    db.query(Sentence).filter(Sentence.book_id == book_id).delete()
    
    # Add new sentences
    for i, s_text in enumerate(sentences):
        db_sentence = Sentence(book_id=book.id, text=s_text, index=i)
        db.add(db_sentence)
    
    db.commit()
    db.refresh(book)
    return {"status": "success", "title": book.title}

@app.get("/api/dict")
def get_definition(word: str, book_id: Optional[int] = None, sentence_id: Optional[int] = None, db: Session = Depends(get_db)):
    # 1. Check if word is already in our DB
    db_word = db.query(Word).filter(Word.word == word.lower()).first()
    
    if not db_word:
        # 2. Lookup word from external API
        result = lookup_word(word)
        if result:
            db_word = Word(
                word=word.lower(), 
                phonetic=result.get("phonetic"), 
                meaning=result.get("meaning"),
                audio_url=result.get("audio_url")
            )
            try:
                db.add(db_word)
                db.commit()
                db.refresh(db_word)
            except IntegrityError:
                db.rollback()
                # If another request inserted it while we were looking it up
                db_word = db.query(Word).filter(Word.word == word.lower()).first()
        else:
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
