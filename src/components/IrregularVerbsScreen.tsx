import React, { useState, useEffect, useRef, useMemo } from "react";
import { IrregularVerb, UserProgress } from "../types";
import { speak, getLocalDateString } from "../utils";

interface IrregularVerbsScreenProps {
  irregular: IrregularVerb[];
  stats: UserProgress;
  onSaveVerb: (verb: IrregularVerb) => void;
  onSaveProgress: (stats: UserProgress) => void;
  onBack: () => void;
}

export default function IrregularVerbsScreen({
  irregular,
  stats,
  onSaveVerb,
  onSaveProgress,
  onBack
}: IrregularVerbsScreenProps) {
  const [search, setSearch] = useState("");
  const [filterLearned, setFilterLearned] = useState<"all" | "new" | "learned">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<IrregularVerb>>({});

  // Refs for auto-saving active edit on unmount (navigation or logout)
  const editFormRef = useRef(editForm);
  const editingIdRef = useRef(editingId);
  const irregularRef = useRef(irregular);

  useEffect(() => {
    editFormRef.current = editForm;
    editingIdRef.current = editingId;
    irregularRef.current = irregular;
  }, [editForm, editingId, irregular]);

  useEffect(() => {
    return () => {
      if (editingIdRef.current) {
        const original = irregularRef.current.find(v => v.id === editingIdRef.current);
        const form = editFormRef.current;
        // Save only if base word isn't completely empty to prevent blank spam
        if (original && (form.base?.trim() || form.past?.trim() || form.participle?.trim() || form.ru?.trim())) {
          const updated: IrregularVerb = {
            ...original,
            base: form.base || "",
            past: form.past || "",
            participle: form.participle || "",
            ru: form.ru || ""
          };
          onSaveVerb(updated);
        }
      }
    };
  }, []);
  const [mode, setMode] = useState<"list" | "cards" | "choice" | "practice" | "voice">("list");
  
  // Unified flow states
  const [sessionFlow, setSessionFlow] = useState<"none" | "learn" | "review">("none");
  const [flowStep, setFlowStep] = useState<"direction" | "method" | "active">("direction");
  const [selectedDirection, setSelectedDirection] = useState<"mixed" | "ru-en" | "en-ru">("mixed");
  const [selectedMethod, setSelectedMethod] = useState<"cards" | "practice" | "choice" | "voice">("cards");
  const [sessionQueue, setSessionQueue] = useState<IrregularVerb[]>([]);
  
  // Hint states
  const [showHint, setShowHint] = useState(false);
  const [halfHalfUsed, setHalfHalfUsed] = useState(false);

  // Active indices/states
  const [cardIdx, setCardIdx] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [pIdx, setPIdx] = useState(0);
  const [pPast, setPPast] = useState("");
  const [pPP, setPPP] = useState("");
  const [pChecked, setPChecked] = useState(false);
  const [pScore, setPScore] = useState({ c: 0, w: 0 });
  const [pAns, setPAns] = useState("");
  const [recog, setRecog] = useState(false);
  const [recMsg, setRecMsg] = useState("");
  const [recError, setRecError] = useState("");

  // Shuffle utility
  const shuffle = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]!];
    }
    return copy;
  };

  const startLearningFlow = (dir: "mixed" | "ru-en" | "en-ru") => {
    setSelectedDirection(dir);
    let pool = irregular.filter(v => !v.learned);
    if (pool.length === 0) {
      pool = [...irregular];
    }
    const shuffled = shuffle(pool);
    setSessionQueue(shuffled);
    setCardIdx(0);
    setCardFlipped(false);
    setSelectedMethod("cards");
    setFlowStep("active");
    setShowHint(false);
    setHalfHalfUsed(false);
    setPIdx(0);
    setPChecked(false);
    setPScore({ c: 0, w: 0 });
  };

  const startReviewFlow = (dir: "mixed" | "ru-en" | "en-ru") => {
    setSelectedDirection(dir);
    setFlowStep("method");
  };

  const selectReviewMethod = (method: "cards" | "practice" | "choice" | "voice") => {
    setSelectedMethod(method);
    let pool = irregular.filter(v => v.learned);
    if (pool.length === 0) {
      pool = [...irregular];
    }
    const shuffled = shuffle(pool);
    setSessionQueue(shuffled);
    setPIdx(0);
    setCardIdx(0);
    setCardFlipped(false);
    setPPast("");
    setPPP("");
    setPAns("");
    setPChecked(false);
    setPScore({ c: 0, w: 0 });
    setShowHint(false);
    setHalfHalfUsed(false);
    setFlowStep("active");
    setRecMsg("");
    setRecError("");
  };

  // Generate 4 options for Multiple Choice (V2 / V3 combinations)
  const practiceChoices = useMemo(() => {
    const cur = sessionQueue[pIdx];
    if (!cur) return [];
    const correctOption = `${cur.past} / ${cur.participle}`;
    
    // Pick other verbs for wrong choices
    const others = irregular.filter(v => v.id !== cur.id);
    const otherOptions = others.map(v => `${v.past} / ${v.participle}`);
    
    // Deduplicate and shuffle
    const uniqueIncorrects = Array.from(new Set(otherOptions)).filter(o => o !== correctOption);
    const shuffledIncorrects = shuffle(uniqueIncorrects).slice(0, 3);
    
    return shuffle([correctOption, ...shuffledIncorrects]);
  }, [pIdx, sessionQueue, irregular]);

  const filtered = irregular.filter(v => {
    const s = search.toLowerCase();
    if (filterLearned === "learned" && !v.learned) return false;
    if (filterLearned === "new" && v.learned) return false;
    return !s || v.base.toLowerCase().includes(s) || v.past.toLowerCase().includes(s) || v.participle.toLowerCase().includes(s) || v.ru.toLowerCase().includes(s);
  });

  const toggleLearnVerb = (id: string) => {
    const verb = irregular.find(v => v.id === id);
    if (!verb) return;
    const today = getLocalDateString();
    const updated: IrregularVerb = {
      ...verb,
      learned: !verb.learned,
      learnedDate: !verb.learned ? today : null
    };
    onSaveVerb(updated);
  };

  const startEdit = (v: IrregularVerb) => {
    setEditingId(v.id);
    setEditForm({
      base: v.base,
      past: v.past,
      participle: v.participle,
      ru: v.ru
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const original = irregular.find(v => v.id === editingId);
    if (!original) return;
    const updated: IrregularVerb = {
      ...original,
      ...editForm as IrregularVerb
    };
    onSaveVerb(updated);
    setEditingId(null);
  };

  const addCustomVerb = () => {
    const id = Math.random().toString(36).slice(2);
    const v: IrregularVerb = {
      id,
      userId: stats.userId || "guest",
      base: "",
      past: "",
      participle: "",
      ru: "",
      learned: false,
      learnedDate: null,
      streak: 0
    };
    onSaveVerb(v);
    setEditingId(id);
    setEditForm(v);
  };

  // Unified flow screen routing
  if (sessionFlow !== "none" && flowStep === "direction") {
    const isLearn = sessionFlow === "learn";
    return (
      <div className="fade-in">
        <button 
          className="back-btn" 
          onClick={() => { setSessionFlow("none"); }} 
          style={{ marginBottom: 16 }}
        >
          ← Назад
        </button>
        
        <div className="card" style={{ textAlign: "center", padding: "24px 16px" }}>
          <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 24, marginBottom: 8, color: "var(--warm)" }}>
            {isLearn ? "Изучение: Направление" : "Повторение: Направление"}
          </h3>
          <p style={{ fontSize: 13, color: "#aaa", marginBottom: 20 }}>
            Выберите, в какую сторону вы хотите тренировать глаголы
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button 
              className="btn btn-outline" 
              style={{ width: "100%", padding: "16px 20px", textAlign: "left", borderRadius: "1.25rem" }}
              onClick={() => {
                if (isLearn) startLearningFlow("mixed");
                else startReviewFlow("mixed");
              }}
            >
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 17, color: "var(--warm)", fontWeight: 600 }}>
                🔀 Смешанный
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                Случайные подсказки на русском или английском
              </div>
            </button>

            <button 
              className="btn btn-outline" 
              style={{ width: "100%", padding: "16px 20px", textAlign: "left", borderRadius: "1.25rem" }}
              onClick={() => {
                if (isLearn) startLearningFlow("ru-en");
                else startReviewFlow("ru-en");
              }}
            >
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 17, color: "var(--warm)", fontWeight: 600 }}>
                🇷🇺 ➔ 🇬🇧 Русско-английский
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                Подсказка на русском, пишите или выбирайте формы на английском
              </div>
            </button>

            <button 
              className="btn btn-outline" 
              style={{ width: "100%", padding: "16px 20px", textAlign: "left", borderRadius: "1.25rem" }}
              onClick={() => {
                if (isLearn) startLearningFlow("en-ru");
                else startReviewFlow("en-ru");
              }}
            >
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 17, color: "var(--warm)", fontWeight: 600 }}>
                🇬🇧 ➔ 🇷🇺 Англо-русский
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                Подсказка на английском, пишите или выбирайте формы
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sessionFlow === "review" && flowStep === "method") {
    const pool = irregular.filter(v => v.learned);
    const poolCount = pool.length > 0 ? pool.length : irregular.length;
    return (
      <div className="fade-in">
        <button 
          className="back-btn" 
          onClick={() => { setFlowStep("direction"); }} 
          style={{ marginBottom: 16 }}
        >
          ← Назад
        </button>
        
        <div className="card" style={{ textAlign: "center", padding: "24px 16px" }}>
          <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 24, marginBottom: 8, color: "var(--warm)" }}>
            Способ повторения
          </h3>
          <p style={{ fontSize: 13, color: "#aaa", marginBottom: 20 }}>
            Выберите, каким способом повторять {poolCount} глаголов
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button 
              className="btn btn-outline" 
              style={{ width: "100%", padding: "14px 18px", textAlign: "left", borderRadius: "1.25rem" }}
              onClick={() => selectReviewMethod("cards")}
            >
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 16, color: "var(--warm)", fontWeight: 600 }}>
                🃏 Карточки
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                Повторение с помощью переворачивающихся флэш-карточек
              </div>
            </button>

            <button 
              className="btn btn-outline" 
              style={{ width: "100%", padding: "14px 18px", textAlign: "left", borderRadius: "1.25rem" }}
              onClick={() => selectReviewMethod("practice")}
            >
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 16, color: "var(--warm)", fontWeight: 600 }}>
                ✏️ Письменно
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                Ввод форм V2 и V3 вручную с клавиатуры
              </div>
            </button>

            <button 
              className="btn btn-outline" 
              style={{ width: "100%", padding: "14px 18px", textAlign: "left", borderRadius: "1.25rem" }}
              onClick={() => selectReviewMethod("choice")}
            >
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 16, color: "var(--warm)", fontWeight: 600 }}>
                🎯 Выбор V2/V3
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                Выбор правильных форм из 4 вариантов ответов
              </div>
            </button>

            <button 
              className="btn btn-outline" 
              style={{ width: "100%", padding: "14px 18px", textAlign: "left", borderRadius: "1.25rem" }}
              onClick={() => selectReviewMethod("voice")}
            >
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 16, color: "var(--warm)", fontWeight: 600 }}>
                🎙️ Произношение
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                Тренировка произношения форм V2 и V3 вслух
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sessionFlow !== "none" && flowStep === "active") {
    if (selectedMethod === "cards") {
      if (sessionQueue.length === 0) {
        return (
          <div className="fade-in">
            <button className="back-btn" onClick={() => setSessionFlow("none")}>← Выйти</button>
            <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Нет глаголов в выборке</div>
          </div>
        );
      }
      const cur = sessionQueue[cardIdx % sessionQueue.length]!;

      // Front representation based on selectedDirection
      let frontText = cur.base;
      let frontSub = "Infinitive (V1)";
      if (selectedDirection === "ru-en") {
        frontText = cur.ru;
        frontSub = "Перевод";
      } else if (selectedDirection === "mixed") {
        if (cardIdx % 2 === 0) {
          frontText = cur.ru;
          frontSub = "Перевод";
        } else {
          frontText = cur.base;
          frontSub = "Infinitive (V1)";
        }
      }

      const handleFlip = () => {
        setCardFlipped(!cardFlipped);
      };

      const handleNextCard = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCardIdx((cardIdx + 1) % sessionQueue.length);
        setCardFlipped(false);
        setShowHint(false);
      };

      const handlePrevCard = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCardIdx((cardIdx - 1 + sessionQueue.length) % sessionQueue.length);
        setCardFlipped(false);
        setShowHint(false);
      };

      return (
        <div className="fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button className="back-btn" onClick={() => { setSessionFlow("none"); }}>← Выйти</button>
            <span className="badge">{ (cardIdx % sessionQueue.length) + 1 }/{ sessionQueue.length }</span>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => toggleLearnVerb(cur.id)}>
              {cur.learned ? "↩️ Повторять" : "✅ Выучил"}
            </button>
          </div>

          <div className="flip-card" style={{ height: 230 }} onClick={handleFlip}>
            <div className={`flip-inner ${cardFlipped ? "flipped" : ""}`}>
              <div className="flip-front">
                <span className="badge" style={{ marginBottom: 10, background: "rgba(148,161,135,0.08)", color: "var(--sage)" }}>Карточка</span>
                <div style={{ fontSize: 13, color: "#aaa", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>{frontSub}</div>
                <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 36, marginBottom: 8 }}>{frontText}</div>
                {selectedDirection !== "ru-en" && frontSub !== "Перевод" && (
                  <div style={{ color: "#aaa", fontSize: 15 }}>{cur.ru}</div>
                )}
                <div style={{ marginTop: 12, fontSize: 12, color: "#ccc" }}>Нажмите на карточку, чтобы перевернуть →</div>

                {showHint && (
                  <div style={{ marginTop: 12, fontSize: 13, color: "var(--warm)", fontWeight: 500, background: "rgba(230,175,46,0.08)", padding: "6px 12px", borderRadius: 8 }}>
                    💡 {cur.past[0]}... / {cur.participle[0]}...
                  </div>
                )}
              </div>
              
              <div className="flip-back">
                <span className="badge" style={{ marginBottom: 10, background: "rgba(148,161,135,0.08)", color: "var(--sage)" }}>Формы глагола</span>
                <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 26, marginBottom: 14 }}>{cur.base} <span style={{ fontSize: 16, color: "#aaa", fontStyle: "normal" }}>— {cur.ru}</span></div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", marginBottom: 12 }}>
                  <div style={{ textAlign: "center", background: "rgba(220, 95, 95, 0.03)", padding: 8, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Past (V2)</div>
                    <div style={{ fontFamily: "Lora, serif", fontSize: 20, fontWeight: 600, color: "var(--rose)" }}>{cur.past}</div>
                  </div>
                  <div style={{ textAlign: "center", background: "rgba(148, 161, 135, 0.03)", padding: 8, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Participle (V3)</div>
                    <div style={{ fontFamily: "Lora, serif", fontSize: 20, fontWeight: 600, color: "var(--sage)" }}>{cur.participle}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button className="speak-btn" style={{ fontSize: 16 }} onClick={(e) => { e.stopPropagation(); speak(cur.base); }}>🔊 V1</button>
                  <button className="speak-btn" style={{ fontSize: 16 }} onClick={(e) => { e.stopPropagation(); speak(cur.past); }}>🔊 V2</button>
                  <button className="speak-btn" style={{ fontSize: 16 }} onClick={(e) => { e.stopPropagation(); speak(cur.participle); }}>🔊 V3</button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="btn btn-outline" style={{ flex: 1, padding: 14 }} onClick={handlePrevCard}>← Назад</button>
            {sessionFlow !== "learn" && !cardFlipped && (
              <button 
                className="btn btn-ghost" 
                style={{ border: "1px solid var(--warm)", color: "var(--warm)", padding: 14 }}
                onClick={(e) => { e.stopPropagation(); setShowHint(!showHint); }}
              >
                {showHint ? "🙈 Скрыть" : "💡 Подсказка"}
              </button>
            )}
            <button className="btn btn-primary" style={{ flex: 1, padding: 14 }} onClick={handleNextCard}>Дальше →</button>
          </div>
        </div>
      );
    }

    if (selectedMethod === "practice") {
      if (sessionQueue.length === 0) {
        return (
          <div className="fade-in">
            <button className="back-btn" onClick={() => setSessionFlow("none")}>← Выйти</button>
            <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Нет глаголов в выборке</div>
          </div>
        );
      }
      const cur = sessionQueue[pIdx]!;

      // Prompt representation based on selectedDirection
      let questionTitle = "Напишите формы Past (V2) и Participle (V3)";
      let questionWord = cur.base;
      let questionSub = cur.ru;
      
      if (selectedDirection === "ru-en") {
        questionTitle = "Переведите глагол и напишите V2 и V3";
        questionWord = cur.ru;
        questionSub = "Напишите формы V2 и V3";
      } else if (selectedDirection === "mixed") {
        if (pIdx % 2 === 0) {
          questionTitle = "Переведите и напишите V2 и V3";
          questionWord = cur.ru;
          questionSub = "Напишите формы V2 и V3";
        } else {
          questionTitle = "Напишите формы Past (V2) и Participle (V3)";
          questionWord = cur.base;
          questionSub = cur.ru;
        }
      }

      const handleCheck = () => {
        setPChecked(true);
        const isPastCorrect = pPast.trim().toLowerCase() === cur.past.toLowerCase();
        const isPPCorrect = pPP.trim().toLowerCase() === cur.participle.toLowerCase();
        const isAllOk = isPastCorrect && isPPCorrect;

        setPScore(s => ({ c: s.c + (isAllOk ? 1 : 0), w: s.w + (isAllOk ? 0 : 1) }));

        if (isAllOk && !cur.learned) {
          toggleLearnVerb(cur.id);
        }
      };

      const handleDontRemember = () => {
        setPChecked(true);
        setPScore(s => ({ ...s, w: s.w + 1 }));
      };

      const handleNext = () => {
        if (pIdx + 1 >= sessionQueue.length) {
          setSessionFlow("none");
        } else {
          setPIdx(pIdx + 1);
          setPPast("");
          setPPP("");
          setPChecked(false);
          setShowHint(false);
        }
      };

      return (
        <div className="fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button className="back-btn" onClick={() => { setSessionFlow("none"); }}>← Выйти</button>
            <span className="badge">{pIdx + 1}/{sessionQueue.length}</span>
            <span>
              <span style={{ color: "var(--sage)", fontWeight: 600 }}>✓ {pScore.c}</span>{" "}
              <span style={{ color: "var(--rose)", fontWeight: 600 }}>✗ {pScore.w}</span>
            </span>
          </div>

          <div className="card" style={{ textAlign: "center" }}>
            <span className="badge" style={{ marginBottom: 10, background: "rgba(148,161,135,0.08)", color: "var(--sage)" }}>Письменная тренировка</span>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 6 }}>{questionTitle}</div>
            <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 32 }}>{questionWord}</div>
            <div style={{ color: "#aaa", fontSize: 14, marginBottom: 20 }}>{questionSub}</div>

            <div style={{ textAlign: "left" }}>
              <label className="sub-text" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Past Simple (V2)</label>
              <input 
                className="input" 
                style={{ marginTop: 4, fontSize: 16, marginBottom: 12 }} 
                value={pPast}
                onChange={e => setPPast(e.target.value)}
                disabled={pChecked}
                placeholder="Введите V2..."
                autoFocus
              />
              {pChecked && pPast.trim().toLowerCase() !== cur.past.toLowerCase() && (
                <div style={{ fontSize: 12, color: "var(--rose)", marginBottom: 8, fontWeight: 500 }}>✓ Правильно: {cur.past}</div>
              )}

              <label className="sub-text" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Past Participle (V3)</label>
              <input 
                className="input" 
                style={{ marginTop: 4, fontSize: 16 }} 
                value={pPP}
                onChange={e => setPPP(e.target.value)}
                disabled={pChecked}
                placeholder="Введите V3..."
              />
              {pChecked && pPP.trim().toLowerCase() !== cur.participle.toLowerCase() && (
                <div style={{ fontSize: 12, color: "var(--rose)", marginTop: 4, fontWeight: 500 }}>✓ Правильно: {cur.participle}</div>
              )}
            </div>

            {showHint && (
              <div style={{ marginTop: 14, padding: "8px 12px", background: "rgba(230,175,46,0.08)", borderRadius: 8, fontSize: 13, color: "var(--warm)", fontWeight: 500, textAlign: "left" }}>
                💡 Первые буквы: <strong>{cur.past.slice(0, 2)}...</strong> / <strong>{cur.participle.slice(0, 2)}...</strong>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
              {!pChecked && (
                <button 
                  className="btn btn-outline" 
                  style={{ flex: 1, borderColor: "var(--rose)", color: "var(--rose)", padding: 14, fontSize: 14 }}
                  onClick={handleDontRemember}
                >
                  🤷 Не помню
                </button>
              )}
              {!pChecked && !showHint && (
                <button 
                  className="btn btn-outline" 
                  style={{ flex: 1, borderColor: "var(--warm)", color: "var(--warm)", padding: 14, fontSize: 14 }}
                  onClick={() => setShowHint(true)}
                >
                  💡 Подсказка
                </button>
              )}
              
              {!pChecked ? (
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 2, padding: 14 }} 
                  onClick={handleCheck}
                  disabled={!pPast.trim() || !pPP.trim()}
                >
                  Проверить
                </button>
              ) : (
                <button className="btn btn-secondary" style={{ width: "100%", padding: 14 }} onClick={handleNext}>
                  {pIdx + 1 >= sessionQueue.length ? "Завершить" : "Дальше →"}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (selectedMethod === "choice") {
      if (sessionQueue.length === 0) {
        return (
          <div className="fade-in">
            <button className="back-btn" onClick={() => setSessionFlow("none")}>← Выйти</button>
            <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Нет глаголов в выборке</div>
          </div>
        );
      }
      const cur = sessionQueue[pIdx]!;
      const correctOpt = `${cur.past} / ${cur.participle}`;

      // Prompt representation based on selectedDirection
      let questionTitle = "Выберите правильные формы V2 и V3";
      let questionWord = cur.base;
      let questionSub = cur.ru;

      if (selectedDirection === "ru-en") {
        questionTitle = "Выберите V2 и V3 перевод для глагола";
        questionWord = cur.ru;
        questionSub = "Выберите формы V2 и V3";
      } else if (selectedDirection === "mixed") {
        if (pIdx % 2 === 0) {
          questionTitle = "Выберите V2 и V3 перевод для глагола";
          questionWord = cur.ru;
          questionSub = "Выберите формы V2 и V3";
        } else {
          questionTitle = "Выберите правильные формы V2 и V3";
          questionWord = cur.base;
          questionSub = cur.ru;
        }
      }

      const handleChoiceClick = (opt: string) => {
        if (pChecked) return;
        setPAns(opt);
        setPChecked(true);
        const correct = opt === correctOpt;
        setPScore(s => ({ c: s.c + (correct ? 1 : 0), w: s.w + (correct ? 0 : 1) }));
        if (correct && !cur.learned) {
          toggleLearnVerb(cur.id);
        }
      };

      const handleChoiceNext = () => {
        if (pIdx + 1 >= sessionQueue.length) {
          setSessionFlow("none");
        } else {
          setPIdx(pIdx + 1);
          setPAns("");
          setPChecked(false);
          setHalfHalfUsed(false);
          setShowHint(false);
        }
      };

      return (
        <div className="fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button className="back-btn" onClick={() => { setSessionFlow("none"); }}>← Выйти</button>
            <span className="badge">{pIdx + 1}/{sessionQueue.length}</span>
            <span>
              <span style={{ color: "var(--sage)", fontWeight: 600 }}>✓ {pScore.c}</span>{" "}
              <span style={{ color: "var(--rose)", fontWeight: 600 }}>✗ {pScore.w}</span>
            </span>
          </div>

          <div className="card" style={{ textAlign: "center", marginBottom: 16 }}>
            <span className="badge" style={{ marginBottom: 10, background: "rgba(148,161,135,0.08)", color: "var(--sage)" }}>Выбор вариантов</span>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 6 }}>{questionTitle}</div>
            <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 32 }}>{questionWord}</div>
            <div style={{ color: "#aaa", fontSize: 14, marginBottom: 20 }}>{questionSub}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {practiceChoices.map((opt, i) => {
                const isSelected = pAns === opt;
                const isCorrect = opt === correctOpt;
                
                if (halfHalfUsed && !isCorrect) {
                  const incorrects = practiceChoices.filter(x => x !== correctOpt);
                  const keepIncorrect = incorrects[0];
                  if (opt !== keepIncorrect) {
                    return null;
                  }
                }

                let style: React.CSSProperties = { padding: 14, textTransform: "none", fontSize: 15 };

                if (pChecked) {
                  if (isCorrect) {
                    style = { ...style, background: "var(--sage-soft)", color: "var(--sage)", border: "2px solid var(--sage)" };
                  } else if (isSelected) {
                    style = { ...style, background: "var(--rose-soft)", color: "var(--rose)", border: "2px solid var(--rose)" };
                  } else {
                    style = { ...style, opacity: 0.5 };
                  }
                }

                return (
                  <button 
                    key={i} 
                    className="btn btn-outline" 
                    style={style}
                    onClick={() => handleChoiceClick(opt)}
                    disabled={pChecked}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {showHint && (
              <div style={{ marginTop: 14, padding: "8px 12px", background: "rgba(230,175,46,0.08)", borderRadius: 8, fontSize: 13, color: "var(--warm)", fontWeight: 500 }}>
                💡 Подсказка: Правильный ответ начинается на букву: <strong>"{cur.past[0]}"</strong>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {!pChecked && !halfHalfUsed && (
                <button 
                  className="btn btn-outline" 
                  style={{ flex: 1, borderColor: "var(--warm)", color: "var(--warm)", fontSize: 13 }}
                  onClick={() => setHalfHalfUsed(true)}
                >
                  💡 Подсказка (50/50)
                </button>
              )}
              {!pChecked && !showHint && (
                <button 
                  className="btn btn-outline" 
                  style={{ flex: 1, borderColor: "var(--warm)", color: "var(--warm)", fontSize: 13 }}
                  onClick={() => setShowHint(true)}
                >
                  💡 Подсказка (Первая буква)
                </button>
              )}
            </div>

            {pChecked && (
              <div style={{ marginTop: 18 }}>
                {pAns === correctOpt ? (
                  <p style={{ color: "var(--sage)", fontWeight: 600, fontSize: 14 }}>✨ Превосходно! Верно.</p>
                ) : (
                  <p style={{ color: "var(--rose)", fontWeight: 600, fontSize: 14 }}>⚠️ Ошибка. Правильный ответ: {correctOpt}</p>
                )}
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 12, padding: 14 }} onClick={handleChoiceNext}>
                  {pIdx + 1 >= sessionQueue.length ? "Завершить" : "Дальше →"}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (selectedMethod === "voice") {
      if (sessionQueue.length === 0) {
        return (
          <div className="fade-in">
            <button className="back-btn" onClick={() => setSessionFlow("none")}>← Выйти</button>
            <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Нет глаголов в выборке</div>
          </div>
        );
      }
      const cur = sessionQueue[pIdx]!;
      const expectedForms = `${cur.past} ${cur.participle}`;

      // Prompt representation based on selectedDirection
      let questionTitle = "Произнесите V2 и V3 формы глагола";
      let questionWord = cur.base;
      let questionSub = cur.ru;

      if (selectedDirection === "ru-en") {
        questionTitle = "Переведите и произнесите V2 и V3 формы";
        questionWord = cur.ru;
        questionSub = "Произнесите формы V2 и V3";
      } else if (selectedDirection === "mixed") {
        if (pIdx % 2 === 0) {
          questionTitle = "Переведите и произнесите V2 и V3 формы";
          questionWord = cur.ru;
          questionSub = "Произнесите формы V2 и V3";
        } else {
          questionTitle = "Произнесите V2 и V3 формы глагола";
          questionWord = cur.base;
          questionSub = cur.ru;
        }
      }

      const handleVoiceNext = () => {
        if (pIdx + 1 >= sessionQueue.length) {
          setSessionFlow("none");
        } else {
          setPIdx(pIdx + 1);
          setRecMsg("");
          setRecError("");
          setPChecked(false);
          setShowHint(false);
        }
      };

      const handleManualPass = (correct: boolean) => {
        setPChecked(true);
        setPScore(s => ({ c: s.c + (correct ? 1 : 0), w: s.w + (correct ? 0 : 1) }));
        if (correct && !cur.learned) {
          toggleLearnVerb(cur.id);
        }
      };

      const startSpeechRecogUnified = () => {
        setRecog(true);
        setRecError("");
        setRecMsg("");
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRec) {
          setRecog(false);
          setRecError("browser");
          return;
        }
        try {
          const r = new SpeechRec();
          r.lang = "en-US";
          r.maxAlternatives = 1;
          r.continuous = false;
          r.interimResults = false;
          
          r.onresult = (e: any) => {
            const t = Array.from(e.results).map((x: any) => x[0].transcript).join("").trim().toLowerCase();
            if (t) {
              setRecMsg(t);
              const expectedPast = cur.past.toLowerCase().trim();
              const expectedPP = cur.participle.toLowerCase().trim();
              
              const heardPast = t.includes(expectedPast);
              const heardPP = t.includes(expectedPP);
              
              setPChecked(true);
              if (heardPast && heardPP) {
                setPScore(s => ({ ...s, c: s.c + 1 }));
                if (!cur.learned) {
                  toggleLearnVerb(cur.id);
                }
              } else {
                setPScore(s => ({ ...s, w: s.w + 1 }));
              }
            } else {
              setRecError("no-speech");
            }
            setRecog(false);
          };
          
          r.onerror = (e: any) => {
            console.error("Irregular Speech recognition error:", e.error);
            if (e.error === "not-allowed" || e.error === "permission-denied" || e.error === "service-not-allowed") {
              setRecError("not-allowed");
            } else {
              setRecError(e.error || "error");
            }
            setRecog(false);
          };
          
          r.onend = () => {
            setRecog(false);
          };
          
          r.start();
        } catch (err) {
          setRecError("error");
          setRecog(false);
        }
      };

      return (
        <div className="fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button className="back-btn" onClick={() => { setSessionFlow("none"); }}>← Выйти</button>
            <span className="badge">{pIdx + 1}/{sessionQueue.length}</span>
            <span>
              <span style={{ color: "var(--sage)", fontWeight: 600 }}>✓ {pScore.c}</span>{" "}
              <span style={{ color: "var(--rose)", fontWeight: 600 }}>✗ {pScore.w}</span>
            </span>
          </div>

          <div className="card" style={{ textAlign: "center" }}>
            <span className="badge" style={{ marginBottom: 10, background: "rgba(168,140,240,0.08)", color: "var(--lavender)" }}>🎙️ Устный (Произношение)</span>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 6 }}>{questionTitle}</div>
            <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 32 }}>{questionWord}</div>
            <div style={{ color: "#aaa", fontSize: 14, marginBottom: 20 }}>{questionSub}</div>

            <p style={{ fontSize: 13, color: "#aaa", marginBottom: 14, lineHeight: 1.4 }}>
              Нажмите микрофон и произнесите формы V2 и V3
            </p>

            {showHint && (
              <div style={{ padding: "8px 12px", background: "rgba(230,175,46,0.08)", borderRadius: 8, fontSize: 13, color: "var(--warm)", fontWeight: 500, marginBottom: 14 }}>
                💡 Подсказка (как сказать): <strong>"{expectedForms}"</strong>
              </div>
            )}

            {!pChecked ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <button 
                  className={`btn ${recog ? "btn-secondary pulse" : "btn-primary"}`} 
                  style={{ padding: "16px 28px", borderRadius: "2rem", display: "inline-flex", alignItems: "center", gap: 8 }}
                  onClick={startSpeechRecogUnified}
                  disabled={recog}
                >
                  {recog ? "🎙️ Слушаю вас..." : "🎙️ Говорить формы"}
                </button>

                {!showHint && (
                  <button 
                    className="btn btn-ghost" 
                    style={{ fontSize: 13, color: "var(--warm)", textDecoration: "underline" }} 
                    onClick={() => setShowHint(true)}
                  >
                    💡 Показать подсказку
                  </button>
                )}

                {recError === "not-allowed" && (
                  <div className="card" style={{ padding: 12, border: "1.5px solid var(--rose)", background: "rgba(220, 95, 95, 0.05)", marginTop: 8 }}>
                    <p style={{ fontSize: 12, color: "var(--rose)", fontWeight: 600, margin: "0 0 4px 0" }}>🎙️ Доступ к микрофону заблокирован во фрейме</p>
                    <p style={{ fontSize: 11, color: "#aaa", lineHeight: "1.4", margin: "0 0 6px 0" }}>
                      Пожалуйста, <strong>откройте приложение в новой вкладке</strong> (иконка со стрелочкой вверху справа). Или воспользуйтесь кнопками ручного ввода ниже:
                    </p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => handleManualPass(false)}>Не знаю ✗</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px", color: "var(--sage)" }} onClick={() => handleManualPass(true)}>Знаю ✓</button>
                    </div>
                  </div>
                )}

                {recError && recError !== "not-allowed" && (
                  <div style={{ width: "100%" }}>
                    <p style={{ fontSize: 12, color: "var(--rose)", margin: "4px 0 10px" }}>
                      ⚠️ Ошибка: {recError === "browser" ? "Микрофон не поддерживается браузером." : recError === "no-speech" ? "Речь не распознана." : `Код ошибки: ${recError}`}
                    </p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => handleManualPass(false)}>Не знаю ✗</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px", color: "var(--sage)" }} onClick={() => handleManualPass(true)}>Знаю ✓</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {recMsg && (
                  <div style={{ margin: "10px 0 16px" }}>
                    <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>Услышано:</p>
                    <p style={{ fontSize: 17, fontWeight: 600, fontStyle: "italic", margin: "4px 0" }}>"{recMsg}"</p>
                  </div>
                )}

                {recMsg.includes(cur.past.toLowerCase().trim()) && recMsg.includes(cur.participle.toLowerCase().trim()) ? (
                  <p style={{ color: "var(--sage)", fontWeight: 600, fontSize: 14 }}>✨ Отлично! Произношение распознано верно.</p>
                ) : (
                  <div>
                    <p style={{ color: "var(--rose)", fontWeight: 600, fontSize: 14 }}>⚠️ Формы произнесены неточно или не распознаны.</p>
                    <p style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>Ожидалось: <strong>"{expectedForms}"</strong></p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                      <button 
                        className="btn btn-outline" 
                        style={{ fontSize: 12, color: "var(--sage)", borderColor: "var(--sage)", padding: "8px 12px" }}
                        onClick={() => {
                          setPScore(s => ({ c: s.c + 1, w: Math.max(0, s.w - 1) }));
                          if (!cur.learned) {
                            toggleLearnVerb(cur.id);
                          }
                          setRecMsg(`${cur.past} ${cur.participle}`);
                        }}
                      >
                        ✓ Я сказал верно (Зачесть)
                      </button>
                      <button 
                        className="btn btn-outline" 
                        style={{ fontSize: 12, padding: "8px 12px" }}
                        onClick={() => {
                          setPChecked(false);
                          setRecMsg("");
                          setRecError("");
                        }}
                      >
                        🎙️ Сказать еще раз
                      </button>
                    </div>
                  </div>
                )}

                <button className="btn btn-primary" style={{ width: "100%", marginTop: 14, padding: 14 }} onClick={handleVoiceNext}>
                  {pIdx + 1 >= sessionQueue.length ? "Завершить" : "Дальше →"}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  // Cards mode render
  if (mode === "cards") {
    if (filtered.length === 0) {
      return (
        <div className="fade-in">
          <button className="back-btn" onClick={() => setMode("list")}>← Назад</button>
          <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Нет глаголов в выборке</div>
        </div>
      );
    }
    const cur = filtered[cardIdx % filtered.length]!;
    return (
      <div className="fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button className="back-btn" onClick={() => { setMode("list"); setCardIdx(0); setCardFlipped(false); }}>← Назад</button>
          <span className="badge">{ (cardIdx % filtered.length) + 1 }/{ filtered.length }</span>
          <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => toggleLearnVerb(cur.id)}>
            {cur.learned ? "↩️ Повторять" : "✅ Выучил"}
          </button>
        </div>

        <div className="flip-card" onClick={() => setCardFlipped(!cardFlipped)}>
          <div className={`flip-inner ${cardFlipped ? "flipped" : ""}`}>
            <div className="flip-front">
              <div style={{ fontSize: 13, color: "#aaa", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>Infinitive (V1)</div>
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 38, marginBottom: 8 }}>{cur.base}</div>
              <div style={{ color: "#aaa", fontSize: 15 }}>{cur.ru}</div>
              <div style={{ marginTop: 16, fontSize: 12, color: "#ccc" }}>Нажми, чтобы увидеть формы →</div>
            </div>
            <div className="flip-back">
              <div style={{ fontSize: 13, color: "#aaa", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>{cur.base}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Past (V2)</div>
                  <div style={{ fontFamily: "Lora, serif", fontSize: 22, fontWeight: 600, color: "var(--rose)" }}>{cur.past}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Participle (V3)</div>
                  <div style={{ fontFamily: "Lora, serif", fontSize: 22, fontWeight: 600, color: "var(--sage)" }}>{cur.participle}</div>
                </div>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button className="speak-btn" style={{ fontSize: 18 }} onClick={(e) => { e.stopPropagation(); speak(cur.base); }}>🔊 V1</button>
                <button className="speak-btn" style={{ fontSize: 18 }} onClick={(e) => { e.stopPropagation(); speak(cur.past); }}>🔊 V2</button>
                <button className="speak-btn" style={{ fontSize: 18 }} onClick={(e) => { e.stopPropagation(); speak(cur.participle); }}>🔊 V3</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn btn-outline" style={{ flex: 1, padding: 14 }} onClick={() => { setCardIdx((cardIdx - 1 + filtered.length) % filtered.length); setCardFlipped(false); }}>← Назад</button>
          <button className="btn btn-primary" style={{ flex: 1, padding: 14 }} onClick={() => { setCardIdx((cardIdx + 1) % filtered.length); setCardFlipped(false); }}>Дальше →</button>
        </div>
      </div>
    );
  }

  // Choice mode render
  if (mode === "choice") {
    if (irregular.length === 0) {
      return (
        <div className="fade-in">
          <button className="back-btn" onClick={() => setMode("list")}>← Назад</button>
          <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Нет глаголов для тренировки</div>
        </div>
      );
    }
    const cur = irregular[pIdx]!;
    const correctOpt = `${cur.past} / ${cur.participle}`;

    const handleChoiceClick = (opt: string) => {
      if (pChecked) return;
      setPAns(opt);
      setPChecked(true);
      const correct = opt === correctOpt;
      setPScore(s => ({ c: s.c + (correct ? 1 : 0), w: s.w + (correct ? 0 : 1) }));
      if (correct && !cur.learned) {
        toggleLearnVerb(cur.id);
      }
    };

    const handleChoiceNext = () => {
      if (pIdx + 1 >= irregular.length) {
        setMode("list");
      } else {
        setPIdx(pIdx + 1);
        setPAns("");
        setPChecked(false);
      }
    };

    return (
      <div className="fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button className="back-btn" onClick={() => { setMode("list"); setPIdx(0); setPAns(""); setPChecked(false); }}>← Выйти</button>
          <span className="badge">{pIdx + 1}/{irregular.length}</span>
          <span>
            <span style={{ color: "var(--sage)" }}>✓{pScore.c}</span>{" "}
            <span style={{ color: "var(--rose)" }}>✗{pScore.w}</span>
          </span>
        </div>

        <div className="card" style={{ textAlign: "center", marginBottom: 16 }}>
          <span className="badge" style={{ marginBottom: 10, background: "rgba(148,161,135,0.08)", color: "var(--sage)" }}>Выберите V2 и V3</span>
          <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 32 }}>{cur.base}</div>
          <div style={{ color: "#aaa", fontSize: 14, marginBottom: 20 }}>{cur.ru}</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {practiceChoices.map((opt, i) => {
              const isSelected = pAns === opt;
              const isCorrect = opt === correctOpt;
              let style: React.CSSProperties = { padding: 14, textTransform: "none", fontSize: 15 };

              if (pChecked) {
                if (isCorrect) {
                  style = { ...style, background: "var(--sage-soft)", color: "var(--sage)", border: "2px solid var(--sage)" };
                } else if (isSelected) {
                  style = { ...style, background: "var(--rose-soft)", color: "var(--rose)", border: "2px solid var(--rose)" };
                } else {
                  style = { ...style, opacity: 0.5 };
                }
              }

              return (
                <button 
                  key={i} 
                  className="btn btn-outline" 
                  style={style}
                  onClick={() => handleChoiceClick(opt)}
                  disabled={pChecked}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {pChecked && (
            <div style={{ marginTop: 18 }}>
              {pAns === correctOpt ? (
                <p style={{ color: "var(--sage)", fontWeight: 600, fontSize: 14 }}>✨ Превосходно! Верно.</p>
              ) : (
                <p style={{ color: "var(--rose)", fontWeight: 600, fontSize: 14 }}>⚠️ Ошибка. Правильный ответ: {correctOpt}</p>
              )}
              <button className="btn btn-primary" style={{ width: "100%", marginTop: 12, padding: 14 }} onClick={handleChoiceNext}>
                {pIdx + 1 >= irregular.length ? "Завершить" : "Дальше →"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Speech recognition helper
  const startSpeechRecog = () => {
    setRecog(true);
    setRecError("");
    setRecMsg("");
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setRecog(false);
      setRecError("browser");
      return;
    }
    try {
      const r = new SpeechRec();
      r.lang = "en-US";
      r.maxAlternatives = 1;
      r.continuous = false;
      r.interimResults = false;
      
      const cur = irregular[pIdx]!;
      
      r.onresult = (e: any) => {
        const t = Array.from(e.results).map((x: any) => x[0].transcript).join("").trim().toLowerCase();
        if (t) {
          setRecMsg(t);
          // Compare with past & participle
          const expectedPast = cur.past.toLowerCase().trim();
          const expectedPP = cur.participle.toLowerCase().trim();
          
          const heardPast = t.includes(expectedPast);
          const heardPP = t.includes(expectedPP);
          
          setPChecked(true);
          if (heardPast && heardPP) {
            setPScore(s => ({ ...s, c: s.c + 1 }));
            if (!cur.learned) {
              toggleLearnVerb(cur.id);
            }
          } else {
            setPScore(s => ({ ...s, w: s.w + 1 }));
          }
        } else {
          setRecError("no-speech");
        }
        setRecog(false);
      };
      
      r.onerror = (e: any) => {
        console.error("Irregular Speech recognition error:", e.error);
        if (e.error === "not-allowed" || e.error === "permission-denied" || e.error === "service-not-allowed") {
          setRecError("not-allowed");
        } else {
          setRecError(e.error || "error");
        }
        setRecog(false);
      };
      
      r.onend = () => {
        setRecog(false);
      };
      
      r.start();
    } catch (err) {
      setRecError("error");
      setRecog(false);
    }
  };

  // Voice mode render
  if (mode === "voice") {
    if (irregular.length === 0) {
      return (
        <div className="fade-in">
          <button className="back-btn" onClick={() => setMode("list")}>← Назад</button>
          <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Нет глаголов для тренировки</div>
        </div>
      );
    }
    const cur = irregular[pIdx]!;
    const expectedForms = `${cur.past} ${cur.participle}`;

    const handleVoiceNext = () => {
      if (pIdx + 1 >= irregular.length) {
        setMode("list");
      } else {
        setPIdx(pIdx + 1);
        setRecMsg("");
        setRecError("");
        setPChecked(false);
      }
    };

    const handleManualPass = (correct: boolean) => {
      setPChecked(true);
      setPScore(s => ({ c: s.c + (correct ? 1 : 0), w: s.w + (correct ? 0 : 1) }));
      if (correct && !cur.learned) {
        toggleLearnVerb(cur.id);
      }
    };

    return (
      <div className="fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button className="back-btn" onClick={() => { setMode("list"); setPIdx(0); setRecMsg(""); setRecError(""); setPChecked(false); }}>← Выйти</button>
          <span className="badge">{pIdx + 1}/{irregular.length}</span>
          <span>
            <span style={{ color: "var(--sage)" }}>✓{pScore.c}</span>{" "}
            <span style={{ color: "var(--rose)" }}>✗{pScore.w}</span>
          </span>
        </div>

        <div className="card" style={{ textAlign: "center" }}>
          <span className="badge" style={{ marginBottom: 10, background: "rgba(168,140,240,0.08)", color: "var(--lavender)" }}>🎙️ Устный (Произношение)</span>
          <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 32 }}>{cur.base}</div>
          <div style={{ color: "#aaa", fontSize: 14, marginBottom: 20 }}>{cur.ru}</div>

          <p style={{ fontSize: 13, color: "#aaa", marginBottom: 14, lineHeight: 1.4 }}>
            Нажмите микрофон и произнесите формы V2 и V3 подряд через пробел:<br />
            <strong>"{cur.past} {cur.participle}"</strong>
          </p>

          {!pChecked ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <button 
                className={`btn ${recog ? "btn-secondary pulse" : "btn-primary"}`} 
                style={{ padding: "16px 28px", borderRadius: "2rem", display: "inline-flex", alignItems: "center", gap: 8 }}
                onClick={startSpeechRecog}
                disabled={recog}
              >
                {recog ? "🎙️ Слушаю вас..." : "🎙️ Говорить формы"}
              </button>

              {recError === "not-allowed" && (
                <div className="card" style={{ padding: 12, border: "1.5px solid var(--rose)", background: "rgba(220, 95, 95, 0.05)", marginTop: 8 }}>
                  <p style={{ fontSize: 12, color: "var(--rose)", fontWeight: 600, margin: "0 0 4px 0" }}>🎙️ Доступ к микрофону заблокирован во фрейме</p>
                  <p style={{ fontSize: 11, color: "#aaa", lineHeight: "1.4", margin: "0 0 6px 0" }}>
                    Пожалуйста, <strong>откройте приложение в новой вкладке</strong> (иконка со стрелочкой вверху справа). Или воспользуйтесь кнопками ручного ввода ниже:
                  </p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => handleManualPass(false)}>Не знаю ✗</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px", color: "var(--sage)" }} onClick={() => handleManualPass(true)}>Знаю ✓</button>
                  </div>
                </div>
              )}

              {recError && recError !== "not-allowed" && (
                <p style={{ fontSize: 12, color: "var(--rose)", margin: 4 }}>
                  ⚠️ Ошибка: {recError === "browser" ? "Микрофон не поддерживается браузером." : recError === "no-speech" ? "Речь не распознана." : `Код ошибки: ${recError}`}
                </p>
              )}
            </div>
          ) : (
            <div>
              {recMsg && (
                <div style={{ margin: "10px 0 16px" }}>
                  <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>Услышано:</p>
                  <p style={{ fontSize: 17, fontWeight: 600, fontStyle: "italic", margin: "4px 0" }}>"{recMsg}"</p>
                </div>
              )}

              {recMsg.includes(cur.past.toLowerCase().trim()) && recMsg.includes(cur.participle.toLowerCase().trim()) ? (
                <p style={{ color: "var(--sage)", fontWeight: 600, fontSize: 14 }}>✨ Отлично! Произношение распознано верно.</p>
              ) : (
                <div>
                  <p style={{ color: "var(--rose)", fontWeight: 600, fontSize: 14 }}>⚠️ Формы произнесены неточно или не распознаны.</p>
                  <p style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>Ожидалось: <strong>"{expectedForms}"</strong></p>
                </div>
              )}

              <button className="btn btn-primary" style={{ width: "100%", marginTop: 14, padding: 14 }} onClick={handleVoiceNext}>
                {pIdx + 1 >= irregular.length ? "Завершить" : "Дальше →"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Practice mode render
  if (mode === "practice") {
    if (irregular.length === 0) {
      return (
        <div className="fade-in">
          <button className="back-btn" onClick={() => setMode("list")}>← Назад</button>
          <div style={{ textAlign: "center", padding: 40, color: "#ccc" }}>Нет глаголов для тренировки</div>
        </div>
      );
    }
    const cur = irregular[pIdx]!;
    
    const handleCheck = () => {
      setPChecked(true);
      const isPastCorrect = pPast.trim().toLowerCase() === cur.past.toLowerCase();
      const isPPCorrect = pPP.trim().toLowerCase() === cur.participle.toLowerCase();
      const isAllOk = isPastCorrect && isPPCorrect;

      setPScore(s => ({ c: s.c + (isAllOk ? 1 : 0), w: s.w + (isAllOk ? 0 : 1) }));

      if (isAllOk && !cur.learned) {
        toggleLearnVerb(cur.id);
      }
    };

    const handleNext = () => {
      if (pIdx + 1 >= irregular.length) {
        setMode("list");
      } else {
        setPIdx(pIdx + 1);
        setPPast("");
        setPPP("");
        setPChecked(false);
      }
    };

    return (
      <div className="fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button className="back-btn" onClick={() => { setMode("list"); setPIdx(0); setPPast(""); setPPP(""); setPChecked(false); }}>← Выйти</button>
          <span className="badge">{pIdx + 1}/{irregular.length}</span>
          <span>
            <span style={{ color: "var(--sage)" }}>✓{pScore.c}</span>{" "}
            <span style={{ color: "var(--rose)" }}>✗{pScore.w}</span>
          </span>
        </div>

        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 32 }}>{cur.base}</div>
          <div style={{ color: "#aaa", fontSize: 14, marginBottom: 20 }}>{cur.ru}</div>

          <div style={{ textAlign: "left" }}>
            <label className="sub-text" style={{ fontSize: 10, fontWeight: 600 }}>Past Simple (V2)</label>
            <input 
              className="input" 
              style={{ marginTop: 4, fontSize: 16, marginBottom: 12 }} 
              value={pPast}
              onChange={e => setPPast(e.target.value)}
              disabled={pChecked}
            />
            {pChecked && pPast.trim().toLowerCase() !== cur.past.toLowerCase() && (
              <div style={{ fontSize: 12, color: "var(--rose)", marginBottom: 8 }}>Правильно: {cur.past}</div>
            )}

            <label className="sub-text" style={{ fontSize: 10, fontWeight: 600 }}>Past Participle (V3)</label>
            <input 
              className="input" 
              style={{ marginTop: 4, fontSize: 16 }} 
              value={pPP}
              onChange={e => setPPP(e.target.value)}
              disabled={pChecked}
            />
            {pChecked && pPP.trim().toLowerCase() !== cur.participle.toLowerCase() && (
              <div style={{ fontSize: 12, color: "var(--rose)", marginTop: 4 }}>Правильно: {cur.participle}</div>
            )}
          </div>

          {!pChecked ? (
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 20, padding: 14 }} onClick={handleCheck}>Проверить</button>
          ) : (
            <button className="btn btn-secondary" style={{ width: "100%", marginTop: 20, padding: 14 }} onClick={handleNext}>
              {pIdx + 1 >= irregular.length ? "Завершить" : "Дальше →"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleBack = () => {
    if (editingId) {
      saveEdit();
    }
    onBack();
  };

  // Default List View
  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button className="back-btn" onClick={handleBack}>← Назад</button>
        <h2 className="section-title" style={{ margin: 0 }}>Глаголы ({irregular.length})</h2>
        <span />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input 
          className="input" 
          placeholder="Поиск глагола..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          style={{ flex: 1, minWidth: 120 }}
        />
        <select className="select" value={filterLearned} onChange={e => setFilterLearned(e.target.value as any)} style={{ minWidth: 100 }}>
          <option value="all">Все</option>
          <option value="new">Новые</option>
          <option value="learned">Выученные</option>
        </select>
        <button className="btn btn-outline btn-sm" onClick={addCustomVerb}>+ Добавить</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <button 
          className="btn" 
          disabled={irregular.filter(v => !v.learned).length === 0}
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
            background: irregular.filter(v => !v.learned).length > 0 ? "var(--rose)" : "rgba(180,180,180,.14)",
            color: irregular.filter(v => !v.learned).length > 0 ? "#fff" : "#aaa",
            boxShadow: irregular.filter(v => !v.learned).length > 0 ? "0 4px 12px rgba(181,93,76,.2)" : "none",
            border: "none",
            cursor: irregular.filter(v => !v.learned).length > 0 ? "pointer" : "default"
          }}
          onClick={() => {
            setSessionFlow("learn");
            setFlowStep("direction");
          }}
        >
          <div>
            <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 19, color: irregular.filter(v => !v.learned).length > 0 ? "#fff" : "#aaa", fontWeight: 600 }}>Учить глаголы ✨</div>
            <div style={{ fontSize: 12, opacity: .9, marginTop: 2, color: irregular.filter(v => !v.learned).length > 0 ? "#eee" : "#aaa" }}>Новые глаголы для изучения — {irregular.filter(v => !v.learned).length}</div>
          </div>
          <span style={{ fontSize: 22, opacity: irregular.filter(v => !v.learned).length > 0 ? .8 : .3 }}>→</span>
        </button>

        <button 
          className="btn" 
          disabled={irregular.filter(v => v.learned).length === 0}
          style={{ 
            width: "100%", 
            padding: "16px 20px", 
            textAlign: "left", 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            borderRadius: "1.5rem", 
            fontSize: 15,
            background: irregular.filter(v => v.learned).length > 0 ? "var(--sage)" : "rgba(180,180,180,.14)",
            color: irregular.filter(v => v.learned).length > 0 ? "#fff" : "#aaa",
            boxShadow: irregular.filter(v => v.learned).length > 0 ? "0 4px 12px rgba(148,161,135,.2)" : "none",
            border: "none",
            cursor: irregular.filter(v => v.learned).length > 0 ? "pointer" : "default"
          }}
          onClick={() => {
            setSessionFlow("review");
            setFlowStep("direction");
          }}
        >
          <div>
            <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 19, color: irregular.filter(v => v.learned).length > 0 ? "#fff" : "#aaa", fontWeight: 600 }}>Повторять глаголы ↺</div>
            <div style={{ fontSize: 12, opacity: .9, marginTop: 2, color: irregular.filter(v => v.learned).length > 0 ? "#eee" : "#aaa" }}>
              {irregular.filter(v => v.learned).length === 0 
                ? "Сначала выучите глаголы (или повторите все)" 
                : `Выучено — ${irregular.filter(v => v.learned).length}`}
            </div>
          </div>
          <span style={{ fontSize: 22, opacity: irregular.filter(v => v.learned).length > 0 ? .8 : .3 }}>↺</span>
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>
        {irregular.filter(v => v.learned).length} / {irregular.length} выучено
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="irregular-table">
            <thead>
              <tr>
                <th>V1 (Infinitive)</th>
                <th>V2 (Past)</th>
                <th>V3 (Participle)</th>
                <th>Перевод</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} style={{ background: v.learned ? "rgba(148,161,135,0.04)" : "transparent" }}>
                  {editingId === v.id ? (
                    <>
                      <td><input className="input" style={{ fontSize: 13, padding: "6px 8px" }} value={editForm.base || ""} onChange={e => setEditForm({ ...editForm, base: e.target.value })} /></td>
                      <td><input className="input" style={{ fontSize: 13, padding: "6px 8px" }} value={editForm.past || ""} onChange={e => setEditForm({ ...editForm, past: e.target.value })} /></td>
                      <td><input className="input" style={{ fontSize: 13, padding: "6px 8px" }} value={editForm.participle || ""} onChange={e => setEditForm({ ...editForm, participle: e.target.value })} /></td>
                      <td><input className="input" style={{ fontSize: 13, padding: "6px 8px" }} value={editForm.ru || ""} onChange={e => setEditForm({ ...editForm, ru: e.target.value })} /></td>
                      <td>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={saveEdit}>✓</button>
                          <button className="btn btn-sm" style={{ fontSize: 11, color: "var(--rose)" }} onClick={() => setEditingId(null)}>✕</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {v.learned && <span style={{ color: "var(--sage)", fontSize: 10 }}>✓</span>}
                          {v.base}
                          <button className="speak-btn" onClick={() => speak(v.base)}>🔊</button>
                        </span>
                      </td>
                      <td><span style={{ display: "flex", alignItems: "center", gap: 4 }}>{v.past}<button className="speak-btn" onClick={() => speak(v.past)}>🔊</button></span></td>
                      <td><span style={{ display: "flex", alignItems: "center", gap: 4 }}>{v.participle}<button className="speak-btn" onClick={() => speak(v.participle)}>🔊</button></span></td>
                      <td style={{ color: "#888" }}>{v.ru}</td>
                      <td>
                        <div style={{ display: "flex", gap: 2 }}>
                          <button 
                            className="btn btn-sm" 
                            style={{ 
                              fontSize: 11, 
                              padding: "4px 8px",
                              background: v.learned ? "transparent" : "var(--sage-soft)",
                              color: v.learned ? "var(--muted)" : "var(--sage)",
                              border: v.learned ? "1px solid var(--border)" : "none"
                            }} 
                            onClick={() => toggleLearnVerb(v.id)}
                            title={v.learned ? "Вернуть на изучение" : "Отметить как выученный"}
                          >
                            {v.learned ? "↩️ Изучать" : "✓ Знаю"}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => startEdit(v)}>✏️</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
