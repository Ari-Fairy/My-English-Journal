import { useState } from "react";
import { Word, UserProgress } from "../types";
import { getLocalDateString } from "../utils";

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
  const newWords = words.filter(w => !w.learned);

  const getNextReviewTimeMs = (w: Word) => {
    if (!w.learned) return Infinity;
    const now = Date.now();
    const learnedAt = w.learnedDate ? new Date(w.learnedDate).getTime() : now;
    const lastRev = w.lastReviewed ? new Date(w.lastReviewed).getTime() : learnedAt;
    const iv = [24, 48, 96, 168, 336, 720]; // Review intervals in hours
    const hours = iv[Math.min(Math.max((w.streak || 1) - 1, 0), iv.length - 1)] || 24;
    const due = lastRev + (hours * 3600 * 1000);
    return Math.max(0, due - now);
  };

  const formatTimeLeft = (ms: number) => {
    if (ms <= 0) return "сейчас";
    const h = Math.ceil(ms / 3600000);
    if (h < 24) return `через ${h} ч`;
    return `через ${Math.ceil(h / 24)} дн`;
  };

  const reviewWords = words.filter(w => w.learned && getNextReviewTimeMs(w) === 0);
  const upcoming = learnedCount > 0 && reviewWords.length === 0 
    ? words.filter(w => w.learned && getNextReviewTimeMs(w) > 0).sort((a, b) => getNextReviewTimeMs(a) - getNextReviewTimeMs(b))[0] 
    : null;

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
          style={{ width: "100%", padding: "18px 22px", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "1.75rem", fontSize: 15, marginBottom: 10 }}
          onClick={() => onStartStudy("learn")} 
          disabled={newWords.length === 0}
        >
          <div>
            <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 20, color: "#fff" }}>Study</div>
            <div style={{ fontSize: 13, opacity: .9 }}>Новые слова — {newWords.length}</div>
          </div>
          <span style={{ fontSize: 24, opacity: .8 }}>→</span>
        </button>

        <button 
          className="btn" 
          style={{ 
            width: "100%", 
            padding: "18px 22px", 
            textAlign: "left", 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            borderRadius: "1.75rem", 
            fontSize: 15,
            background: reviewWords.length > 0 ? "var(--sage)" : learnedCount > 0 ? "rgba(148,161,135,.15)" : "rgba(180,180,180,.14)",
            color: reviewWords.length > 0 ? "#fff" : learnedCount > 0 ? "var(--warm)" : "#aaa",
            boxShadow: reviewWords.length > 0 ? "0 4px 14px rgba(148,161,135,.3)" : "none",
            border: reviewWords.length > 0 ? "none" : learnedCount > 0 ? "1.5px solid var(--sage)" : "1.5px dashed rgba(180,180,180,.3)",
            cursor: learnedCount > 0 ? "pointer" : "default"
          }}
          onClick={() => {
            if (reviewWords.length > 0) {
              onStartStudy("review");
            } else if (learnedCount > 0) {
              setRecallInfo(r => !r);
            }
          }}
        >
          <div>
            <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 20 }}>
              {reviewWords.length > 0 ? "Recall ✨" : "Recall"}
            </div>
            <div style={{ fontSize: 13, opacity: .85, marginTop: 2 }}>
              {learnedCount === 0 
                ? "Сначала выучи слова 📚" 
                : reviewWords.length > 0 
                  ? `${reviewWords.length} слов ждут` 
                  : `Все ${learnedCount} слов повторены! См. график 📅`
              }
            </div>
          </div>
          <span style={{ fontSize: 24, opacity: (reviewWords.length > 0 || learnedCount > 0) ? .8 : .3 }}>↺</span>
        </button>

        {recallInfo && reviewWords.length === 0 && learnedCount > 0 && (
          <div className="card fade-in" style={{ marginTop: 8, padding: 14, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--sage)" }}>📅 Расписание повторений</div>
            {words.filter(w => w.learned).sort((a, b) => getNextReviewTimeMs(a) - getNextReviewTimeMs(b)).slice(0, 5).map(w => (
              <div key={w.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontWeight: 500 }}>{w.en}</span>
                <span style={{ color: "var(--muted)" }}>{formatTimeLeft(getNextReviewTimeMs(w))}</span>
              </div>
            ))}
          </div>
        )}
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
