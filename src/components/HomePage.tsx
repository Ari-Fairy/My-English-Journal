import { useState, useEffect } from "react";
import { Word, UserProgress } from "../types";
import { getLocalDateString, getReviewCooldownStatus, getEffectiveDueWords, getWordNextReviewTimeMs } from "../utils";

const getWeeklyPreset = (index: number) => {
  const presets = [
    {
      title: "📚 Интенсивное накопление",
      goals: [
        { id: "words", text: "📚 Выучить 100 слов за неделю", target: 100, type: "words" },
        { id: "books", text: "📖 Прочитать 10 глав или книг за неделю", target: 10, type: "books" },
        { id: "streak", text: "🔥 Заниматься 3 дня подряд", target: 3, type: "streak" }
      ]
    },
    {
      title: "📖 Читательский вызов",
      goals: [
        { id: "words", text: "📚 Выучить 150 слов за неделю", target: 150, type: "words" },
        { id: "books", text: "📖 Прочитать 15 глав или книг за неделю", target: 15, type: "books" },
        { id: "streak", text: "🔥 Заниматься 5 дней подряд", target: 5, type: "streak" }
      ]
    },
    {
      title: "🚀 Лингвистический спринт",
      goals: [
        { id: "words", text: "📚 Выучить 200 слов за неделю", target: 200, type: "words" },
        { id: "books", text: "📖 Прочитать 12 глав или книг за неделю", target: 12, type: "books" },
        { id: "streak", text: "🔥 Заниматься 7 дней подряд", target: 7, type: "streak" }
      ]
    },
    {
      title: "🧘🏽 Стабильный темп",
      goals: [
        { id: "words", text: "📚 Выучить 120 слов за неделю", target: 120, type: "words" },
        { id: "books", text: "📖 Прочитать 5 глав или книг за неделю", target: 5, type: "books" },
        { id: "streak", text: "🔥 Заниматься 4 дня подряд", target: 4, type: "streak" }
      ]
    }
  ];

  return presets[index % presets.length];
};

interface HomePageProps {
  words: Word[];
  stats: UserProgress;
  onNavigate: (view: "home" | "study" | "words" | "add" | "irregular" | "reader" | "stats" | "achievements" | "settings") => void;
  onStartStudy: (sessionType: "learn" | "review" | "mandatory") => void;
  onSaveWord: (word: Word) => void;
  onSaveWords: (words: Word[]) => void;
  onSaveProgress: (stats: UserProgress) => void;
}

