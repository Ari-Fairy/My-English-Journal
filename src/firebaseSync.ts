import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  writeBatch 
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { Word, IrregularVerb, UserProgress } from "./types";
import { SEED_WORDS, SEED_IRREGULAR } from "./data";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const isOffline = errMessage.toLowerCase().includes("offline") || 
                    errMessage.toLowerCase().includes("network") || 
                    errMessage.toLowerCase().includes("storage") ||
                    errMessage.toLowerCase().includes("permission");

  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  if (isOffline) {
    console.warn(`[Firestore Offline/Restricted] Operation '${operationType}' on path '${path || "unknown"}' is operating in local/offline fallback: ${errMessage}`);
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  throw new Error(JSON.stringify(errInfo));
}

const wordsCollection = collection(db, "words");
const irregularCollection = collection(db, "irregular");
const usersCollection = collection(db, "users");

// Helper to generate a unique ID
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Seed initial default words & verbs into Firestore for a new user
export async function seedUserData(userId: string): Promise<{ words: Word[]; irregular: IrregularVerb[]; progress: UserProgress }> {
  try {
    const batch = writeBatch(db);
    const wordsList: Word[] = [];
    const irregularList: IrregularVerb[] = [];

    // 1. Seed words
    for (const w of SEED_WORDS) {
      const wordId = uid();
      const word: Word = {
        id: wordId,
        userId,
        en: w.en,
        ru: w.ru,
        partOfSpeech: w.pos,
        topic: w.topic,
        note: "",
        learned: false,
        learnedDate: null,
        lastReviewed: null,
        correct: 0,
        wrong: 0,
        streak: 0,
        created: new Date().toISOString()
      };
      wordsList.push(word);
      batch.set(doc(wordsCollection, wordId), word);
    }

    // 2. Seed irregular verbs
    for (const v of SEED_IRREGULAR) {
      const verbId = uid();
      const verb: IrregularVerb = {
        id: verbId,
        userId,
        base: v.base,
        past: v.past,
        participle: v.participle,
        ru: v.ru,
        learned: false,
        learnedDate: null,
        streak: 0
      };
      irregularList.push(verb);
      batch.set(doc(irregularCollection, verbId), verb);
    }

    // 3. Create user progress stats document
    const d = new Date();
    const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const progress: UserProgress = {
      userId,
      streak: 1,
      best: 1,
      lastVisit: localToday,
      achievements: [],
      booksRead: 0,
      wordsFromBooks: 0,
      bestStreak: 0,
      daily: {},
      dailyBooksRead: {},
      customTopics: {},
      customPos: {}
    };
    batch.set(doc(usersCollection, userId), progress);

    await batch.commit();
    return { words: wordsList, irregular: irregularList, progress };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "seedUserData");
    throw error;
  }
}

// Fetch all data for a given user
export async function fetchUserData(userId: string): Promise<{ words: Word[]; irregular: IrregularVerb[]; progress: UserProgress | null }> {
  try {
    // Query words
    const wordsQuery = query(wordsCollection, where("userId", "==", userId));
    const wordsSnap = await getDocs(wordsQuery);
    const words: Word[] = [];
    wordsSnap.forEach(snap => {
      words.push(snap.data() as Word);
    });

    // Query irregular verbs
    const irregularQuery = query(irregularCollection, where("userId", "==", userId));
    const irregularSnap = await getDocs(irregularQuery);
    const irregular: IrregularVerb[] = [];
    irregularSnap.forEach(snap => {
      irregular.push(snap.data() as IrregularVerb);
    });

    // Fetch progress
    const progressDoc = await getDoc(doc(usersCollection, userId));
    const progress = progressDoc.exists() ? (progressDoc.data() as UserProgress) : null;

    // Guarantee that progress has userId
    if (progress) {
      progress.userId = userId;
    }

    return { words, irregular, progress };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    throw error;
  }
}

// Save a word (insert or update)
export async function saveWord(word: Word): Promise<void> {
  try {
    await setDoc(doc(wordsCollection, word.id), word);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `words/${word.id}`);
  }
}

// Delete a word
export async function deleteWord(wordId: string): Promise<void> {
  try {
    await deleteDoc(doc(wordsCollection, wordId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `words/${wordId}`);
  }
}

// Save an irregular verb
export async function saveIrregularVerb(verb: IrregularVerb): Promise<void> {
  try {
    await setDoc(doc(irregularCollection, verb.id), verb);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `irregular/${verb.id}`);
  }
}

// Save user progress stats
export async function saveUserProgress(progress: UserProgress): Promise<void> {
  try {
    await setDoc(doc(usersCollection, progress.userId), progress);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${progress.userId}`);
  }
}

// Completely delete all data for a specific user ID (Settings wipeout feature!)
export async function wipeUserAccountData(userId: string): Promise<void> {
  const batch = writeBatch(db);

  // 1. Fetch user's words
  let wordsSnap;
  try {
    const wordsQuery = query(wordsCollection, where("userId", "==", userId));
    wordsSnap = await getDocs(wordsQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `words (query for ${userId})`);
    throw error;
  }

  wordsSnap.forEach(docSnap => {
    batch.delete(docSnap.ref);
  });

  // 2. Fetch user's irregular verbs
  let irregularSnap;
  try {
    const irregularQuery = query(irregularCollection, where("userId", "==", userId));
    irregularSnap = await getDocs(irregularQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `irregular (query for ${userId})`);
    throw error;
  }

  irregularSnap.forEach(docSnap => {
    batch.delete(docSnap.ref);
  });

  // 3. Add progress document to batch delete
  try {
    batch.delete(doc(usersCollection, userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    throw error;
  }

  // 4. Commit batch
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `batch.commit (wipe data for ${userId})`);
    throw error;
  }
}
