import React, { useState, useRef } from "react";
import { Word, UserProgress } from "../types";
import { POS_DEFAULT, TOPICS_DEFAULT } from "../data";

interface AddScreenProps {
  words: Word[];
  stats: UserProgress;
  onSaveWord: (word: Word) => void;
  onSaveProgress: (stats: UserProgress) => void;
  onBack: () => void;
}

export default function AddScreen({
  words,
  stats,
  onSaveWord,
  onSaveProgress,
  onBack
}: AddScreenProps) {
  const [tab, setTab] = useState<"one" | "photo" | "bulk" | "manage">("one");
  const [en, setEn] = useState("");
  const [ru, setRu] = useState("");
  const [pos, setPos] = useState("noun");
  const [topic, setTopic] = useState("general");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Bulk state
  const [bulkText, setBulkText] = useState("");
  const [bPos, setBPos] = useState("noun");
  const [bTopic, setBTopic] = useState("general");

  // Photo state
  const [img, setImg] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{ en: string; ru: string }[]>([]);
  const [review, setReview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Manage state
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicEmoji, setNewTopicEmoji] = useState("");
  const [newPosName, setNewPosName] = useState("");
  const [newPosKey, setNewPosKey] = useState("");
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [showPosForm, setShowPosForm] = useState(false);

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

  const trimmedEn = en.trim().toLowerCase();
  const duplicateWord = trimmedEn
    ? (words || []).find(w => w.en.trim().toLowerCase() === trimmedEn)
    : undefined;

  const photoDuplicates = parsed.filter(p => {
    const trimmed = p.en.trim().toLowerCase();
    return trimmed && (words || []).some(w => w.en.trim().toLowerCase() === trimmed);
  });

  const bulkLinesParsed = bulkText.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const match = l.match(/^(.+?)\s*[\u2014\u2013\-:]\s*(.+)$/);
    return match ? { en: match[1]!.trim(), ru: match[2]!.trim() } : null;
  }).filter(Boolean) as { en: string; ru: string }[];

  const bulkDuplicates = bulkLinesParsed.filter(b => {
    const trimmed = b.en.toLowerCase();
    return trimmed && (words || []).some(w => w.en.trim().toLowerCase() === trimmed);
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImg(reader.result as string);
    reader.readAsDataURL(f);
  };

  // Perform Gemini OCR using our server API
  const handleOCR = async () => {
    if (!img) return;
    setParsing(true);
    setMsg("");
    setParsed([]);
    setReview(false);

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: img })
      });
      const data = await res.json();
      if (data.pairs && Array.isArray(data.pairs)) {
        setParsed(data.pairs);
        setReview(true);
      } else {
        setMsg("❌ Не удалось распознать слова. Попробуйте вкладку Список.");
      }
    } catch (err) {
      console.error(err);
      setMsg("❌ Ошибка при отправке изображения.");
    } finally {
      setParsing(false);
    }
  };

  const handleAddPhotoWords = () => {
    const valid = parsed.filter(p => p.en && p.en.trim());
    if (!valid.length) {
      setMsg("❌ Нет распознанных слов для добавления.");
      return;
    }

    valid.forEach(p => {
      const w: Word = {
        id: Math.random().toString(36).slice(2),
        userId: stats.userId,
        en: p.en.trim(),
        ru: (p.ru || "—").trim(),
        partOfSpeech: bPos,
        topic: bTopic,
        note: "Из фото",
        learned: false,
        learnedDate: null,
        lastReviewed: null,
        correct: 0,
        wrong: 0,
        streak: 0,
        created: new Date().toISOString()
      };
      onSaveWord(w);
    });

    setImg(null);
    setParsed([]);
    setReview(false);
    setMsg(`✅ Успешно добавлено ${valid.length} слов!`);
    setTimeout(() => setMsg(""), 3000);
  };

  // Add One Word - performs AI auto-classification using server API
  const handleAddOneWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!en.trim() || !ru.trim()) return;
    if (duplicateWord) {
      setMsg(`⚠️ Слово "${duplicateWord.en}" уже есть в словаре!`);
      return;
    }

    setLoading(true);
    setMsg("");

    try {
      // Ask Gemini server-side to guess part of speech and topic
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          en: en.trim(),
          ru: ru.trim(),
          existingPos: Object.entries(allPos).map(([k, v]) => `${k}:${v}`).join(", "),
          existingTopics: Object.entries(allTopics).map(([k, v]) => `${k}:${v}`).join(", ")
        })
      });
      
      const classification = await res.json();
      
      let finalPos = classification.pos || pos;
      let finalTopic = classification.topic || topic;
      let customTopics = { ...(stats.customTopics || {}) };
      let customPos = { ...(stats.customPos || {}) };

      if (classification.newTopic?.key && classification.newTopic?.label) {
        customTopics[classification.newTopic.key] = classification.newTopic.label;
        finalTopic = classification.newTopic.key;
      }
      if (classification.newPos?.key && classification.newPos?.label) {
        customPos[classification.newPos.key] = classification.newPos.label;
        finalPos = classification.newPos.key;
      }

      const w: Word = {
        id: Math.random().toString(36).slice(2),
        userId: stats.userId,
        en: en.trim(),
        ru: ru.trim(),
        partOfSpeech: finalPos,
        topic: finalTopic,
        note: note.trim(),
        learned: false,
        learnedDate: null,
        lastReviewed: null,
        correct: 0,
        wrong: 0,
        streak: 0,
        created: new Date().toISOString()
      };

      onSaveWord(w);

      if (classification.newTopic || classification.newPos) {
        onSaveProgress({
          ...stats,
          customTopics,
          customPos
        });
      }

      setMsg(`✨ Добавлено: "${w.en}" [Тема: ${allTopics[finalTopic] || finalTopic}]`);
      setEn("");
      setRu("");
      setNote("");
    } catch (err) {
      console.error(err);
      // Fallback to manually selected options if AI fails
      const w: Word = {
        id: Math.random().toString(36).slice(2),
        userId: stats.userId,
        en: en.trim(),
        ru: ru.trim(),
        partOfSpeech: pos,
        topic,
        note: note.trim(),
        learned: false,
        learnedDate: null,
        lastReviewed: null,
        correct: 0,
        wrong: 0,
        streak: 0,
        created: new Date().toISOString()
      };
      onSaveWord(w);
      setMsg(`✅ Добавлено: "${w.en}"`);
      setEn("");
      setRu("");
      setNote("");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 3500);
    }
  };

  const handleAddBulk = () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    let count = 0;
    lines.forEach(l => {
      const match = l.match(/^(.+?)\s*[\u2014\u2013\-:]\s*(.+)$/);
      if (!match) return;

      const w: Word = {
        id: Math.random().toString(36).slice(2),
        userId: stats.userId,
        en: match[1]!.trim(),
        ru: (match[2] || "—").trim(),
        partOfSpeech: bPos,
        topic: bTopic,
        note: "",
        learned: false,
        learnedDate: null,
        lastReviewed: null,
        correct: 0,
        wrong: 0,
        streak: 0,
        created: new Date().toISOString()
      };
      onSaveWord(w);
      count++;
    });

    setBulkText("");
    setMsg(`✅ Успешно добавлено ${count} слов!`);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleAddCustomTopic = () => {
    if (!newTopicName.trim()) return;
    const key = "custom_" + Math.random().toString(36).slice(2, 8);
    const label = `${newTopicEmoji || "📌"} ${newTopicName.trim()}`;
    
    onSaveProgress({
      ...stats,
      customTopics: { ...(stats.customTopics || {}), [key]: label }
    });

    setNewTopicName("");
    setNewTopicEmoji("");
    setShowTopicForm(false);
    setMsg(`✅ Создана новая тема: ${label}`);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleAddCustomPos = () => {
    if (!newPosName.trim() || !newPosKey.trim()) return;
    const key = newPosKey.trim().toLowerCase().replace(/\s+/g, "_");
    
    onSaveProgress({
      ...stats,
      customPos: { ...(stats.customPos || {}), [key]: newPosName.trim() }
    });

    setNewPosName("");
    setNewPosKey("");
    setShowPosForm(false);
    setMsg(`✅ Создана новая часть речи: ${newPosName}`);
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button className="back-btn" onClick={onBack}>← Назад</button>
        <h2 className="section-title" style={{ margin: 0 }}>Добавить</h2>
        <span />
      </div>

      {msg && (
        <div className="card" style={{ textAlign: "center", marginBottom: 12, padding: 11, fontSize: 14, color: "var(--sage)" }}>
          {msg}
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${tab === "one" ? "active" : ""}`} onClick={() => setTab("one")}>✍️ Одно слово</button>
        <button className={`tab ${tab === "photo" ? "active" : ""}`} onClick={() => { setTab("photo"); setReview(false); }}>📸 Фото (AI OCR)</button>
        <button className={`tab ${tab === "bulk" ? "active" : ""}`} onClick={() => setTab("bulk")}>📋 Список</button>
        <button className={`tab ${tab === "manage" ? "active" : ""}`} onClick={() => setTab("manage")}>⚙️ Темы</button>
      </div>

      {/* Tab: One Word */}
      {tab === "one" && (
        <form onSubmit={handleAddOneWord} className="card">
          <p style={{ fontSize: 12, color: "#aaa", marginBottom: 12 }}>
            💡 Gemini автоматически определит тему и часть речи слова!
          </p>
          <input className="input" value={en} onChange={e => setEn(e.target.value)} placeholder="English Word" style={{ marginBottom: 8 }} required />
          
          {duplicateWord && (
            <div style={{ color: "var(--rose, #ff4d4d)", fontSize: "13px", marginTop: "-4px", marginBottom: "8px", fontWeight: "500", padding: "6px 10px", background: "rgba(255, 77, 77, 0.1)", borderRadius: "8px", border: "1px solid rgba(255, 77, 77, 0.2)" }}>
              ⚠️ Слово "{duplicateWord.en}" уже есть в словаре с переводом "{duplicateWord.ru}"! (Тема: {allTopics[duplicateWord.topic] || duplicateWord.topic})
            </div>
          )}

          <input className="input" value={ru} onChange={e => setRu(e.target.value)} placeholder="Перевод" style={{ marginBottom: 8 }} required />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select className="select" style={{ flex: 1 }} value={pos} onChange={e => setPos(e.target.value)}>
              {Object.entries(allPos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select" style={{ flex: 1 }} value={topic} onChange={e => setTopic(e.target.value)}>
              {Object.entries(allTopics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Заметка (необязательно)" style={{ marginBottom: 12 }} />
          <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: 14 }} disabled={loading || !!duplicateWord}>
            {loading ? "⏳ Искусственный интеллект думает..." : "Добавить в журнал"}
          </button>
        </form>
      )}

      {/* Tab: Photo OCR */}
      {tab === "photo" && !review && (
        <div className="card" style={{ textAlign: "center" }}>
          <h3 className="section-title" style={{ fontSize: 18 }}>Распознавание списка по фото</h3>
          <p style={{ fontSize: 12, color: "#aaa", margin: "6px 0 18px" }}>Сфотографируйте список — Gemini автоматически извлечет все слова!</p>
          {!img ? (
            <button className="btn" style={{ width: "100%", padding: 36, border: "2px dashed rgba(212,165,165,.3)", borderRadius: "2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }} onClick={() => fileRef.current?.click()}>
              <span style={{ fontSize: 36 }}>📷</span>
              <span style={{ fontSize: 14, color: "var(--rose)", fontWeight: 500 }}>Выбрать изображение</span>
            </button>
          ) : (
            <div>
              <img src={img} style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 16, marginBottom: 12 }} alt="OCR Input" />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setImg(null)}>Сбросить</button>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleOCR} disabled={parsing}>
                  {parsing ? "⏳ Обработка..." : "🔍 Распознать"}
                </button>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden-input" />
        </div>
      )}

      {tab === "photo" && review && (
        <div className="fade-in card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="section-title" style={{ fontSize: 18, margin: 0 }}>Найдено {parsed.length} слов</h3>
            <button className="btn btn-ghost" onClick={() => setReview(false)}>← Сбросить</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <select className="select" style={{ flex: 1 }} value={bPos} onChange={e => setBPos(e.target.value)}>
              {Object.entries(allPos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select" style={{ flex: 1 }} value={bTopic} onChange={e => setBTopic(e.target.value)}>
              {Object.entries(allTopics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {photoDuplicates.length > 0 && (
            <div style={{ color: "var(--rose, #ff4d4d)", fontSize: "13px", marginBottom: "12px", fontWeight: "500", background: "rgba(255, 77, 77, 0.1)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 77, 77, 0.2)", lineHeight: "1.4" }}>
              ⚠️ Некоторые слова уже есть в словаре: {photoDuplicates.map(d => `"${d.en}"`).join(", ")}. Измените их или удалите (нажав на ✕), чтобы добавить остальные слова.
            </div>
          )}

          <div style={{ maxHeight: 250, overflowY: "auto", marginBottom: 12 }}>
            {parsed.map((p, i) => {
              const isDup = p.en.trim() && (words || []).some(w => w.en.trim().toLowerCase() === p.en.trim().toLowerCase());
              return (
                <div key={i} className="word-row" style={isDup ? { border: "1px solid rgba(255, 77, 77, 0.4)", background: "rgba(255, 77, 77, 0.05)", padding: "6px", borderRadius: "8px", margin: "4px 0" } : {}}>
                  <input 
                    value={p.en} 
                    onChange={e => { const list = [...parsed]; list[i]!.en = e.target.value; setParsed(list); }} 
                    style={{ flex: 1, minWidth: 80, color: isDup ? "var(--rose, #ff4d4d)" : "inherit", fontWeight: isDup ? "600" : "normal" }} 
                    placeholder="Слово"
                  />
                  <span>—</span>
                  <input 
                    value={p.ru} 
                    onChange={e => { const list = [...parsed]; list[i]!.ru = e.target.value; setParsed(list); }} 
                    style={{ flex: 1, minWidth: 80 }} 
                    placeholder="Перевод"
                  />
                  <button className="speak-btn" onClick={() => setParsed(parsed.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              );
            })}
          </div>
          <button className="btn btn-primary" style={{ width: "100%", padding: 14 }} onClick={handleAddPhotoWords} disabled={photoDuplicates.length > 0}>
            Добавить все ({parsed.length})
          </button>
        </div>
      )}

      {/* Tab: Bulk */}
      {tab === "bulk" && (
        <div className="card">
          <p style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>Формат ввода: английское_слово — русский_перевод (каждое слово на новой строчке)</p>
          <textarea className="textarea" value={bulkText} onChange={e => setBulkText(e.target.value)} rows={7} placeholder="such — такой&#10;genius — гений&#10;warm — теплый" style={{ marginBottom: 10 }} />
          
          {bulkDuplicates.length > 0 && (
            <div style={{ color: "var(--rose, #ff4d4d)", fontSize: "13px", marginBottom: "12px", fontWeight: "500", background: "rgba(255, 77, 77, 0.1)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 77, 77, 0.2)", lineHeight: "1.4" }}>
              ⚠️ Эти слова уже есть в словаре: {bulkDuplicates.map(d => `"${d.en}"`).join(", ")}. Измените или удалите эти строки из списка, чтобы продолжить.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <select className="select" style={{ flex: 1 }} value={bPos} onChange={e => setBPos(e.target.value)}>
              {Object.entries(allPos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select" style={{ flex: 1 }} value={bTopic} onChange={e => setBTopic(e.target.value)}>
              {Object.entries(allTopics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" style={{ width: "100%", padding: 14 }} onClick={handleAddBulk} disabled={bulkDuplicates.length > 0}>Добавить список</button>
        </div>
      )}

      {/* Tab: Manage topics */}
      {tab === "manage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Пользовательские Темы</h3>
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowTopicForm(!showTopicForm)}>
                {showTopicForm ? "Скрыть" : "+ Новая"}
              </button>
            </div>
            
            {showTopicForm && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" value={newTopicEmoji} onChange={e => setNewTopicEmoji(e.target.value)} placeholder="Эмодзи (🎨)" style={{ width: 70 }} />
                  <input className="input" value={newTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder="Название темы" />
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleAddCustomTopic}>Создать тему</button>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {Object.entries(allTopics).map(([k, v]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(245,230,211,.3)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                  {v}
                  <button style={{ border: "none", background: "none", cursor: "pointer", color: "#999", marginLeft: 4 }} onClick={() => {
                    if (stats.customTopics?.[k]) {
                      const ct = { ...stats.customTopics };
                      delete ct[k];
                      onSaveProgress({ ...stats, customTopics: ct });
                    } else {
                      const dt = [...(stats.deletedTopics || []), k];
                      onSaveProgress({ ...stats, deletedTopics: dt });
                    }
                  }}>✕</button>
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Части Речи</h3>
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowPosForm(!showPosForm)}>
                {showPosForm ? "Скрыть" : "+ Новая"}
              </button>
            </div>

            {showPosForm && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <input className="input" value={newPosName} onChange={e => setNewPosName(e.target.value)} placeholder="Название (напр: Междометие)" />
                <input className="input" value={newPosKey} onChange={e => setNewPosKey(e.target.value)} placeholder="Код (напр: interjection)" />
                <button className="btn btn-primary btn-sm" onClick={handleAddCustomPos}>Создать часть речи</button>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {Object.entries(allPos).map(([k, v]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(245,230,211,.3)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                  {v}
                  <button style={{ border: "none", background: "none", cursor: "pointer", color: "#999", marginLeft: 4 }} onClick={() => {
                    if (stats.customPos?.[k]) {
                      const cp = { ...stats.customPos };
                      delete cp[k];
                      onSaveProgress({ ...stats, customPos: cp });
                    } else {
                      const dp = [...(stats.deletedPos || []), k];
                      onSaveProgress({ ...stats, deletedPos: dp });
                    }
                  }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
