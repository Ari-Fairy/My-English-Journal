import { useMemo } from "react";
import { Word, UserProgress } from "../types";
import { TOPICS_DEFAULT } from "../data";

interface StatsScreenProps {
  words: Word[];
  stats: UserProgress;
  onBack: () => void;
}

export default function StatsScreen({ words, stats, onBack }: StatsScreenProps) {
  const learnedCount = words.filter(w => w.learned).length;

  // Calculate global accuracy
  const totalCorrect = Object.values(stats.daily || {}).reduce((s, d) => s + (d.correct || 0), 0);
  const totalWrong = Object.values(stats.daily || {}).reduce((s, d) => s + (d.wrong || 0), 0);
  const accuracy = totalCorrect + totalWrong === 0 ? 0 : Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100);

  // Generate last 14 days list for charts
  const last14 = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const ds = `${year}-${month}-${day}`;
      
      const s = stats.daily?.[ds] || { learned: 0, reviewed: 0 };
      list.push({
        date: ds.slice(8), // Just Day portion
        learned: s.learned || 0,
        reviewed: s.reviewed || 0
      });
    }
    return list;
  }, [stats.daily]);

  const maxActivity = Math.max(1, ...last14.map(d => d.learned + d.reviewed));

  // Compute stats per topic
  const byTopic: { [key: string]: { total: number; learned: number } } = {};
  words.forEach(w => {
    if (!byTopic[w.topic]) {
      byTopic[w.topic] = { total: 0, learned: 0 };
    }
    byTopic[w.topic]!.total++;
    if (w.learned) {
      byTopic[w.topic]!.learned++;
    }
  });

  const allTopics = { ...TOPICS_DEFAULT, ...(stats.customTopics || {}) };

  return (
    <div className="fade-in">
      <button className="back-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Назад</button>
      <h2 className="section-title" style={{ marginBottom: 16 }}>Статистика и аналитика</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[
          { n: learnedCount, l: "выучено слов", c: "var(--rose)" },
          { n: `${accuracy}%`, l: "точность ответов", c: "var(--sage)" },
          { n: `${stats.streak || 0}🔥`, l: "серия дней", c: "var(--lavender)" },
          { n: Object.keys(stats.daily || {}).length, l: "активных дней", c: "var(--warm)" }
        ].map((s, i) => (
          <div key={i} className="card stat-box">
            <div className="stat-num" style={{ color: s.c }}>{s.n}</div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
          <span>Общий прогресс словаря</span>
          <span>{learnedCount} / {words.length}</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: words.length ? `${(learnedCount / words.length) * 100}%` : "0%", background: "var(--lavender)" }} />
        </div>
      </div>

      {/* 14 Days Bar Chart */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Активность за 14 дней</h3>
        <div className="chart-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          {last14.map(d => {
            const total = d.learned + d.reviewed;
            const learnedPercent = total > 0 ? (d.learned / total) * 100 : 0;
            const reviewedPercent = total > 0 ? (d.reviewed / total) * 100 : 0;
            const barHeight = `${(total / maxActivity) * 100}%`;

            return (
              <div key={d.date} className="chart-col" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ height: 80, width: "100%", display: "flex", flexDirection: "column-reverse", justifyContent: "flex-start", alignItems: "center" }}>
                  <div style={{ height: barHeight, width: 12, display: "flex", flexDirection: "column-reverse", borderRadius: 4, overflow: "hidden", background: "rgba(0,0,0,0.05)" }}>
                    <div style={{ height: `${reviewedPercent}%`, background: "var(--sage)" }} />
                    <div style={{ height: `${learnedPercent}%`, background: "var(--rose)" }} />
                  </div>
                </div>
                <div className="chart-label" style={{ fontSize: 9, marginTop: 4 }}>{d.date}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <span style={{ fontSize: 11, color: "#aaa", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--rose)", borderRadius: 2 }} /> новые слова
          </span>
          <span style={{ fontSize: 11, color: "#aaa", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--sage)", borderRadius: 2 }} /> повторение
          </span>
        </div>
      </div>

      {/* Progress per Topic */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>По темам</h3>
        {Object.entries(byTopic).map(([t, v]) => (
          <div key={t} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>{allTopics[t] || t}</span>
              <span style={{ color: "#aaa" }}>{v.learned} / {v.total}</span>
            </div>
            <div className="progress-bar" style={{ marginTop: 4 }}>
              <div className="progress-fill" style={{ width: `${(v.learned / v.total) * 100}%`, background: "var(--lavender)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
