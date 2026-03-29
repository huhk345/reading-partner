---
title: Match Game 5-Level Progression System
version: 1.2
date_created: 2026-03-29
last_updated: 2026-03-29
owner: reading-partner
tags: [features, gaming, levels, matching, game-design]
---

# Introduction
This specification defines a 5-level progression system for the Word Card Match game. The difficulty scales from easy to hard across levels, with increasing word counts. All levels share a fixed 100-second timer. Levels 2-5 introduce sound mode in the last 40% of matches. The game always starts at Level 1 and advances sequentially.

## 1. Purpose & Scope
Provide a structured difficulty curve for the match game so users experience gradual challenge increase. The scope covers level configuration, word count scaling, sound mode timing (last 40%), and sequential level progression. No changes to existing game engine logic (matching, card rendering, feedback).

## 2. Definitions

| Term | Definition |
|------|-----------|
| Match Target | The number of correct matches required to win a level |
| Sound Mode | Game mode where English cards display as waveform icons and play audio instead of showing text |
| Text Mode | Game mode where English cards display as text (English word → Chinese meaning) |
| Mixed Mode | Combination of text and sound cards within a single level, with sound appearing in the last 40% |
| SLOTS_COUNT | Number of visible card slots per column (fixed at 5) |
| Sound Threshold | The score at which new cards become sound-based (calculated as `matchTarget - ceil(matchTarget * 0.4)`) |

## 3. Requirements, Constraints & Guidelines

### Level Configuration

| Level | Difficulty | Time Limit | Match Target | Sound Mode | Sound Threshold | Description |
|-------|-----------|------------|-------------|------------|----------------|-------------|
| 1 | Easy | 100s | 15 | No | N/A | Pure text matching, warmup level |
| 2 | Medium-Easy | 100s | 25 | Yes (last 40%) | 15 | Sound in last 10 matches |
| 3 | Medium | 100s | 35 | Yes (last 40%) | 21 | Sound in last 14 matches |
| 4 | Medium-Hard | 100s | 45 | Yes (last 40%) | 27 | Sound in last 18 matches |
| 5 | Hard | 100s | 55 | Yes (last 40%) | 33 | Sound in last 22 matches |

### Sound Threshold Calculation

For Levels 2-5, the sound threshold is computed as:

```
soundThreshold = matchTarget - ceil(matchTarget * 0.4)
```

| Level | matchTarget | 40% of target | soundThreshold | Sound matches |
|-------|------------|---------------|----------------|---------------|
| 1 | 15 | N/A | N/A | 0 |
| 2 | 25 | 10 | 25 - 10 = 15 | 10 |
| 3 | 35 | 14 | 35 - 14 = 21 | 14 |
| 4 | 45 | 18 | 45 - 18 = 27 | 18 |
| 5 | 55 | 22 | 55 - 22 = 33 | 22 |

All levels 2-5 use `mode: 'mixed'`. Levels 4-5 no longer use full audio mode.

### Sequential Progression

- The game always starts at Level 1.
- After winning a level, the game automatically advances to the next level.
- After winning Level 5, the game shows a "Game Complete" screen.
- No level selector UI. User starts by pressing "Play Match Game".
- On "Quit Game", user returns to the Word Wall (not level select).

### Requirements

- **REQ-001**: The game shall support 5 distinct levels with increasing difficulty.
- **REQ-002**: All levels shall have a fixed time limit of 100 seconds.
- **REQ-003**: Level 1 shall use text mode only (English text → Chinese text). No sound mode.
- **REQ-004**: Levels 2, 3, 4, and 5 shall use mixed mode. Sound cards appear only in the last 40% of matches (after soundThreshold is reached).
- **REQ-005**: Match targets shall increase progressively: 15, 25, 35, 45, 55.
- **REQ-006**: The game shall always start at Level 1 when the user presses "Play Match Game".
- **REQ-007**: After winning a level, the game shall automatically load the next level with fresh cards and reset timer.
- **REQ-008**: After winning Level 5, a "Game Complete" screen shall display total score across all levels.
- **REQ-009**: If the user loses (time runs out) on any level, the game over screen shall offer "Retry Level" and "Quit Game".
- **REQ-010**: The game HUD shall display the current level number and difficulty label.
- **REQ-011**: The game HUD shall display cumulative score across all completed levels.

