from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
import shutil
import os
import json
import requests
from typing import List, Optional
import datetime
import re
from fastapi.staticfiles import StaticFiles
from urllib.parse import quote
from dotenv import load_dotenv
import logging
import threading
import hashlib
from pydantic import BaseModel

from database import SessionLocal, init_db, Book, Sentence, Word, Vocab, ActivityLog, get_db
from parser.pdf_parser import parse_pdf
from parser.epub_parser import parse_epub
from parser.llm_parser import get_book_info_and_clean_text, split_sentences_llm
from parser.ocr_corrector import correct_ocr_errors
from dictionary.lookup import lookup_word
from dictionary.lemmatize import get_lemma
from srs.sm2 import update_sm2
from tts.generate import tts_engine, light_tts_engine

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = FastAPI(title="Reading Partner API")

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# CORS:
# - Book cover images are used in WebGL/canvas (Three.js). For canvas to remain readable
#   (e.g., toDataURL, postprocessing, texture sampling), the image responses must include
#   explicit CORS headers.
# - IMPORTANT: Browsers reject `Access-Control-Allow-Origin: *` when
#   `Access-Control-Allow-Credentials: true` is present, even for image loads.
#   We don't need credentials for this app, so keep allow_credentials=False.
cors_allow_origins_env = os.getenv(
    "CORS_ALLOW_ORIGINS",
    ",".join(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ]
    ),
)
cors_allow_origins = [o.strip() for o in cors_allow_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

TTS_DIR = "uploads/tts"
if not os.path.exists(TTS_DIR):
    os.makedirs(TTS_DIR)
app.mount("/tts", StaticFiles(directory=TTS_DIR), name="tts")

WORD_AUDIO_DIR = "uploads/audio"
if not os.path.exists(WORD_AUDIO_DIR):
    os.makedirs(WORD_AUDIO_DIR)

def log_activity(db: Session, event_type: str, book_id: int = None, word_count: int = 1):
    today = datetime.date.today().isoformat()
    log = ActivityLog(date=today, event_type=event_type, book_id=book_id, word_count=word_count)
    db.add(log)
    db.commit()

init_db()

def auto_generate_tts_task(sentences: List[str], book_id: int):
    """Background task to generate TTS files for the first few sentences."""
    count = min(len(sentences), 50)
    logger.info(f"Auto-generating TTS for first {count} sentences of book {book_id}")
    for i, s_text in enumerate(sentences[:count]):
        if not s_text.strip():
            continue
        try:
            # We don't provide prompt_wav_path/text here, it uses the default (Sulafat)
            tts_engine.synthesize(s_text)
            if (i + 1) % 10 == 0:
                logger.info(f"Auto TTS progress for book {book_id}: {i + 1}/{count}")
        except Exception as e:
            logger.error(f"Auto TTS generation failed for sentence {i} of book {book_id}: {e}")
    logger.info(f"Auto TTS generation completed for book {book_id}")

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
        elif filename_lower.endswith('.epub'):
            full_text, sentences, pages_data, cover_image_bytes = parse_epub(file_path)
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
        if book.sentences:
            db.query(Sentence).filter(Sentence.book_id == book_id).delete()
        
        for i, s_text in enumerate(sentences):
            db_sentence = Sentence(book_id=book.id, text=s_text, index=i)
            db.add(db_sentence)
        
        book.status = "completed"
        book.progress = 1.0
        db.commit()
        logger.info(f"Successfully processed book {book_id}")

        # Auto-generate TTS for first 50 sentences in the background if LLM extraction succeeded
        if llm_info and sentences:
            threading.Thread(
                target=auto_generate_tts_task, 
                args=(sentences, book_id), 
                daemon=True
            ).start()
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

def get_cover_url(book):
    """
    Return a direct URL to the book cover image if available.
    """
    if not getattr(book, "cover_image", None):
        return None
    return f"http://localhost:8000/uploads/{quote(book.cover_image)}"

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
    
    log_activity(db, "book_open", book_id=book_id)
    
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


@app.get("/api/audio/{word_id}")
async def get_word_audio(word_id: int, db: Session = Depends(get_db)):
    db_word = db.query(Word).filter(Word.id == word_id).first()
    if not db_word:
        raise HTTPException(status_code=404, detail="Word not found")
    
    audio_filename = f"{word_id}.mp3"
    audio_path = os.path.join(WORD_AUDIO_DIR, audio_filename)
    
    if os.path.exists(audio_path):
        return FileResponse(audio_path)
    
    # Try to download from audio_url if available
    if db_word.audio_url:
        try:
            response = requests.get(db_word.audio_url, timeout=5)
            if response.status_code == 200:
                with open(audio_path, "wb") as f:
                    f.write(response.content)
                return FileResponse(audio_path)
        except Exception as e:
            logger.error(f"Failed to download audio for word {db_word.word}: {e}")
            
    # Fallback to TTS
    try:
        # Use light_tts_engine for single words
        generated_path = light_tts_engine.synthesize(db_word.word)
        if os.path.exists(generated_path):
            shutil.copy(generated_path, audio_path)
            return FileResponse(audio_path)
    except Exception as e:
        logger.error(f"TTS fallback failed for word {db_word.word}: {e}")
        
    raise HTTPException(status_code=404, detail="Audio not found and TTS failed")

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
    
    # 3. Track activity
    if book_id:
        log_activity(db, "word_lookup", book_id=book_id)
            
    # 4. Check if word is already in vocab and get its context sentence
    db_vocab = db.query(Vocab).filter(Vocab.word_id == db_word.id).first()
    in_vocab = db_vocab is not None
    vocab_sentence = db_vocab.sentence if db_vocab else None
            
    return {
        "id": db_word.id,
        "word": db_word.word,
        "lemma": lemma,
        "phonetic": db_word.phonetic,
        "meaning": db_word.meaning,
        "audio_url": db_word.audio_url,
        "vocab_sentence": vocab_sentence,
        "in_vocab": in_vocab
    }

@app.post("/api/vocab")
def add_to_vocab(word_id: int, sentence_text: Optional[str] = None, book_id: Optional[int] = None, db: Session = Depends(get_db)):
    db_vocab = db.query(Vocab).filter(Vocab.word_id == word_id).first()

    if not db_vocab:
        db_vocab = Vocab(word_id=word_id, sentence=sentence_text)
        try:
            db.add(db_vocab)
            db.commit()
        except IntegrityError:
            db.rollback()
            # Already added by another request, just continue
            db_vocab = db.query(Vocab).filter(Vocab.word_id == word_id).first()
            if db_vocab and sentence_text:
                db_vocab.sentence = sentence_text
                db.commit()
    elif sentence_text:
        # Update sentence if provided (optional: maybe only if not already set?)
        db_vocab.sentence = sentence_text
        db.commit()

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
                "sentence": r.sentence
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
                "sentence": r.sentence
            })
    return result


