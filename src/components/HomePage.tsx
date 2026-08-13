import { useState, useEffect, useMemo } from "react";
import { Word, UserProgress } from "../types";
import { getLocalDateString, getReviewCooldownStatus, getEffectiveDueWords, getWordNextReviewTimeMs } from "../utils";
import { getDefaultCategories, getCategoryStats, getCategoryPath, getWordsForCategory, isCategoryPaused } from "../categories";

const getWeeklyPreset = (index: number) => {
  const presets = [
    {
      title: "🌱 Активный старт",
      goals: [
        { id: "words", text: "📚 Выучить 50 слов за неделю", target: 50, type: "words" },
        { id: "books", text: "📖 Прочитать 3 книги/главы за неделю", target: 3, type: "books" },
        { id: "streak", text: "🔥 Заниматься 4 дня на этой неделе", target: 4, type: "streak" }
      ]
    },
    {
      title: "📖 Интенсивный темп",
      goals: [
        { id: "words", text: "📚 Выучить 75 слов за неделю", target: 75, type: "words" },
        { id: "books", text: "📖 Прочитать 5 книг/глав за неделю", target: 5, type: "books" },
        { id: "streak", text: "🔥 Заниматься 5 дней на этой неделе", target: 5, type: "streak" }
      ]
    },
    {
      title: "📚 Максимальный вызов",
      goals: [
        { id: "words", text: "📚 Выучить 100 слов за неделю", target: 100, type: "words" },
        { id: "books", text: "📖 Прочитать 7 книг/глав за неделю", target: 7, type: "books" },
        { id: "streak", text: "🔥 Заниматься каждый день (7 дней)", target: 7, type: "streak" }
      ]
    },
    {
      title: "🧘🏽 Стабильная привычка",
      goals: [
        { id: "words", text: "📚 Выучить 50 слов за неделю", target: 50, type: "words" },
        { id: "books", text: "📖 Прочитать 4 книги/главы за неделю", target: 4, type: "books" },
        { id: "streak", text: "🔥 Заниматься 5 дней на этой неделе", target: 5, type: "streak" }
      ]
    }
  ];

  return presets[index % presets.length];
};

interface HomePageProps {
  words: Word[];
  stats: UserProgress;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onNavigate: (view: "home" | "study" | "words" | "add" | "irregular" | "reader" | "stats" | "achievements" | "settings" | "ai" | "categories") => void;
  onStartStudy: (sessionType: "learn" | "review" | "mandatory", isGlobal?: boolean) => void;
  onSaveWord: (word: Word) => void;
  onSaveWords: (words: Word[]) => void;
  onSaveProgress: (stats: UserProgress) => void;
}

