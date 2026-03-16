---
title: Design Specification - Review Page Word Card Wall
version: 1.0
date_created: 2026-03-15
last_updated: 2026-03-15
owner: Gemini CLI
tags: [design, frontend, ux, interactive, language-learning]
status: done
---

# Introduction

This specification defines the interactive "Word Card Wall" for the vocabulary review page of the Reading Partner application. The goal is to replace the existing linear, single-card review process with an immersive, tactile grid of cards that users can "clear" as they review their vocabulary.

## 1. Purpose & Scope

The purpose of this specification is to provide a detailed design and technical guide for implementing a grid-based vocabulary review interface. 
- **Scope**: Frontend component (`Review.tsx`), associated types, and interaction patterns.
- **Intended Audience**: Frontend developers and UI/UX designers.
- **Assumptions**: The backend already supports SM2-based vocabulary review endpoints (`GET /api/vocab/review` and `POST /api/vocab/review`).

## 2. Definitions

- **Claymorphism**: A UI style characterized by soft, rounded edges, inner and outer shadows creating a 3D, tactile feel.
- **SM2**: SuperMemo 2 algorithm used for spaced repetition scheduling.
- **Framer Motion**: A production-ready motion library for React.
- **3D Flip**: An animation where a card rotates on its Y-axis to reveal the back side.

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The interface must display vocabulary words as a grid of cards (Word Card Wall).
- **REQ-002**: Each card must support a 3D flip animation to reveal its meaning/context.
- **REQ-003**: Users must be able to rate their memory of a word using four quality levels (0, 3, 4, 5).
- **REQ-004**: Cards must disappear from the wall with a satisfying "success" animation once rated.
- **REQ-005**: The grid must reflow smoothly as cards are removed.
- **CON-001**: Must adhere to the existing `clay-card` and `clay-button` styles defined in `globals.css`.
- **CON-002**: Must use `framer-motion` for all transitions and layout animations.
- **GUD-001**: Use `Baloo 2` for words and `Comic Neue` for secondary text.
- **PAT-001**: Staggered entrance animations for the grid items on page load.

## 4. Interfaces & Data Contracts

### 4.1. VocabReview Type
```typescript
export interface VocabReview {
  vocab_id: number;
  word: string;
  phonetic?: string;
  meaning?: string;
  audio_url?: string;
  occurrences?: { book: string; sentence: string }[];
}
```

### 4.2. API Integration
- `GET http://localhost:8000/api/vocab/review` -> `VocabReview[]`
- `POST http://localhost:8000/api/vocab/review?vocab_id={id}&quality={0|3|4|5}`

## 5. Acceptance Criteria

- **AC-001**: Given a list of pending reviews, When the page loads, Then a grid of cards appears with a staggered "drop-in" animation.
- **AC-002**: When a user clicks a card front, Then it flips 180 degrees on the Y-axis to show the back.
- **AC-003**: When a user clicks a rating button on the back, Then the card is removed from the wall and the backend is updated.
- **AC-004**: When the last card is removed, Then a celebratory mastery dialog appears.
- **AC-005**: The system shall be responsive and usable on mobile (2 columns), tablet (3 columns), and desktop (4+ columns).

## 6. Test Automation Strategy

- **Test Levels**: Unit tests for the card flip state; Integration tests for the rating submission.
- **Frameworks**: Vitest and React Testing Library.
- **Coverage Requirements**: 80% coverage for the `Review` component logic.

## 7. Rationale & Context

The "Word Card Wall" approach increases user engagement by providing a visual sense of progress and "work to be done." The claymorphic style and tactile animations reduce the "drudgery" of flashcards, making the learning process feel more like a game.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: Backend API - Vocabulary and SRS management.

### Third-Party Services
- **SVC-001**: Google Fonts - `Baloo 2` and `Comic Neue`.

### Technology Platform Dependencies
- **PLT-001**: Next.js 15+ (App Router).
- **PLT-002**: Framer Motion 11+.

## 9. Examples & Edge Cases

### Edge Case: Empty Review List
- Display a "No words to review" message with a celebratory icon and a "Back to Library" button.

### Edge Case: Long Meanings/Examples
- Cards should have a minimum height but expand or scroll if the content exceeds the 4:3 aspect ratio, though a "modal zoom" for long context is preferred.

## 10. Validation Criteria

- Visual consistency with the Claymorphism design system.
- Smooth 60fps animations for flips and grid reflows.
- Correct updating of SRS data via API.

## 11. Related Specifications / Further Reading

- `spec-design-features.md`
- `spec-design-word-dialog-ux-improvements.md`
