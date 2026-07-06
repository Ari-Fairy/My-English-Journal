import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { 
  fetchUserData, 
  seedUserData, 
  saveWord, 
  deleteWord, 
  saveIrregularVerb, 
  saveUserProgress,
  batchResetUserData
} from "./firebaseSync";
import { Word, IrregularVerb, UserProgress } from "./types";
import { checkAchievements, ACHIEVEMENTS_DEF, SEED_WORDS, SEED_IRREGULAR } from "./data";
import { getLocalDateString } from "./utils";

// Sub-screens imports
import AuthScreen from "./components/AuthScreen";
import HomePage from "./components/HomePage";
import StudyScreen from "./components/StudyScreen";
import DictionaryScreen from "./components/DictionaryScreen";
import IrregularVerbsScreen from "./components/IrregularVerbsScreen";
import ReaderScreen from "./components/ReaderScreen";
import SettingsScreen from "./components/SettingsScreen";
import AddScreen from "./components/AddScreen";
import StatsScreen from "./components/StatsScreen";
import AchievementsScreen from "./components/AchievementsScreen";

export default function App() {
  const [user, setUser] = useState<any>(null); // "guest" or Firebase User object
  const [authLoading, setAuthLoading] = useState(true);
  const [dbLoading, setDbLoading] = useState(false);
  const [view, setView] = useState<"home" | "study" | "words" | "add" | "irregular" | "reader" | "stats" | "achievements" | "settings">("home");
  const [sessionType, setSessionType] = useState<"learn" | "review">("learn");

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("my-eng-theme") as "light" | "dark") || "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("my-eng-theme", theme);
  }, [theme]);

  // Core app data (local state sync)
  const [words, setWords] = useState<Word[]>([]);
  const [irregular, setIrregular] = useState<IrregularVerb[]>([]);
  const [progress, setProgress] = useState<UserProgress>({
    userId: "guest",
    streak: 1,
    best: 1,
    lastVisit: null,
    achievements: [],
    booksRead: 0,
    wordsFromBooks: 0,
    bestStreak: 0,
    daily: {},
    dailyBooksRead: {}
  });

  const [welcome, setWelcome] = useState(false);
  const [newAchs, setNewAchs] = useState<any[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Local Storage guest sync helpers
  const loadGuestData = () => {
    try {
      const cached = localStorage.getItem("my-eng-v3-guest");
      if (cached) {
        const parsed = JSON.parse(cached);
        setWords(parsed.words || []);
        setIrregular(parsed.irregular || []);
        setProgress(parsed.stats || {
          userId: "guest",
          streak: 1,
          best: 1,
          lastVisit: null,
          achievements: [],
          booksRead: 0,
          wordsFromBooks: 0,
          bestStreak: 0,
          daily: {},
          dailyBooksRead: {}
        });
      } else {
        // First-time guest initialization
        localStorage.setItem("my-eng-v3-guest", JSON.stringify({ words: [], irregular: [], stats: progress }));
      }
    } catch (e) {
      console.error("Local storage error:", e);
    }
  };

  const saveGuestData = (updatedWords: Word[], updatedIrregular: IrregularVerb[], updatedProgress: UserProgress) => {
    try {
      localStorage.setItem("my-eng-v3-guest", JSON.stringify({
        words: updatedWords,
        irregular: updatedIrregular,
        stats: updatedProgress
      }));
    } catch (e) {
      console.error(e);
    }
  };

  const loadUserData = (userId: string) => {
    try {
      const cached = localStorage.getItem(`my-eng-v3-user-${userId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setWords(parsed.words || []);
        setIrregular(parsed.irregular || []);
        setProgress(parsed.stats || {
          userId,
          streak: 1,
          best: 1,
          lastVisit: null,
          achievements: [],
          booksRead: 0,
          wordsFromBooks: 0,
          bestStreak: 0,
          daily: {},
          dailyBooksRead: {}
        });
        return true;
      }
    } catch (e) {
      console.error("Local storage user load error:", e);
    }
    return false;
  };

  const saveUserData = (userId: string, updatedWords: Word[], updatedIrregular: IrregularVerb[], updatedProgress: UserProgress) => {
    try {
      localStorage.setItem(`my-eng-v3-user-${userId}`, JSON.stringify({
        words: updatedWords,
        irregular: updatedIrregular,
        stats: updatedProgress
      }));
    } catch (e) {
      console.error("Local storage user save error:", e);
    }
  };

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        setDbLoading(true);
        try {
          // Read up-to-date guest data from localStorage if we are in guest mode or have guest cache
          let guestWords: Word[] = [];
          let guestIrregular: IrregularVerb[] = [];
          let guestProgress: UserProgress | null = null;
          try {
            const cached = localStorage.getItem("my-eng-v3-guest");
            if (cached) {
              const parsed = JSON.parse(cached);
              guestWords = parsed.words || [];
              guestIrregular = parsed.irregular || [];
              guestProgress = parsed.stats || null;
            }
          } catch (err) {
            console.error("Failed to parse guest data for migration:", err);
          }

          // Fetch existing user data from Firestore
          const { words: wList, irregular: iList, progress: pStats } = await fetchUserData(firebaseUser.uid);
          
          if (pStats) {
            pStats.userId = firebaseUser.uid; // Enforce correct userId

            // Merge any guest data that is not in the user's Firestore data
            let mergedWords = [...wList];
            let mergedIrregular = [...iList];

            if (guestWords.length > 0) {
              for (const gw of guestWords) {
                const alreadyExists = wList.some(uw => uw.en.toLowerCase() === gw.en.toLowerCase());
                if (!alreadyExists) {
                  const migratedWord = { ...gw, userId: firebaseUser.uid };
                  mergedWords.push(migratedWord);
                  try {
                    await saveWord(migratedWord);
                  } catch (e) {
                    console.error("Migration error for word:", e);
                  }
                }
              }
            }

            if (guestIrregular.length > 0) {
              for (const gi of guestIrregular) {
                const alreadyExists = iList.some(ui => ui.base.toLowerCase() === gi.base.toLowerCase());
                if (!alreadyExists) {
                  const migratedVerb = { ...gi, userId: firebaseUser.uid };
                  mergedIrregular.push(migratedVerb);
                  try {
                    await saveIrregularVerb(migratedVerb);
                  } catch (e) {
                    console.error("Migration error for irregular verb:", e);
                  }
                }
              }
            }

            setWords(mergedWords);
            setIrregular(mergedIrregular);
            setProgress(pStats);
            saveUserData(firebaseUser.uid, mergedWords, mergedIrregular, pStats);

            // Optional: clear migrated local guest cache to prevent duplicate merges in the future
            localStorage.removeItem("my-eng-v3-guest");
          } else {
            // New user registered!
            // If they have guest data, migrate ALL of it to the brand new Firestore account!
            if (guestWords.length > 0 || guestIrregular.length > 0) {
              const migratedWordsList: Word[] = [];
              const migratedIrregularList: IrregularVerb[] = [];

              for (const gw of guestWords) {
                const migrated = { ...gw, userId: firebaseUser.uid };
                migratedWordsList.push(migrated);
                try {
                  await saveWord(migrated);
                } catch (e) {
                  console.error("Migration error:", e);
                }
              }

              for (const gi of guestIrregular) {
                const migrated = { ...gi, userId: firebaseUser.uid };
                migratedIrregularList.push(migrated);
                try {
                  await saveIrregularVerb(migrated);
                } catch (e) {
                  console.error("Migration error:", e);
                }
              }

              const newProgress: UserProgress = {
                ...(guestProgress || {
                  streak: 1,
                  best: 1,
                  achievements: [],
                  booksRead: 0,
                  wordsFromBooks: 0,
                  bestStreak: 0,
                  daily: {},
                  dailyBooksRead: {},
                  customTopics: {},
                  customPos: {}
                }),
                userId: firebaseUser.uid,
                lastVisit: getLocalDateString()
              };

              try {
                await saveUserProgress(newProgress);
              } catch (e) {
                console.error("Migration error progress:", e);
              }

              setWords(migratedWordsList);
              setIrregular(migratedIrregularList);
              setProgress(newProgress);
              saveUserData(firebaseUser.uid, migratedWordsList, migratedIrregularList, newProgress);

              // Clear guest cache since it's now fully backed up in Firestore
              localStorage.removeItem("my-eng-v3-guest");
            } else {
              // No guest data to migrate, seed standard default words & irregular verbs in Firestore
              const seeded = await seedUserData(firebaseUser.uid);
              setWords(seeded.words);
              setIrregular(seeded.irregular);
              setProgress(seeded.progress);
              saveUserData(firebaseUser.uid, seeded.words, seeded.irregular, seeded.progress);
            }
          }
          setWelcome(true);
          setSyncError(null);
        } catch (e: any) {
          const errStr = e instanceof Error ? e.message : String(e);
          const isOffline = errStr.toLowerCase().includes("offline") || 
                            errStr.toLowerCase().includes("network") || 
                            errStr.toLowerCase().includes("storage") ||
                            errStr.toLowerCase().includes("permission");
          if (isOffline) {
            console.warn("Database loading: Cloud is restricted or offline. Quietly falling back to local storage.");
            const hasCached = loadUserData(firebaseUser.uid);
            if (!hasCached) {
              const defaultProgress: UserProgress = {
                userId: firebaseUser.uid,
                streak: 1,
                best: 1,
                lastVisit: getLocalDateString(),
                achievements: [],
                booksRead: 0,
                wordsFromBooks: 0,
                bestStreak: 0,
                daily: {},
                dailyBooksRead: {},
                customTopics: {},
                customPos: {}
              };
              
              const seededWords: Word[] = SEED_WORDS.map((w, idx) => ({
                id: `loc-word-${idx}-${Math.random().toString(36).substring(2, 9)}`,
                userId: firebaseUser.uid,
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
              }));

              const seededIrregular: IrregularVerb[] = SEED_IRREGULAR.map((v, idx) => ({
                id: `loc-verb-${idx}-${Math.random().toString(36).substring(2, 9)}`,
                userId: firebaseUser.uid,
                base: v.base,
                past: v.past,
                participle: v.participle,
                ru: v.ru,
                learned: false,
                learnedDate: null,
                streak: 0
              }));
              
              setWords(seededWords);
              setIrregular(seededIrregular);
              setProgress(defaultProgress);
              saveUserData(firebaseUser.uid, seededWords, seededIrregular, defaultProgress);
            }
            setWelcome(true);
            setSyncError("⚠️ Автономный режим работы: прогресс сохраняется локально.");
          } else {
            console.error("Database loading error:", e);
            setSyncError("⚠️ Ошибка соединения с облаком. Переключение в локальный режим...");
            loadGuestData();
          }
        } finally {
          setDbLoading(false);
        }
      } else {
        // Fallback to Guest / Sign-In screen
        const lastLoginMode = localStorage.getItem("my-eng-v3-mode");
        if (lastLoginMode === "guest") {
          setUser("guest");
          loadGuestData();
        } else {
          setUser(null);
        }
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Update Streak on Daily Visit
  useEffect(() => {
    if (!progress.userId) return;

    const today = getLocalDateString();
    const last = progress.lastVisit;

    if (last !== today) {
      const updatedDaily = { ...(progress.daily || {}) };
      updatedDaily[today] = updatedDaily[today] || {
        date: today,
        learned: 0,
        reviewed: 0,
        correct: 0,
        wrong: 0
      };

      const updatedProgress: UserProgress = {
        ...progress,
        lastVisit: today,
        daily: updatedDaily
      };

      if (last) {
        const diffDays = Math.round((new Date(today).getTime() - new Date(last).getTime()) / (1000 * 3600 * 24));
        updatedProgress.streak = diffDays === 1 ? (progress.streak || 0) + 1 : 1;
        updatedProgress.best = Math.max(updatedProgress.best || 0, updatedProgress.streak);
      } else {
        updatedProgress.streak = 1;
      }

      handleSaveProgress(updatedProgress);
    }
  }, [progress.userId, progress.lastVisit]);

  // Main Save functions (unified sync with local offline fallback)
  const handleSaveWord = async (updatedWord: Word) => {
    const list = words.map(w => w.id === updatedWord.id ? updatedWord : w);
    if (!words.some(w => w.id === updatedWord.id)) {
      list.push(updatedWord);
    }
    setWords(list);

    if (user && user !== "guest") {
      saveUserData(user.uid, list, irregular, progress);
      try {
        await saveWord(updatedWord);
        setSyncError(null);
      } catch (e: any) {
        const errStr = e instanceof Error ? e.message : String(e);
        if (errStr.toLowerCase().includes("offline") || errStr.toLowerCase().includes("network") || errStr.toLowerCase().includes("storage")) {
          console.warn("Cloud save word pending/restricted: saved locally.");
        } else {
          console.error("Cloud save failed:", e);
        }
        setSyncError("⚠️ Автономный режим: изменения сохранены на устройстве.");
      }
    } else {
      saveGuestData(list, irregular, progress);
    }

    triggerAchievementsCheck(list, irregular, progress);
  };

  const handleSaveVerb = async (updatedVerb: IrregularVerb) => {
    const list = irregular.map(v => v.id === updatedVerb.id ? updatedVerb : v);
    if (!irregular.some(v => v.id === updatedVerb.id)) {
      list.push(updatedVerb);
    }
    setIrregular(list);

    if (user && user !== "guest") {
      saveUserData(user.uid, words, list, progress);
      try {
        await saveIrregularVerb(updatedVerb);
        setSyncError(null);
      } catch (e: any) {
        const errStr = e instanceof Error ? e.message : String(e);
        if (errStr.toLowerCase().includes("offline") || errStr.toLowerCase().includes("network") || errStr.toLowerCase().includes("storage")) {
          console.warn("Cloud save irregular pending/restricted: saved locally.");
        } else {
          console.error("Cloud save failed:", e);
        }
        setSyncError("⚠️ Автономный режим: изменения сохранены на устройстве.");
      }
    } else {
      saveGuestData(words, list, progress);
    }

    triggerAchievementsCheck(words, list, progress);
  };

  const handleSaveProgress = async (updatedProgress: UserProgress) => {
    setProgress(updatedProgress);

    if (user && user !== "guest") {
      saveUserData(user.uid, words, irregular, updatedProgress);
      try {
        await saveUserProgress(updatedProgress);
        setSyncError(null);
      } catch (e: any) {
        const errStr = e instanceof Error ? e.message : String(e);
        if (errStr.toLowerCase().includes("offline") || errStr.toLowerCase().includes("network") || errStr.toLowerCase().includes("storage")) {
          console.warn("Cloud save progress pending/restricted: saved locally.");
        } else {
          console.error("Cloud save failed:", e);
        }
        setSyncError("⚠️ Автономный режим: прогресс сохранен на устройстве.");
      }
    } else {
      saveGuestData(words, irregular, updatedProgress);
    }

    triggerAchievementsCheck(words, irregular, updatedProgress);
  };

  const handleDeleteWord = async (wordId: string) => {
    const list = words.filter(w => w.id !== wordId);
    setWords(list);

    if (user && user !== "guest") {
      saveUserData(user.uid, list, irregular, progress);
      try {
        await deleteWord(wordId);
        setSyncError(null);
      } catch (e: any) {
        const errStr = e instanceof Error ? e.message : String(e);
        if (errStr.toLowerCase().includes("offline") || errStr.toLowerCase().includes("network") || errStr.toLowerCase().includes("storage")) {
          console.warn("Cloud delete pending/restricted: applied locally.");
        } else {
          console.error("Cloud delete failed:", e);
        }
        setSyncError("⚠️ Автономный режим: изменения применены локально.");
      }
    } else {
      saveGuestData(list, irregular, progress);
    }
  };

  // Check achievements automatically and notify on unlock!
  const triggerAchievementsCheck = (wList: Word[], iList: IrregularVerb[], pStats: UserProgress) => {
    const prevAchs = progress.achievements || [];
    const currentAchs = checkAchievements(wList, iList, pStats);

    const fresh = currentAchs.filter(id => !prevAchs.includes(id));
    if (fresh.length > 0) {
      const awarded = fresh.map(id => ACHIEVEMENTS_DEF.find(a => a.id === id)).filter(Boolean);
      setNewAchs(awarded);

      const updatedProgress: UserProgress = {
        ...pStats,
        achievements: [...(pStats.achievements || []), ...fresh]
      };
      
      setProgress(updatedProgress);
      if (user && user !== "guest") {
        saveUserProgress(updatedProgress);
      } else {
        saveGuestData(wList, iList, updatedProgress);
      }

      setTimeout(() => {
        setNewAchs([]);
      }, 4000);
    }
  };

  // Import local/exported JSON backup
  const handleImportBackup = (backup: { words: Word[]; irregular: IrregularVerb[]; progress: UserProgress }) => {
    const userId = user && user !== "guest" ? user.uid : "guest";

    const mappedWords = backup.words.map(w => ({ ...w, userId }));
    const mappedVerbs = backup.irregular.map(v => ({ ...v, userId }));
    const mappedProgress = { ...backup.progress, userId };

    setWords(mappedWords);
    setIrregular(mappedVerbs);
    setProgress(mappedProgress);

    if (user && user !== "guest") {
      // Sync all imported elements to Firestore
      mappedWords.forEach(w => saveWord(w));
      mappedVerbs.forEach(v => saveIrregularVerb(v));
      saveUserProgress(mappedProgress);
    } else {
      saveGuestData(mappedWords, mappedVerbs, mappedProgress);
    }
  };

  // Reset study progress while keeping dictionary words and irregular verbs intact
  const handleResetProgress = async () => {
    const userId = user && user !== "guest" ? user.uid : "guest";

    const resetWordsList = words.map(w => ({
      ...w,
      learned: false,
      correct: 0,
      wrong: 0,
      streak: 0,
      learnedDate: undefined,
      lastReviewed: undefined
    }));

    const resetVerbsList = irregular.map(v => ({
      ...v,
      correct: 0,
      wrong: 0,
      streak: 0,
      lastReviewed: undefined
    }));

    const resetProgress: UserProgress = {
      userId,
      streak: 1,
      best: 1,
      lastVisit: getLocalDateString(),
      achievements: [],
      booksRead: 0,
      wordsFromBooks: 0,
      bestStreak: 0,
      daily: {},
      dailyBooksRead: {}
    };

    setWords(resetWordsList);
    setIrregular(resetVerbsList);
    setProgress(resetProgress);

    if (user && user !== "guest") {
      saveUserData(user.uid, resetWordsList, resetVerbsList, resetProgress);
      try {
        await batchResetUserData(user.uid, resetWordsList, resetVerbsList, resetProgress);
        setSyncError(null);
      } catch (e) {
        console.error("Failed to sync reset to cloud:", e);
        setSyncError("⚠️ Ошибка при синхронизации сброса с облаком.");
      }
    } else {
      saveGuestData(resetWordsList, resetVerbsList, resetProgress);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setWords([]);
    setIrregular([]);
    setProgress({
      userId: "guest",
      streak: 1,
      best: 1,
      lastVisit: null,
      achievements: [],
      booksRead: 0,
      wordsFromBooks: 0,
      bestStreak: 0,
      daily: {},
      dailyBooksRead: {}
    });
    localStorage.removeItem("my-eng-v3-mode");
    setView("home");
  };

  if (authLoading || dbLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", gap: 12 }}>
        <div style={{ fontSize: 48, animation: "pulse 1.2s infinite" }}>🦉</div>
        <p style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 18, color: "var(--warm)" }}>
          Загрузка журнала...
        </p>
      </div>
    );
  }

  // Routing to Auth Screen if no user context exists
  if (!user) {
    return (
      <AuthScreen 
        onGuestMode={() => {
          localStorage.setItem("my-eng-v3-mode", "guest");
          setUser("guest");
          loadGuestData();
        }}
        onSuccess={(uid) => {
          localStorage.setItem("my-eng-v3-mode", "user");
        }}
      />
    );
  }

  return (
    <div className="app">
      {syncError && (
        <div style={{
          background: "rgba(255, 255, 255, 0.95)",
          color: "#4a3e3e",
          border: "1px solid rgba(212, 165, 165, 0.4)",
          borderRadius: "1rem",
          padding: "14px 18px",
          margin: "12px 16px 4px 16px",
          fontSize: "13px",
          lineHeight: "1.5",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 500,
          position: "relative"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
            <span style={{ fontWeight: 500 }}>
              {syncError.includes("Автономный") || syncError.includes("локально") ? (
                window.self !== window.top ? (
                  <>
                    <span style={{ fontSize: "16px" }}>🦉</span> <strong>Локальный режим:</strong> Ваш прогресс сохраняется на устройстве! Из-за политики безопасности браузера (ограничений iframe-песочницы редактора), прямое подключение к облаку внутри этой панели ограничено.
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: "16px" }}>⚠️</span> <strong>Режим оффлайн:</strong> Не удалось подключиться к базе данных Firestore. Если вы только что создали проект Firebase, убедитесь, что вы создали (активировали) <strong>Firestore Database</strong> в консоли Firebase.
                  </>
                )
              ) : (
                syncError
              )}
            </span>
            <button 
              style={{ background: "none", border: "none", color: "#8a7e7e", cursor: "pointer", fontSize: "18px", fontWeight: "bold", padding: "0 4px", lineHeight: 1 }}
              onClick={() => setSyncError(null)}
            >
              ×
            </button>
          </div>
          {(syncError.includes("Автономный") || syncError.includes("локально")) && window.self !== window.top && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
              <a 
                href={window.location.href} 
                target="_blank" 
                rel="noreferrer"
                style={{ 
                  display: "inline-flex", 
                  alignItems: "center", 
                  gap: "6px", 
                  padding: "6px 14px", 
                  fontSize: "12px", 
                  borderRadius: "999px",
                  textDecoration: "none",
                  fontWeight: 600,
                  color: "#5c4d4d",
                  border: "1.5px solid rgba(212, 165, 165, 0.4)",
                  background: "#fff5f5"
                }}
              >
                🌐 Открыть в новой вкладке (для работы с облаком) →
              </a>
            </div>
          )}
        </div>
      )}
      {/* Welcome Streak Overlay */}
      {welcome && progress.streak > 0 && (
        <div className="overlay" onClick={() => setWelcome(false)}>
          <div className="card overlay-card" style={{ textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>✨</div>
            <h2 className="section-title">С возвращением!</h2>
            <p className="sub-text">
              Ваша текущая серия: <span style={{ color: "var(--rose)", fontWeight: 700 }}>{progress.streak} дней</span>
            </p>
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 14, padding: 13 }} onClick={() => setWelcome(false)}>
              Продолжить учебу →
            </button>
          </div>
        </div>
      )}

      {/* Achievement Unlocked Notification Toast */}
      {newAchs.length > 0 && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 400, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          {newAchs.map(a => (
            <div key={a.id} className="fade-in" style={{ background: "#fff", border: "1.5px solid rgba(212,165,165,.3)", borderRadius: 999, padding: "10px 20px", boxShadow: "0 8px 24px rgba(0,0,0,.1)", display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
              <span style={{ fontSize: 22 }}>{a.icon}</span> 
              <span>Достижение разблокировано: {a.title}!</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Routing Render */}
      {view === "home" && (
        <HomePage 
          words={words} 
          stats={progress} 
          onNavigate={setView} 
          onStartStudy={(type) => {
            setSessionType(type);
            setView("study");
          }} 
        />
      )}

      {view === "study" && (
        <StudyScreen 
          words={words} 
          stats={progress} 
          sessionType={sessionType}
          onSaveWord={handleSaveWord}
          onSaveProgress={handleSaveProgress}
          onExit={() => setView("home")}
        />
      )}

      {view === "words" && (
        <DictionaryScreen 
          words={words} 
          stats={progress}
          onSaveWord={handleSaveWord}
          onDeleteWord={handleDeleteWord}
          onBack={() => setView("home")}
        />
      )}

      {view === "add" && (
        <AddScreen 
          stats={progress}
          onSaveWord={handleSaveWord}
          onSaveProgress={handleSaveProgress}
          onBack={() => setView("home")}
        />
      )}

      {view === "irregular" && (
        <IrregularVerbsScreen 
          irregular={irregular} 
          stats={progress}
          onSaveVerb={handleSaveVerb}
          onSaveProgress={handleSaveProgress}
          onBack={() => setView("home")}
        />
      )}

      {view === "reader" && (
        <ReaderScreen 
          words={words} 
          stats={progress}
          onSaveWord={handleSaveWord}
          onSaveProgress={handleSaveProgress}
          onBack={() => setView("home")}
        />
      )}

      {view === "stats" && (
        <StatsScreen 
          words={words} 
          stats={progress}
          onBack={() => setView("home")}
        />
      )}

      {view === "achievements" && (
        <AchievementsScreen 
          stats={progress}
          onBack={() => setView("home")}
        />
      )}

      {view === "settings" && (
        <SettingsScreen 
          user={user}
          words={words}
          irregular={irregular}
          stats={progress}
          theme={theme}
          onToggleTheme={() => setTheme(t => t === "light" ? "dark" : "light")}
          onResetProgress={handleResetProgress}
          onLogout={handleLogout}
          onImportData={handleImportBackup}
          onBack={() => setView("home")}
        />
      )}
    </div>
  );
}
