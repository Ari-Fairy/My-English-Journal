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
  // Spaced repetition fields
  intervalMinutes?: number; // 15, 60, 240, 1440, 4320, 10080
  consecutiveErrors?: number; // consecutive errors within a single day
  isProblematic?: boolean; // marked if consecutiveErrors >= 2
  isMandatoryEndOfDay?: boolean; // marked if consecutiveErrors >= 3 (for end-of-day lists)
  nextReviewDate?: string; // ISO string for the next repetition time
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
  deletedTopics?: string[];
  deletedPos?: string[];
  notifFrequency?: string;
  emailNotifEnabled?: boolean;
  emailNotifHour?: number;
  emailNotifOffset?: number;
  email?: string;
  dailyWordsLimit?: number;
  sessionReviewLimit?: number;
  lastReviewSessionTime?: number;
  secondLastReviewSessionTime?: number;
  firstStudyDate?: string;
  level?: string;
  tutorLevels?: {
    sophia?: string;
    oliver?: string;
    alex?: string;
  };
}
