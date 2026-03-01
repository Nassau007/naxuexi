export type WordStatus = 'NEW' | 'LEARNING' | 'LEARNED';
export type ReviewModule = 'FLASHCARD' | 'PRONUNCIATION_READ' | 'PRONUNCIATION_LISTEN' | 'TRANSLATE' | 'DAILY_HANZI';
export type ReviewResult = 'CORRECT' | 'WRONG' | 'PARTIAL';

export type WordData = {
  id: number;
  hanzi: string;
  pinyin: string;
  meaning: string;
  category: string | null;
  hskLevel: number | null;
  components: string | null;
  mnemonic: string | null;
  audioUrl: string | null;
  status: WordStatus;
  easeFactor: number;
  interval: number;
  nextReview: string;
  reviewCount: number;
  correctCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WordCreateInput = {
  hanzi: string;
  pinyin: string;
  meaning: string;
  category?: string;
  hskLevel?: number;
  components?: string;
  mnemonic?: string;
};

export type WordBulkImport = {
  words: WordCreateInput[];
};

export type VocabStats = {
  total: number;
  new: number;
  learning: number;
  learned: number;
  dueForReview: number;
};