@app.get("/api/vocab/graph")
def get_vocab_graph(db: Session = Depends(get_db)):
    """
    Build a graph of:
      Word (saved vocab) -> Sentence (all occurrences) -> Book

    Response format matches spec/spec-design-word-wall-3d-graph-view.md.
    """
    vocabs = db.query(Vocab).order_by(Vocab.added_time.desc()).all()

    nodes_by_id = {}
    links_set = set()

    def add_node(node_id: str, node_type: str, label: str, val: int, color: str):
        if node_id in nodes_by_id:
            return
        nodes_by_id[node_id] = {
            "id": node_id,
            "type": node_type,
            "label": label,
            "val": val,
            "color": color,
        }

    def add_link(source: str, target: str):
        # Use a tuple so we can de-dupe
        links_set.add((source, target))

    # Build word nodes first
    words = []
    for v in vocabs:
        w = db.query(Word).filter(Word.id == v.word_id).first()
        if not w:
            continue
        words.append(w)

        add_node(
            node_id=f"w_{w.id}",
            node_type="word",
            label=w.word,
            val=10,
            color="#FFD700",  # gold
        )

    # For each word, find all matching sentences and books
    # Note: we do a SQL LIKE prefilter, then a python regex "whole token" check for precision.
    # We intentionally avoid `\b` because vocab can contain non-word characters (e.g. "C++"),
    # and `\b` fails when a token ends with non-word characters.
    for w in words:
        word = (w.word or "").strip().lower()
        if not word:
            continue

        # SQL prefilter (case-insensitive)
        candidates = (
            db.query(Sentence)
            .filter(func.lower(Sentence.text).like(f"%{word}%"))
            .all()
        )

        # Python whole-token check:
        # - Must NOT have a `\w` character immediately before or after the match.
        # - This prevents substring matches like: "age" matching inside "image".
        try:
            pattern = re.compile(rf"(?<!\w){re.escape(word)}(?!\w)", re.IGNORECASE)
        except re.error:
            pattern = None

        # If strict "whole-token" matching yields no links for a vocab word, fall back to a
        # simpler substring/`includes` strategy so the word doesn't become an isolated node.
        # This intentionally ignores the stricter word-boundary logic in the fallback case.
        strict_matches = [
            s for s in candidates
            if (not pattern) or pattern.search(s.text or "")
        ]
        matches = strict_matches if strict_matches else candidates

        for s in matches:
            s_text = s.text or ""

            s_node_id = f"s_{s.id}"
            # Keep sentence labels short-ish for payload size; UI can show full on hover/click if desired.
            s_label = s_text.strip()
            if len(s_label) > 160:
                s_label = s_label[:157] + "..."

            add_node(
                node_id=s_node_id,
                node_type="sentence",
                label=s_label,
                val=5,
                color="#AAB3FF",  # soft blue-white
            )
            add_link(f"w_{w.id}", s_node_id)

            book = db.query(Book).filter(Book.id == s.book_id).first()
            if not book:
                continue

            b_node_id = f"b_{book.id}"
            add_node(
                node_id=b_node_id,
                node_type="book",
                label=book.title or f"Book {book.id}",
                val=15,
                color="#00FFFF",  # cyan
            )
            # Add cover image URL if available (frontend uses it for book nodes)
            if book.cover_image:
                nodes_by_id[b_node_id]["image"] = get_cover_url(book)
            add_link(s_node_id, b_node_id)

    return {
        "nodes": list(nodes_by_id.values()),
        "links": [{"source": s, "target": t} for (s, t) in sorted(links_set)],
    }

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
    
    log_activity(db, "srs_review")
    
    db.commit()
    return {"next_review": next_review}

