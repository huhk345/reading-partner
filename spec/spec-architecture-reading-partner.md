---
title: Reading Partner Architecture & Design Specification
version: 1.0
date_created: 2026-03-10
last_updated: 2026-03-10
owner: Gemini CLI
tags: [architecture, design, app, srs, learning]
---

# Introduction

The Reading Partner is a web-based application designed to facilitate language learning through immersive reading. It integrates document parsing (PDF/EPUB), real-time word lookup, and a Spaced Repetition System (SRS) based on the SM2 algorithm to help users retain new vocabulary discovered during reading.

## 1. Purpose & Scope

The purpose of this specification is to define the technical architecture, data structures, and core functional requirements for the Reading Partner application. The scope includes the frontend reader interface, the backend processing engine, and the persistent storage layer.

## 2. Definitions

- **SRS**: Spaced Repetition System, a method of reviewing information at increasing intervals.
- **SM2**: SuperMemo 2 algorithm, a specific SRS algorithm used to calculate review intervals.
- **EF**: Easiness Factor, a multiplier in the SM2 algorithm that represents how easy a word is to remember.
- **TTS**: Text-to-Speech, technology that converts written text into spoken words.
- **Tokenize**: The process of breaking down a sentence into individual words or symbols.

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The system must parse PDF documents and extract text while maintaining approximate reading order.
- **REQ-002**: The system must parse EPUB documents and extract text/content.
- **REQ-003**: The UI must allow users to click individual words to trigger a definition lookup.
- **REQ-004**: The system must provide a Spaced Repetition System (SRS) using the SM2 algorithm.
- **REQ-005**: The system must support Text-to-Speech (TTS) for sentences or selected words.
- **REQ-006**: The system must track word occurrences across different books to provide context during review.
- **CON-001**: The application must be deployable as a local-first or server-based Web App.
- **CON-002**: The system should prefer free or open-source APIs and libraries (e.g., DictionaryAPI.dev).
- **CON-003**: Data persistence must use SQLite for simplicity and portability.
- **GUD-001**: Use Vanilla CSS or Tailwind for styling; prioritize a clean, reading-focused interface.
- **PAT-001**: Follow a decoupled Frontend (Next.js) and Backend (FastAPI) architecture.

## 4. Interfaces & Data Contracts

### 4.1. Backend API (FastAPI)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/upload` | POST | Upload PDF/EPUB for parsing and storage. |
| `/api/dict?word={word}` | GET | Fetch word definition and phonetics. |
| `/api/vocab` | GET/POST | Manage user vocabulary and SRS state. |
| `/api/books` | GET | List available books. |

### 4.2. Database Schema (SQLite)

- **books**: `id, title, type, content`
- **sentences**: `id, book_id, text, index`
- **words**: `id, word, phonetic, meaning`
- **word_occurrence**: `id, word_id, sentence_id, book_id`
- **vocab**: `id, word_id, added_time, next_review, interval, ef, repetition`

## 5. Acceptance Criteria

- **AC-001**: Given a PDF file, when uploaded, then the system returns the full text content and saves it to the database.
- **AC-002**: Given a word in the reader, when clicked, then a popup appears with its definition, phonetics, and previous occurrences.
- **AC-003**: Given a vocabulary word for review, when the user rates it (Again, Hard, Good, Easy), then the `next_review` date is updated according to SM2.
- **AC-004**: The system shall play audio of a sentence when the "Speak" button is clicked using the browser's Web Speech API.

## 6. Test Automation Strategy

- **Test Levels**: 
    - Unit Tests: SM2 algorithm logic, text parsing functions.
    - Integration Tests: API endpoints for document upload and dictionary lookup.
    - End-to-End: Frontend reading experience and word-click interaction.
- **Frameworks**: 
    - Backend: `pytest`
    - Frontend: `Jest`, `React Testing Library`
- **Coverage Requirements**: Minimum 80% coverage for core SRS logic and parsers.

## 7. Rationale & Context

- **FastAPI/Next.js**: Chosen for high developer velocity and strong ecosystem support (Python for parsing, React for interactive UI).
- **SM2**: Industry standard for flashcard applications (e.g., Anki), ensuring scientifically-backed memory retention.
- **SQLite**: Minimal configuration required, making it ideal for a "Reading Partner" that might be run locally by individuals.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: Dictionary API - `https://dictionaryapi.dev` for free word definitions.
- **EXT-002**: Web Speech API - Browser-native TTS.

### Third-Party Services
- **SVC-001**: OpenRouter (Optional) - LLM fallback (Llama-3.1-8b) for complex word explanations.

### Technology Platform Dependencies
- **PLT-001**: Python 3.10+ (Backend)
- **PLT-002**: Node.js 18+ (Frontend)

## 9. Examples & Edge Cases

### SM2 Algorithm Logic (Python)
```python
def update_sm2(quality, interval, repetition, ef):
    if quality < 3:
        repetition = 0
        interval = 1
    else:
        repetition += 1
        if repetition == 1:
            interval = 1
        elif repetition == 2:
            interval = 6
        else:
            interval = int(interval * ef)
        
        ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        if ef < 1.3:
            ef = 1.3
            
    return interval, repetition, ef
```

## 10. Validation Criteria

- All document parsing must handle non-ASCII characters (UTF-8).
- The reader UI must be responsive for both desktop and tablet screens.
- Vocabulary reviews must persist across browser sessions.

## 11. Related Specifications / Further Reading

- [SuperMemo 2 Algorithm Description](https://www.supermemo.com/en/archives1990-2015/english/ol/sm2)
- [DictionaryAPI.dev Documentation](https://dictionaryapi.dev/)
