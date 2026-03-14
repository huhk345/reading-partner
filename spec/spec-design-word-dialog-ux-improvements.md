---
title: Word Dialog UX Improvements
version: 1.0
date_created: 2026-03-14
owner: Reading Partner Team
tags: [features, ui, ux, dictionary]
---

# Introduction

This specification outlines UX improvements for the word lookup dialog in the Reader component to enhance user experience when interacting with words.

## 1. Purpose & Scope

The scope is the `Reader.tsx` component, specifically the word dialog functionality. The goal is to improve the interaction flow when users click on words to look up definitions.

## 2. Definitions

- **Word Dialog**: The modal that appears when a user clicks a word to see its definition
- **Add Review List**: The action of adding a word to the vocabulary bank
- **Modal Overlay**: The backdrop layer behind the word dialog

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The word dialog must be displayed immediately when a word is clicked, without any loading delay or additional steps
- **REQ-002**: When adding a word to the review list, no confirmation dialog should be shown after successful addition
- **REQ-003**: The word dialog must close when clicking the modal overlay (outside the dialog content)
- **REQ-004**: When the word API returns a response with audio data, the audio must play automatically exactly once

## 4. Interfaces & Data Contracts

### Component State

```typescript
interface WordDialogState {
  isOpen: boolean;           // Whether dialog is visible
  word: string;              // The word being looked up
  isLoading: boolean;        // Loading state while fetching definition
  data: WordDefinition | null; // Definition data from API
}
```

### API Response

```typescript
interface WordDefinition {
  id: number;
  word: string;
  phonetic: string;
  meaning: string;
  audio_url?: string;        // Audio file URL for pronunciation
  occurrences?: Occurrence[];
}
```

## 5. Acceptance Criteria

- **AC-001**: Given I click a word in the text, When the API is still fetching, Then the dialog should still be visible with a loading state
- **AC-002**: Given I click "Add to My Word Bank", When the word is successfully added, Then no dialog should appear and the word dialog should close
- **AC-003**: Given the word dialog is open, When I click on the overlay background, Then the dialog should close
- **AC-004**: Given the word API returns successfully, When audio_url exists, Then the pronunciation audio should play automatically once

## 6. Test Automation Strategy

- **Test Levels**: Manual testing
- **Test Scenarios**:
  1. Click word -> verify dialog appears immediately
  2. Add to vocab -> verify no confirmation dialog appears
  3. Click overlay -> verify dialog closes
  4. Look up word with audio -> verify audio plays automatically

## 7. Rationale & Context

- Immediate dialog display prevents user confusion about whether the click was registered
- Removing the confirmation dialog for adding words streamlines the workflow since the action is not destructive
- Modal overlay click-to-close is a standard UX pattern that users expect
- Auto-playing pronunciation helps users learn correct pronunciation without extra clicks

## 8. Dependencies & External Integrations

- **API**: `/api/dict` endpoint for word definitions
- **Audio**: Browser Audio API for pronunciation playback

## 9. Examples & Edge Cases

### Edge Case 1: No audio URL
```typescript
// If audio_url is undefined, skip auto-play
if (data.audio_url) {
  speak(data.word, data.audio_url);
}
```

### Edge Case 2: Network error
```typescript
// Even on error, show dialog with error state
setDialogState({ isOpen: true, isLoading: false, error: 'Failed to fetch' });
```

## 10. Validation Criteria

1. Dialog shows immediately on word click (no delay)
2. No OK dialog appears after adding word to vocab
3. Clicking modal overlay closes the word dialog
4. Audio plays automatically once when API returns with audio_url

## 11. Related Specifications / Further Reading

- [spec-design-editable-word-dialog.md](./spec-design-editable-word-dialog.md)