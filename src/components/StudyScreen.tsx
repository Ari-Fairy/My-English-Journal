import { useState, useMemo, useEffect, useRef } from "react";
import { Word, UserProgress } from "../types";
import { speak, primeSpeechSynthesis, getLocalDateString, getEffectiveDueWords, getWordNextReviewTimeMs } from "../utils";
import { getWordsForCategory } from "../categories";
import { POS_DEFAULT, TOPICS_DEFAULT } from "../data";

interface StudyScreenProps {
  words: Word[];
  stats: UserProgress;
  sessionType: "learn" | "review" | "mandatory";
  categoryId?: string | null;
  isGlobalReview?: boolean;
  onSaveWord: (word: Word) => void;
  onSaveWords?: (words: Word[]) => void;
  onSaveProgress: (stats: UserProgress) => void;
  onExit: () => void;
}

export default function StudyScreen({ 
  words, 
  stats, 
  sessionType, 
  categoryId,
  isGlobalReview,
  onSaveWord, 
  onSaveWords,
  onSaveProgress, 
  onExit 
}: StudyScreenProps) {
  const [currentCatId, setCurrentCatId] = useState<string | null>(categoryId || stats.activeCategoryId || "cat_base");

  const getSessionLimit = () => {
    if (sessionType === "review") {
      return stats.sessionReviewLimit || stats.dailyWordsLimit || 15;
    }
    return stats.dailyWordsLimit ?? 15;
  };

  const [stage, setStage] = useState<"mode" | "dir" | "session" | "done">(
    sessionType === "learn" ? "dir" : "mode"
  );
  const [mode, setMode] = useState<"cards" | "choice" | "written" | "voice" | "listening">(
    sessionType === "learn" ? "cards" : "choice"
  );
  const [listeningSubMode, setListeningSubMode] = useState<"choice" | "written">("choice");
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [dir, setDir] = useState<"en-ru" | "ru-en" | "mixed">("en-ru");
  const [queue, setQueue] = useState<Word[]>([]);
  const [idx, setIdx] = useState(0);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [sessionMistakes, setSessionMistakes] = useState<string[]>([]);
  const [sessionLearnedIds, setSessionLearnedIds] = useState<string[]>([]);
  const [isRepeatRound, setIsRepeatRound] = useState(false);
  const [testRecResult, setTestRecResult] = useState<string>("");
  const [testRecog, setTestRecog] = useState(false);
  const [testRecError, setTestRecError] = useState("");
  const [answered, setAnswered] = useState(false);
  const [ans, setAns] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const okRef = useRef<boolean | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const updateOk = (val: boolean | null) => {
    setOk(val);
    okRef.current = val;
  };
  const [hint, setHint] = useState(false);
  const [score, setScore] = useState({ c: 0, w: 0 });
  const [recog, setRecog] = useState(false);
  const [recMsg, setRecMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const sessionSavedRef = useRef(false);

  useEffect(() => {
    primeSpeechSynthesis();
  }, []);

  useEffect(() => {
    if (stage === "done" && !sessionSavedRef.current) {
      sessionSavedRef.current = true;
      const now = Date.now();
      const updatedStats: UserProgress = {
        ...stats,
        secondLastReviewSessionTime: stats.lastReviewSessionTime || 0,
        lastReviewSessionTime: now
      };
      onSaveProgress(updatedStats);
    }
  }, [stage, stats, onSaveProgress]);

  const cur = queue[idx];

  const getPosLabel = (posKey?: string) => {
    if (!posKey) return "";
    const custom = stats.customPos?.[posKey];
    if (custom) return custom;
    return POS_DEFAULT[posKey] || posKey;
  };

  const getTopicLabel = (topicKey?: string) => {
    if (!topicKey) return "";
    const custom = stats.customTopics?.[topicKey];
    if (custom) return custom;
    return TOPICS_DEFAULT[topicKey] || topicKey;
  };

  const pDir = cur ? (dir === "mixed" ? (cur.id.charCodeAt(0) + idx) % 2 === 0 ? "en-ru" : "ru-en" : dir) : "en-ru";
  const prompt = cur ? (pDir === "en-ru" ? cur.en : cur.ru) : "";
  const expected = cur ? (pDir === "en-ru" ? cur.ru : cur.en) : "";
  const aLang = pDir === "en-ru" ? "ru-RU" : "en-US";

  // Shuffle function
  const shuffle = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]!];
    }
    return copy;
  };

  const normalize = (s: string) => s.toLowerCase().trim().replace(/[.,!?;:'"`]/g, "").replace(/\s+/g, " ");

  const isCorrect = (ansStr: string, expStr: string) => {
    const a = normalize(ansStr);
    if (!a) return false;

    const getAlternatives = (str: string): string[] => {
      // Replaces slash with comma so it treats '/' exactly like ','
      const normalizedStr = str.replace(/\//g, ",");
      const parts = normalizedStr.split(/[,;|]|\s+или\s+|\s+и\s+/i);
      const alts: string[] = [];
      
      parts.forEach(p => {
        const trimmed = p.trim();
        if (!trimmed) return;
        
        const normalizedPart = normalize(trimmed);
        if (normalizedPart) {
          alts.push(normalizedPart);
        }
        
        if (trimmed.includes("(") && trimmed.includes(")")) {
          const stripped = trimmed.replace(/\(.*?\)/g, "").trim();
          const normalizedStripped = normalize(stripped);
          if (normalizedStripped) {
            alts.push(normalizedStripped);
          }
        }
      });
      
      return alts;
    };

    const expectedAlts = getAlternatives(expStr);
    const userAlts = getAlternatives(ansStr);

    return userAlts.some(u => 
      expectedAlts.some(e => {
        if (u === e) return true;
        
        if (e.includes(" ") || u.includes(" ")) {
          return e.includes(u) || u.includes(e);
        }
        
        return false;
      })
    );
  };

  const startTestRecog = (expectedWord: string, lang: string) => {
    setTestRecog(true);
    setTestRecError("");
    setTestRecResult("");
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setTestRecog(false);
      setTestRecError("browser");
      return;
    }
    try {
      const r = new SpeechRec();
      r.lang = lang;
      r.maxAlternatives = 1;
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e: any) => {
        const t = Array.from(e.results).map((x: any) => x[0].transcript).join("").trim();
        if (t) {
          const correct = isCorrect(t, expectedWord);
          setTestRecResult(correct ? `✅ Верно! Услышано: "${t}"` : `❓ Услышано: "${t}" (ожидалось "${expectedWord}")`);
        } else {
          setTestRecError("no-speech");
        }
        setTestRecog(false);
      };
      r.onerror = (e: any) => {
        console.error("Test speech recognition error:", e.error);
        if (e.error === "not-allowed" || e.error === "permission-denied" || e.error === "service-not-allowed") {
          setTestRecError("not-allowed");
        } else {
          setTestRecError(e.error || "error");
        }
        setTestRecog(false);
      };
      r.onend = () => {
        setTestRecog(false);
      };
      r.start();
    } catch (err) {
      setTestRecError("error");
      setTestRecog(false);
    }
  };

  const choices = useMemo(() => {
    if (!cur) return [];
    if (mode !== "choice" && (mode !== "listening" || listeningSubMode !== "choice")) return [];
    
    const exp = mode === "listening" ? cur.ru : expected;
    const isRussianOptions = mode === "listening" ? true : (pDir === "en-ru");

    const getDistractorScore = (w: Word, targetWord: Word, isRu: boolean) => {
      let score = 0;
      
      // 1. Same part of speech is a huge distractor factor
      if (w.partOfSpeech && targetWord.partOfSpeech && w.partOfSpeech.toLowerCase() === targetWord.partOfSpeech.toLowerCase()) {
        score += 15;
      }
      
      // 2. Same topic
      if (w.topic && targetWord.topic && w.topic.toLowerCase() === targetWord.topic.toLowerCase()) {
        score += 8;
      }
      
      // Determine comparison strings safely
      const str1 = (isRu ? targetWord.ru : targetWord.en || "").toLowerCase();
      const str2 = (isRu ? w.ru : w.en || "").toLowerCase();
      
      if (!str1 || !str2) return 0;

      // 3. Similar word length
      const lenDiff = Math.abs(str1.length - str2.length);
      if (lenDiff === 0) score += 6;
      else if (lenDiff <= 2) score += 4;
      else if (lenDiff <= 4) score += 2;
      
      // 4. Same first character
      if (str1[0] && str2[0] && str1[0] === str2[0]) {
        score += 8;
      }
      
      // 5. Same last character
      if (str1[str1.length - 1] && str2[str2.length - 1] && str1[str1.length - 1] === str2[str2.length - 1]) {
        score += 4;
      }
      
      // 6. Character overlap (intersection of unique letters)
      const set1 = new Set(str1.split(""));
      const set2 = new Set(str2.split(""));
      let commonChars = 0;
      set1.forEach(char => {
        if (set2.has(char)) commonChars++;
      });
      score += commonChars * 1.5;

      // Add a tiny bit of random noise (0 to 1) so it's not strictly deterministic
      score += Math.random();
      
      return score;
    };

    // Filter other words that actually have translations for the target option language
    const scoredOthers = words
      .filter(w => w.id !== cur.id && (isRussianOptions ? w.ru : w.en))
      .map(w => ({
        word: w,
        score: getDistractorScore(w, cur, isRussianOptions)
      }))
      .sort((a, b) => b.score - a.score);

    // Take top 8 candidates, shuffle them and take 3
    const poolSize = Math.min(scoredOthers.length, 8);
    const topScored = scoredOthers.slice(0, poolSize);
    
    // Shuffle the top scored ones to have some variety
    const selectedDistractors = shuffle(topScored).slice(0, 3).map(item => {
      const w = item.word;
      return mode === "listening" ? w.ru : (pDir === "en-ru" ? w.ru : w.en);
    });

    // If we don't have enough words, fallback to some basic placeholders or whatever words we can find
    while (selectedDistractors.length < 3) {
      selectedDistractors.push(isRussianOptions ? "слово" : "word");
    }

    return shuffle([exp, ...selectedDistractors]);
  }, [cur?.id, mode, listeningSubMode, pDir, expected, words]);

  useEffect(() => {
    if (mode === "written" || (mode === "listening" && listeningSubMode === "written")) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 200);
    }
  }, [cur?.id, mode, listeningSubMode]);

  useEffect(() => {
    if (stage === "session" && cur && mode === "listening") {
      const t = setTimeout(() => {
        speak(cur.en, "en-US");
      }, 300);
      return () => clearTimeout(t);
    }
  }, [cur?.id, mode, stage]);

  const getNextReviewTimeMs = (w: Word) => {
    const dueTime = getWordNextReviewTimeMs(w);
    if (dueTime === Infinity) return Infinity;
    return Math.max(0, dueTime - Date.now());
  };

  const getPool = (catIdParam?: string | null) => {
    const categories = stats.categories || [];
    const activeCatId = catIdParam !== undefined ? catIdParam : currentCatId;

    const baseWords = (!isGlobalReview && activeCatId && activeCatId !== "all")
      ? getWordsForCategory(words, activeCatId, categories)
      : words;

    if (sessionType === "learn") return baseWords.filter(w => !w.learned);
    if (sessionType === "mandatory") {
      return baseWords.filter(w => w.learned && w.isMandatoryEndOfDay);
    }
    if (sessionType === "review") {
      return getEffectiveDueWords(baseWords, stats).dueWords;
    }
    return baseWords.filter(w => w.learned);
  };

  // Sound signals
  const beep = (isCorrect: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const c = new AudioCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.setValueAtTime(isCorrect ? 660 : 220, c.currentTime);
      o.frequency.setValueAtTime(isCorrect ? 880 : 180, c.currentTime + 0.08);
      g.gain.setValueAtTime(0.12, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2);
      o.start();
      o.stop(c.currentTime + 0.2);
    } catch (e) {}
  };

  const handleAns = (a: string) => {
    if (!cur || answered) return;
    const exp = mode === "listening" ? (listeningSubMode === "choice" ? cur.ru : cur.en) : expected;
    const dontRemember = a === "__dont_remember__";
    const correct = dontRemember ? false : isCorrect(a, exp);
    const finalAns = dontRemember ? exp : a;

    updateOk(correct);
    setAnswered(true);
    setAns(finalAns);
    
    beep(correct);

    if (mode !== "cards" && mode !== "voice" && mode !== "listening") {
      setTimeout(() => speak(cur.en), 400);
    }

    setScore(s => ({ 
      c: s.c + (correct ? 1 : 0), 
      w: s.w + (correct ? 0 : 1) 
    }));

    const today = getLocalDateString();
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    if (!correct) {
      setWrongIds(prev => prev.includes(cur.id) ? prev : [...prev, cur.id]);
      setSessionMistakes(prev => prev.includes(cur.id) ? prev : [...prev, cur.id]);

      // Calculate consecutive errors and spacing rules on error
      const currentConsecErrors = (cur.consecutiveErrors || 0) + 1;
      const isProblematic = currentConsecErrors >= 2;
      const isMandatoryEndOfDay = currentConsecErrors >= 3;

      // User rule: 2 or more errors -> 90 minutes (1h 30m). 1 error -> minimum 240 minutes (4 hours).
      let intervalMin = currentConsecErrors >= 2 ? 90 : 240;
      const prevInterval = cur.intervalMinutes || 240;

      if (currentConsecErrors < 2) {
        if (prevInterval >= 10080) intervalMin = 1440;       // 7 days -> 24 hours
        else if (prevInterval >= 4320) intervalMin = 1440;    // 3 days -> 24 hours
        else intervalMin = 240;                               // Default 4 hours minimum
      }

      const nextReviewDate = new Date(nowMs + intervalMin * 60 * 1000).toISOString();

      const updatedWord: Word = {
        ...cur,
        wrong: cur.wrong + 1,
        streak: 0,
        lastReviewed: nowIso,
        intervalMinutes: intervalMin,
        consecutiveErrors: currentConsecErrors,
        isProblematic,
        isMandatoryEndOfDay,
        nextReviewDate,
        learned: true
      };
      onSaveWord(updatedWord);

      // Update progress daily wrong count
      const currentDaily = { ...(stats.daily || {}) };
      const ds = { ...(currentDaily[today] || { date: today, learned: 0, reviewed: 0, correct: 0, wrong: 0 }) };
      ds.wrong++;
      currentDaily[today] = ds;
      onSaveProgress({ ...stats, daily: currentDaily });

    } else {
      // Correct answer
      const isNewWord = !cur.learned || !cur.lastReviewed;
      let intervalMin = 240; // Default 4 hours on correct answer
      let newStreak = cur.streak;

      if (isNewWord) {
        // New word answered correctly: 4 hours interval
        intervalMin = 240;
        newStreak = 2;
      } else {
        // Advance interval level (4 hours -> 24 hours -> 3 days -> 7 days -> 14 days -> 30 days)
        const prevInterval = cur.intervalMinutes || 240;
        if (prevInterval < 240) {
          intervalMin = 240; // < 4 hours -> 4 hours
          newStreak = 2;
        } else if (prevInterval === 240) {
          intervalMin = 1440; // 4 hours -> 24 hours (1 day)
          newStreak = 3;
        } else if (prevInterval === 1440) {
          intervalMin = 4320; // 24 hours -> 3 days
          newStreak = 4;
        } else if (prevInterval === 4320) {
          intervalMin = 10080; // 3 days -> 7 days
          newStreak = 5;
        } else if (prevInterval === 10080) {
          intervalMin = 20160; // 7 days -> 14 days
          newStreak = 6;
        } else if (prevInterval >= 20160) {
          intervalMin = 43200; // 14 days -> 30 days
          newStreak = Math.max(7, (cur.streak || 7) + 1);
        }
      }

      const nextReviewDate = new Date(nowMs + intervalMin * 60 * 1000).toISOString();

      const updatedWord: Word = {
        ...cur,
        correct: cur.correct + 1,
        streak: newStreak,
        learned: true,
        learnedDate: cur.learnedDate || today,
        lastReviewed: nowIso,
        intervalMinutes: intervalMin,
        consecutiveErrors: 0, // Reset errors on success
        isProblematic: false,
        isMandatoryEndOfDay: false,
        nextReviewDate
      };
      onSaveWord(updatedWord);

      // Check if we already registered this word as learned/reviewed in this session
      const alreadyRegistered = sessionLearnedIds.includes(cur.id);
      if (!alreadyRegistered) {
        setSessionLearnedIds(prev => [...prev, cur.id]);

        const currentDaily = { ...(stats.daily || {}) };
        const ds = { ...(currentDaily[today] || { date: today, learned: 0, reviewed: 0, correct: 0, wrong: 0 }) };
        ds.correct++;

        if (sessionType === "learn" && !cur.learned) {
          ds.learned++;
        }
        if (sessionType !== "learn") {
          ds.reviewed++;
        }

        currentDaily[today] = ds;
        onSaveProgress({ ...stats, daily: currentDaily });
      }
    }
  };

  const next = () => {
    // Reset test voice feedback on card change
    setTestRecResult("");
    setTestRecError("");

    if (mode === "cards") {
      // First, unflip/reset states so the card rotates back to the front
      setAnswered(false);
      setAns("");
      updateOk(null);
      setHint(false);

      // Wait 600ms for the animation to completely flip back, then load the next word
      setTimeout(() => {
        if (idx + 1 >= queue.length) {
          if (wrongIds.length > 0) {
            // Repeat the wrong ones!
            const wrongWords = queue.filter(w => wrongIds.includes(w.id));
            setQueue(shuffle(wrongWords));
            setWrongIds([]);
            setIdx(0);
            setIsRepeatRound(true);
          } else {
            setStage("done");
            setIsRepeatRound(false);
          }
        } else {
          setIdx(idx + 1);
        }
      }, 600);
    } else {
      if (idx + 1 >= queue.length) {
        if (wrongIds.length > 0) {
          // Repeat the wrong ones!
          const wrongWords = queue.filter(w => wrongIds.includes(w.id));
          setQueue(shuffle(wrongWords));
          setWrongIds([]);
          setIdx(0);
          setAnswered(false);
          setAns("");
          updateOk(null);
          setHint(false);
          setIsRepeatRound(true);
        } else {
          setStage("done");
          setIsRepeatRound(false);
        }
      } else {
        setIdx(idx + 1);
        setAnswered(false);
        setAns("");
        updateOk(null);
        setHint(false);
      }
    }
  };

  const startRecog = () => {
    setRecog(true);
    setRecMsg("");
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setRecog(false);
      setRecMsg("browser");
      return;
    }
    try {
      const r = new SpeechRec();
      r.lang = aLang;
      r.maxAlternatives = 1;
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e: any) => {
        const t = Array.from(e.results).map((x: any) => x[0].transcript).join("").trim();
        if (t) {
          handleAns(t);
          setRecog(false);
          setRecMsg("");
        } else {
          setRecMsg("no-speech");
          setRecog(false);
        }
      };
      r.onerror = (e: any) => {
        console.error("Speech recognition error:", e.error);
        if (e.error === "not-allowed" || e.error === "permission-denied" || e.error === "service-not-allowed") {
          setRecMsg("not-allowed");
        } else {
          setRecMsg(e.error || "error");
        }
        setRecog(false);
      };
      r.onend = () => {
        setRecog(false);
      };
      r.start();
    } catch (err) {
      setRecMsg("");
      setRecog(false);
    }
  };

  if (stage === "mode") {
    return (
      <div className="fade-in study-container">
        <button className="back-btn" onClick={onExit}>← Назад</button>
        <h2 className="section-title" style={{ textAlign: "center", marginTop: 16 }}>
          {sessionType === "learn" ? "Как будем учить?" : "Как повторяем?"}
        </h2>
        <div className="option-cards-container">
          {([
            { v: "cards", l: "🃏 Карточки", s: "Флип-карточки" },
            { v: "choice", l: "🎯 Выбор варианта", s: "Выбери из 4 вариантов" },
            { v: "written", l: "✍️ Письменно", s: "Напиши ответ" },
            { v: "listening", l: "🎧 Аудирование", s: "Выбери или запиши на слух" },
            { v: "voice", l: "🎤 Голосом", s: "Произнеси ответ" }
          ] as const).map(m => (
            <button 
              key={m.v} 
              className="option-card-btn" 
              onClick={() => {
                if (m.v === "listening") {
                  setMode("listening");
                  setListeningSubMode("choice");
                  setDir("en-ru");
                  const pool = getPool();
                  const withErrors = shuffle(pool.filter(w => w.wrong > w.correct));
                  const rest = shuffle(pool.filter(w => w.wrong <= w.correct));
                  const limit = getSessionLimit();
                  setQueue([...withErrors, ...rest].slice(0, limit));
                  setIdx(0);
                  setWrongIds([]);
                  setSessionMistakes([]);
                  setSessionLearnedIds([]);
                  setIsRepeatRound(false);
                  setAnswered(false);
                  setAns("");
                  setOk(null);
                  setHint(false);
                  setScore({ c: 0, w: 0 });
                  setStage("session");
                  return;
                }
                if (m.v === "voice" && micGranted === null) {
                  navigator.mediaDevices?.getUserMedia({ audio: true }).then(s => {
                    s.getTracks().forEach(t => t.stop());
                    setMicGranted(true);
                    setMode("voice");
                    setStage("dir");
                  }).catch(() => setMicGranted(false));
                  return;
                }
                setMode(m.v);
                setStage("dir");
              }}
            >
              <div className="option-card-title">{m.l}</div>
              <div className="option-card-subtitle">{m.s}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (stage === "dir") {
    return (
      <div className="fade-in study-container">
        <button className="back-btn" onClick={() => {
          if (sessionType === "learn") {
            onExit();
          } else {
            setStage("mode");
          }
        }}>← Назад</button>
        <h2 className="section-title" style={{ textAlign: "center", marginTop: 16 }}>Направление</h2>
        <div className="option-cards-container">
          {([
            { v: "en-ru", l: "English → Русский" },
            { v: "ru-en", l: "Русский → English" },
            { v: "mixed", l: "Смешанный режим" }
          ] as const).map(d => (
            <button 
              key={d.v} 
              className="option-card-btn" 
              onClick={() => {
                setDir(d.v);
                const pool = getPool();
                const withErrors = shuffle(pool.filter(w => w.wrong > w.correct));
                const rest = shuffle(pool.filter(w => w.wrong <= w.correct));
                const limit = getSessionLimit();
                setQueue([...withErrors, ...rest].slice(0, limit));
                setIdx(0);
                setWrongIds([]);
                setSessionMistakes([]);
                setSessionLearnedIds([]);
                setIsRepeatRound(false);
                setAnswered(false);
                setAns("");
                setOk(null);
                setHint(false);
                setScore({ c: 0, w: 0 });
                setStage("session");
              }}
            >
              <div className="option-card-title">{d.l}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Subcategory / Category family navigation logic
  const categories = stats.categories || [];
  const activeCatObj = categories.find(c => c.id === currentCatId);
  const parentCatObj = activeCatObj?.parentId ? categories.find(c => c.id === activeCatObj.parentId) : null;
  const rootParent = parentCatObj || activeCatObj;

  // Sibling subcategories under the root parent category
  const siblingSubCats = rootParent ? categories.filter(c => c.parentId === rootParent.id && !c.archived) : [];

  // Next subcategory in this main category family that has unlearned words
  const nextSubWithWords = siblingSubCats.find(sub => {
    if (sub.id === currentCatId) return false;
    const subWords = getWordsForCategory(words, sub.id, categories);
    return subWords.some(w => !w.learned);
  });

  // Calculate statistics for the root main category family
  const rootCatWords = rootParent ? getWordsForCategory(words, rootParent.id, categories) : [];
  const rootUnlearnedWords = rootCatWords.filter(w => !w.learned);
  const isRootFullyLearned = rootCatWords.length > 0 && rootUnlearnedWords.length === 0;

  const startStudyNextCategory = (nextCatId: string) => {
    setCurrentCatId(nextCatId);
    const pool = getPool(nextCatId);
    const withErrors = shuffle(pool.filter(w => w.wrong > w.correct));
    const rest = shuffle(pool.filter(w => w.wrong <= w.correct));
    const limit = getSessionLimit();

    setQueue([...withErrors, ...rest].slice(0, limit));
    setIdx(0);
    setWrongIds([]);
    setSessionMistakes([]);
    setSessionLearnedIds([]);
    setIsRepeatRound(false);
    setAnswered(false);
    setAns("");
    setOk(null);
    setHint(false);
    setScore({ c: 0, w: 0 });
    sessionSavedRef.current = false;
    setStage("session");
  };

  if (stage === "done") {
    return (
      <div className="fade-in study-container" style={{ textAlign: "center", paddingTop: 30, maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🕊️</div>
        <h2 className="section-title" style={{ margin: 0 }}>Отлично!</h2>
        <p className="sub-text" style={{ marginTop: 4 }}>Сессия завершена</p>

        <div className="card" style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><div className="stat-num" style={{ color: "var(--sage)" }}>{score.c}</div><div className="stat-label">верно</div></div>
          <div><div className="stat-num" style={{ color: "var(--rose)" }}>{score.w}</div><div className="stat-label">ошибки</div></div>
        </div>

        {/* Next Subcategory Recommendation */}
        {nextSubWithWords ? (
          <div className="card" style={{ marginTop: 16, textAlign: "left", background: "rgba(143,160,128,0.12)", border: "1px solid var(--sage)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sage)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
              📂 Следующая подкатегория:
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--charcoal)", marginBottom: 4 }}>
              {nextSubWithWords.icon || "📖"} {nextSubWithWords.name}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
              В вашей основной категории «{rootParent?.name}» ещё есть невыученные слова.
            </div>
            <button 
              className="btn btn-primary" 
              style={{ width: "100%", padding: 14, fontSize: 14, fontWeight: 700 }}
              onClick={() => startStudyNextCategory(nextSubWithWords.id)}
            >
              ▶ Учить следующую подкатегорию «{nextSubWithWords.name}»
            </button>
          </div>
        ) : isRootFullyLearned ? (
          <div className="card" style={{ marginTop: 16, textAlign: "center", background: "rgba(245, 158, 11, 0.12)", border: "1px solid #f59e0b", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>🎉</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--charcoal)", marginBottom: 6 }}>
              Поздравляем! Вся категория выучена!
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>
              Вы полностью выучили все подкатегории и слова из основной категории <strong>«{rootParent?.name || activeCatObj?.name}»</strong>!
            </div>
            <div style={{ fontSize: 12, color: "var(--charcoal)", fontWeight: 600 }}>
              Так как невыученных слов больше нет, выберите другую категорию или подкатегорию для изучения.
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <button className="btn btn-primary" style={{ width: "100%", padding: 16, fontWeight: 700 }} onClick={onExit}>
            📚 Выбрать другую категорию
          </button>
        </div>
      </div>
    );
  }

  if (!cur) {
    const activeSubWords = activeCatObj ? getWordsForCategory(words, activeCatObj.id, categories) : [];

    return (
      <div className="fade-in study-container" style={{ textAlign: "center", paddingTop: 40, maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {isRootFullyLearned ? "🎉" : "📭"}
        </div>

        <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--charcoal)", marginBottom: 8 }}>
          {isRootFullyLearned 
            ? `Все слова в категории «${rootParent?.name || activeCatObj?.name}» выучены!`
            : `В подкатегории «${activeCatObj?.name || "Категория"}» нет невыученных слов`}
        </h3>

        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 20 }}>
          {isRootFullyLearned ? (
            <>
              Вы полностью выучили все подкатегории и слова в категории <strong>«{rootParent?.name || activeCatObj?.name}»</strong>.
              Так как невыученных слов не осталось, выберите другую категорию для изучения или добавьте новые слова.
            </>
          ) : (
            <>
              В подкатегории <strong>«{activeCatObj?.name || "Категория"}»</strong> {activeSubWords.length === 0 ? "пока нет слов" : "все слова уже 100% выучены"}.
            </>
          )}
        </p>

        {nextSubWithWords && (
          <div className="card" style={{ marginBottom: 16, textAlign: "left", background: "rgba(143,160,128,0.12)", border: "1px solid var(--sage)", padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sage)", marginBottom: 4 }}>
              📂 В этой же основной категории есть другая подкатегория:
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--charcoal)", marginBottom: 10 }}>
              {nextSubWithWords.icon || "📖"} {nextSubWithWords.name}
            </div>
            <button 
              className="btn btn-primary" 
              style={{ width: "100%", padding: 12, fontSize: 13, fontWeight: 700 }}
              onClick={() => startStudyNextCategory(nextSubWithWords.id)}
            >
              ▶ Перейти к подкатегории «{nextSubWithWords.name}»
            </button>
          </div>
        )}

        <button className="btn btn-primary" style={{ width: "100%", padding: 14 }} onClick={onExit}>
          📚 Выбрать другую категорию
        </button>
      </div>
    );
  }

  if (mode === "cards") {
    const cardFlipped = ans === "flipped" || (answered && !ok);
    return (
      <div className="fade-in study-container">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button className="back-btn" onClick={onExit}>✕</button>
          <span className="badge">{idx + 1}/{queue.length}</span>
          <span style={{ fontSize: 12, color: "var(--sage)", fontWeight: 600 }}>{score.c}✓</span>
        </div>

        {isRepeatRound && (
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <span className="badge" style={{ backgroundColor: "rgba(220, 95, 95, 0.08)", color: "var(--rose)", border: "1.5px solid rgba(220, 95, 95, 0.2)" }}>
              🔁 Повторение ошибок в случайном порядке
            </span>
          </div>
        )}

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(idx / queue.length) * 100}%` }} />
        </div>
        <div 
          className="flip-card" 
          style={{ 
            marginTop: 18, 
            height: 255, 
            cursor: "pointer"
          }}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null || touchStartY.current === null) return;
            const diffX = e.changedTouches[0].clientX - touchStartX.current;
            const diffY = e.changedTouches[0].clientY - touchStartY.current;
            if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
              if (diffX < 0) {
                if (!answered) handleAns("__dont_remember__"); else next();
              } else {
                if (!answered) handleAns(expected); else next();
              }
            }
            touchStartX.current = null;
            touchStartY.current = null;
          }}
          onClick={() => {
            if (!answered) {
              setAns(cardFlipped ? "" : "flipped");
            }
          }}
        >
          <div className={`flip-inner ${cardFlipped ? "flipped" : ""}`}>
            <div 
              className="flip-front" 
              style={{ 
                padding: "20px 16px", 
                display: "flex", 
                flexDirection: "column", 
                justifyContent: "center", 
                alignItems: "center", 
                boxSizing: "border-box",
                borderRadius: "1.75rem",
                border: answered 
                  ? (ok ? "2.5px solid var(--sage)" : "2.5px solid var(--rose)") 
                  : "1.5px solid rgba(181, 93, 76, 0.2)",
                boxShadow: answered
                  ? (ok ? "0 8px 24px rgba(148,161,135,.25)" : "0 8px 24px rgba(220,95,95,.2)")
                  : "0 10px 30px rgba(0,0,0,0.06)"
              }}
            >
              <div className="sub-text" style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: "1px", fontSize: 11, color: "var(--muted)" }}>{pDir === "en-ru" ? "Русский" : "English"}</div>
              <div className="study-word" style={{ fontSize: "2.1rem", lineHeight: 1.25, margin: "4px 0" }}>{pDir === "en-ru" ? cur.ru : cur.en}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
                {cur.partOfSpeech && <span className="badge" style={{ background: "rgba(143,160,128,0.15)", color: "var(--sage)", fontSize: 11 }}>🏷️ {getPosLabel(cur.partOfSpeech)}</span>}
                {cur.topic && <span className="badge" style={{ background: "rgba(220,175,100,0.15)", color: "#b45309", fontSize: 11 }}>📌 {getTopicLabel(cur.topic)}</span>}
              </div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 10 }}>Нажми или смахни карточку →</div>
              <button className="btn btn-ghost" style={{ fontSize: 20, padding: "6px 14px", marginTop: 8 }} onClick={(e) => { e.stopPropagation(); speak(pDir === "en-ru" ? cur.ru : cur.en, pDir === "en-ru" ? "ru-RU" : "en-US"); }}>🔊</button>
            </div>
            <div 
              className="flip-back" 
              style={{ 
                padding: "20px 16px", 
                display: "flex", 
                flexDirection: "column", 
                justifyContent: "center", 
                alignItems: "center", 
                boxSizing: "border-box",
                borderRadius: "1.75rem",
                border: answered 
                  ? (ok ? "2.5px solid var(--sage)" : "2.5px solid var(--rose)") 
                  : "1.5px solid rgba(124, 139, 114, 0.25)",
                boxShadow: answered
                  ? (ok ? "0 8px 24px rgba(148,161,135,.25)" : "0 8px 24px rgba(220,95,95,.2)")
                  : "0 10px 30px rgba(0,0,0,0.06)"
              }}
            >
              <div className="sub-text" style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: "1px", fontSize: 11, color: "var(--muted)" }}>{pDir === "en-ru" ? "English" : "Русский"}</div>
              <div className="study-word" style={{ fontSize: "2.1rem", lineHeight: 1.25, margin: "4px 0" }}>{pDir === "en-ru" ? cur.en : cur.ru}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
                {cur.partOfSpeech && <span className="badge" style={{ background: "rgba(143,160,128,0.15)", color: "var(--sage)", fontSize: 11 }}>🏷️ {getPosLabel(cur.partOfSpeech)}</span>}
                {cur.topic && <span className="badge" style={{ background: "rgba(220,175,100,0.15)", color: "#b45309", fontSize: 11 }}>📌 {getTopicLabel(cur.topic)}</span>}
              </div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 10 }}>← Нажми или смахни карточку</div>
              <button className="btn btn-ghost" style={{ fontSize: 20, padding: "6px 14px", marginTop: 8 }} onClick={(e) => { e.stopPropagation(); speak(pDir === "en-ru" ? cur.en : cur.ru, pDir === "en-ru" ? "en-US" : "ru-RU"); }}>🔊</button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          {!answered ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button 
                className="btn btn-outline" 
                style={{ flex: 1, padding: 15 }} 
                onClick={() => { 
                  handleAns("__dont_remember__"); 
                }}
              >
                👈 Не знаю
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, padding: 15 }} 
                onClick={() => { 
                  handleAns(expected); 
                }}
              >
                👉 Знаю
              </button>
            </div>
          ) : (
            <button 
              className="btn btn-secondary animate-bounce-subtle" 
              style={{ width: "100%", padding: 15 }} 
              onClick={next}
            >
              {idx + 1 >= queue.length 
                ? (wrongIds.length > 0 ? "Повторить ошибки 🔁" : "Завершить сессию ✨") 
                : "Дальше →"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in study-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button className="back-btn" onClick={onExit}>✕</button>
        <span className="badge">{idx + 1}/{queue.length}</span>
        <span style={{ fontSize: 12, color: "var(--sage)", fontWeight: 600 }}>{score.c}✓</span>
      </div>

      {isRepeatRound && (
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <span className="badge" style={{ backgroundColor: "rgba(220, 95, 95, 0.08)", color: "var(--rose)", border: "1.5px solid rgba(220, 95, 95, 0.2)" }}>
            🔁 Повторение ошибок в случайном порядке
          </span>
        </div>
      )}

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="study-card">
          {mode === "listening" ? (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <button 
                className="btn"
                style={{
                  background: "rgba(148, 161, 135, 0.15)",
                  color: "var(--sage)",
                  borderRadius: "50%",
                  width: 80,
                  height: 80,
                  fontSize: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(148, 161, 135, 0.2)",
                  transition: "transform 0.2s"
                }}
                onClick={() => speak(cur.en, "en-US")}
              >
                🔊
              </button>
              <div style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500, marginBottom: 8 }}>
                Прослушайте слово и {listeningSubMode === "choice" ? "выберите правильный перевод" : "запишите его на слух"}
              </div>
              
              {!answered && (
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
                  <button 
                    className={`btn btn-sm ${listeningSubMode === "choice" ? "btn-primary" : "btn-ghost"}`}
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: "1rem" }}
                    onClick={() => {
                      setListeningSubMode("choice");
                      setAns("");
                    }}
                  >
                    🎯 Выбрать перевод
                  </button>
                  <button 
                    className={`btn btn-sm ${listeningSubMode === "written" ? "btn-primary" : "btn-ghost"}`}
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: "1rem" }}
                    onClick={() => {
                      setListeningSubMode("written");
                      setAns("");
                    }}
                  >
                    ✍️ Написать на слух
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="sub-text" style={{ marginBottom: 8 }}>{pDir === "en-ru" ? "English" : "Russian"}</div>
              <div className="study-word">{prompt}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
                {cur.partOfSpeech && <span className="badge" style={{ background: "rgba(143,160,128,0.15)", color: "var(--sage)", fontSize: 11 }}>🏷️ {getPosLabel(cur.partOfSpeech)}</span>}
                {cur.topic && <span className="badge" style={{ background: "rgba(220,175,100,0.15)", color: "#b45309", fontSize: 11 }}>📌 {getTopicLabel(cur.topic)}</span>}
              </div>
              {!answered && <button className="btn btn-ghost" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setHint(!hint)}>{hint ? <span className="hint-box">🔑 «{expected[0]}» · {expected.length} симв.</span> : "💡 Подсказка"}</button>}
            </>
          )}
          {answered && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4, color: ok ? "var(--sage)" : "var(--rose)" }}>{ok ? "Perfect ✨" : "Неверно"}</div>
              <div style={{ fontSize: 18, fontWeight: 500 }}>{cur.en} — {cur.ru}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                {cur.partOfSpeech && <span>🏷️ Часть речи: <strong>{getPosLabel(cur.partOfSpeech)}</strong></span>}
                {cur.topic && <span>📌 Тема: <strong>{getTopicLabel(cur.topic)}</strong></span>}
              </div>
              <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => speak(cur.en)}>🔊 Послушать еще раз</button>
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        {((mode === "choice") || (mode === "listening" && listeningSubMode === "choice")) && !answered && choices.map(c => (
          <button key={c} className="choice-btn btn" style={{ marginBottom: 8, width: "100%", padding: 14 }} onClick={() => handleAns(c)}>{c}</button>
        ))}
        {((mode === "written") || (mode === "listening" && listeningSubMode === "written")) && !answered && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input 
              ref={inputRef} 
              className="input" 
              style={{ textAlign: "center", fontSize: 18 }} 
              value={ans} 
              onChange={e => setAns(e.target.value)} 
              onKeyDown={e => e.key === "Enter" && ans.trim() && handleAns(ans)} 
              placeholder={mode === "listening" ? "Напишите услышанное слово по-английски..." : "Ваш ответ..."} 
            />
            <button className="btn btn-primary" style={{ width: "100%", padding: 15 }} onClick={() => ans.trim() && handleAns(ans)} disabled={!ans.trim()}>Проверить</button>
            <button className="btn btn-ghost" style={{ color: "#ccc" }} onClick={() => handleAns("__dont_remember__")}>🤍 Не помню</button>
          </div>
        )}
        {mode === "voice" && !answered && (
          <div style={{ textAlign: "center" }}>
            <button className={`voice-btn btn ${recog ? "listening" : "idle"}`} onClick={startRecog}>🎤</button>
            {recog && <p className="sub-text" style={{ marginTop: 12 }}>Слушаю...</p>}
            {!recog && !recMsg && <p className="sub-text" style={{ marginTop: 12 }}>Нажмите и говорите</p>}
            {recMsg === "browser" && (
              <p className="sub-text" style={{ marginTop: 12, color: "var(--rose)", fontWeight: 500 }}>
                ⚠️ Голосовой ввод не поддерживается вашим браузером. Рекомендуем Google Chrome.
              </p>
            )}
            {recMsg === "not-allowed" && (
              <div style={{ marginTop: 12, padding: "10px 16px", background: "rgba(220, 95, 95, 0.08)", borderRadius: "0.5rem", border: "1px solid rgba(220, 95, 95, 0.15)", maxWidth: "340px", marginLeft: "auto", marginRight: "auto" }}>
                <p style={{ fontSize: 13, color: "var(--rose)", fontWeight: 600, marginBottom: 4 }}>
                  🎙️ Доступ к микрофону заблокирован
                </p>
                <p style={{ fontSize: 12, color: "#666", lineHeight: "1.4" }}>
                  Браузер часто блокирует микрофон внутри фрейма в целях безопасности. Пожалуйста, <strong>откройте приложение в новой вкладке</strong> (иконка со стрелочкой вверху справа) и разрешите доступ к микрофону!
                </p>
              </div>
            )}
            {recMsg === "no-speech" && (
              <p className="sub-text" style={{ marginTop: 12, color: "var(--rose)" }}>
                ⚠️ Речь не распознана. Попробуйте еще раз.
              </p>
            )}
            {recMsg && recMsg !== "browser" && recMsg !== "not-allowed" && recMsg !== "no-speech" && (
              <p className="sub-text" style={{ marginTop: 12, color: "var(--rose)" }}>
                ⚠️ Ошибка микрофона ({recMsg}). Попробуйте открыть приложение в новой вкладке!
              </p>
            )}
          </div>
        )}
        {answered && (
          <button 
            className="btn btn-secondary animate-bounce-subtle" 
            style={{ width: "100%", padding: 15, marginTop: 8 }} 
            onClick={next}
          >
            {idx + 1 >= queue.length 
              ? (wrongIds.length > 0 ? "Повторить ошибки 🔁" : "Завершить сессию ✨") 
              : "Дальше →"}
          </button>
        )}
      </div>
    </div>
  );
}
