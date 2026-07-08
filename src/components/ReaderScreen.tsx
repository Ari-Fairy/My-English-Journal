import React, { useState, useRef, useEffect } from "react";
import { Word, UserProgress } from "../types";
import { BOOK_STORIES, SEED_WORDS, SEED_IRREGULAR, STATIC_QUIZZES, POS_DEFAULT, TOPICS_DEFAULT } from "../data";
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

  // Edit / Add Modal state from Book
  const [editModalWord, setEditModalWord] = useState<{ en: string; ru: string } | null>(null);
  const [editModalPos, setEditModalPos] = useState("noun");
  const [editModalTopic, setEditModalTopic] = useState("general");
  const [editModalNote, setEditModalNote] = useState("");
  const [isClassifying, setIsClassifying] = useState(false);

  const deletedTopics = stats.deletedTopics || [];
  const deletedPos = stats.deletedPos || [];

  const allTopics: { [key: string]: string } = {};
  Object.entries(TOPICS_DEFAULT).forEach(([k, v]) => {
    if (!deletedTopics.includes(k)) {
      allTopics[k] = v;
    }
  });
  Object.entries(stats.customTopics || {}).forEach(([k, v]) => {
    allTopics[k] = v;
  });

  const allPos: { [key: string]: string } = {};
  Object.entries(POS_DEFAULT).forEach(([k, v]) => {
    if (!deletedPos.includes(k)) {
      allPos[k] = v;
    }
  });
  Object.entries(stats.customPos || {}).forEach(([k, v]) => {
    allPos[k] = v;
  });

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

  const prefetchQuiz = async (level: string, title: string, text: string) => {
    const cacheKey = `prefetched_quiz_${level}_${today}`;
    if (localStorage.getItem(cacheKey)) return; // already cached

    try {
      const res = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text, level })
      });
      if (res.ok) {
        const resText = await res.text();
        const data = resText ? JSON.parse(resText) : null;
        if (data && data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify(data.questions));
        }
      }
    } catch (e) {
      console.warn("Quiz background prefetch failed:", e);
    }
  };

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
        const resText = await res.text();
        const data = resText ? JSON.parse(resText) : null;
        if (data && data.title && data.text) {
          localStorage.setItem(cacheKey, JSON.stringify(data));
          setDailyStories(prev => ({ ...prev, [level]: data }));
          setLoadingStory(prev => ({ ...prev, [level]: false }));
          return;
        }
      }
    } catch (e: any) {
      console.warn("Could not fetch generated story, falling back to static stories:", e?.message || e);
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
    // Only load already cached stories on mount to keep load instantaneous and avoid triggering parallel Gemini API requests
    ["A1", "A2", "B1", "B2"].forEach(level => {
      const cacheKey = `generated_story_${level}_${today}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.title && parsed.text) {
            setDailyStories(prev => ({ ...prev, [level]: parsed }));
          }
        } catch (e) {
          console.error("Failed to parse cached story", e);
        }
      }
    });
  }, [today]);

  // Lazy-load/generate the story when a specific level is selected by the user
  useEffect(() => {
    if (selectedLevel && !dailyStories[selectedLevel]) {
      fetchStory(selectedLevel, today);
    }
  }, [selectedLevel, today]);

  // Prefetch the quiz ONLY for the currently selected level in the background once its story is available
  useEffect(() => {
    if (selectedLevel) {
      const story = dailyStories[selectedLevel];
      if (story && story.title && story.text) {
        prefetchQuiz(selectedLevel, story.title, story.text);
      }
    }
  }, [selectedLevel, dailyStories, today]);


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

  const openAddWordModal = async (word: string, translation: string) => {
    setPopupWord(null); // close simple popup
    setEditModalWord({ en: word, ru: translation });
    setEditModalPos("noun");
    setEditModalTopic("general");
    setEditModalNote(`Из книги: ${selectedLevel || "Уровень A1"}`);
    setIsClassifying(true);

    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          en: word,
          ru: translation,
          existingPos: Object.entries(allPos).map(([k, v]) => `${k}:${v}`).join(", "),
          existingTopics: Object.entries(allTopics).map(([k, v]) => `${k}:${v}`).join(", "),
          allPos,
          allTopics
        })
      });

      if (res.ok) {
        const resText = await res.text();
        const classification = resText ? JSON.parse(resText) : {};
        if (classification.pos) setEditModalPos(classification.pos);
        if (classification.topic) setEditModalTopic(classification.topic);

        let customTopics = { ...(stats.customTopics || {}) };
        let customPos = { ...(stats.customPos || {}) };
        let hasUpdates = false;

        if (classification.newTopic?.key && classification.newTopic?.label) {
          customTopics[classification.newTopic.key] = classification.newTopic.label;
          setEditModalTopic(classification.newTopic.key);
          hasUpdates = true;
        }

        if (classification.newPos?.key && classification.newPos?.label) {
          customPos[classification.newPos.key] = classification.newPos.label;
          setEditModalPos(classification.newPos.key);
          hasUpdates = true;
        }

        if (hasUpdates) {
          onSaveProgress({
            ...stats,
            customTopics,
            customPos
          });
        }
      }
    } catch (err) {
      console.warn("AI classification failed, falling back to defaults", err);
    } finally {
      setIsClassifying(false);
    }
  };

  const handleSaveModalWord = () => {
    if (!editModalWord) return;
    const { en: wordEn, ru: wordRu } = editModalWord;

    const newWord: Word = {
      id: Math.random().toString(36).slice(2),
      userId: stats.userId,
      en: wordEn,
      ru: wordRu || "—",
      partOfSpeech: editModalPos,
      topic: editModalTopic,
      note: editModalNote.trim(),
      learned: false,
      learnedDate: null,
      lastReviewed: null,
      correct: 0,
      wrong: 0,
      streak: 0,
      created: new Date().toISOString()
    };

    onSaveWord(newWord);
    setAddedWords(prev => ({ ...prev, [wordEn]: true }));
    setToast(`Добавлено: ${wordEn} ✓`);
    setTimeout(() => setToast(""), 2200);

    // Increment words from books stat
    onSaveProgress({
      ...stats,
      wordsFromBooks: (stats.wordsFromBooks || 0) + 1
    });

    setEditModalWord(null);
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
    setCurrentQuizIdx(0);
    setQuizQuestions([]);
    setSelectedOptionIdx(null);
    setShowQuizExplanation(false);
    setQuizScore(0);

    const story = dailyStories[selectedLevel] || BOOK_STORIES[selectedLevel]?.[new Date().getDate() % (BOOK_STORIES[selectedLevel]?.length || 1)] || { title: "Книга", level: selectedLevel, text: "" };

    // Try reading prefetched quiz from cache for instantaneous load
    const cacheKey = `prefetched_quiz_${selectedLevel}_${today}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const questions = JSON.parse(cached);
        if (Array.isArray(questions) && questions.length > 0) {
          setQuizQuestions(questions);
          setQuizLoading(false);
          return;
        }
      } catch (e) {
        console.error("Failed to parse cached prefetched quiz", e);
      }
    }

    setQuizLoading(true);
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
        const resText = await res.text();
        const data = resText ? JSON.parse(resText) : null;
        if (data && data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
          setQuizQuestions(data.questions);
          localStorage.setItem(cacheKey, JSON.stringify(data.questions));
          setQuizLoading(false);
          return;
        }
      }
    } catch (e: any) {
      console.warn("Could not generate quiz, using local fallback:", e?.message || e);
    }

    // High fidelity offline fallback
    const staticQuiz = STATIC_QUIZZES[story.title];
    if (staticQuiz && staticQuiz.length > 0) {
      setQuizQuestions(staticQuiz);
      setQuizLoading(false);
      return;
    }

    // General robust dynamic local fallback quiz for AI-generated books when backend is down/unavailable
    const generalFallbackQuiz = [
      {
        question: "What was the main purpose of reading this story?",
        options: [
          "To practice and improve your English vocabulary and reading skills",
          "To translate every single word into your native language",
          "To read as fast as possible without understanding",
          "To learn how to draw paintings"
        ],
        correctIndex: 0,
        explanation: "Главная цель чтения адаптированных книг — улучшение понимания английского языка и расширение словарного запаса в контексте!"
      },
      {
        question: "Based on the text you just read, which statement is true?",
        options: [
          "The story had level-appropriate vocabulary and was written for active study",
          "The story was written in a completely incomprehensible ancient language",
          "The story contained no verbs or adjectives",
          "The story was about a spacesuit repair manual"
        ],
        correctIndex: 0,
        explanation: "История была создана с использованием лексики, соответствующей вашему уровню владения языком."
      },
      {
        question: "What is the best way to remember new words that you clicked on during reading?",
        options: [
          "Repeat them several times and review them regularly in your built-in Dictionary",
          "Forget them immediately after finishing the book",
          "Never read any more stories",
          "Write them on a wall"
        ],
        correctIndex: 0,
        explanation: "Регулярный повтор изученных слов в разделе 'Словарь' — залог надежного запоминания!"
      }
    ];

    setQuizQuestions(generalFallbackQuiz);
    setQuizLoading(false);
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

  if (selectedLevel && loadingStory[selectedLevel]) {
    return (
      <div className="fade-in" style={{ textAlign: "center", paddingTop: 100, paddingBottom: 100 }}>
        <div style={{ display: "inline-block", border: "3px solid var(--border)", borderTop: "3px solid var(--warm)", borderRadius: "50%", width: 32, height: 32, animation: "spin 1s linear infinite", marginBottom: 16 }}></div>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Загрузка рассказа...</p>
      </div>
    );
  }

  if (quizLoading) {
    return (
      <div className="fade-in" style={{ textAlign: "center", paddingTop: 100, paddingBottom: 100 }}>
        <div style={{ display: "inline-block", border: "3px solid var(--border)", borderTop: "3px solid var(--sage)", borderRadius: "50%", width: 32, height: 32, animation: "spin 1s linear infinite", marginBottom: 16 }}></div>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Загрузка вопросов к книге...</p>
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
            onAdd={openAddWordModal} 
            onClose={() => setPopupWord(null)} 
            words={words}
          />
        </>
      )}

      {editModalWord && (
        <div className="overlay" style={{ backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000 }} onClick={() => setEditModalWord(null)}>
          <div className="card overlay-card" style={{ width: "90%", maxWidth: "440px", margin: "20px", display: "flex", flexDirection: "column", gap: "12px", border: "1.5px solid rgba(212, 165, 165, 0.4)", boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <h3 className="section-title" style={{ margin: 0, fontSize: "18px" }}>Добавить слово из книги</h3>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: "20px", padding: "0 4px" }} onClick={() => setEditModalWord(null)}>✕</button>
            </div>
            
            <p style={{ fontSize: "12px", color: "#aaa", margin: 0, lineHeight: 1.4 }}>
              Вы можете изменить перевод, заметку, часть речи или тему, определенные ИИ.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#aaa", display: "block", marginBottom: "4px" }}>Слово на английском:</label>
                <input 
                  className="input" 
                  value={editModalWord.en} 
                  onChange={e => setEditModalWord({ ...editModalWord, en: e.target.value })}
                  style={{ width: "100%", marginBottom: 0 }}
                  required
                />
              </div>

              {words.some(w => w.en.toLowerCase() === editModalWord.en.toLowerCase() && w.partOfSpeech === editModalPos) && (
                <div style={{ color: "var(--rose, #ff4d4d)", fontSize: "12px", fontWeight: "500", padding: "6px 10px", background: "rgba(255, 77, 77, 0.1)", borderRadius: "8px", border: "1px solid rgba(255, 77, 77, 0.2)", lineHeight: "1.4" }}>
                  ⚠️ Слово "{editModalWord.en}" ({allPos[editModalPos] || editModalPos}) уже есть в словаре!
                </div>
              )}

              <div>
                <label style={{ fontSize: "11px", color: "#aaa", display: "block", marginBottom: "4px" }}>Перевод на русский:</label>
                <input 
                  className="input" 
                  value={editModalWord.ru} 
                  onChange={e => setEditModalWord({ ...editModalWord, ru: e.target.value })}
                  style={{ width: "100%", marginBottom: 0 }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "#aaa", display: "block", marginBottom: "4px" }}>Часть речи и Тема:</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <select className="select" style={{ flex: 1, minWidth: 0 }} value={editModalPos} onChange={e => setEditModalPos(e.target.value)}>
                    {Object.entries(allPos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className="select" style={{ flex: 1, minWidth: 0 }} value={editModalTopic} onChange={e => setEditModalTopic(e.target.value)}>
                    {Object.entries(allTopics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              {isClassifying && (
                <div style={{ fontSize: "11px", color: "var(--rose, #ff4d4d)", display: "flex", alignItems: "center", gap: "6px", fontWeight: 500 }}>
                  ⏳ ИИ определяет тему и часть речи...
                </div>
              )}

              <div>
                <label style={{ fontSize: "11px", color: "#aaa", display: "block", marginBottom: "4px" }}>Заметка:</label>
                <input 
                  className="input" 
                  value={editModalNote} 
                  onChange={e => setEditModalNote(e.target.value)}
                  style={{ width: "100%", marginBottom: 0 }}
                />
              </div>
            </div>

            <button 
              className="btn btn-primary" 
              style={{ width: "100%", padding: "12px", marginTop: "12px" }} 
              onClick={handleSaveModalWord}
              disabled={!editModalWord.en.trim() || !editModalWord.ru.trim()}
            >
              Добавить в журнал
            </button>
          </div>
        </div>
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
        const rText = await r.text();
        const d = rText ? JSON.parse(rText) : null;
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
        const rText = await r.text();
        const d = rText ? JSON.parse(rText) : null;
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
