export interface Word {
  id: string;
  userId: string;
  en: string;
  ru: string;
  partOfSpeech: string;
  topic: string;
  note: string;
  learned: boolean;
  learnedDate: string | null;
  lastReviewed: string | null;
  correct: number;
  wrong: number;
  streak: number;
  created: string;
}

export interface IrregularVerb {
  id: string;
  userId: string;
  base: string;
  past: string;
  participle: string;
  ru: string;
  learned: boolean;
  learnedDate: string | null;
  streak: number;
}

export interface UserProgress {
  userId: string;
  streak: number;
  best: number;
  lastVisit: string | null;
  achievements: string[];
  booksRead: number;
  wordsFromBooks: number;
  bestStreak: number;
  daily: {
    [date: string]: {
      date: string;
      learned: number;
      reviewed: number;
      correct: number;
      wrong: number;
    };
  };
  dailyBooksRead: {
    [date: string]: string[];
  };
  customTopics?: { [id: string]: string };
  customPos?: { [id: string]: string };
}
