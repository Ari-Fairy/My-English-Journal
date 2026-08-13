import React, { useState, useMemo } from "react";
import { Word, UserProgress } from "../types";
import { TOPICS_DEFAULT } from "../data";
import { getDefaultCategories, getCategoryStats } from "../categories";

interface StatsScreenProps {
  words: Word[];
  stats: UserProgress;
  onBack: () => void;
}

export default function StatsScreen({ words, stats, onBack }: StatsScreenProps) {
  const [activeTab, setActiveTab] = useState<"categories" | "topics">("categories");

  const categories = useMemo(() => {
    return stats.categories && stats.categories.length > 0
      ? stats.categories
      : getDefaultCategories(stats.userId || "guest");
  }, [stats.categories, stats.userId]);

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

  const deletedTopics = stats.deletedTopics || [];
  const allTopics: { [key: string]: string } = {};
  Object.entries(TOPICS_DEFAULT).forEach(([k, v]) => {
    if (!deletedTopics.includes(k)) {
      allTopics[k] = v;
    }
  });
  Object.entries(stats.customTopics || {}).forEach(([k, v]) => {
    allTopics[k] = v;
  });

  // Top categories
  const topCategories = useMemo(() => {
    return categories.filter(c => !c.parentId && !c.archived);
  }, [categories]);

  return (
    <div className="fade-in stats-container">
      <button className="back-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Назад</button>
      <h2 className="section-title" style={{ marginBottom: 16 }}>📊 Статистика и аналитика</h2>

      {/* Overview Stat Boxes */}
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

      {/* Global Dictionary Progress Bar */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          <span>Общий прогресс словаря</span>
          <span>{learnedCount} из {words.length} слов ({words.length ? Math.round((learnedCount / words.length) * 100) : 0}%)</span>
        </div>
        <div className="progress-bar" style={{ height: 10 }}>
          <div className="progress-fill" style={{ width: words.length ? `${(learnedCount / words.length) * 100}%` : "0%", background: "var(--lavender)", height: "100%" }} />
        </div>
      </div>

      {/* 14 Days Bar Chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>📈 Активность за 14 дней</h3>
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
          <span style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--rose)", borderRadius: 2 }} /> новые слова
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--sage)", borderRadius: 2 }} /> повторение
          </span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          className={`btn ${activeTab === "categories" ? "btn-primary" : "btn-secondary"}`}
          style={{ flex: 1, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}
          onClick={() => setActiveTab("categories")}
        >
          📂 По категориям
        </button>
        <button
          className={`btn ${activeTab === "topics" ? "btn-primary" : "btn-secondary"}`}
          style={{ flex: 1, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}
          onClick={() => setActiveTab("topics")}
        >
          🏷️ По темам
        </button>
      </div>

      {/* Tab 1: Categories & Subcategories Progress */}
      {activeTab === "categories" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {topCategories.map(topCat => {
            const topStats = getCategoryStats(words, topCat.id, categories);
            const subCategories = categories.filter(c => c.parentId === topCat.id && !c.archived);

            return (
              <div key={topCat.id} className="card" style={{ border: "1px solid var(--border)", marginBottom: 0 }}>
                {/* Main Category Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 17 }}>{topCat.icon || "📁"}</span>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--charcoal)" }}>
                        {topCat.name}
                      </h3>
                      {subCategories.length > 0 && (
                        <span style={{ fontSize: 10.5, color: "var(--muted)" }}>
                          {subCategories.length} подкатегорий
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--sage)" }}>
                      {topStats.learned} / {topStats.total} слов
                    </span>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>
                      {topStats.percent}%
                    </div>
                  </div>
                </div>

                {/* Main Category Overall Progress Bar */}
                <div className="progress-bar" style={{ height: 6, marginBottom: subCategories.length > 0 ? 10 : 0 }}>
                  <div 
                    className="progress-fill" 
                    style={{ 
                      width: `${topStats.percent}%`, 
                      background: topStats.percent === 100 ? "var(--sage)" : "var(--rose)", 
                      height: "100%",
                      borderRadius: 3 
                    }} 
                  />
                </div>

                {/* Subcategories Breakdown */}
                {subCategories.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                    {subCategories.map(subCat => {
                      const subStats = getCategoryStats(words, subCat.id, categories);

                      return (
                        <div 
                          key={subCat.id} 
                          style={{ 
                            padding: "6px 8px", 
                            background: "var(--sand-light)", 
                            borderRadius: 8, 
                            border: "1px solid var(--border)" 
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--charcoal)", display: "flex", alignItems: "center", gap: 5 }}>
                              <span>{subCat.icon || "📖"}</span>
                              {subCat.name}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              {subStats.dueForReview > 0 && (
                                <span style={{ fontSize: 9.5, padding: "1px 5px", background: "rgba(214,128,96,0.15)", color: "var(--terracotta)", borderRadius: 5, fontWeight: 700 }}>
                                  ↺ {subStats.dueForReview}
                                </span>
                              )}
                              {subStats.total > 0 && subStats.percent === 100 && (
                                <span style={{ fontSize: 9.5, padding: "1px 5px", background: "rgba(143,160,128,0.18)", color: "var(--sage)", borderRadius: 5, fontWeight: 700 }}>
                                  ✅ Выучено
                                </span>
                              )}
                              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>
                                {subStats.learned}/{subStats.total} ({subStats.percent}%)
                              </span>
                            </div>
                          </div>

                          <div className="progress-bar" style={{ height: 5, background: "rgba(0,0,0,0.05)" }}>
                            <div 
                              className="progress-fill" 
                              style={{ 
                                width: `${subStats.percent}%`, 
                                background: subStats.percent === 100 ? "var(--sage)" : "var(--lavender)", 
                                height: "100%",
                                borderRadius: 3 
                              }} 
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Topics Progress */}
      {activeTab === "topics" && (
        <div className="card">
          <h3 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>🏷️ Прогресс по темам</h3>
          {Object.keys(byTopic).length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", textAlign: "center", margin: "12px 0" }}>
              Слова пока не разделены по темам.
            </p>
          ) : (
            Object.entries(byTopic).map(([t, v]) => {
              const topicPercent = v.total > 0 ? Math.round((v.learned / v.total) * 100) : 0;
              return (
                <div key={t} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: "var(--charcoal)" }}>{allTopics[t] || t}</span>
                    <span style={{ color: "var(--muted)", fontWeight: 600 }}>{v.learned} / {v.total} слов ({topicPercent}%)</span>
                  </div>
                  <div className="progress-bar" style={{ height: 5 }}>
                    <div className="progress-fill" style={{ width: `${topicPercent}%`, background: topicPercent === 100 ? "var(--sage)" : "var(--lavender)", height: "100%" }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
