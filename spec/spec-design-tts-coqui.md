---
title: Local TTS with Coqui AI Integration
version: 1.0
date_created: 2026-03-14
last_updated: 2026-03-14
owner: Gemini CLI
tags: [features, tts, backend, audio]
---

# Introduction
This specification defines the integration of local Text-to-Speech (TTS) into the Reading Partner to provide sentence-level audio using the high-quality VITS model.

## 1. Purpose & Scope
The goal is to enable users to hear the pronunciation of sentences within the reader. This includes backend model serving and frontend UI components for playback.

## 2. Requirements & Constraints
- **REQ-001**: The backend must serve the `coqui-ai/TTS` model `tts_models/en/vctk/vits`.
- **REQ-002**: Audio should be generated on-demand for sentences and ideally cached to reduce latency.
- **REQ-003**: In the Reader UI, a "Play" icon must appear when a user hovers over the first word of a sentence.
- **REQ-004**: Clicking the "Play" button must stream the sentence audio to the user's browser.

## 3. Interfaces & Data Contracts
- **POST /api/tts**: Accepts `{ "text": string }` and returns an audio stream or static URL.

## 4. Acceptance Criteria
- **AC-001**: Given I am reading a book, When I hover over the first word of a sentence, Then a speaker icon appears nearby.
- **AC-002**: Given I click the speaker icon, Then I hear a natural-sounding voice read the sentence aloud.
- **AC-003**: Audio generation and playback start within 2 seconds.