export default function HomePage({ words, stats, onNavigate, onStartStudy, onSaveWord, onSaveWords, onSaveProgress }: HomePageProps) {
  const [recallInfo, setRecallInfo] = useState(false);
  const [isSpreading, setIsSpreading] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 5000); // Update timer display every 5 seconds for great real-time precision!
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

  const newWords = words.filter(w => !w.learned);

  const activePreset = getWeeklyPreset(currentWeekIndex);

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

  const cooldownStatus = getReviewCooldownStatus(stats);
  const { dueWords: reviewWords, totalOverdueCount, allDueWordsSorted } = getEffectiveDueWords(words, stats);
  
  // Find any urgent 15-minute words that are waiting for their cooldown to expire
  const urgentWaiting = words.filter(w => w.learned && w.intervalMinutes === 15 && getNextReviewTimeMs(w) > 0);
  const earliestUrgent = urgentWaiting.sort((a, b) => getNextReviewTimeMs(a) - getNextReviewTimeMs(b))[0];

  // Find mandatory end-of-day repetitions
  const mandatoryEndOfDayWords = words.filter(w => w.learned && w.isMandatoryEndOfDay);

  const handleSpreadSurplus = () => {
    if (totalOverdueCount <= 50 || isSpreading) return;
    const ok = confirm(`Очередь переполнена (${totalOverdueCount} слов)! Вы хотите автоматически распределить излишек (все слова после первых 30) равномерно на следующие 1-3 дня?`);
    if (!ok) return;

    setIsSpreading(true);
    try {
      // Оставляем топ-30 слов, остальные распределяем на 1-3 дня вперед в одном батче
      const surplus = allDueWordsSorted.slice(30);
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
      alert(`🎉 Успешно распределено ${surplus.length} слов излишка на следующие 1-3 дня!`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSpreading(false);
    }
  };

  const upcoming = learnedCount > 0 && reviewWords.length === 0 
    ? words.filter(w => w.learned && getNextReviewTimeMs(w) > 0).sort((a, b) => getNextReviewTimeMs(a) - getNextReviewTimeMs(b))[0] 
    : null;

  const getUnifiedNextReviewTimeMs = () => {
    // Find standard next review time for any uncompleted learned words
    const uncompletedWords = words.filter(w => w.learned && (w.streak || 0) < 10);
    if (uncompletedWords.length === 0) return null;
    
    const standardNextReviewTimes = uncompletedWords.map(w => getNextReviewTimeMs(w));
    const minStandardMs = Math.min(...standardNextReviewTimes);
    
    if (minStandardMs === Infinity || isNaN(minStandardMs)) return null;
    return minStandardMs;
  };
  
  const unifiedNextMs = getUnifiedNextReviewTimeMs();

  const recallActive = reviewWords.length > 0;
  const unlockedAchievementsCount = (stats.achievements || []).length;

  const menuItems = [
    { icon: "📖", title: "Dictionary", sub: "Словарь", v: "words" as const },
    { icon: "✨", title: "Add Word", sub: "Добавить", v: "add" as const },
    { icon: "📝", title: "Verbs", sub: "Глаголы", v: "irregular" as const },
    { icon: "📚", title: "Reading", sub: "Чтение книг", v: "reader" as const },
    { icon: "📈", title: "Insights", sub: "Статистика", v: "stats" as const },
    { icon: "🏅", title: "Achievements", sub: `${unlockedAchievementsCount} разблок.`, v: "achievements" as const },
  ];

  return (
    <div className="fade-in">
      <div style={{ textAlign: "center", paddingTop: 12, paddingBottom: 20 }}>
        <h1 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 30, color: "var(--warm)" }}>
          My English Journal
        </h1>
        <p className="sub-text" style={{ color: "var(--sage)", marginTop: 5 }}>
          {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
        </p>
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

      <div style={{ marginBottom: 20 }}>
        <button 
          className="btn btn-primary" 
          style={{ 
            width: "100%", 
            padding: "16px 20px", 
            textAlign: "left", 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            borderRadius: "1.5rem", 
            fontSize: 15, 
            marginBottom: 10, 
            cursor: "pointer" 
          }}
          onClick={() => onStartStudy("learn")} 
        >
          <div>
            <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 19, color: "#fff", fontWeight: 600 }}>Study ✨</div>
            <div style={{ fontSize: 12, opacity: .9, marginTop: 2, color: "#eee" }}>Новые слова для изучения — {newWords.length}</div>
          </div>
          <span style={{ fontSize: 22, opacity: .8 }}>→</span>
        </button>

        {reviewWords.length > 0 ? (
          <button 
            className="btn" 
            style={{ 
              width: "100%", 
              padding: "16px 20px", 
              textAlign: "left", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              borderRadius: "1.5rem", 
              fontSize: 15,
              background: "var(--sage)",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(148,161,135,.2)",
              border: "none",
              cursor: "pointer"
            }}
            onClick={() => onStartStudy("review")}
          >
            <div>
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 19, color: "#fff", fontWeight: 600 }}>
                Recall ✨
              </div>
              <div style={{ fontSize: 12, opacity: .9, marginTop: 2, color: "#eee" }}>
                {totalOverdueCount > reviewWords.length
                  ? `${reviewWords.length} слов доступны (всего ${totalOverdueCount}) ⚡`
                  : `${reviewWords.length} слов ждут повторения` 
                }
              </div>
            </div>
            <span style={{ fontSize: 22, opacity: .9, color: "#fff" }}>
              ↺
            </span>
          </button>
        ) : (
          <button 
            className="btn" 
            style={{ 
              width: "100%", 
              padding: "16px 20px", 
              textAlign: "left", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              borderRadius: "1.5rem", 
              fontSize: 15,
              background: "rgba(255,255,255,0.03)",
              color: "var(--text-muted)",
              border: "1px dashed var(--border)",
              boxShadow: "none",
              cursor: "pointer"
            }}
            onClick={() => setRecallInfo(r => !r)}
          >
            <div>
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 19, color: "var(--muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                Recall 🔒
              </div>
              <div style={{ fontSize: 12, marginTop: 2, color: "var(--muted)" }}>
                {learnedCount === 0 
                  ? "Сначала выучи слова в разделе Study 📚" 
                  : unifiedNextMs !== null
                    ? `Все повторено! Приходи через ${formatTimeLeftPrecise(unifiedNextMs)} 🕒`
                    : "Все слова выучены навсегда! 🎉"
                }
              </div>
            </div>
            <span style={{ fontSize: 22, opacity: .5, color: "var(--muted)" }}>
              🕒
            </span>
          </button>
        )}

        {recallInfo && (
          <div className="card fade-in" style={{ marginTop: 8, padding: 14, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--sage)" }}>
              {learnedCount === 0 ? "📝 Как начать повторение" : "📅 Расписание повторений"}
            </div>
            {learnedCount === 0 ? (
              <p style={{ color: "var(--warm)", lineHeight: 1.4, margin: 0 }}>
                У вас пока нет выученных слов. Нажмите на кнопку <strong>Study</strong> выше или добавьте слова в разделе <strong>Dictionary</strong>, чтобы начать обучение! 🚀
              </p>
            ) : reviewWords.length > 0 ? (
              <div>
                <p style={{ color: "var(--warm)", lineHeight: 1.4, margin: "0 0 10px 0" }}>
                  Слова готовы к повторению! Нажмите на кнопку <strong>Recall</strong> выше, чтобы начать сессию.
                </p>
                {totalOverdueCount > reviewWords.length && (
                  <p style={{ color: "var(--muted)", lineHeight: 1.4, margin: 0, fontSize: 12 }}>
                    💡 Всего слов на повторение в очереди: {totalOverdueCount}. Текущая порция ограничена до {reviewWords.length} слов, чтобы избежать переутомления.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p style={{ color: "var(--warm)", lineHeight: 1.4, margin: "0 0 12px 0" }}>
                  Отличная работа! Все доступные слова уже повторены.
                </p>
                {unifiedNextMs !== null && (
                  <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Единое время возвращения</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--sage)", marginTop: 4 }}>
                      🕒 {formatTimeLeftPrecise(unifiedNextMs)}
                    </div>
                  </div>
                )}
              </div>
            )}
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
          <button 
            className="btn btn-outline" 
            style={{ width: "100%", padding: 10, fontSize: 13, borderColor: "rgba(181, 93, 76, 0.3)", color: "var(--rose)" }}
            onClick={handleSpreadSurplus}
            disabled={isSpreading}
          >
            {isSpreading ? "⏳ Распределение..." : "🔄 Распределить излишек на 1-3 дня"}
          </button>
        </div>
      )}

      {/* ⏳ Срочное повторение (15-минутный интервал) */}
      {earliestUrgent && reviewWords.length === 0 && (
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
          Текущая неделя: с {new Date(weekStartMs).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} по {new Date(weekEndMs).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} (расчёт с вашего первого дня занятий)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {activePreset.goals.map(goal => {
            let currentVal = 0;
            if (goal.type === "words") currentVal = wordsThisWeek;
            if (goal.type === "books") currentVal = booksThisWeek;
            if (goal.type === "streak") currentVal = stats.streak || 0;

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
