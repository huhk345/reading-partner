export interface WordData {
  text: string;
  bbox: [number, number, number, number];
  block: number;
  line: number;
}

export interface PageData {
  page_index: number;
  width: number;
  height: number;
  words: WordData[];
}

export interface Book {
  id: number;
  title: string;
  type: string;
  clean_text?: string;
  pages_data?: PageData[];
  pdf_url?: string;
  cover_image?: string;
  sentences?: Sentence[];
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error_message?: string;
}

export interface Sentence {
  id: number;
  book_id: number;
  text: string;
  index: number;
}

export interface WordDefinition {
  id?: number;
  word: string;
  lemma?: string;
  phonetic?: string;
  meaning?: string;
  audio_url?: string;
  vocab_sentence?: string;
  in_vocab?: boolean;
}

export interface VocabReview {
  vocab_id: number;
  word_id: number;
  word: string;
  phonetic?: string;
  meaning?: string;
  audio_url?: string;
  interval: number;
  repetition: number;
  ef: number;
  sentence?: string;
}

export interface ActivityDay {
  date: string;
  book_count: number;
  word_count: number;
  review_count: number;
}

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
}

export type LevelConfig = {
  level: number;
  difficulty: string;
  timeLimit: number;
  matchTarget: number;
  mode: 'text' | 'mixed';
  soundThreshold?: number;
};

export type LevelStats = {
  bestStreak: number;
  avgSecondsPerMatch: number;
  totalMatches: number;
  timeUsed: number;
  timeLeft: number;
};

export type GameSession = {
  currentLevel: number;
  cumulativeScore: number;
  status: 'idle' | 'playing' | 'level-stats' | 'game-over' | 'all-complete';
  gameType?: 'match' | 'completion';
  levelStats?: LevelStats;
  bonusTime?: number;
};

export function calcSoundThreshold(matchTarget: number): number {
  return matchTarget - Math.ceil(matchTarget * 0.4);
}

export type GraphNodeType = 'word' | 'sentence' | 'book';

export interface VocabGraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  val: number;
  color: string;
  /**
   * Optional image URL for the node (used for book cover thumbnails).
   */
  image?: string;
  // react-force-graph-3d will add x/y/z at runtime
  x?: number;
  y?: number;
  z?: number;
}

export interface VocabGraphLink {
  source: string | VocabGraphNode;
  target: string | VocabGraphNode;
}

export interface VocabGraphResponse {
  nodes: VocabGraphNode[];
  links: VocabGraphLink[];
}
