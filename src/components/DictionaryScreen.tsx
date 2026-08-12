import { useState, useMemo, useEffect, useRef } from "react";
import { Word, UserProgress } from "../types";
import { POS_DEFAULT, TOPICS_DEFAULT } from "../data";
import { speak, getLocalDateString } from "../utils";
import { getDefaultCategories, getCategoryPath, renderCategoryOptions, getValidCategoryId, getAllSubcategoryIds } from "../categories";

interface DictionaryScreenProps {
  words: Word[];
  stats: UserProgress;
  onSaveWord: (word: Word) => void;
  onDeleteWord: (wordId: string) => void;
  onDeleteWords?: (wordIds: string[]) => void;
  onBack: () => void;
}

export default function DictionaryScreen({
  words,
  stats,
  onSaveWord,
  onDeleteWord,
  onDeleteWords,
  onBack
}: DictionaryScreenProps) {
  const [search, setSearch] = useState("");
  const [fPos, setFPos] = useState("all");
  const [fTopic, setFTopic] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Word>>({});
  const [toast, setToast] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const [wordToDeleteConfirm, setWordToDeleteConfirm] = useState<Word | null>(null);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [wordSortMode, setWordSortModeState] = useState<"date_desc" | "date_asc" | "alpha_asc" | "alpha_desc" | "status">(() => {
    return (localStorage.getItem("journal_sort_words") as any) || "date_asc";
  });

  const setWordSortMode = (val: "date_desc" | "date_asc" | "alpha_asc" | "alpha_desc" | "status") => {
    setWordSortModeState(val);
    localStorage.setItem("journal_sort_words", val);
  };

  const toggleWordSelection = (wordId: string) => {
    setSelectedWordIds(prev => {
      const next = new Set(prev);
      if (next.has(wordId)) {
        next.delete(wordId);
      } else {
        next.add(wordId);
      }
      return next;
    });
  };

  const handleTouchStartWord = (wordId: string) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      toggleWordSelection(wordId);
      if (window.navigator && window.navigator.vibrate) {
        try { window.navigator.vibrate(50); } catch (_) {}
      }
    }, 450);
  };

  const handleTouchEndWord = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  // Infinite scroll listener for fast initial load and smooth expansion on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) {
        setVisibleCount(prev => prev + 30);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const categories = stats.categories && stats.categories.length > 0
    ? stats.categories
    : getDefaultCategories(stats.userId || "guest");

  const deletedTopics = stats.deletedTopics || [];
  const deletedPos = stats.deletedPos || [];

  const allTopics: { [key: string]: string } = useMemo(() => {
    const res: { [key: string]: string } = {};
    Object.entries(TOPICS_DEFAULT).forEach(([k, v]) => {
      if (!deletedTopics.includes(k)) {
        res[k] = v;
      }
    });
    Object.entries(stats.customTopics || {}).forEach(([k, v]) => {
      res[k] = v;
    });
    return res;
  }, [deletedTopics, stats.customTopics]);

  const allPos: { [key: string]: string } = useMemo(() => {
    const res: { [key: string]: string } = {};
    Object.entries(POS_DEFAULT).forEach(([k, v]) => {
      if (!deletedPos.includes(k)) {
        res[k] = v;
      }
    });
    Object.entries(stats.customPos || {}).forEach(([k, v]) => {
      res[k] = v;
    });
    return res;
  }, [deletedPos, stats.customPos]);

  const filtered = useMemo(() => {
    const allowedCatIds = (fCat === "all" || fCat === "cat_main")
      ? null
      : new Set(getAllSubcategoryIds(fCat, categories));
    const q = search.trim().toLowerCase();

    return words.filter(w => {
      if (fPos !== "all" && w.partOfSpeech !== fPos) return false;
      if (fTopic !== "all" && w.topic !== fTopic) return false;
      if (allowedCatIds) {
        const wordCat = w.categoryId || "cat_base";
        if (!allowedCatIds.has(wordCat)) return false;
      }
      if (q) {
        return w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q);
      }
      return true;
    });
  }, [words, fPos, fTopic, fCat, search, categories]);

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
      categoryId: w.categoryId || "cat_base",
      note: w.note || ""
    });
  };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (wordSortMode === "date_desc") {
        const tA = a.created ? new Date(a.created).getTime() : 0;
        const tB = b.created ? new Date(b.created).getTime() : 0;
        return tB - tA;
      } else if (wordSortMode === "date_asc") {
        const tA = a.created ? new Date(a.created).getTime() : 0;
        const tB = b.created ? new Date(b.created).getTime() : 0;
        return tA - tB;
      } else if (wordSortMode === "alpha_asc") {
        return a.en.localeCompare(b.en, "en");
      } else if (wordSortMode === "alpha_desc") {
        return b.en.localeCompare(a.en, "en");
      } else if (wordSortMode === "status") {
        if (a.learned === b.learned) return a.en.localeCompare(b.en, "en");
        return a.learned ? 1 : -1;
      }
      return 0;
    });
  }, [filtered, wordSortMode]);

  const saveEdit = () => {
    if (!editId) return;
    const original = words.find(w => w.id === editId);
    if (!original) return;

    const rawCatId = editForm.categoryId || "cat_base";

    const updated: Word = {
      ...original,
      ...editForm as Word,
      categoryId: rawCatId
    };
    onSaveWord(updated);
    setEditId(null);
    setToast("Сохранено ✓");
    setTimeout(() => setToast(""), 2000);
  };

  // Sliced filtered list for virtual/progressive rendering
  const visibleWords = sorted.slice(0, visibleCount);

  // Group by Part of Speech
  const grouped: { [key: string]: Word[] } = {};
  visibleWords.forEach(w => {
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
        onChange={e => {
          setSearch(e.target.value);
          setVisibleCount(150);
        }} 
        style={{ marginBottom: 10 }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select 
          className="select" 
          style={{ flex: 1, minWidth: 120 }}
          value={fCat} 
          onChange={e => {
            setFCat(e.target.value);
            setVisibleCount(150);
          }}
        >
          <option value="all">📁 Все категории</option>
          {renderCategoryOptions(categories)}
        </select>

        <select 
          className="select" 
          style={{ flex: 1, minWidth: 120 }}
          value={fPos} 
          onChange={e => {
            setFPos(e.target.value);
            setVisibleCount(150);
          }}
        >
          <option value="all">Все части речи</option>
          {Object.entries(allPos).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select 
          className="select" 
          style={{ flex: 1, minWidth: 120 }}
          value={fTopic} 
          onChange={e => {
            setFTopic(e.target.value);
            setVisibleCount(150);
          }}
        >
          <option value="all">Все темы</option>
          {Object.entries(allTopics).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select 
          className="select" 
          style={{ flex: 1, minWidth: 140 }}
          value={wordSortMode} 
          onChange={e => {
            setWordSortMode(e.target.value as any);
            setVisibleCount(150);
          }}
        >
          <option value="date_asc">🕒 Сначала старые</option>
          <option value="date_desc">🕒 Сначала новые</option>
          <option value="alpha_asc">🔤 А-Я (по алфавиту)</option>
          <option value="alpha_desc">🔠 Я-А (по алфавиту)</option>
          <option value="status">🎯 На изучении</option>
        </select>
      </div>

      {/* Selection Control Bar for Bulk Delete */}
      {selectedWordIds.size > 0 && (
        <div 
          className="card" 
          style={{ 
            padding: "12px 16px", 
            marginBottom: 16, 
            background: "rgba(188, 71, 73, 0.08)", 
            border: "1.5px solid var(--terracotta)", 
            borderRadius: "1.2rem", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between", 
            flexWrap: "wrap", 
            gap: 10 
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button 
              className="btn btn-secondary" 
              style={{ fontSize: 12, padding: "7px 14px", borderRadius: 20, fontWeight: 700 }}
              onClick={() => {
                const allFilteredIds = filtered.map(w => w.id);
                const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedWordIds.has(id));
                if (isAllSelected) {
                  setSelectedWordIds(new Set());
                } else {
                  setSelectedWordIds(new Set(allFilteredIds));
                }
              }}
            >
              {filtered.length > 0 && filtered.every(w => selectedWordIds.has(w.id)) ? "☐ Снять выбор" : "☑️ Выделить всё"}
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--charcoal)" }}>
              Отмечено: <strong style={{ color: "var(--terracotta)" }}>{selectedWordIds.size}</strong> из {filtered.length}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button 
              className="btn btn-primary" 
              style={{ 
                fontSize: 12, 
                padding: "8px 16px", 
                borderRadius: 20, 
                background: "var(--terracotta)", 
                borderColor: "var(--terracotta)", 
                fontWeight: 700 
              }}
              onClick={() => setShowBulkDeleteConfirm(true)}
            >
              🗑️ Удалить выбранные ({selectedWordIds.size})
            </button>
            <button 
              className="btn btn-ghost" 
              style={{ fontSize: 13, padding: "6px 12px", borderRadius: 20 }}
              onClick={() => setSelectedWordIds(new Set())}
              title="Снять выбор"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([pos, wordList]) => (
        <div key={pos} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--rose)", marginBottom: 8 }}>
            {allPos[pos] || pos} ({wordList.length})
          </h3>
          {wordList.map(w => {
            const wordCatId = w.categoryId || "cat_base";
            const wordCat = categories.find(c => c.id === wordCatId);
            const isSelected = selectedWordIds.has(w.id);

            return (
              <div 
                key={w.id} 
                className="card" 
                style={{ 
                  padding: 11, 
                  marginBottom: 7,
                  border: isSelected ? "2px solid var(--terracotta)" : undefined,
                  background: isSelected ? "rgba(188, 71, 73, 0.05)" : undefined,
                  transition: "border 0.15s ease, background 0.15s ease",
                  cursor: selectedWordIds.size > 0 ? "pointer" : "default"
                }}
                onClick={() => {
                  if (selectedWordIds.size > 0) {
                    toggleWordSelection(w.id);
                  }
                }}
                onTouchStart={() => handleTouchStartWord(w.id)}
                onTouchEnd={handleTouchEndWord}
                onMouseDown={() => handleTouchStartWord(w.id)}
                onMouseUp={handleTouchEndWord}
                onMouseLeave={handleTouchEndWord}
              >
                {editId === w.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }} onClick={e => e.stopPropagation()}>
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
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <select className="select" style={{ flex: "1 1 110px" }} value={editForm.categoryId || "cat_base"} onChange={e => setEditForm({ ...editForm, categoryId: e.target.value })}>
                        {renderCategoryOptions(categories)}
                      </select>
                      <select className="select" style={{ flex: "1 1 110px" }} value={editForm.partOfSpeech || ""} onChange={e => setEditForm({ ...editForm, partOfSpeech: e.target.value })}>
                        {Object.entries(allPos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <select className="select" style={{ flex: "1 1 110px" }} value={editForm.topic || "general"} onChange={e => setEditForm({ ...editForm, topic: e.target.value })}>
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      {selectedWordIds.size > 0 && (
                        <button 
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: "2px", lineHeight: 1 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWordSelection(w.id);
                          }}
                          title={isSelected ? "Снять выбор" : "Выделить слово"}
                        >
                          {isSelected ? "☑️" : "☐"}
                        </button>
                      )}

                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600 }}>{w.en}</span>
                          <button className="speak-btn" onClick={(e) => { e.stopPropagation(); speak(w.en); }}>🔊</button>
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
                        <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ color: "var(--sage)", fontWeight: 600 }}>
                            {wordCat?.icon || "📁"} {wordCat?.name || "Базовые слова"}
                          </span>
                          <span className="badge badge-gray" style={{ fontSize: 10, padding: "2px 6px" }}>
                            🏷️ {allPos[w.partOfSpeech] || w.partOfSpeech}
                          </span>
                          <span className="badge badge-gray" style={{ fontSize: 10, padding: "2px 6px" }}>
                            🌐 {allTopics[w.topic] || w.topic}
                          </span>
                          {w.note && <span style={{ color: "var(--muted)", fontStyle: "italic" }}>📝 {w.note}</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 3 }} onClick={e => e.stopPropagation()}>
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
                      <button className="btn btn-sm" style={{ padding: "4px 8px", fontSize: 12, color: "var(--rose)" }} onClick={() => setWordToDeleteConfirm(w)}>🗑</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {filtered.length > visibleCount && (
        <button 
          className="btn btn-outline" 
          style={{ width: "100%", padding: "12px", marginTop: "10px", marginBottom: "20px" }}
          onClick={() => setVisibleCount(prev => prev + 100)}
        >
          Показать ещё (Осталось: {filtered.length - visibleCount})
        </button>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Ничего не найдено</div>
      )}

      {/* Modal: Confirm Word Permanent Deletion */}
      {wordToDeleteConfirm && (
        <div className="overlay" onClick={() => setWordToDeleteConfirm(null)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ textAlign: "center", padding: "10px 4px" }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>⚠️</div>
              <h3 className="section-title" style={{ fontSize: 18, color: "var(--rose)", marginBottom: 8 }}>
                Удалить слово навсегда?
              </h3>
              <p style={{ fontSize: 14, color: "var(--charcoal)", marginBottom: 8, lineHeight: 1.4 }}>
                Вы уверены, что хотите удалить слово <strong>«{wordToDeleteConfirm.en}»</strong> (<em>{wordToDeleteConfirm.ru}</em>)?
              </p>
              <div style={{ fontSize: 12, color: "var(--rose)", fontWeight: 600, background: "rgba(220,95,95,0.08)", border: "1px solid rgba(220,95,95,0.2)", padding: "10px 12px", borderRadius: 10, textAlign: "left", lineHeight: 1.4, marginBottom: 16 }}>
                ❗ <strong>Обратите внимание:</strong> Слово будет полностью и навсегда удалено из основного словаря и из всех категорий/подкатегорий.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: "10px" }}
                  onClick={() => setWordToDeleteConfirm(null)}
                >
                  Отмена
                </button>
                <button 
                  type="button" 
                  className="btn" 
                  style={{ flex: 1, padding: "10px", background: "var(--rose)", color: "#fff", fontWeight: 700, borderRadius: 30 }}
                  onClick={() => {
                    onDeleteWord(wordToDeleteConfirm.id);
                    setWordToDeleteConfirm(null);
                    setToast("🗑️ Слово удалено из словаря");
                  }}
                >
                  🗑️ Удалить навсегда
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Confirm Bulk Words Deletion */}
      {showBulkDeleteConfirm && (
        <div className="overlay" onClick={() => setShowBulkDeleteConfirm(false)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ textAlign: "center", padding: "10px 4px" }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>🗑️</div>
              <h3 className="section-title" style={{ fontSize: 18, color: "var(--rose)", marginBottom: 8 }}>
                Удалить выбранные слова ({selectedWordIds.size})?
              </h3>
              <p style={{ fontSize: 14, color: "var(--charcoal)", marginBottom: 8, lineHeight: 1.4 }}>
                Вы уверены, что хотите безвозвратно удалить <strong>{selectedWordIds.size}</strong> выбранных слов?
              </p>
              <div style={{ fontSize: 12, color: "var(--rose)", fontWeight: 600, background: "rgba(220,95,95,0.08)", border: "1px solid rgba(220,95,95,0.2)", padding: "10px 12px", borderRadius: 10, textAlign: "left", lineHeight: 1.4, marginBottom: 16 }}>
                ❗ <strong>Обратите внимание:</strong> Все выбранные слова будут полностью и навсегда удалены из вашей базы. Это действие нельзя отменить!
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: "10px" }}
                  onClick={() => setShowBulkDeleteConfirm(false)}
                >
                  Отмена
                </button>
                <button 
                  type="button" 
                  className="btn" 
                  style={{ flex: 1, padding: "10px", background: "var(--rose)", color: "#fff", fontWeight: 700, borderRadius: 30 }}
                  onClick={() => {
                    const ids = Array.from(selectedWordIds) as string[];
                    const count = ids.length;
                    if (onDeleteWords) {
                      onDeleteWords(ids);
                    } else {
                      ids.forEach(id => onDeleteWord(id));
                    }
                    setSelectedWordIds(new Set());
                    setShowBulkDeleteConfirm(false);
                    setToast(`🗑️ Удалено слов: ${count}`);
                  }}
                >
                  🗑️ Удалить ({selectedWordIds.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
