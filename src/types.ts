export interface Category {
  id: string;
  userId: string;
  name: string;
  parentId: string | null; // null for top-level folder, or category ID of parent folder
  icon?: string; // emoji icon e.g. "🎬", "📁", "👨‍🏫"
  description?: string;
  archived?: boolean;
  paused?: boolean; // If true, repetition reminders and SRS due count are disabled for this category
  created: string;
}

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
  categoryId?: string; // Belongs to a specific category or subcategory
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
  categories?: Category[]; // Stored user categories
  activeCategoryId?: string | null; // Currently selected active category on HomePage
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
