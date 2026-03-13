from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, Float, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./reading_partner.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Book(Base):
    __tablename__ = "books"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    filename = Column(String, nullable=True)
    type = Column(String)  # 'pdf' or 'epub'
    content = Column(Text)
    clean_text = Column(Text, nullable=True)
    pages_data = Column(Text, nullable=True) # JSON string
    cover_image = Column(String, nullable=True) # Path to cover image
    sentences = relationship("Sentence", back_populates="book")

class Sentence(Base):
    __tablename__ = "sentences"
    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"))
    text = Column(Text)
    index = Column(Integer)
    book = relationship("Book", back_populates="sentences")
    occurrences = relationship("WordOccurrence", back_populates="sentence")

class Word(Base):
    __tablename__ = "words"
    id = Column(Integer, primary_key=True, index=True)
    word = Column(String, unique=True, index=True)
    phonetic = Column(String, nullable=True)
    meaning = Column(Text, nullable=True)
    audio_url = Column(String, nullable=True)
    occurrences = relationship("WordOccurrence", back_populates="word")
    vocab = relationship("Vocab", back_populates="word", uselist=False)

class WordOccurrence(Base):
    __tablename__ = "word_occurrences"
    id = Column(Integer, primary_key=True, index=True)
    word_id = Column(Integer, ForeignKey("words.id"))
    sentence_id = Column(Integer, ForeignKey("sentences.id"))
    book_id = Column(Integer, ForeignKey("books.id"))
    
    __table_args__ = (UniqueConstraint('word_id', 'sentence_id', name='_word_sentence_uc'),)
    
    word = relationship("Word", back_populates="occurrences")
    sentence = relationship("Sentence", back_populates="occurrences")

class Vocab(Base):
    __tablename__ = "vocab"
    id = Column(Integer, primary_key=True, index=True)
    word_id = Column(Integer, ForeignKey("words.id"), unique=True)
    added_time = Column(DateTime, default=datetime.datetime.utcnow)
    next_review = Column(DateTime, default=datetime.datetime.utcnow)
    interval = Column(Integer, default=0)
    ef = Column(Float, default=2.5)
    repetition = Column(Integer, default=0)
    word = relationship("Word", back_populates="vocab")

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
