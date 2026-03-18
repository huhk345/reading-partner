---
title: Design Specification - Word Context Tracking and Display
version: 1.0
date_created: 2026-03-17
last_updated: 2026-03-17
owner: Gemini CLI
tags: [design, backend, frontend, ux, database]
status: done
---

# Introduction

This specification outlines the requirements and implementation plan for capturing the specific sentence context when a user adds a word to their vocabulary list. It also defines how this context should be displayed within the "Word Wall" (Review Page) to enhance learning through contextual usage.

## 1. Purpose & Scope

The goal is to ensure that users always have access to the original sentence where they encountered a word. This provides crucial semantic context during spaced repetition reviews.
- **Scope**: Backend API updates, Frontend `Reader` and `Review` component updates, and database interaction logic.
- **Intended Audience**: Full-stack developers.

## 2. Definitions

- **Word Wall**: The grid-based interactive review interface where vocabulary cards are displayed.
- **WordOccurrence**: A database record linking a `Word` to a specific `Sentence` within a `Book`.
- **Vocab**: A user's personal collection of words being tracked for spaced repetition.

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The backend `POST /api/vocab` endpoint must accept optional `book_id` and `sentence_id` parameters.
- **REQ-002**: When `book_id` and `sentence_id` are provided to `POST /api/vocab`, the system must ensure a `WordOccurrence` record exists for that word-sentence pair.
- **REQ-003**: The frontend `Reader` component must send the current `book_id` and `lastSentenceId` when the user adds a word to their vocabulary.
- **REQ-004**: The `Word Wall` (Review cards) must display the most relevant occurrence (usually the one that triggered the addition) on the back of the card.
- **REQ-005**: The keyword within the context sentence on the review card should be visually highlighted (e.g., bolded or colored).
- **CON-001**: Do not create duplicate `WordOccurrence` records (maintain unique constraint on `word_id` and `sentence_id`).
- **GUD-001**: Keep the context display concise; if multiple occurrences exist, prioritize the one most recently added or the one specifically linked to the vocab entry.

## 4. Interfaces & Data Contracts

### 4.1. Updated Backend API: `POST /api/vocab`
- **Path**: `/api/vocab`
- **Method**: `POST`
- **Query Parameters**:
  - `word_id` (int, required)
  - `book_id` (int, optional)
  - `sentence_id` (int, optional)

### 4.2. Frontend Data Flow
In `Reader.tsx`, the `addToVocab` function will be updated:
```typescript
const addToVocab = async () => {
  if (!selectedWord || !selectedWord.id) return;
  try {
    await axios.post('http://localhost:8000/api/vocab', null, {
      params: { 
        word_id: selectedWord.id,
        book_id: bookId,
        sentence_id: lastSentenceId
      }
    });
    // ...
  } catch (error) { ... }
};
```

## 5. Acceptance Criteria

- **AC-001**: Given a user is reading a book, When they click a word and add it to vocab, Then a `WordOccurrence` record is created/verified in the database for that specific sentence.
- **AC-002**: When the user navigates to the Review page (Word Wall), Then the card for that word shows the original sentence on its back.
- **AC-003**: The displayed sentence context correctly highlights the target word.
- **AC-004**: Adding the same word from a different sentence creates a new `WordOccurrence` but does not duplicate the `Vocab` entry.

## 6. Test Automation Strategy

- **Backend**: Unit test for `add_to_vocab` to verify `WordOccurrence` creation when IDs are provided.
- **Frontend**: Integration test for `Reader` to ensure correct params are sent to the API.
- **UI**: Snapshot test for the Review card to verify the context sentence is rendered with highlighting.

## 7. Rationale & Context

Learning words in isolation is significantly less effective than learning them in context. By capturing the exact sentence where a user encountered a word, we provide a "memory anchor" that aids retention and demonstrates proper usage.

## 8. Dependencies & External Integrations

### Data Dependencies
- **DAT-001**: `sentences` table must be populated for the book being read (handled by parsers).
- **DAT-002**: `word_occurrences` table acts as the link between vocabulary and context.

## 9. Examples & Edge Cases

### Edge Case: Word added from search (no context)
- If `book_id` or `sentence_id` are missing (e.g., added from a search bar), the system should still allow adding the word to vocab without a specific occurrence, or fall back to an existing occurrence if available.

### Highlight Logic Example
```typescript
const highlightWord = (sentence: string, word: string) => {
  const parts = sentence.split(new RegExp(`(\\b${word}\\b)`, 'gi'));
  return parts.map((part, i) => 
    part.toLowerCase() === word.toLowerCase() 
      ? <span key={i} className="text-indigo-600 font-bold">{part}</span> 
      : part
  );
};
```

## 10. Validation Criteria

- Database inspection confirms `WordOccurrence` records are created upon adding to vocab.
- UI verification on the Review page shows the context sentence for new vocabulary items.

## 11. Related Specifications / Further Reading

- `spec-design-review-word-card-wall.md`
- `spec-architecture-reading-partner.md`
