import { useState } from "react";
import { Word, UserProgress } from "../types";
import { POS_DEFAULT, TOPICS_DEFAULT } from "../data";
import { speak, getLocalDateString } from "../utils";

interface DictionaryScreenProps {
  words: Word[];
  stats: UserProgress;
  onSaveWord: (word: Word) => void;
  onDeleteWord: (wordId: string) => void;
  onBack: () => void;
}

export default function DictionaryScreen({
  words,
  stats,
  onSaveWord,
  onDeleteWord,
  onBack
}: DictionaryScreenProps) {
  const [search, setSearch] = useState("");
  const [fPos, setFPos] = useState("all");
  const [fTopic, setFTopic] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Word>>({});
  const [toast, setToast] = useState("");

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

  const filtered = words.filter(w => {
    if (fPos !== "all" && w.partOfSpeech !== fPos) return false;
    if (fTopic !== "all" && w.topic !== fTopic) return false;
    if (search) {
      const q = search.toLowerCase();
      return w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q);
    }
    return true;
  });

  const toggleLearn = (w: Word) => {
    const today = getLocalDateString();
    const updated: Word = {
      ...w,
      learned: !w.learned,
      learnedDate: !w.learned ? today : null,
      streak: !w.learned ? 1 : 0
    };
    onSaveWord(updated);
  };

  const startEdit = (w: Word) => {
    setEditId(w.id);
    setEditForm({
      en: w.en,
      ru: w.ru,
      partOfSpeech: w.partOfSpeech,
      topic: w.topic,
      note: w.note || ""
    });
  };

  const saveEdit = () => {
    if (!editId) return;
    const original = words.find(w => w.id === editId);
    if (!original) return;

    const updated: Word = {
      ...original,
      ...editForm as Word
    };
    onSaveWord(updated);
    setEditId(null);
    setToast("Сохранено ✓");
    setTimeout(() => setToast(""), 2000);
  };

  // Group by Part of Speech
  const grouped: { [key: string]: Word[] } = {};
  filtered.forEach(w => {
    if (!grouped[w.partOfSpeech]) grouped[w.partOfSpeech] = [];
    grouped[w.partOfSpeech]!.push(w);
  });

  return (
    <div className="fade-in">
      {toast && <div className="toast">{toast}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button className="back-btn" onClick={onBack}>← Назад</button>
        <h2 className="section-title" style={{ margin: 0 }}>Словарь ({words.length})</h2>
        <span />
      </div>

      <input 
        className="input" 
        placeholder="🔍 Поиск слова..." 
        value={search} 
        onChange={e => setSearch(e.target.value)} 
        style={{ marginBottom: 10 }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select className="select" value={fPos} onChange={e => setFPos(e.target.value)}>
          <option value="all">Все части речи</option>
          {Object.entries(allPos).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="select" value={fTopic} onChange={e => setFTopic(e.target.value)}>
          <option value="all">Все темы</option>
          {Object.entries(allTopics).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {Object.entries(grouped).map(([pos, wordList]) => (
        <div key={pos} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--rose)", marginBottom: 8 }}>
            {allPos[pos] || pos} ({wordList.length})
          </h3>
          {wordList.map(w => (
            <div key={w.id} className="card" style={{ padding: 11, marginBottom: 7 }}>
              {editId === w.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <input 
                    className="input" 
                    value={editForm.en || ""} 
                    onChange={e => setEditForm({ ...editForm, en: e.target.value })} 
                    placeholder="English" 
                  />
                  <input 
                    className="input" 
                    value={editForm.ru || ""} 
                    onChange={e => setEditForm({ ...editForm, ru: e.target.value })} 
                    placeholder="Перевод" 
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <select className="select" style={{ flex: 1 }} value={editForm.partOfSpeech || ""} onChange={e => setEditForm({ ...editForm, partOfSpeech: e.target.value })}>
                      {Object.entries(allPos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select className="select" style={{ flex: 1 }} value={editForm.topic || ""} onChange={e => setEditForm({ ...editForm, topic: e.target.value })}>
                      {Object.entries(allTopics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <input 
                    className="input" 
                    value={editForm.note || ""} 
                    onChange={e => setEditForm({ ...editForm, note: e.target.value })} 
                    placeholder="Заметка" 
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={saveEdit}>ОК</button>
                    <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setEditId(null)}>Отмена</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600 }}>{w.en}</span>
                      <button className="speak-btn" onClick={() => speak(w.en)}>🔊</button>
                      <span 
                        style={{ 
                          fontSize: 10, 
                          padding: "2px 6px", 
                          borderRadius: "4px",
                          fontWeight: 600,
                          background: w.streak >= 12 
                            ? "rgba(90, 155, 212, 0.12)" 
                            : w.learned 
                              ? "rgba(148,161,135,0.15)" 
                              : "rgba(223,174,134,0.15)",
                          color: w.streak >= 12 
                            ? "#5a9bd4" 
                            : w.learned 
                              ? "var(--sage)" 
                              : "var(--rose)"
                        }}
                      >
                        {w.streak >= 12 ? "🏆 Усвоено навсегда" : w.learned ? "✓ Выучено" : "📖 Изучаю"}
                      </span>
                      {w.learned && w.streak < 12 && (
                        <span style={{ fontSize: 10, color: "#888", background: "rgba(180,180,180,0.08)", padding: "2px 5px", borderRadius: "3px" }}>
                          Этап {w.streak || 1}/11
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "#888" }}>{w.ru}</div>
                    <div style={{ fontSize: 11, color: "#ccc" }}>
                      {allTopics[w.topic] || w.topic} {w.note ? `· ${w.note}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    <button 
                      className="btn btn-sm" 
                      style={{ 
                        padding: "4px 8px", 
                        fontSize: 12,
                        background: w.learned ? "transparent" : "var(--sage-soft)",
                        color: w.learned ? "var(--muted)" : "var(--sage)",
                        border: w.learned ? "1px solid var(--border)" : "none"
                      }} 
                      onClick={() => toggleLearn(w)}
                    >
                      {w.learned ? "↩️ Изучать снова" : "✓ Знаю слово"}
                    </button>
                    <button className="btn btn-sm" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => startEdit(w)}>✏️</button>
                    <button className="btn btn-sm" style={{ padding: "4px 8px", fontSize: 12, color: "var(--rose)" }} onClick={() => onDeleteWord(w.id)}>🗑</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Ничего не найдено</div>
      )}
    </div>
  );
}
