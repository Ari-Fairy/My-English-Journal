import { useState } from "react";
import { Word, UserProgress } from "../types";
import { getLocalDateString, getCurrentWeekKey, getReviewCooldownStatus, getEffectiveDueWords } from "../utils";

const getWeeklyPreset = (weekKey: string) => {
  let hash = 0;
  for (let i = 0; i < weekKey.length; i++) {
    hash += weekKey.charCodeAt(i);
  }
  const index = hash % 4;

  const presets = [
    {
      title: "📚 Интенсивное накопление",
      goals: [
        { id: "words", text: "📚 Выучить 100 слов за неделю", target: 100, type: "words" },
        { id: "books", text: "📖 Прочитать хотя бы 5 книг в разделе Чтение за неделю", target: 5, type: "books" },
        { id: "streak", text: "🔥 Заниматься 3 дня подряд", target: 3, type: "streak" }
      ]
    },
    {
      title: "📖 Читательский вызов",
      goals: [
        { id: "words", text: "📚 Выучить 10 слов за неделю", target: 10, type: "words" },
        { id: "books", text: "📖 Прочитать 2 книги в Чтении", target: 2, type: "books" },
        { id: "streak", text: "🔥 Заниматься 5 дней подряд", target: 5, type: "streak" }
      ]
    },
    {
      title: "🚀 Лингвистический спринт",
      goals: [
        { id: "words", text: "📚 Выучить 20 слов за неделю", target: 20, type: "words" },
        { id: "books", text: "📖 Прочитать 3 книги в Чтении", target: 3, type: "books" },
        { id: "streak", text: "🔥 Заниматься 7 дней подряд", target: 7, type: "streak" }
      ]
    },
    {
      title: "🧘🏽 Стабильный темп",
      goals: [
        { id: "words", text: "📚 Выучить 8 слов за неделю", target: 8, type: "words" },
        { id: "books", text: "📖 Прочитать хотя бы 1 книгу в разделе Чтение", target: 1, type: "books" },
        { id: "streak", text: "🔥 Заниматься 4 дня подряд", target: 4, type: "streak" }
      ]
    }
  ];

  return presets[index];
};

interface HomePageProps {
  words: Word[];
  stats: UserProgress;
  onNavigate: (view: "home" | "study" | "words" | "add" | "irregular" | "reader" | "stats" | "achievements" | "settings") => void;
  onStartStudy: (sessionType: "learn" | "review") => void;
}

