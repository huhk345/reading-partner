---
title: Reading Partner Feature Enhancements & Design Specification
version: 1.0
date_created: 2026-03-14
last_updated: 2026-03-14
owner: Gemini CLI
tags: [design, features, tts, gamification, ux]
---

# Introduction

This specification outlines the design and implementation details for a series of enhancements to the Reading Partner application. These features aim to improve user retention, accuracy of word lookups, and the overall immersive reading experience through advanced TTS and gamification.

## 1. Purpose & Scope

The purpose of this specification is to provide clear instructions for the implementation of five core features:
1. UI Simplification (Removal of Text Mode).
2. Local Text-to-Speech (TTS) Integration.
3. Editable Word Correction in Dialogs.
4. Reading Activity Calendar.
5. Vocabulary Review Games.

The scope covers both frontend UI/UX changes and backend API/integration requirements.

## 2. Definitions

- **Coqui TTS**: An open-source deep learning toolkit for Text-to-Speech.
- **VITS**: A conditional variational autoencoder with adversarial learning for end-to-end text-to-speech.
- **OCR**: Optical Character Recognition (used here to refer to the process of word detection from documents).
- **Streak**: The number of consecutive days a user has performed a reading activity.

## 3. Requirements, Constraints & Guidelines

### 3.1. UI Simplification
- **REQ-001**: Remove the "Text Mode" toggle and its associated view from the Reader component.
- **REQ-002**: The interactive reader (where words are clickable) shall be the only available reading mode.

### 3.2. Local TTS (Coqui AI)
- **REQ-003**: The backend shall integrate `coqui-ai/TTS` using the model `tts_models/en/vctk/vits`.
- **REQ-004**: When the user hovers over the first word of a sentence, a "Play" icon button must appear.
- **REQ-005**: Clicking the "Play" button shall trigger a backend request to generate (or retrieve cached) audio for that sentence and play it in the browser.

### 3.3. Editable Word Dialog
- **REQ-006**: The word lookup dialog must include an input field (initially populated with the detected word) that allows user editing.
- **REQ-007**: When the user modifies the text in the lookup dialog, the system must trigger a new dictionary lookup for the edited word.

### 3.4. Reading Calendar
- **REQ-008**: Implement a calendar view that highlights days on which the user has read at least one sentence or reviewed a word.
- **REQ-009**: The calendar should support navigating through months and show "Reading Events" for selected days.

### 3.5. Review Games
- **REQ-010**: Implement "Word Card Match" games with three modes:
    - **Mode A**: English Word -> Chinese Meaning.
    - **Mode B**: Audio (Sound) -> Chinese Meaning.
    - **Mode C**: Audio (Sound) -> English Word.
- **REQ-011**: Games should use words from the user's SRS queue that are due or recently learned.

### 3.6. Gamification (Retention)
- **REQ-012**: Display a "Daily Streak" counter in the main dashboard.
- **REQ-013**: Provide visual feedback (e.g., animations or badges) when a user completes their daily reading goal.

## 4. Interfaces & Data Contracts

### 4.1. TTS API (Backend)
| Endpoint | Method | Payload | Description |
| :--- | :--- | :--- | :--- |
| `/api/tts` | POST | `{ "text": string, "speaker_id": string }` | Returns an audio stream or URL for the generated speech. |

### 4.2. Activity API (Backend)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/activity/calendar` | GET | Returns a list of dates with activity counts. |

### 4.3. Game State (Frontend)
```typescript
interface GameCard {
  id: string;
  content: string; // word, meaning, or audio_url
  type: 'word' | 'meaning' | 'audio';
  matchId: string;
}
```

## 5. Acceptance Criteria

- **AC-001**: Given the Reader is open, When I hover over the first word of a sentence, Then a play button appears near that word.
- **AC-002**: Given the Word Dialog is open, When I change "apple" to "apply" in the input field, Then the definition for "apply" is fetched and displayed.
- **AC-003**: Given the Calendar view, When I click on a date, Then a list of books read or words reviewed on that date is shown.
- **AC-004**: Given a Match Game, When I select a sound card and then its matching English word card, Then both cards are marked as "Matched" and removed from the active set.

## 6. Test Automation Strategy

- **TTS Testing**: Mock the TTS model output in CI/CD to verify the API response structure without loading the full model.
- **UI Interaction**: Use Playwright or Cypress to verify the hover-to-show-button logic and dialog editing.
- **Logic**: Unit tests for the "Matching" logic in games and the "Streak" calculation algorithm.

## 7. Rationale & Context

- **Removal of Text Mode**: Simplifies the codebase and ensures all users benefit from the interactive features (lookup, SRS).
- **Coqui TTS**: Selected for high-quality, local-first synthesis without relying on expensive cloud APIs.
- **Editable Dialog**: Essential for fixing errors in PDF/EPUB parsing where words might be merged or misspelled during extraction.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: `coqui-ai/TTS` - Local Python library for speech synthesis.

### Technology Platform Dependencies
- **PLT-001**: `vits` model files - Requires ~100MB-500MB storage on the backend.

## 9. Examples & Edge Cases

### OCR Correction Flow
1. User clicks "Tne" (OCR error for "The").
2. Dialog opens showing definition for "Tne" (likely not found).
3. User edits "Tne" to "The".
4. Dialog automatically refreshes with "The" definition.
5. User adds "The" to SRS (optional).

## 10. Validation Criteria

- TTS audio must play within 2 seconds of the click on local machines.
- The calendar must correctly handle timezone offsets for "Daily" activity.
- The word match game must be responsive on mobile devices.

## 11. Related Specifications / Further Reading

- [Coqui TTS Documentation](https://github.com/coqui-ai/TTS)
- [React DayPicker (for Calendar)](https://react-day-picker.js.org/)
