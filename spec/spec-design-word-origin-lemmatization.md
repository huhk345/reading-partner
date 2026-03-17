---
title: Word Origin (Lemmatization) using spaCy and Enhanced Word Dialog UX
version: 1.0
date_created: 2026-03-17
tags: [design, backend, frontend, spacy, lemmatization]
---

# Introduction

This specification defines the implementation of a lemmatization feature using spaCy in the backend and an enhanced word search dialog in the frontend. The goal is to help users find the "origin" (root form) of a word they click on (e.g., clicking "running" shows both "running" and "run") and allow them to switch between these forms to see their respective meanings.

## 1. Purpose & Scope

The purpose is to improve the reading experience by providing automated root-word discovery. 
- **Scope**: 
    - Backend: Integration of `spaCy` for English lemmatization *only* to suggest root forms, without altering the core dictionary search logic.
    - Backend: Modification of the `/api/dict` endpoint to return lemmatized forms and accept a flag to skip lemmatization.
    - Frontend: UI update to the Word Definition Modal in `Reader.tsx` to show word "tags" (original and lemma) and keep them stable during navigation.

## 2. Definitions

- **Lemma**: The canonical form, dictionary form, or citation form of a set of words (e.g., "go" is the lemma for "go", "goes", "going", "went", "gone").
- **Lemmatization**: The process of grouping together the inflected forms of a word so they can be analyzed as a single item, identified by the word's lemma.
- **spaCy**: An open-source software library for advanced natural language processing.
- **ECDICT**: The local English-Chinese dictionary database used in the project.

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The backend shall use `spaCy` (model `en_core_web_sm`) to determine the lemma of any word requested via `/api/dict`. This process must *only* be used to provide the lemma recommendation and must *not* alter the primary dictionary search logic.
- **REQ-002**: The `/api/dict` response shall include both the `original_word` and the `lemma` (if different).
- **REQ-003**: If the `lemma` is different from the `original_word`, the frontend dialog shall display two "tags" or "tabs" at the top: one for the clicked word and one for its lemma. These tags must remain stable (stayable) while interacting within this word dialog session.
- **REQ-004**: Clicking a "tag" in the dialog shall trigger a lookup for that specific word/lemma. To break the calling loop and maintain stable tags, this subsequent request should instruct the backend to skip further lemmatization (e.g., via a `skip_lemma=true` parameter).
- **REQ-005**: The UI shall maintain the existing "clay" design system (using classes like `clay-card`, `clay-button`).
- **CON-001**: spaCy model `en_core_web_sm` must be downloaded during the setup/install phase.
- **CON-002**: The system should handle cases where spaCy fails or returns the same word as the lemma gracefully (i.e., don't show duplicate tags).

## 4. Interfaces & Data Contracts

### 4.1 Backend: Updated `/api/dict` Endpoint

**Request**: `GET /api/dict?word=running&book_id=1&sentence_id=123`
*Optional query parameter*: `skip_lemma=true` (Used by the frontend when clicking a recommended lemma tag to prevent recursive spaCy processing and keep the UI tags stable).

**Response Schema**:
```json
{
  "word": "running",
  "lemma": "run",
  "phonetic": "/ˈrʌnɪŋ/",
  "meaning": "...",
  "audio_url": "...",
  "id": 456
}
```

### 4.2 Frontend: Word Dialog State

The frontend state should track:
- `originalWord`: The word exactly as clicked in the text.
- `lemma`: The root form returned by the backend.
- `activeWord`: The word currently being "looked up" (either `originalWord` or `lemma`).

When `activeWord` changes (because a user clicked a different tag), the frontend fetches the new definition using `?skip_lemma=true`. This ensures the initial `originalWord` and `lemma` tags remain stable ("stayable") in the UI, breaking any potential infinite calling loop.

## 5. Acceptance Criteria

- **AC-001**: Given I click the word "studies", When the dialog opens, Then I see two tags: "studies" and "study".
- **AC-002**: Given the dialog for "studies" is open, When I click the "study" tag, Then the meaning updates to show the definition of "study".
- **AC-003**: Given I click a word that is already a lemma (e.g., "apple"), When the dialog opens, Then only one tag "apple" is shown (or no tags if redundancy is avoided).
- **AC-004**: Given the backend receives a word, When it processes it with spaCy, Then it returns the correct dictionary root form.

## 6. Test Automation Strategy

- **Unit Tests (Backend)**: Test the lemmatization logic with various inflected forms (plurals, tenses, etc.).
- **Integration Tests**: Verify the `/api/dict` endpoint returns both `word` and `lemma` fields.
- **Component Tests (Frontend)**: Verify the `Reader.tsx` modal correctly renders tags and handles click events to switch definitions.

## 7. Rationale & Context

Users often encounter inflected forms of words they already know or want to learn the root form of. Manually typing the root form into the search box is tedious. Automating this via spaCy and providing a one-click switch improves vocabulary acquisition efficiency.

## 8. Dependencies & External Integrations

### External Systems
- **None**

### Third-Party Services
- **DictionaryAPI.dev**: Used by `lookup_word` for English definitions.

### Infrastructure Dependencies
- **spaCy (Python Library)**: Required for lemmatization.
- **en_core_web_sm**: spaCy model for English.

### Data Dependencies
- **ECDICT (SQLite)**: Local dictionary database.

## 9. Examples & Edge Cases

### Edge Case: Irregular Verbs
- Clicked: "went"
- Tags: ["went", "go"]
- Action: User can see specific usage of "went" or the general meaning of "go".

### Edge Case: Same Word
- Clicked: "book"
- Lemma: "book"
- UI: Only shows "book" (no tab switching needed).

## 10. Validation Criteria

- The `backend/requirements.txt` includes `spacy`.
- A script or instruction exists to download `en_core_web_sm`.
- The frontend `Reader.tsx` modal shows tags when `word !== lemma`.

## 11. Related Specifications / Further Reading

- [spec-design-word-dialog-ux-improvements.md](./spec-design-word-dialog-ux-improvements.md)