export default function HomePage({ words, stats, theme = "light", onToggleTheme, onNavigate, onStartStudy, onSaveWord, onSaveWords, onSaveProgress }: HomePageProps) {
  const [recallInfo, setRecallInfo] = useState(false);
  const [isSpreading, setIsSpreading] = useState(false);
  const [showSpreadConfirm, setShowSpreadConfirm] = useState(false);
  const [spreadSuccess, setSpreadSuccess] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const categories = stats.categories && stats.categories.length > 0
    ? stats.categories
    : getDefaultCategories(stats.userId || "guest");

  const activeCategoryId = stats.activeCategoryId || "cat_base";
  const activeCategoryPath = getCategoryPath(activeCategoryId, categories);
  const activeCategory = categories.find(c => c.id === activeCategoryId) || categories[0];
  const isCurrentActivePaused = isCategoryPaused(activeCategoryId, categories);

  // Filter words belonging to active category
  const activeCatWords = useMemo(() => {
    return getWordsForCategory(words, activeCategoryId, categories);
  }, [words, activeCategoryId, categories]);

  const activeCatStats = useMemo(() => {
    return getCategoryStats(words, activeCategoryId, categories);
  }, [words, activeCategoryId, categories]);

  const activeNewWords = useMemo(() => activeCatWords.filter(w => !w.learned), [activeCatWords]);
  const activeEffectiveDue = useMemo(() => getEffectiveDueWords(activeCatWords, stats), [activeCatWords, stats]);
  const activeReviewWords = isCurrentActivePaused ? [] : activeEffectiveDue.dueWords;

  // Global overdue count for comparison
  const globalEffectiveDue = useMemo(() => getEffectiveDueWords(words, stats), [words, stats]);
  const globalReviewWords = globalEffectiveDue.dueWords;

  // Categories (excluding active) that have words ready for review
  const otherCategoriesWithDue = useMemo(() => {
    const cats = stats.categories && stats.categories.length > 0 ? stats.categories : getDefaultCategories(stats.userId || "guest");
    const now = Date.now();

    return cats
      .filter(c => c.id !== activeCategoryId && !c.archived && !isCategoryPaused(c.id, cats))
      .map(c => {
        const catWords = getWordsForCategory(words, c.id, cats);
        const dueCount = catWords.filter(w => w.learned && (w.streak || 0) < 10 && getWordNextReviewTimeMs(w) <= now).length;
        return { category: c, dueCount, totalWords: catWords.length };
      })
      .filter(item => item.dueCount > 0);
  }, [words, stats.categories, stats.userId, activeCategoryId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!stats.firstStudyDate) {
      const dailyDates = Object.keys(stats.daily || {});
      let fallbackDate = getLocalDateString();
      if (dailyDates.length > 0) {
        const sorted = dailyDates.sort();
        fallbackDate = sorted[0];
      } else {
        const learnedDates = words.filter(w => w.learnedDate).map(w => w.learnedDate!);
        if (learnedDates.length > 0) {
          const sorted = learnedDates.sort();
          fallbackDate = sorted[0];
        }
      }
      onSaveProgress({
        ...stats,
        firstStudyDate: fallbackDate
      });
    }
  }, [stats, words, onSaveProgress]);

  const getStartDateMs = () => {
    if (stats.firstStudyDate) {
      return new Date(stats.firstStudyDate).getTime();
    }
    const dailyDates = Object.keys(stats.daily || {});
    if (dailyDates.length > 0) {
      const sorted = dailyDates.sort();
      return new Date(sorted[0]).getTime();
    }
    const learnedDates = words.filter(w => w.learnedDate).map(w => new Date(w.learnedDate!).getTime());
    if (learnedDates.length > 0) {
      return Math.min(...learnedDates);
    }
    return Date.now();
  };

  const startDateMs = getStartDateMs();
  const diffMs = Date.now() - startDateMs;
  const currentWeekIndex = Math.floor(diffMs / (7 * 24 * 3600 * 1000));
  const weekStartMs = startDateMs + currentWeekIndex * 7 * 24 * 3600 * 1000;
  const weekEndMs = weekStartMs + 7 * 24 * 3600 * 1000;

  const learnedCount = words.filter(w => w.learned).length;
  const today = getLocalDateString();
  const todayLearned = words.filter(w => w.learnedDate === today).length;
  
  const wordsThisWeek = words.filter(w => {
    if (!w.learned || !w.learnedDate) return false;
    const t = new Date(w.learnedDate).getTime();
    return t >= weekStartMs && t < weekEndMs;
  }).length;

  const activePreset = getWeeklyPreset(currentWeekIndex);

  const activeDaysThisWeek = useMemo(() => {
    let count = 0;
    const dailyMap = stats.daily || {};
    Object.entries(dailyMap).forEach(([dateStr, record]) => {
      try {
        const t = new Date(dateStr).getTime();
        if (t >= weekStartMs && t < weekEndMs) {
          if ((record.learned || 0) > 0 || (record.reviewed || 0) > 0) {
            count++;
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
    return count;
  }, [stats.daily, weekStartMs, weekEndMs]);

  const booksThisWeek = Object.entries(stats.dailyBooksRead || {}).reduce((count, [dateStr, levels]) => {
    try {
      const t = new Date(dateStr).getTime();
      if (t >= weekStartMs && t < weekEndMs && levels && Array.isArray(levels)) {
        return count + levels.length;
      }
    } catch (e) {
      console.error(e);
    }
    return count;
  }, 0);

  const getNextReviewTimeMs = (w: Word) => {
    const dueTime = getWordNextReviewTimeMs(w);
    if (dueTime === Infinity) return Infinity;
    return Math.max(0, dueTime - Date.now());
  };

  const formatTimeLeft = (ms: number) => {
    if (ms <= 0) return "сейчас";
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) return `через ${mins} мин`;
    const h = Math.ceil(ms / 3600000);
    if (h < 24) return `через ${h} ч`;
    const days = Math.ceil(h / 24);
    if (days === 1) return "через 1 день";
    if (days >= 2 && days <= 4) return `через ${days} дня`;
    return `через ${days} дней`;
  };

  const formatTimeLeftPrecise = (ms: number) => {
    if (ms <= 0) return "сейчас";
    const totalMins = Math.ceil(ms / 60000);
    if (totalMins < 60) {
      return `через ${totalMins} мин`;
    }
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (mins === 0) {
      return `через ${hrs} ч`;
    }
    return `через ${hrs} ч ${mins} мин`;
  };

  const totalOverdueCount = globalEffectiveDue.totalOverdueCount;
  
  // Find any problem words with 90-minute cooldown (2+ errors) that are waiting
  const urgentWaiting = activeCatWords.filter(w => w.learned && (w.intervalMinutes === 90 || w.isProblematic) && getNextReviewTimeMs(w) > 0);
  const earliestUrgent = urgentWaiting.sort((a, b) => getNextReviewTimeMs(a) - getNextReviewTimeMs(b))[0];

  // Find mandatory end-of-day repetitions
  const mandatoryEndOfDayWords = activeCatWords.filter(w => w.learned && w.isMandatoryEndOfDay);

  const executeSpreadSurplus = () => {
    if (totalOverdueCount <= 30 || isSpreading) return;
    setIsSpreading(true);
    try {
      const surplus = globalEffectiveDue.allDueWordsSorted.slice(30);
      const updatedWords: Word[] = surplus.map(w => {
        const pushDays = Math.floor(Math.random() * 3) + 1;
        const newReviewTime = Date.now() + pushDays * 24 * 3600 * 1000;
        return {
          ...w,
          nextReviewDate: new Date(newReviewTime).toISOString(),
          consecutiveErrors: 0,
          isProblematic: false
        };
      });
      onSaveWords(updatedWords);
      setSpreadSuccess(`🎉 Успешно перенесено ${surplus.length} слов излишка на следующие 1-3 дня!`);
      setTimeout(() => {
        setSpreadSuccess(null);
        setShowSpreadConfirm(false);
      }, 5000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSpreading(false);
    }
  };

  const handleToggleActiveCategoryPause = () => {
    const updatedCats = categories.map(c => {
      if (c.id === activeCategoryId) {
        return { ...c, paused: !c.paused };
      }
      return c;
    });
    onSaveProgress({
      ...stats,
      categories: updatedCats
    });
  };

  const getUnifiedNextReviewTimeMs = () => {
    const uncompletedWords = activeCatWords.filter(w => w.learned && (w.streak || 0) < 10);
    if (uncompletedWords.length === 0) return null;
    
    const now = Date.now();
    const futureReviewTimes = uncompletedWords
      .map(w => {
        const dueMs = getWordNextReviewTimeMs(w);
        return dueMs === Infinity ? Infinity : dueMs - now;
      })
      .filter(ms => ms > 0 && ms !== Infinity && !isNaN(ms));

    if (futureReviewTimes.length === 0) return null;
    const minStandardMs = Math.min(...futureReviewTimes);
    
    if (minStandardMs === Infinity || isNaN(minStandardMs)) return null;
    return minStandardMs;
  };
  
  const unifiedNextMs = getUnifiedNextReviewTimeMs();
  const unlockedAchievementsCount = (stats.achievements || []).length;

  const menuItems = [
    { icon: "📁", title: "Categories", sub: "Категории", v: "categories" as const },
    { icon: "📖", title: "Dictionary", sub: "Словарь", v: "words" as const },
    { icon: "✨", title: "Add Word", sub: "Добавить", v: "add" as const },
    { icon: "📝", title: "Verbs", sub: "Глаголы", v: "irregular" as const },
    { icon: "📚", title: "Reading", sub: "Чтение книг", v: "reader" as const },
    { icon: "📈", title: "Insights", sub: "Статистика", v: "stats" as const },
  ];

  return (
    <div className="fade-in home-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, paddingBottom: 16 }}>
        <div>
          <h1 className="home-header-title" style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 24, color: "var(--warm)", margin: 0, lineHeight: 1.2 }}>
            My English Journal
          </h1>
          <p className="sub-text" style={{ color: "var(--sage)", marginTop: 4, marginBottom: 0, fontSize: 13.5, fontWeight: 600 }}>
            {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, str => str.toUpperCase())}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              style={{
                background: "var(--card)",
                border: "1.5px solid var(--border)",
                borderRadius: "50%",
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 18,
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                color: "var(--warm)",
                transition: "transform 0.2s ease"
              }}
              title={theme === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          )}
          <button
            onClick={() => onNavigate("settings")}
            style={{
              background: "var(--card)",
              border: "1.5px solid var(--border)",
              borderRadius: "50%",
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 18,
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              color: "var(--warm)"
            }}
            title="Настройки"
          >
            ⚙️
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 0", marginBottom: 16 }}>
        <div className="stat-box">
          <div className="stat-num" style={{ color: "var(--rose)" }}>{learnedCount}</div>
          <div className="stat-label">выучено</div>
        </div>
        <div className="divider" />
        <div className="stat-box">
          <div className="stat-num" style={{ color: "var(--sage)" }}>{todayLearned}</div>
          <div className="stat-label">сегодня</div>
        </div>
        <div className="divider" />
        <div className="stat-box">
          <div className="stat-num" style={{ color: "var(--lavender)" }}>{stats.streak || 0}🔥</div>
          <div className="stat-label">серия</div>
        </div>
      </div>

      {/* ACTIVE CATEGORY CARD */}
      <div 
        className="card active-cat-card" 
        style={{ 
          marginBottom: 20, 
          padding: "16px 18px", 
          background: "var(--card)",
          border: "2px solid var(--sage)",
          borderRadius: "1.5rem",
          boxShadow: "0 6px 18px rgba(143,160,128,0.12)"
        }}
      >
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--sage)", fontWeight: 700, marginBottom: 4 }}>
          📌 Активная категория
        </div>

        {activeCategoryPath.length > 1 && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
            {activeCategoryPath.map(c => c.name).join(" ➔ ")}
          </div>
        )}

        {/* Full-width Category Name Row */}
        <h2 className="active-cat-title" style={{ margin: "2px 0 10px 0", fontSize: 20, fontWeight: 800, color: "var(--charcoal)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{activeCategory?.icon || "📁"}</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{activeCategory?.name || "Основной словарь"}</span>
          {isCurrentActivePaused && (
            <span className="badge badge-gray" style={{ fontSize: 11, background: "rgba(0,0,0,0.08)" }}>
              ⏸️ Повторения на паузе
            </span>
          )}
        </h2>

        {/* Action Buttons Row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <button 
            className="btn btn-secondary" 
            style={{ fontSize: 12.5, padding: "6px 13px", borderRadius: 20 }}
            onClick={handleToggleActiveCategoryPause}
            title={isCurrentActivePaused ? "Включить повторения для этой категории" : "Отключить повторения (поставить на паузу)"}
          >
            {isCurrentActivePaused ? "▶️ Включить" : "⏸️ Выключить"}
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ fontSize: 12.5, padding: "6px 13px", borderRadius: 20 }}
            onClick={() => onNavigate("categories")}
          >
            📁 Сменить
          </button>
        </div>

        {/* Category Stats */}

        {/* Category Stats */}
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
          Выучено: <strong>{activeCatStats.learned}</strong> из <strong>{activeCatStats.total}</strong> слов ({activeCatStats.percent}%)
          {activeReviewWords.length > 0 && (
            <span style={{ color: "var(--terracotta)", fontWeight: 600, marginLeft: 8 }}>
              • {activeReviewWords.length} на повторение
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="progress-bar" style={{ height: 8, background: "rgba(0,0,0,0.06)", borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
          <div 
            style={{ 
              height: "100%", 
              width: `${activeCatStats.percent}%`, 
              background: "var(--sage)", 
              borderRadius: 4,
              transition: "width 0.3s ease"
            }} 
          />
        </div>

        {/* Study buttons for active category */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button 
            className="btn btn-primary" 
            style={{ 
              width: "100%", 
              padding: "16px 20px", 
              textAlign: "left", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              borderRadius: "1.2rem", 
              fontSize: 15,
              cursor: "pointer" 
            }}
            onClick={() => onStartStudy("learn", false)} 
          >
            <div>
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 19, color: "#fff", fontWeight: 600 }}>
                Учить категорию ✨
              </div>
              <div style={{ fontSize: 12.5, opacity: .9, marginTop: 2, color: "#eee" }}>
                Новые слова — {activeNewWords.length}
              </div>
            </div>
            <span style={{ fontSize: 22, opacity: .9 }}>→</span>
          </button>

          {activeReviewWords.length > 0 ? (
            <button 
              className="btn" 
              style={{ 
                width: "100%", 
                padding: "16px 20px", 
                textAlign: "left", 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                borderRadius: "1.2rem", 
                fontSize: 15,
                background: "var(--sage)",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(148,161,135,.2)",
                border: "none",
                cursor: "pointer"
              }}
              onClick={() => onStartStudy("review", false)}
            >
              <div>
                <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 19, color: "#fff", fontWeight: 600 }}>
                  Повторить категорию ↺
                </div>
                <div style={{ fontSize: 12.5, opacity: .9, marginTop: 2, color: "#eee" }}>
                  {activeReviewWords.length} {activeReviewWords.length === 1 ? "слово ждёт" : activeReviewWords.length < 5 ? "слова ждут" : "слов ждут"} повторения
                </div>
              </div>
              <span style={{ fontSize: 22, opacity: .9 }}>↺</span>
            </button>
          ) : (
            <button 
              className="btn" 
              style={{ 
                width: "100%", 
                padding: "12px 18px", 
                textAlign: "left", 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                borderRadius: "1.2rem", 
                fontSize: 14,
                background: "rgba(0,0,0,0.02)",
                color: "var(--text-muted)",
                border: "1px dashed var(--border)",
                cursor: "pointer"
              }}
              onClick={() => setRecallInfo(r => !r)}
            >
              <div>
                <div style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>
                  {isCurrentActivePaused ? "Повторения на паузе ⏸️" : "Recall категории 🔒"}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, color: "var(--muted)" }}>
                  {isCurrentActivePaused
                    ? "Повторения выключены. Нажмите «Включить», чтобы возобновить."
                    : activeCatStats.learned === 0 
                      ? "Выучите новые слова этой категории" 
                      : unifiedNextMs !== null
                        ? `Все повторено! Приходите через ${formatTimeLeftPrecise(unifiedNextMs)}`
                        : "Все слова выучены! 🎉"
                  }
                </div>
              </div>
              <span style={{ fontSize: 18, opacity: .5 }}>🕒</span>
            </button>
          )}
        </div>

        {/* Notification for other categories that have due words for SRS repetition */}
        {otherCategoriesWithDue.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🔔</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--charcoal)" }}>
                  Пора повторить слова в других категориях:
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  Подошёл срок интервального повторения
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {otherCategoriesWithDue.map(item => (
                <div 
                  key={item.category.id} 
                  style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    padding: "10px 12px", 
                    background: "rgba(143,160,128,0.12)", 
                    border: "1px solid var(--sage)", 
                    borderRadius: 12 
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--charcoal)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.category.icon || "📁"} {item.category.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--sage)", fontWeight: 600 }}>
                      ⏰ {item.dueCount} {item.dueCount === 1 ? "слово ждёт" : item.dueCount < 5 ? "слова ждут" : "слов ждут"} повторения
                    </div>
                  </div>

                  <button 
                    className="btn btn-primary"
                    style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}
                    onClick={() => {
                      onSaveProgress({ ...stats, activeCategoryId: item.category.id });
                      onStartStudy("review", false);
                    }}
                  >
                    ↺ Повторить
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Global review fallback button if other categories have overdue words */}
        {globalReviewWords.length > activeReviewWords.length && otherCategoriesWithDue.length === 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed rgba(0,0,0,0.08)" }}>
            <button 
              className="btn btn-secondary" 
              style={{ 
                width: "100%", 
                padding: "10px 14px", 
                fontSize: 13, 
                color: "var(--terracotta)", 
                borderColor: "rgba(214,128,96,0.3)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8
              }}
              onClick={() => onStartStudy("review", true)}
            >
              🚨 Срочно повторить из всех категорий ({globalReviewWords.length} слов) →
            </button>
          </div>
        )}
      </div>

      {/* ⚠️ Очередь повторения переполнена */}
      {totalOverdueCount > 50 && (
        <div className="card fade-in" style={{ 
          marginBottom: 20, 
          padding: 16, 
          background: "rgba(181, 93, 76, 0.08)", 
          border: "1.5px solid rgba(181, 93, 76, 0.25)",
          borderRadius: "1.5rem"
        }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px 0", fontSize: 15, color: "var(--rose)", fontWeight: 600 }}>
            ⚠️ Очередь переполнена! ({totalOverdueCount} слов из 50)
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.4, margin: "0 0 12px 0" }}>
            В вашей очереди повторения скопилось слишком много слов. Рекомендуем разгрузить её, распределив излишек на ближайшие дни, чтобы заниматься комфортно.
          </p>
          
          {spreadSuccess ? (
            <div style={{ padding: "8px 12px", background: "rgba(143,160,128,0.15)", borderRadius: "12px", color: "var(--sage)", fontSize: 13, fontWeight: 500, textAlign: "center" }}>
              {spreadSuccess}
            </div>
          ) : showSpreadConfirm ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12.5, color: "var(--warm)", marginBottom: 4, lineHeight: 1.4 }}>
                Это автоматически перенесет <strong>{totalOverdueCount - 30} слов</strong> (все слова после первых 30) равномерно на следующие 1-3 дня. Вы уверены?
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1, padding: 8, fontSize: 12, background: "var(--rose)", border: "none" }}
                  onClick={executeSpreadSurplus}
                  disabled={isSpreading}
                >
                  {isSpreading ? "⏳ Распределяем..." : "Да, распределить"}
                </button>
                <button 
                  className="btn btn-outline" 
                  style={{ flex: 1, padding: 8, fontSize: 12 }}
                  onClick={() => setShowSpreadConfirm(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button 
              className="btn btn-outline" 
              style={{ width: "100%", padding: 10, fontSize: 13, borderColor: "rgba(181, 93, 76, 0.3)", color: "var(--rose)" }}
              onClick={() => setShowSpreadConfirm(true)}
              disabled={isSpreading}
            >
              🔄 Распределить излишек на 1-3 дня
            </button>
          )}
        </div>
      )}

      {/* ⏳ Срочное повторение сложных слов (1.5 часа) */}
      {earliestUrgent && activeReviewWords.length === 0 && (
        <div className="card fade-in" style={{ 
          marginBottom: 20, 
          padding: "12px 14px", 
          border: "1px dashed var(--border)",
          borderRadius: "1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>⏳</span> Ближайшее срочное повторение:
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--warm)" }}>
            {formatTimeLeft(getNextReviewTimeMs(earliestUrgent))} (всего: {urgentWaiting.length})
          </div>
        </div>
      )}

      {/* 🔴 Обязательное повторение в конце дня */}
      {mandatoryEndOfDayWords.length > 0 && (
        <div className="card fade-in" style={{ 
          marginBottom: 20, 
          padding: 16, 
          background: "rgba(124, 139, 114, 0.06)", 
          border: "1.5px solid rgba(124, 139, 114, 0.2)",
          borderRadius: "1.5rem"
        }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px 0", fontSize: 15, color: "var(--sage)", fontWeight: 600 }}>
            🔴 Обязательное повторение в конце дня ({mandatoryEndOfDayWords.length} слов)
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.4, margin: "0 0 12px 0" }}>
            Это слова, на которых вы споткнулись 3 или более раз за сегодняшнюю сессию. Закрепите их перед сном, чтобы они перешли в долгосрочную память!
          </p>
          <button 
            className="btn btn-primary" 
            style={{ width: "100%", padding: 12, fontSize: 13, background: "var(--rose)", border: "none", color: "#fff" }}
            onClick={() => onStartStudy("mandatory")}
          >
            🚀 Повторить сложные слова ({mandatoryEndOfDayWords.length}) →
          </button>
        </div>
      )}

      {/* 🎯 Мои цели и привычки */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 18px", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 16, fontWeight: 600, color: "var(--sage)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            🎯 Мои цели и привычки
          </h3>
          <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
            {activePreset.title}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 14 }}>
          Текущая неделя: с {new Date(weekStartMs).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} по {new Date(weekEndMs).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {activePreset.goals.map(goal => {
            let currentVal = 0;
            if (goal.type === "words") currentVal = wordsThisWeek;
            if (goal.type === "books") currentVal = booksThisWeek;
            if (goal.type === "streak") currentVal = activeDaysThisWeek;

            const percent = Math.min(Math.round((currentVal / goal.target) * 100), 100);
            const isCompleted = currentVal >= goal.target;

            return (
              <div key={goal.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                  <span style={{ fontWeight: 500, color: isCompleted ? "var(--sage)" : "var(--warm)" }}>
                    {goal.text} {isCompleted && "✅"}
                  </span>
                  <span style={{ color: "var(--muted)", fontWeight: 600 }}>
                    {currentVal}/{goal.target}
                  </span>
                </div>
                <div className="progress-bar" style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                  <div 
                    className="progress-fill" 
                    style={{ 
                      width: `${percent}%`,
                      background: isCompleted ? "var(--sage)" : "var(--rose)",
                      height: "100%",
                      transition: "width 0.3s ease",
                      borderRadius: 4
                    }} 
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🔮 Gemini AI Hub Banner */}
      <div 
        className="card fade-in animate-pulse-subtle" 
        style={{ 
          marginBottom: 16, 
          padding: "16px 20px", 
          background: "linear-gradient(135deg, rgba(143,160,128,0.12) 0%, rgba(214,128,96,0.12) 100%)", 
          border: "1.5px solid rgba(143,160,128,0.28)",
          borderRadius: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          boxShadow: "0 4px 15px rgba(0,0,0,0.02)"
        }}
        onClick={() => onNavigate("ai")}
      >
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🔮</span>
            <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 17, fontWeight: 600, color: "var(--sage)", margin: 0 }}>
              Gemini AI Hub
            </h3>
            <span style={{ fontSize: 9, background: "var(--rose)", color: "#fff", padding: "1px 6px", borderRadius: 10, fontWeight: "bold", textTransform: "uppercase" }}>New</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4, margin: 0 }}>
            Говорите голосом, общайтесь с ИИ-преподавателями, сканируйте фото текстов и учите новые слова!
          </p>
        </div>
        <div style={{ 
          background: "var(--sage)", 
          color: "#fff", 
          borderRadius: "50%", 
          width: 34, 
          height: 34, 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          fontWeight: "bold",
          fontSize: 16,
          boxShadow: "0 2px 6px rgba(143,160,128,0.3)",
          flexShrink: 0
        }}>
          →
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {menuItems.map(m => (
          <div key={m.v} className="menu-card" onClick={() => onNavigate(m.v)}>
            <div className="icon">{m.icon}</div>
            <div className="title">{m.title}</div>
            <div className="sub">{m.sub}</div>
          </div>
        ))}
      </div>

      <button className="btn btn-ghost" style={{ width: "100%", padding: 12, fontSize: 13 }} onClick={() => onNavigate("settings")}>
        ⚙️ Настройки и синхронизация
      </button>
    </div>
  );
}
