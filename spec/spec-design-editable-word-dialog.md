---
title: Editable Word Lookup Dialog
version: 1.0
date_created: 2026-03-14
last_updated: 2026-03-14
owner: Gemini CLI
tags: [features, ui, ux, dictionary]
---

# Introduction
This specification outlines the addition of an editable text field in the word lookup dialog, enabling users to manually correct OCR or parsing errors.

## 1. Purpose & Scope
The scope is the `Dialog.tsx` (or `WordDialog`) component. The goal is to allow users to edit the word and immediately trigger a new dictionary search.

## 2. Requirements & Constraints
- **REQ-001**: The dialog header must contain an input field (initially showing the clicked word).
- **REQ-002**: Modifying this input field must trigger a debounced or button-initiated re-search in the dictionary.
- **REQ-003**: The updated definition must replace the current one in the dialog.

## 3. Acceptance Criteria
- **AC-001**: Given I click a misspelled word like "Tne," When the dialog opens, Then I can change the input field to "The."
- **AC-002**: Given I change the word in the dialog, Then the definition for "The" automatically loads.
- **AC-003**: The dialog state reflects the corrected word for SRS addition.
