---
title: Reader UI Simplification
version: 1.0
date_created: 2026-03-14
last_updated: 2026-03-14
owner: Gemini CLI
tags: [design, ux, refactor]
---

# Introduction
This specification covers the removal of the redundant "Text Mode" from the Reading Partner interface to streamline the user experience and focus on the interactive reader.

## 1. Purpose & Scope
The goal is to eliminate the toggle between "Image/Interactive Mode" and "Plain Text Mode." The scope is limited to the `Reader.tsx` component and associated state management.

## 2. Requirements & Constraints
- **REQ-001**: Remove the `isTextMode` state and the toggle UI element.
- **REQ-002**: The interactive/overlay-based reader shall be the default and only view.
- **REQ-003**: Ensure that all document types (PDF/EPUB) still render correctly without the text-only fallback.

## 3. Acceptance Criteria
- **AC-001**: Given the Reader is open, When the user looks at the header, Then no "Text Mode" toggle is visible.
- **AC-002**: The application code no longer contains conditional logic for rendering a plain text version of the book content.