### Constraints

- **CON-001**: Do not modify the existing matching engine logic in WordMatchGame.tsx (slot selection, animation, card replacement).
- **CON-002**: SLOTS_COUNT remains 5 (card slots per column).
- **CON-003**: Audio feedback (correct/wrong sounds) remains unchanged.
- **CON-004**: The component interface (`WordMatchGameProps`) shall remain backward-compatible with the existing `mode` prop.

### Guidelines

- **GUD-001**: Pass level configuration as props or derive from a level config object rather than hardcoding multiple branches.
- **GUD-002**: Store level config as a single constant array for easy maintenance.
- **GUD-003**: Sequential level progression logic should live in the parent component (Review.tsx), not inside WordMatchGame.
- **GUD-004**: Sound threshold should be computed from matchTarget using the formula, not hardcoded per level.

## 4. Interfaces & Data Contracts

### Level Config Data Structure

```typescript
type LevelConfig = {
  level: number;           // 1-5
  difficulty: string;      // 'Easy' | 'Medium-Easy' | 'Medium' | 'Medium-Hard' | 'Hard';
  timeLimit: number;       // Always 100
  matchTarget: number;     // 15 | 25 | 35 | 45 | 55
  mode: 'text' | 'mixed'; // Level 1 is 'text', Levels 2-5 are 'mixed'
  soundThreshold?: number; // Computed: matchTarget - ceil(matchTarget * 0.4); undefined for Level 1
};

function calcSoundThreshold(matchTarget: number): number {
  return matchTarget - Math.ceil(matchTarget * 0.4);
}

const MATCH_GAME_LEVELS: LevelConfig[] = [
  { level: 1, difficulty: 'Easy',        timeLimit: 100, matchTarget: 15, mode: 'text' },
  { level: 2, difficulty: 'Medium-Easy', timeLimit: 100, matchTarget: 25, mode: 'mixed', soundThreshold: calcSoundThreshold(25) },  // 15
  { level: 3, difficulty: 'Medium',      timeLimit: 100, matchTarget: 35, mode: 'mixed', soundThreshold: calcSoundThreshold(35) },  // 21
  { level: 4, difficulty: 'Medium-Hard', timeLimit: 100, matchTarget: 45, mode: 'mixed', soundThreshold: calcSoundThreshold(45) },  // 27
  { level: 5, difficulty: 'Hard',        timeLimit: 100, matchTarget: 55, mode: 'mixed', soundThreshold: calcSoundThreshold(55) },  // 33
];
```

### Updated Component Interface

```typescript
interface WordMatchGameProps {
  reviews: VocabReview[];
  onBack: () => void;
  onLevelComplete?: (level: number, score: number) => void; // NEW: called when a level is won
  mode?: 'text' | 'audio' | 'mixed'; // existing, derived from level config
  level?: number;                     // NEW: 1-5, defaults to 1
  timeLimit?: number;                 // NEW: overrides TIME_LIMIT, defaults to 100
  matchTarget?: number;               // NEW: overrides maxScore, from level config
  soundThreshold?: number;            // NEW: overrides TEXT_MATCH_COUNT, from level config
}
```

### Sequential Progression State (in Review.tsx)

```typescript
type GameSession = {
  currentLevel: number;      // 1-5
  cumulativeScore: number;   // Total matches across all completed levels
  status: 'idle' | 'playing' | 'level-complete' | 'game-over' | 'all-complete';
};
```

### Game Flow

```
[Word Wall] → [Play Match Game] → [Level 1: text, 15 target]
                                      ↓ win
                                [Level 2: mixed (last 40%), 25 target]
                                      ↓ win
                                [Level 3: mixed (last 40%), 35 target]
                                      ↓ win
                                [Level 4: mixed (last 40%), 45 target]
                                      ↓ win
                                [Level 5: mixed (last 40%), 55 target]
                                      ↓ win
                               [All Complete! Total: X]
                                      ↓
                               [Return to Word Wall]
```

### No Backend Changes Required
Existing APIs (`/api/vocab/all`, `/api/audio/{wordId}`, `/api/tts/light`) are sufficient. No new endpoints needed.

