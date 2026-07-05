import { UserProgress } from "../types";
import { ACHIEVEMENTS_DEF } from "../data";

interface AchievementsScreenProps {
  stats: UserProgress;
  onBack: () => void;
}

export default function AchievementsScreen({ stats, onBack }: AchievementsScreenProps) {
  const unlocked = stats.achievements || [];

  return (
    <div className="fade-in">
      <button className="back-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Назад</button>
      <h2 className="section-title" style={{ marginBottom: 4 }}>Достижения</h2>
      <p style={{ fontSize: 13, color: "#aaa", marginBottom: 20 }}>
        Разблокировано: {unlocked.length} / {ACHIEVEMENTS_DEF.length}
      </p>

      {ACHIEVEMENTS_DEF.map(ach => {
        const isUnlocked = unlocked.includes(ach.id);
        return (
          <div key={ach.id} className={`ach-card ${isUnlocked ? "unlocked" : "locked"}`}>
            <div className="ach-icon">{isUnlocked ? ach.icon : "🔒"}</div>
            <div>
              <div className="ach-title">{ach.title}</div>
              <div className="ach-desc">{ach.desc}</div>
            </div>
            {isUnlocked && (
              <span className="badge badge-green" style={{ marginLeft: "auto" }}>✓</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