@app.post("/api/tts")
def generate_tts(text: str, prompt_wav_path: Optional[str] = None, prompt_text: Optional[str] = None):
    try:
        audio_path = tts_engine.synthesize(text, prompt_wav_path=prompt_wav_path, prompt_text=prompt_text)
        audio_filename = os.path.basename(audio_path)
        return {"audio_url": f"http://localhost:8000/tts/{audio_filename}"}
    except Exception as e:
        logger.exception(f"TTS generation failed for text: {text[:100]}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")

class TTSStatusRequest(BaseModel):
    texts: List[str]

@app.post("/api/tts/status")
def tts_status(req: TTSStatusRequest):
    """
    Check whether cached TTS audio already exists for each input text.

    Note: This does NOT generate audio; it only checks for existing files produced by TTSEngine.
    """
    results = []
    for text in req.texts or []:
        # TTSEngine hashes the *raw* text (before preprocessing) to decide the output filename.
        text_hash = hashlib.md5((text or "").encode()).hexdigest()
        filename = f"{text_hash}.wav"
        path = os.path.join(TTS_DIR, filename)
        ready = os.path.exists(path)
        results.append(
            {
                "text": text,
                "ready": ready,
                "audio_url": f"http://localhost:8000/tts/{filename}" if ready else None,
            }
        )
    return {"results": results}

@app.post("/api/tts/light")
def generate_tts_light(text: str):
    try:
        audio_path = light_tts_engine.synthesize(text)
        audio_filename = os.path.basename(audio_path)
        return {"audio_url": f"http://localhost:8000/tts/{audio_filename}"}
    except Exception as e:
        logger.exception(f"Light TTS generation failed for text: {text[:100]}")
        raise HTTPException(status_code=500, detail=f"Light TTS generation failed: {str(e)}")

@app.get("/api/activity")
def get_activity(year: Optional[int] = None, month: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(ActivityLog)
    
    if year and month:
        start_date = f"{year}-{month:02d}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{month + 1:02d}-01"
        query = query.filter(ActivityLog.date >= start_date, ActivityLog.date < end_date)
    
    logs = query.all()
    
    activity_by_date = {}
    for log in logs:
        if log.date not in activity_by_date:
            activity_by_date[log.date] = {"book_count": 0, "word_count": 0, "review_count": 0}
        
        if log.event_type == "book_open":
            activity_by_date[log.date]["book_count"] += 1
        elif log.event_type == "word_lookup":
            activity_by_date[log.date]["word_count"] += log.word_count
        elif log.event_type == "srs_review":
            activity_by_date[log.date]["review_count"] += 1
    
    result = [
        {
            "date": date,
            "book_count": data["book_count"],
            "word_count": data["word_count"],
            "review_count": data["review_count"]
        }
        for date, data in sorted(activity_by_date.items())
    ]
    
    return result

@app.get("/api/activity/streak")
def get_streak(db: Session = Depends(get_db)):
    today = datetime.date.today()
    active_dates = db.query(ActivityLog.date).distinct().order_by(ActivityLog.date.desc()).all()
    active_dates = [d[0] for d in active_dates]
    
    if not active_dates:
        return {"current_streak": 0, "longest_streak": 0}
    
    current_streak = 0
    check_date = today
    
    if active_dates[0] != today.isoformat():
        check_date = today - datetime.timedelta(days=1)
    
    for date_str in active_dates:
        if date_str == check_date.isoformat():
            current_streak += 1
            check_date -= datetime.timedelta(days=1)
        elif date_str < check_date.isoformat():
            break
    
    longest_streak = 0
    streak = 0
    prev_date = None
    for date_str in sorted(active_dates):
        if prev_date is None or (datetime.date.fromisoformat(date_str) - prev_date).days == 1:
            streak += 1
        else:
            streak = 1
        longest_streak = max(longest_streak, streak)
        prev_date = datetime.date.fromisoformat(date_str)
    
    return {"current_streak": current_streak, "longest_streak": longest_streak}