## 5. Acceptance Criteria

- **AC-001**: Given I press "Play Match Game", When the game starts, Then I begin at Level 1 with text-only cards and a 100-second timer.
- **AC-002**: Given I am on Level 1, When I match 15 pairs, Then the game advances to Level 2 with fresh cards and a reset 100-second timer.
- **AC-003**: Given I am on Level 2, When my score is below 15, Then all English cards display text (no sound icons).
- **AC-004**: Given I am on Level 2, When my score reaches 15 or above, Then new English cards appear as sound icons (last 40% = sound mode).
- **AC-005**: Given I am on Level 3, When my score reaches 21 or above, Then new English cards appear as sound icons.
- **AC-006**: Given I am on Level 4, When my score reaches 27 or above, Then new English cards appear as sound icons.
- **AC-007**: Given I am on Level 5, When my score reaches 33 or above, Then new English cards appear as sound icons.
- **AC-008**: Given any level is active, When I look at the HUD, Then it shows "Level X - Difficulty" and cumulative score.
- **AC-009**: Given I am on any level, When the timer reaches 0, Then the game over screen shows "Retry Level" and "Quit Game".
- **AC-010**: Given I win Level 5, When the game ends, Then I see "Game Complete!" with my total score across all levels.
- **AC-011**: Given I lose on Level 3, When I press "Retry Level", Then Level 3 restarts with fresh cards, timer reset to 100s, and cumulative score from Levels 1-2 preserved.
- **AC-012**: Given I lose on Level 1, When I press "Retry Level", Then Level 1 restarts with cumulative score 0.

## 6. Test Automation Strategy

- **Test Levels**: Unit tests for level config validation, component integration tests for each level
- **Validation**: Verify timeLimit=100 for all levels, verify matchTarget ascending order, verify sound mode only in last 40%

### Test Cases

| Test ID | Description | Expected |
|---------|-------------|----------|
| TC-001 | Render Level 1 game | mode='text', matchTarget=15, timer=100, no soundThreshold |
| TC-002 | Render Level 2 game | mode='mixed', matchTarget=25, soundThreshold=15 |
| TC-003 | Render Level 5 game | mode='mixed', matchTarget=55, soundThreshold=33 |
| TC-004 | Level 1 no sound icons | All left cards show text, no WaveformIcon |
| TC-005 | Level 2 sound transition | Score < 15: text cards; Score >= 15: sound cards appear |
| TC-006 | All levels timer=100 | Every level starts with timeLeft=100 |
| TC-007 | Win at target score | Game ends with won=true at exact matchTarget |
| TC-008 | Sequential progression | Win Level 1 → auto-advance to Level 2 |
| TC-009 | Game complete | Win Level 5 → show "Game Complete" screen |
| TC-010 | Retry level | Lose on Level 3 → "Retry" restarts Level 3, preserves L1+L2 score |
| TC-011 | Sound threshold formula | `matchTarget - ceil(matchTarget * 0.4)` for each level |
| TC-012 | No level selector | Play button goes directly to Level 1 |

## 7. Rationale & Context

### Why 40% Sound in Levels 2-5?
Sound in the last 40% creates a natural difficulty ramp within each level. The first 60% lets users warm up with familiar text matching, then the final 40% challenges listening comprehension. This is more engaging than a sudden switch or full audio mode.

### Why Sequential Progression?
Starting at Level 1 and advancing level-by-level creates a cohesive game experience. Users feel progression and accomplishment. It also prevents users from skipping to hard levels and getting frustrated.

### Why Fixed 100s Timer?
A fixed timer keeps the competitive dimension consistent. Difficulty is expressed through word count and sound mode, not time pressure. Users can compare performance across levels fairly.

### Why These Match Targets?
- 15 (L1): ~6.7s per match, relaxed warmup
- 25 (L2): ~4s per match, moderate (last 40% = 10 sound matches)
- 35 (L3): ~2.9s per match, challenging (last 40% = 14 sound matches)
- 45 (L4): ~2.2s per match, hard (last 40% = 18 sound matches)
- 55 (L5): ~1.8s per match, intense (last 40% = 22 sound matches)

## 8. Dependencies & External Integrations

