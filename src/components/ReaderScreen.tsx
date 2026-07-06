import React, { useState, useRef, useEffect } from "react";
import { Word, UserProgress } from "../types";
import { BOOK_STORIES, SEED_WORDS, SEED_IRREGULAR } from "../data";
import { speak, getLocalDateString } from "../utils";

interface ReaderScreenProps {
  words: Word[];
  stats: UserProgress;
  onSaveWord: (word: Word) => void;
  onSaveProgress: (stats: UserProgress) => void;
  onBack: () => void;
}

export default function ReaderScreen({
  words,
  stats,
  onSaveWord,
  onSaveProgress,
  onBack
}: ReaderScreenProps) {
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [popupWord, setPopupWord] = useState<{ raw: string; clean: string } | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [addedWords, setAddedWords] = useState<{ [key: string]: boolean }>({});
  const [toast, setToast] = useState("");

  // Quiz interactive state
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQuizIdx, setCurrentQuizIdx] = useState<number | null>(null);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [showQuizExplanation, setShowQuizExplanation] = useState(false);

  const [dailyStories, setDailyStories] = useState<{ [level: string]: { title: string; level: string; text: string } }>({});
  const [loadingStory, setLoadingStory] = useState<{ [level: string]: boolean }>({});

  const today = getLocalDateString();
  const dailyBooksRead = stats.dailyBooksRead || {};
  const todayReadLevels = dailyBooksRead[today] || [];

  const fetchStory = async (level: string, date: string) => {
    const cacheKey = `generated_story_${level}_${date}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.title && parsed.text) {
          setDailyStories(prev => ({ ...prev, [level]: parsed }));
          return;
        }
      } catch (e) {
        console.error("Failed to parse cached story", e);
      }
    }

    setLoadingStory(prev => ({ ...prev, [level]: true }));
    try {
      const res = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, date })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.title && data.text) {
          localStorage.setItem(cacheKey, JSON.stringify(data));
          setDailyStories(prev => ({ ...prev, [level]: data }));
          setLoadingStory(prev => ({ ...prev, [level]: false }));
          return;
        }
      }
    } catch (e) {
      console.error("Failed to fetch generated story, falling back to static stories", e);
    }

    // Fallback to static story
    const stories = BOOK_STORIES[level] || [];
    const dayIndex = new Date(date).getDate() % stories.length;
    const staticStory = stories[dayIndex];
    if (staticStory) {
      setDailyStories(prev => ({ ...prev, [level]: staticStory }));
    }
    setLoadingStory(prev => ({ ...prev, [level]: false }));
  };

  useEffect(() => {
    ["A1", "A2", "B1", "B2"].forEach(level => {
      fetchStory(level, today);
    });
  }, [today]);


  const handleWordClick = (word: string, e: React.MouseEvent) => {
    const clean = word.replace(/[^a-zA-Z'\-]/g, "").toLowerCase();
    if (clean.length < 2) return;
    
    const target = e.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    // Find the relative parent .app to adjust coordinates for centered layouts on laptops/desktops
    const appEl = document.querySelector(".app");
    const appRect = appEl ? appEl.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth };
    
    const relativeLeft = rect.left - appRect.left;
    const relativeBottom = rect.bottom - appRect.top;
    
    // Max width of word popup is around 280px. Keep it inside the .app container.
    const popupWidth = 280;
    const x = Math.max(8, Math.min(relativeLeft, appRect.width - popupWidth - 8));
    const y = relativeBottom + 8;
    
    setPopupWord({ raw: word, clean });
    setPopupPos({ x, y });
  };

  const handleAddWordToDict = (word: string, translation: string) => {
    const existing = words.find(w => w.en.toLowerCase() === word.toLowerCase());
    if (existing) {
      setToast(`Слово "${word}" уже есть в словаре!`);
      setTimeout(() => setToast(""), 2000);
      return;
    }

    const newWord: Word = {
      id: Math.random().toString(36).slice(2),
      userId: stats.userId,
      en: word,
      ru: translation || "—",
      partOfSpeech: "noun", // Default, user can update in Dictionary
      topic: "general",    // Default, user can update in Dictionary
      note: "Из книги",
      learned: false,
      learnedDate: null,
      lastReviewed: null,
      correct: 0,
      wrong: 0,
      streak: 0,
      created: new Date().toISOString()
    };

    onSaveWord(newWord);
    setAddedWords(prev => ({ ...prev, [word]: true }));
    setToast(`Добавлено: ${word} ✓`);
    setTimeout(() => setToast(""), 2200);

    // Increment words from books stat
    onSaveProgress({
      ...stats,
      wordsFromBooks: (stats.wordsFromBooks || 0) + 1
    });
  };

  const handleFinishBook = () => {
    if (!selectedLevel) return;
    const todayLevels = [...todayReadLevels];
    if (!todayLevels.includes(selectedLevel)) {
      todayLevels.push(selectedLevel);
    }

    const updatedDailyBooks = { ...dailyBooksRead, [today]: todayLevels };
    const updatedStats: UserProgress = {
      ...stats,
      booksRead: (stats.booksRead || 0) + 1,
      dailyBooksRead: updatedDailyBooks
    };

    onSaveProgress(updatedStats);
    setFinished(true);
  };

  const handleStartQuiz = async () => {
    if (!selectedLevel) return;
    setQuizLoading(true);
    setCurrentQuizIdx(0);
    setQuizQuestions([]);
    setSelectedOptionIdx(null);
    setShowQuizExplanation(false);
    setQuizScore(0);

    const story = dailyStories[selectedLevel] || BOOK_STORIES[selectedLevel]?.[new Date().getDate() % (BOOK_STORIES[selectedLevel]?.length || 1)] || { title: "Книга", level: selectedLevel, text: "" };

    try {
      const res = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: story.title, 
          text: story.text, 
          level: story.level 
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
          setQuizQuestions(data.questions);
          setQuizLoading(false);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to generate quiz", e);
    }

    // Fallback to finishing book directly if quiz generation fails
    setQuizLoading(false);
    setCurrentQuizIdx(null);
    handleFinishBook();
  };

  if (!selectedLevel) {
    return (
      <div className="fade-in">
        <button className="back-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Назад</button>
        <h2 className="section-title" style={{ marginBottom: 4 }}>Чтение книг</h2>
        <p style={{ fontSize: 13, color: "#aaa", marginBottom: 16 }}>Нажми на любое слово, чтобы мгновенно перевести его и добавить в словарь!</p>
        
        {["A1", "A2", "B1", "B2"].map(level => {
          const generatedStory = dailyStories[level];
          const isLoading = loadingStory[level];
          const isReadToday = todayReadLevels.includes(level);

          let title = "Загрузка...";
          let wordCount = 0;
          if (generatedStory) {
            title = generatedStory.title;
            wordCount = generatedStory.text.split(/\s+/).filter(Boolean).length;
          } else if (!isLoading) {
            const stories = BOOK_STORIES[level] || [];
            const dayIndex = new Date().getDate() % stories.length;
            const staticStory = stories[dayIndex];
            if (staticStory) {
              title = staticStory.title;
              wordCount = staticStory.text.split(/\s+/).filter(Boolean).length;
            }
          }

          return (
            <div 
              key={level} 
              className="card" 
              style={{ marginBottom: 10, cursor: isReadToday ? "default" : "pointer", opacity: isReadToday ? 0.6 : 1 }}
              onClick={() => {
                if (!isReadToday && !isLoading) {
                  setSelectedLevel(level);
                  setAddedWords({});
                  setFinished(false);
                }
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span className={`level-badge level-${level}`}>{level}</span>
                    {isReadToday && <span style={{ fontSize: 11, color: "var(--sage)" }}>✓ прочитано сегодня</span>}
                  </div>
                  <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 17 }}>
                    {isLoading ? (
                      <span className="pulsing" style={{ color: "#888" }}>✍️ Пишем новую книгу...</span>
                    ) : (
                      title
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#aaa", marginTop: 3 }}>
                    {isLoading ? "секунду..." : `${wordCount} слов`}
                  </div>
                </div>
                <span style={{ fontSize: 22, opacity: isReadToday ? 0.2 : 0.4 }}>→</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Find the selected story (prefer generated, fallback to static)
  const story = dailyStories[selectedLevel] || BOOK_STORIES[selectedLevel]?.[new Date().getDate() % (BOOK_STORIES[selectedLevel]?.length || 1)] || { title: "Книга", level: selectedLevel, text: "" };

  if (quizLoading) {
    return (
      <div className="fade-in" style={{ textAlign: "center", paddingTop: 48, paddingBottom: 48 }}>
        <div style={{ fontSize: 56, animation: "spin 2s linear infinite" }} className="spinning-icon">🧠</div>
        <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 18, marginTop: 20, color: "var(--warm)" }}>
          ИИ придумывает вопросы...
        </h3>
        <p className="sub-text" style={{ marginTop: 8, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
          Пожалуйста, подождите. Мы готовим 3 интерактивных вопроса на английском языке, чтобы проверить ваше понимание прочитанного сюжета!
        </p>
      </div>
    );
  }

  if (currentQuizIdx !== null && quizQuestions.length > 0) {
    const curQ = quizQuestions[currentQuizIdx];
    const isLast = currentQuizIdx + 1 === quizQuestions.length;

    return (
      <div className="fade-in" style={{ paddingBottom: 30 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: "var(--sage)", fontWeight: 600 }}>🧠 Тест по пониманию книги</span>
          <span className="badge" style={{ background: "rgba(148, 161, 135, 0.15)", color: "var(--sage)" }}>
            Вопрос {currentQuizIdx + 1}/{quizQuestions.length}
          </span>
        </div>

        <div className="card" style={{ marginBottom: 20, padding: 20, border: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 17, color: "var(--warm)", marginBottom: 18, lineHeight: 1.4 }}>
            {curQ.question}
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {curQ.options.map((opt: string, i: number) => {
              const isSelected = selectedOptionIdx === i;
              const isCorrect = curQ.correctIndex === i;
              
              let optStyle: React.CSSProperties = {
                width: "100%",
                padding: "14px 16px",
                textAlign: "left",
                borderRadius: "1rem",
                border: "1px solid var(--border)",
                background: "rgba(255, 255, 255, 0.03)",
                color: "var(--foreground)",
                fontSize: 14,
                cursor: "pointer",
                transition: "all 0.2s"
              };

              if (selectedOptionIdx !== null) {
                if (isCorrect) {
                  optStyle.border = "1px solid var(--sage)";
                  optStyle.background = "rgba(148, 161, 135, 0.15)";
                  optStyle.color = "var(--sage)";
                  optStyle.fontWeight = 600;
                } else if (isSelected) {
                  optStyle.border = "1px solid var(--rose)";
                  optStyle.background = "rgba(220, 95, 95, 0.12)";
                  optStyle.color = "var(--rose)";
                } else {
                  optStyle.opacity = 0.5;
                }
              }

              return (
                <button
                  key={i}
                  style={optStyle}
                  disabled={selectedOptionIdx !== null}
                  onClick={() => {
                    setSelectedOptionIdx(i);
                    setShowQuizExplanation(true);
                    if (i === curQ.correctIndex) {
                      setQuizScore(s => s + 1);
                    }
                  }}
                >
                  <span style={{ marginRight: 8, fontWeight: 600 }}>{String.fromCharCode(65 + i)}.</span> {opt}
                </button>
              );
            })}
          </div>

          {showQuizExplanation && (
            <div className="card" style={{ marginTop: 20, padding: 14, background: "rgba(255, 255, 255, 0.01)", border: "1px solid var(--border)", borderRadius: "0.75rem" }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: selectedOptionIdx === curQ.correctIndex ? "var(--sage)" : "var(--rose)" }}>
                {selectedOptionIdx === curQ.correctIndex ? "🎉 Правильно!" : "❌ Неверно"}
              </div>
              <p style={{ fontSize: 13, color: "#ccc", lineHeight: "1.4" }}>
                {curQ.explanation}
              </p>
            </div>
          )}
        </div>

        {selectedOptionIdx !== null && (
          <button
            className="btn btn-primary"
            style={{ width: "100%", padding: 16 }}
            onClick={() => {
              if (isLast) {
                handleFinishBook();
                setCurrentQuizIdx(null);
              } else {
                setCurrentQuizIdx(idx => idx! + 1);
                setSelectedOptionIdx(null);
                setShowQuizExplanation(false);
              }
            }}
          >
            {isLast ? "Завершить тест и сохранить результат 🏁" : "Следующий вопрос →"}
          </button>
        )}
      </div>
    );
  }

  if (finished) {
    const totalWordsAdded = Object.keys(addedWords).length;
    return (
      <div className="fade-in" style={{ textAlign: "center", paddingTop: 24 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>📚</div>
        <h2 className="section-title">Книга прочитана!</h2>
        <p style={{ fontSize: 14, color: "#aaa", margin: "8px 0 20px" }}>«{story.title}» — Уровень {story.level}</p>

        {quizQuestions.length > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: "16px 14px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 14, color: "var(--sage)", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
              🏆 Результат теста на понимание
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--warm)", margin: "8px 0" }}>
              {quizScore} из {quizQuestions.length} верных ответов!
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>
              {quizScore === quizQuestions.length ? "Вы полностью поняли сюжет этой книги! Потрясающе! 🌟" : "Хорошая попытка! Читайте больше книг, чтобы улучшить понимание."}
            </div>
          </div>
        )}
        
        {totalWordsAdded > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: 14 }}>
            <div style={{ fontSize: 13, color: "var(--sage)", fontWeight: 600 }}>
              ✅ Вы добавили {totalWordsAdded} новых слов в словарь во время чтения!
            </div>
          </div>
        )}

        <div className="book-read-msg" style={{ marginTop: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🌙</div>
          <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 18, color: "var(--warm)", marginBottom: 8, fontWeight: 600 }}>Отличная работа!</div>
          <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>
            Эта книга зачтена в ваш сегодняшний прогресс. Возвращайтесь завтра за новыми историями или попробуйте другой уровень!
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: "100%", padding: 14, marginBottom: 10 }} onClick={() => { setSelectedLevel(null); setFinished(false); }}>← К списку книг</button>
        <button className="btn btn-secondary" style={{ width: "100%", padding: 14 }} onClick={onBack}>На главную</button>
      </div>
    );
  }

  const tokens = story.text.split(/(\s+)/);

  return (
    <div className="fade-in">
      {toast && <div className="toast">{toast}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button className="back-btn" onClick={() => setSelectedLevel(null)}>← Назад</button>
        <span className={`level-badge level-${story.level}`}>{story.level}</span>
        <button className="btn btn-ghost" style={{ fontSize: 13, color: "var(--sage)", fontWeight: 600 }} onClick={handleStartQuiz}>
          ✓ Прочитала
        </button>
      </div>

      <h2 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 21, marginBottom: 14 }}>{story.title}</h2>

      <div className="card book-text" style={{ marginBottom: 12 }}>
        {tokens.map((token, i) => {
          if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
          const clean = token.replace(/[^a-zA-Z'\-]/g, "").toLowerCase();
          if (clean.length < 2) return <span key={i}>{token}</span>;

          const isAdded = addedWords[clean];
          const inDict = words.some(w => w.en.toLowerCase() === clean);

          return (
            <span 
              key={i} 
              className={`book-word ${isAdded ? "highlighted" : ""}`}
              style={inDict ? { color: "var(--sage)", fontWeight: 500 } : {}}
              onClick={e => handleWordClick(token, e)}
            >
              {token}
            </span>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: "#ccc", textAlign: "center", marginBottom: 8 }}>
        💡 Нажми на слово · <span style={{ color: "var(--sage)" }}>зелёный</span> = уже в словаре · <span style={{ color: "var(--rose)" }}>подсвеченный</span> = добавлен сейчас
      </div>

      {popupWord && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 150 }} onClick={() => setPopupWord(null)} />
          <WordPopup 
            word={popupWord} 
            pos={popupPos} 
            inDict={words.some(w => w.en.toLowerCase() === popupWord.clean)}
            onAdd={handleAddWordToDict} 
            onClose={() => setPopupWord(null)} 
            words={words}
          />
        </>
      )}
    </div>
  );
}

// Helper for local offline dictionary lookup with lemmatization
function getLocalTranslation(cleanWord: string, userWords: Word[]): string | null {
  const w = cleanWord.toLowerCase().trim();
  const searchLists = [
    userWords.map(x => ({ en: x.en, ru: x.ru })),
    SEED_WORDS,
    SEED_IRREGULAR.map(v => ({ en: v.base, ru: v.ru })),
    SEED_IRREGULAR.map(v => ({ en: v.past, ru: v.ru })),
    SEED_IRREGULAR.map(v => ({ en: v.participle, ru: v.ru }))
  ];

  // 1. Try exact match
  for (const list of searchLists) {
    const found = list.find((x: any) => (x.en || "").toLowerCase() === w);
    if (found) return found.ru;
  }

  // 2. Try inflections
  // Plural/3rd person: -s, -es
  if (w.endsWith("s") && w.length > 2) {
    const stem = w.slice(0, -1);
    for (const list of searchLists) {
      const found = list.find((x: any) => (x.en || "").toLowerCase() === stem);
      if (found) return found.ru;
    }
  }
  if (w.endsWith("es") && w.length > 3) {
    const stem = w.slice(0, -2);
    for (const list of searchLists) {
      const found = list.find((x: any) => (x.en || "").toLowerCase() === stem);
      if (found) return found.ru;
    }
  }

  // Past tense: -ed, -d
  if (w.endsWith("ed") && w.length > 3) {
    const stem = w.slice(0, -2);
    const stemD = w.slice(0, -1);
    for (const stemCandidate of [stem, stemD]) {
      for (const list of searchLists) {
        const found = list.find((x: any) => (x.en || "").toLowerCase() === stemCandidate);
        if (found) return found.ru;
      }
    }
  }

  // Gerund/Progressive: -ing
  if (w.endsWith("ing") && w.length > 4) {
    const stem = w.slice(0, -3);
    const stemE = stem + "e";
    const stemDouble = stem.slice(0, -1); // e.g., running -> run
    for (const stemCandidate of [stem, stemE, stemDouble]) {
      for (const list of searchLists) {
        const found = list.find((x: any) => (x.en || "").toLowerCase() === stemCandidate);
        if (found) return found.ru;
      }
    }
  }

  return null;
}

// Popup translate module
function WordPopup({ word, pos, inDict, onAdd, onClose, words }: { 
  word: { raw: string; clean: string }; 
  pos: { x: number; y: number }; 
  inDict: boolean;
  onAdd: (word: string, translation: string) => void;
  onClose: () => void;
  words: Word[];
}) {
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setTranslation("");

    async function translate() {
      // Step 1: Check offline local lexicon first
      const localMatch = getLocalTranslation(word.clean, words);
      if (localMatch) {
        if (active) {
          setTranslation(localMatch);
          setLoading(false);
        }
        return;
      }

      // Helper to fetch with timeout
      async function fetchWithTimeout(url: string, timeoutMs = 2500) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(id);
          return response;
        } catch (e) {
          clearTimeout(id);
          throw e;
        }
      }

      // Step 2: Try MyMemory API with 2.5s timeout
      try {
        const r = await fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word.clean)}&langpair=en|ru`);
        const d = await r.json();
        const t = d?.responseData?.translatedText;
        if (active && t && t.toLowerCase() !== word.clean.toLowerCase() && t.length < 100 && !/^[A-Z0-9\s]+$/.test(t)) {
          setTranslation(t);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn("MyMemory translate timeout/error", e);
      }

      // Step 3: Try Lingva Translate fallback API with 2.5s timeout
      try {
        const r = await fetchWithTimeout(`https://lingva.ml/api/v1/en/ru/${encodeURIComponent(word.clean)}`);
        const d = await r.json();
        const t = d?.translation;
        if (active && t && t.toLowerCase() !== word.clean.toLowerCase()) {
          setTranslation(t);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn("Lingva translate timeout/error", e);
      }

      // If everything failed, just stop loading so the user can type translation manually
      if (active) {
        setLoading(false);
      }
    }

    translate();
    return () => { active = false; };
  }, [word.clean, words]);

  const handleAdd = () => {
    if (!translation.trim()) return;
    setAdding(true);
    onAdd(word.clean, translation.trim());
    setAdding(false);
    onClose();
  };

  return (
    <div className="word-popup" style={{ left: pos.x, top: pos.y, position: "absolute", zIndex: 200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 19, fontWeight: 600 }}>{word.clean}</div>
        <button style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 17, padding: "0 0 0 10px" }} onClick={onClose}>✕</button>
      </div>
      <div style={{ marginBottom: 10 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#bbb", fontSize: 13 }}>
            <span style={{ display: "inline-block", animation: "pulse 1.2s infinite" }}>⏳</span> перевод...
          </div>
        ) : (
          <input 
            className="input" 
            style={{ fontSize: 16, padding: "8px 12px", fontWeight: 500 }} 
            value={translation}
            onChange={e => setTranslation(e.target.value)}
            placeholder="Введи перевод..."
            autoFocus
          />
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-ghost" onClick={() => speak(word.clean)} style={{ fontSize: 15, padding: "7px 10px" }}>🔊</button>
        {inDict ? (
          <span style={{ fontSize: 12, color: "var(--sage)", padding: "7px 0", flex: 1, textAlign: "center", fontWeight: 600 }}>✓ В словаре</span>
        ) : (
          <button 
            className="btn btn-primary" 
            style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
            onClick={handleAdd}
            disabled={loading || adding || !translation.trim()}
          >
            {adding ? "⏳..." : "+ В словарь"}
          </button>
        )}
      </div>
    </div>
  );
}
