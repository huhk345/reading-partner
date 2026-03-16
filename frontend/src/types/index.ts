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
  phonetic?: string;
  meaning?: string;
  audio_url?: string;
  occurrences?: { book: string; sentence: string }[];
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
  occurrences?: { book: string; sentence: string }[];
}
