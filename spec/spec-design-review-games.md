---
title: Vocabulary Matching Games
version: 1.0
date_created: 2026-03-14
last_updated: 2026-03-14
owner: Gemini CLI
tags: [features, gaming, srs, learning]
---

# Introduction
This specification outlines the gamified vocabulary review feature, specifically focusing on "Word Card Match" games to enhance retention through different sensory modes.

## 1. Purpose & Scope
The scope is a new "Game" section in the application. The goal is to provide a fun way to review vocabulary beyond standard SRS flashcards.

## 2. Requirements & Constraints
- **REQ-001**: Implement "Word Card Match" games with 3 distinct modes:
    - **Mode A**: English Word text -> Chinese Meaning text.
    - **Mode B**: Sound (audio play) -> Chinese Meaning text.
    - **Mode C**: Sound (audio play) -> English Word text.
- **REQ-002**: Games must use words from the user's SRS queue that are due or recently learned.
- **REQ-003**: Feedback (correct/incorrect) must be visual and auditory.

## 3. Interfaces & Data Contracts
- **GET /api/game/words**: Returns a set of 8-12 word pairs based on SRS priority for the game session.

## 4. Acceptance Criteria
- **AC-001**: Given I select "Sound -> English" mode, When I click a sound card, Then it plays audio and I must select the matching English word card.
- **AC-002**: Given I match a pair correctly, Then both cards disappear or are greyed out.
- **AC-003**: The game displays a "Complete" screen with the number of attempts and a final score.
