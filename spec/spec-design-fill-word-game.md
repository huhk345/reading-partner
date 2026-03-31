---
title: Word Completion (Fill-in-the-Word) Game
version: 1.0
date_created: 2026-03-31
last_updated: 2026-03-31
owner: reading-partner
tags: [features, gaming, review, design]
---

# Introduction

This specification defines the "Word Completion" (Fill-in-the-Word) game for the Reading Partner application. The game challenges users to complete English words by selecting missing letters based on a Chinese meaning or audio prompt. This mode enhances spelling and recall while maintaining the app's gamified aesthetic.

## 1. Purpose & Scope

Provide a new vocabulary review mode focused on word construction. The scope includes game mechanics, a 5-level progression system, UI/UX guidelines, and integration into the existing `Review` component.

## 2. Definitions

| Term | Definition |
|------|-----------|
| **Target Word** | The English word the user needs to complete. |
| **Prompt** | The Chinese meaning or audio clip that identifies the target word. |
| **Blank** | A missing letter represented by an underscore (`_`). |
| **Active Blank** | The specific missing letter the user is currently prompted to fill. |
| **Options** | The set of letters (alphabets) the user can choose from to fill a blank. |
| **Sound Mode** | A mode where the Chinese text is hidden, and only audio is played. |

## 3. Requirements, Constraints & Guidelines

### Game Mechanics

- **REQ-001**: The game shall display a prompt (Chinese meaning or sound).
- **REQ-002**: The target word shall be displayed with some letters replaced by blanks (e.g., `W _ N T`).
- **REQ-003**: Only one blank shall be active at a time, highlighted to indicate it is the current target.
- **REQ-004**: For the active blank, exactly 2 (or more in higher levels) letter options shall be displayed. One must be correct, others must be decoys.
- **REQ-005**: If the user selects the correct letter, the blank is filled, and the next blank (if any) becomes active.
- **REQ-006**: If the user selects the wrong letter, a "wrong" visual feedback (e.g., shake) is shown, and the user must try again.
- **REQ-007**: A word is considered "completed" once all blanks are filled correctly.

### Level Progression System

| Level | Difficulty | Time Limit | Blanks per Word | Options | Prompt Mode | Description |
|-------|------------|------------|-----------------|---------|-------------|-------------|
| 1 | Easy | 60s | 1 | 2 | Text | 1 missing letter, 5 choices |
| 2 | Medium-Easy| 60s | 2 | 2 | Text | 2 missing letters, 5 choices |
| 3 | Medium | 60s | 3 | 2 | Text | 3 missing letters, 8 choices |
| 4 | Medium-Hard| 60s | 2 | 2 | Sound | 2 missing letters, Sound only |
| 5 | Hard | 60s | 3+ | 3 | Sound | 3+ missing letters, 8 choices, Sound only |

### UI/UX Design

- **GUD-001**: Use the "Glassmorphism" and "Clay" style consistent with `WordMatchGame.tsx`.
- **GUD-002**: Target word letters should be large and clearly separated.
- **GUD-003**: Blanks should have a pulsing animation when active.
- **GUD-004**: Options should be presented as interactive buttons (letter cards) at the bottom.
- **GUD-005**: Visual feedback:
    - **Correct**: Blank turns green, letter pops in.
    - **Wrong**: Letter card turns red and shakes.
- **GUD-006**: Audio feedback: Use the same correct/wrong oscillator sounds from `WordMatchGame.tsx`.

### Constraints

- **CON-001**: Use words from the user's `reviews` list.
- **CON-002**: Words shorter than the required number of blanks for a level should have all but one or two letters hidden.
- **CON-003**: Decoy letters should be randomized but ideally similar (e.g., 'm' vs 'n', 'p' vs 'b').

## 4. Interfaces & Data Contracts

### Component Props

```typescript
interface WordCompletionGameProps {
  reviews: VocabReview[];
  onBack: () => void;
  onLevelComplete: (level: number, score: number, stats: LevelStats) => void;
  level: number;
  timeLimit: number;
  matchTarget: number; // Number of words to complete to pass the level
}
```

### Level Logic (Example)

```typescript
function getBlanksForWord(word: string, count: number): number[] {
  // Randomly select 'count' indices to be blanks
  // Ensure we don't blank out everything
}

function getOptionsForBlank(correctLetter: string, count: number): string[] {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const options = [correctLetter];
  while (options.length < count) {
    const randomLetter = alphabet[Math.floor(Math.random() * 26)];
    if (!options.includes(randomLetter)) {
      options.push(randomLetter);
    }
  }
  return options.sort(() => Math.random() - 0.5);
}
```

## 5. Acceptance Criteria

- **AC-001**: Given I am on Level 1, When I see the prompt "想要" and the word `W _ N T`, Then I should see two buttons (e.g., 'A' and 'W').
- **AC-002**: Given I click the correct letter 'W', Then the blank should be filled, and the word should animate to show completion.
- **AC-003**: Given I click the wrong letter 'A', Then the button should shake and turn red, and the blank remains empty.
- **AC-004**: Given Level 4 or 5, When the game starts, Then no Chinese text is shown, and the audio for the word plays automatically.
- **AC-005**: Given I complete the `matchTarget` number of words within the `timeLimit`, Then I advance to the next level.

## 6. Test Automation Strategy

- **Unit Tests**:
    - Blank selection logic (ensure at least one letter remains visible).
    - Decoy letter generation (ensure no duplicate correct answers).
- **Component Tests**:
    - Selection of correct/wrong options.
    - Level transition logic.
    - Timer countdown and Game Over state.

## 7. Rationale & Context

The "Fill-in-the-Word" mechanic specifically targets **orthographic recall** (spelling). By showing the Chinese meaning or sound, it forces the user to bridge the gap between meaning/sound and spelling, which is a step harder than simple matching but easier than full typing.

## 8. Dependencies & External Integrations

- **Frontend**: React, Framer Motion, Lucide Icons.
- **Backend**: Same as existing games (`/api/audio`, `/api/tts`).

## 9. Examples & Edge Cases

- **Short Words**: For a 3-letter word like "CAT" in Level 3 (3 blanks), at least one letter should remain visible (e.g., `_ A _`) to provide a hint, or allow full word completion for extreme difficulty.
- **Special Characters**: Words with hyphens or spaces should have those characters revealed by default.
- **Recycling Words**: If the user has few words in their review list, reuse words but with different letters blanked out.

## 10. Validation Criteria

- [ ] Game displays correct prompt (Text vs Sound) based on level.
- [ ] Number of blanks matches level configuration.
- [ ] Options provided contain exactly one correct letter.
- [ ] Winning/Losing follows the same pattern as the Match Game for UI consistency.

## 11. Related Specifications / Further Reading

- [spec-design-match-game-levels.md](./spec-design-match-game-levels.md)
- [spec-design-review-games.md](./spec-design-review-games.md)