export default function HomePage({ words, stats, onNavigate, onStartStudy }: HomePageProps) {
  const [recallInfo, setRecallInfo] = useState(false);

  const learnedCount = words.filter(w => w.learned).length;
  const today = getLocalDateString();
  const todayLearned = words.filter(w => w.learnedDate === today).length;
  const wordsThisWeek = words.filter(w => w.learned && w.learnedDate && (Date.now() - new Date(w.learnedDate).getTime() <= 7 * 24 * 3600 * 1000)).length;
  const newWords = words.filter(w => !w.learned);

  const weekKey = getCurrentWeekKey();
  const activePreset = getWeeklyPreset(weekKey);

  const booksThisWeek = Object.entries(stats.dailyBooksRead || {}).reduce((count, [dateStr, levels]) => {
    try {
      const diffTime = Date.now() - new Date(dateStr).getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      if (diffDays <= 7 && levels && Array.isArray(levels)) {
        return count + levels.length;
      }
    } catch (e) {
      console.error(e);
    }
    return count;
  }, 0);

  const getNextReviewTimeMs = (w: Word) => {
    if (!w.learned) return Infinity;
    if (w.streak >= 10) return Infinity; // Полностью усвоено навсегда - больше не повторяем!
    const now = Date.now();
    const learnedAt = w.learnedDate ? new Date(w.learnedDate).getTime() : now;
    const lastRev = w.lastReviewed ? new Date(w.lastReviewed).getTime() : learnedAt;
    const iv = [0.33, 1, 4, 12, 24, 48, 96, 168, 336]; 
    const hours = iv[Math.min(Math.max((w.streak || 1) - 1, 0), iv.length - 1)] || 24;
    const due = lastRev + (hours * 3600 * 1000);
    return Math.max(0, due - now);
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

  const cooldownStatus = getReviewCooldownStatus(stats);
  const { dueWords: reviewWords, totalOverdueCount } = getEffectiveDueWords(words, stats);
  const upcoming = learnedCount > 0 && reviewWords.length === 0 
    ? words.filter(w => w.learned && getNextReviewTimeMs(w) > 0).sort((a, b) => getNextReviewTimeMs(a) - getNextReviewTimeMs(b))[0] 
    : null;

  const getUnifiedNextReviewTimeMs = () => {
    // 1. Check if we are still within the 20-minute cooldown from the last session
    const lastSession = stats.lastReviewSessionTime || 0;
    const now = Date.now();
    const cooldownMs = 20 * 60 * 1000;
    const timeSinceLastSession = now - lastSession;
    
    // 2. Find standard next review time for any uncompleted learned words
    const uncompletedWords = words.filter(w => w.learned && (w.streak || 0) < 10);
    if (uncompletedWords.length === 0) return null;
    
    const standardNextReviewTimes = uncompletedWords.map(w => getNextReviewTimeMs(w));
    const minStandardMs = Math.min(...standardNextReviewTimes);
    
    if (minStandardMs === Infinity || isNaN(minStandardMs)) return null;
    
    if (timeSinceLastSession < cooldownMs) {
      // Return the remainder of the 20-minute cooldown
      return cooldownMs - timeSinceLastSession;
    }
    
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
            background: cooldownStatus.active ? "var(--border)" : "var(--sage)",
            color: cooldownStatus.active ? "var(--muted)" : "#fff",
            boxShadow: cooldownStatus.active ? "none" : "0 4px 12px rgba(148,161,135,.2)",
            border: "none",
            cursor: "pointer"
          }}
          onClick={() => {
            if (reviewWords.length > 0 && !cooldownStatus.active) {
              onStartStudy("review");
            } else {
              setRecallInfo(r => !r);
            }
          }}
        >
          <div>
            <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 19, color: cooldownStatus.active ? "var(--muted)" : "#fff", fontWeight: 600 }}>
              {cooldownStatus.active ? "Recall ⏳ Перерыв" : reviewWords.length > 0 ? "Recall ✨" : "Recall"}
            </div>
            <div style={{ fontSize: 12, opacity: .9, marginTop: 2, color: cooldownStatus.active ? "var(--muted)" : "#eee" }}>
              {learnedCount === 0 
                ? "Сначала выучи слова 📚" 
                : cooldownStatus.active 
                  ? `Доступно через ${formatTimeLeft(cooldownStatus.timeLeftMs)}${totalOverdueCount > 0 ? ` · ${totalOverdueCount} в очереди` : ""}`
                  : reviewWords.length > 0 
                    ? totalOverdueCount > reviewWords.length
                      ? `${reviewWords.length} слов доступны (всего ${totalOverdueCount}) ⚡`
                      : `${reviewWords.length} слов ждут повторения` 
                    : `Все ${learnedCount} слов повторены! См. график 📅`
              }
            </div>
          </div>
          <span style={{ fontSize: 22, opacity: .9, color: cooldownStatus.active ? "var(--muted)" : "#fff" }}>
            {cooldownStatus.active ? "⏳" : "↺"}
          </span>
        </button>

        {recallInfo && (
          <div className="card fade-in" style={{ marginTop: 8, padding: 14, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--sage)" }}>
              {learnedCount === 0 ? "📝 Как начать повторение" : cooldownStatus.active ? "🧠 Время для отдыха" : "📅 Расписание повторений"}
            </div>
            {learnedCount === 0 ? (
              <p style={{ color: "var(--warm)", lineHeight: 1.4, margin: 0 }}>
                У вас пока нет выученных слов. Нажмите на кнопку <strong>Study</strong> выше или добавьте слова в разделе <strong>Dictionary</strong>, чтобы начать обучение! 🚀
              </p>
            ) : cooldownStatus.active ? (
              <div>
                <p style={{ color: "var(--warm)", lineHeight: 1.4, margin: "0" }}>
                  Мы убрали длинный 4-часовой перерыв и внедрили систему умных микро-порций! Теперь слова подаются небольшими группами максимум по 15 штук с минимальным интервалом отдыха 20 минут. Это позволяет комфортно повторять язык без перегрузки и предотвращает накопление огромной очереди.
                </p>
                <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Минимальный перерыв</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--rose)", marginTop: 4 }}>
                    ⏳ {formatTimeLeft(cooldownStatus.timeLeftMs)}
                  </div>
                </div>
              </div>
            ) : reviewWords.length > 0 ? (
              <div>
                <p style={{ color: "var(--warm)", lineHeight: 1.4, margin: "0 0 10px 0" }}>
                  Слова готовы к повторению! Нажмите на кнопку <strong>Recall</strong> выше, чтобы начать сессию.
                </p>
                {totalOverdueCount > reviewWords.length && (
                  <p style={{ color: "var(--muted)", lineHeight: 1.4, margin: 0, fontSize: 12 }}>
                    💡 Всего слов на повторение в очереди: {totalOverdueCount}. Текущая порция ограничена до 15 слов, чтобы избежать переутомления.
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
                      🕒 {formatTimeLeft(unifiedNextMs)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                      (системные тайминги оптимизированы, минимальный интервал — 20 минут)
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🎯 Мои цели и привычки */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 18px", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 16, fontWeight: 600, color: "var(--sage)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            🎯 Мои цели и привычки
          </h3>
          <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
            {activePreset.title}
          </span>
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