### Existing Components (No Changes)
- **WordMatchGame.tsx**: Core game engine — receives new props but logic unchanged
- **extractShortMeaning()**: Chinese meaning extraction — unchanged
- **Web Audio API**: Correct/wrong feedback — unchanged

### Modified Components
- **Review.tsx**: Manages sequential level state (currentLevel, cumulativeScore), handles level transitions

### External Systems
- **EXT-001**: Browser SpeechSynthesis — fallback TTS, unchanged
- **EXT-002**: Backend `/api/audio/{wordId}` — unchanged

## 9. Examples & Edge Cases

### Starting the Game (Review.tsx)

```tsx
// No level selector. "Play Match Game" always starts Level 1.
<button onClick={() => startGame(1)}>
  Play Match Game
</button>
```

### Level Transition After Win

```tsx
function handleLevelComplete(level: number, score: number) {
  const newCumulative = cumulativeScore + score;
  if (level >= 5) {
    setGameStatus('all-complete');
    setCumulativeScore(newCumulative);
  } else {
    setCurrentLevel(level + 1);
    setCumulativeScore(newCumulative);
    setGameStatus('playing');
  }
}
```

### Passing Config to WordMatchGame

```tsx
const cfg = MATCH_GAME_LEVELS[currentLevel - 1];

<WordMatchGame
  reviews={reviews}
  onBack={() => { setMode('wall'); resetSession(); }}
  onLevelComplete={handleLevelComplete}
  mode={cfg.mode}
  level={cfg.level}
  timeLimit={cfg.timeLimit}
  matchTarget={cfg.matchTarget}
  soundThreshold={cfg.soundThreshold}
/>
```

### Sound Threshold Application (inside WordMatchGame)

```tsx
// Existing logic, but soundThreshold comes from props instead of TEXT_MATCH_COUNT
// Example: Level 3, soundThreshold = 21. Sound starts when score reaches 21.
const isNewSound = soundThreshold !== undefined && newScore >= soundThreshold;
```

### Game Over Screen (Lose)

```tsx
// Shows "Retry Level N" and "Quit Game"
// Retry resets to same level, preserves cumulativeScore from previous levels
<button onClick={() => retryCurrentLevel()}>Retry Level {currentLevel}</button>
<button onClick={onBack}>Quit Game</button>
```

### All Complete Screen

```tsx
// After winning Level 5
<h2>All Levels Complete!</h2>
<p>Total Score: {cumulativeScore} / {15+25+35+45+55} = {cumulativeScore} / 175</p>
<button onClick={onBack}>Return to Word Wall</button>
```

### Edge Cases

- **Fewer words available**: If `reviews.length < matchTarget`, game should still work (words recycle from queue/reviews). Existing `buildSlots` handles this.
- **Level 1 sound threshold**: Not applicable. `soundThreshold` is undefined, so `isNewSound` should be false.
- **Retry preserves cumulative**: When retrying Level N, cumulativeScore from Levels 1 to N-1 is preserved. Only the current level resets.
- **Retry Level 1**: cumulativeScore resets to 0 since no previous levels exist.

## 10. Validation Criteria

- [ ] `MATCH_GAME_LEVELS` array has exactly 5 entries
- [ ] All entries have `timeLimit: 100`
- [ ] `matchTarget` values are strictly ascending: 15 < 25 < 35 < 45 < 55
- [ ] Level 1 has `mode: 'text'` and no `soundThreshold`
- [ ] Levels 2-5 all have `mode: 'mixed'` with `soundThreshold` computed by formula
- [ ] Sound threshold formula: `matchTarget - ceil(matchTarget * 0.4)` produces correct values (15, 21, 27, 33)
- [ ] Game starts at Level 1 (no level selector)
- [ ] Winning a level auto-advances to next level
- [ ] Losing a level shows "Retry Level" option
- [ ] Winning Level 5 shows "All Complete" screen
- [ ] HUD shows current level and cumulative score
- [ ] Existing `mode` prop still works for backward compatibility

## 11. Related Specifications / Further Reading

- [spec-design-review-games.md](./spec-design-review-games.md) — Original game design spec
- [spec-design-features.md](./spec-design-features.md) — Feature specifications
- [spec-design-remove-text-mode.md](./spec-design-remove-text-mode.md) — Related text mode considerations
