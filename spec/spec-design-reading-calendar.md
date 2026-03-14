---
title: Reading Activity Calendar
version: 1.0
date_created: 2026-03-14
last_updated: 2026-03-14
owner: Gemini CLI
tags: [features, ui, analytics, tracking]
---

# Introduction
This specification defines a calendar feature that tracks and displays a user's daily reading and review activities.

## 1. Purpose & Scope
The goal is to increase user engagement by visualizing streaks and past reading sessions on a dashboard calendar.

## 2. Requirements & Constraints
- **REQ-001**: Implement a month-view calendar in the main dashboard.
- **REQ-002**: Highlight days with any "Reading Event" (opening a book, looking up words, or reviewing SRS cards).
- **REQ-003**: Clicking a day must show a summary of what was read or reviewed on that specific date.
- **REQ-004**: Display a "Current Streak" counter nearby based on consecutive active days.

## 3. Interfaces & Data Contracts
- **GET /api/activity**: Returns activity logs grouped by date (e.g., `[{ "date": "2026-03-14", "book_count": 2, "word_count": 15 }]`).

## 4. Acceptance Criteria
- **AC-001**: Given I have read for 3 days straight, When I view the dashboard, Then the streak counter shows "3."
- **AC-002**: Given I view the calendar, When I click on "March 10," Then I see a list of books I opened on that day.
- **AC-003**: The calendar highlights active days in a distinct color.
