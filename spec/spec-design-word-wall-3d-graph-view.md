---
title: Design Specification - Word Wall 3D Graph View
version: 1.2
date_created: 2026-04-11
last_updated: 2026-04-11
owner: Codex
tags: [design, frontend, backend, graph, review, word-wall, three-js, eve-online]
status: proposed
---

# Introduction

This specification defines a new 3D graph view for the Reading Partner Word Wall. The graph view provides a spatial visualization of the user's vocabulary, connecting saved words to every sentence in the library where they appear, and linking those sentences back to their source books. The visual style is inspired by **Obsidian's graph view** and **EVE Online's star map**, creating a "cosmic" data exploration experience.

## 1. Purpose & Scope

The purpose is to provide an immersive 3D visualization using **Three.js** that helps users explore their vocabulary in context.

Scope:

- Frontend implementation using **Three.js** (via `react-force-graph-3d` and custom shaders/post-processing) in `frontend/src/components/Review.tsx`.
- Backend API update in `backend/main.py` to support exhaustive sentence matching for vocab words.
- Visualizing connections: `Word (in Vocab) -> Sentence (all occurrences in DB) -> Book`.

## 2. Definitions

- **3D Graph**: A force-directed spatial network rendered using **Three.js**.
- **Vocab Node**: A node representing a word saved by the user (the "stars" of the map).
- **Sentence Node**: A node representing a specific sentence in the database that contains a vocab word (intermediate waypoints).
- **Book Node**: A node representing a book in the library (the "constellation" or "sector" hubs).

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The graph view shall be built using **Three.js**. `react-force-graph-3d` is the recommended base.
- **REQ-002**: Data Source: The graph shall start from the words currently in the user's Word Wall (`Vocab` table).
- **REQ-003**: Discovery Logic: For each word in the Word Wall, the system shall find **all sentences** in the database (`sentences` table) that contain that word.
- **REQ-004**: Hierarchy: Word nodes connect to Sentence nodes. Sentence nodes connect to Book nodes.
- **REQ-005**: The graph shall support interactive camera controls: orbit, zoom, and pan with smooth inertia.
- **REQ-006**: **Visual Aesthetic (EVE Star Map Style)**:
    - **Background**: Deep black or very dark navy (#000005). Optional subtle starfield texture or gradient "nebula" background.
    - **Nodes**: Spherical geometry with emissive (glowing) materials.
        - **Word Nodes**: Gold/Yellow glow, larger scale.
        - **Sentence Nodes**: Soft white/blue glow, smaller scale.
        - **Book Nodes**: Distinctive cyan or magenta glow, medium scale.
    - **Links**: Thin, translucent lines with high contrast. Use dashed lines or "pulsing" effects for active connections.
    - **Post-Processing**: Implement a **Bloom effect** (UnrealBloomPass) to give nodes a radiant, star-like glow.
- **REQ-007**: Interaction: Clicking a node should center the camera on it and highlight its entire "constellation" (all recursive connections).
- **REQ-008**: Performance: Use `three-spritetext` for labels to ensure they are always readable and performant in 3D space.
- **REQ-009**: The UI shall include a toggle in the Review screen to switch between "Wall" and "Graph" modes.

## 4. Interfaces & Data Contracts

### 4.1. Backend API: `GET /api/vocab/graph`

This endpoint returns the nodes and links for the 3D graph.

**Logic:**
1. Fetch all words from `Vocab` (via `Word` join).
2. For each word, search the `sentences` table for matches.
3. Collect all unique books related to those sentences.

**Response Schema:**
```json
{
  "nodes": [
    { "id": "w_1", "type": "word", "label": "harbor", "val": 10, "color": "#FFD700" },
    { "id": "s_55", "type": "sentence", "label": "The harbor was quiet...", "val": 5, "color": "#AAAAAA" },
    { "id": "b_7", "type": "book", "label": "Treasure Island", "val": 15, "color": "#00FFFF" }
  ],
  "links": [
    { "source": "w_1", "target": "s_55" },
    { "source": "s_55", "target": "b_7" }
  ]
}
```

## 5. Acceptance Criteria

- **AC-001**: The graph view renders in 3D using Three.js with a dark "cosmic" background.
- **AC-002**: Nodes exhibit a visible glow (Bloom effect) similar to EVE Online's star map.
- **AC-003**: Every word in the user's word wall appears as a primary node.
- **AC-004**: Word nodes are connected to all sentences in the database that contain them.
- **AC-005**: Users can orbit, zoom, and click nodes to explore relationships with smooth camera transitions.

## 7. Rationale

Using **Three.js** with post-processing effects (Bloom) allows us to create a high-fidelity visualization that transforms data review into an engaging, gamified experience. The "EVE Star Map" aesthetic is not just visual flair; it uses contrast and lighting to help users focus on connections in a vast "vocabulary space."
