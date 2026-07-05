import { useState, useMemo, useEffect, useRef } from "react";
import { Word, UserProgress } from "../types";
import { speak } from "../utils";

interface StudyScreenProps {
  words: Word[];
  stats: UserProgress;
  sessionType: "learn" | "review";
  onSaveWord: (word: Word) => void;
  onSaveProgress: (stats: UserProgress) => void;
  onExit: () => void;
}

export default function StudyScreen({ 
  words, 
  stats, 
  sessionType, 
  onSaveWord, 
  onSaveProgress, 
  onExit 
}: StudyScreenProps) {
  const [stage, setStage] = useState<"mode" | "dir" | "session" | "done">(
    sessionType === "learn" ? "dir" : "mode"
  );
  const [mode, setMode] = useState<"cards" | "choice" | "written" | "voice">(
    sessionType === "learn" ? "cards" : "choice"
  );
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [dir, setDir] = useState<"en-ru" | "ru-en" | "mixed">("en-ru");
  const [queue, setQueue] = useState<Word[]>([]);
  const [idx, setIdx] = useState(0);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [isRepeatRound, setIsRepeatRound] = useState(false);
  const [testRecResult, setTestRecResult] = useState<string>("");
  const [testRecog, setTestRecog] = useState(false);
  const [testRecError, setTestRecError] = useState("");
  const [answered, setAnswered] = useState(false);
  const [ans, setAns] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [hint, setHint] = useState(false);
  const [score, setScore] = useState({ c: 0, w: 0 });
  const [recog, setRecog] = useState(false);
  const [recMsg, setRecMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const cur = queue[idx];
  const pDir = cur ? (dir === "mixed" ? (cur.id.charCodeAt(0) + idx) % 2 === 0 ? "en-ru" : "ru-en" : dir) : "en-ru";
  const prompt = cur ? (pDir === "en-ru" ? cur.en : cur.ru) : "";
  const expected = cur ? (pDir === "en-ru" ? cur.ru : cur.en) : "";
  const aLang = pDir === "en-ru" ? "ru-RU" : "en-US";

  // Shuffle function
  const shuffle = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]!];
    }
    return copy;
  };

  const normalize = (s: string) => s.toLowerCase().trim().replace(/[.,!?;:'"`]/g, "").replace(/\s+/g, " ");

  const isCorrect = (ansStr: string, expStr: string) => {
    const a = normalize(ansStr);
    const v = expStr.split(/[,/;]|\s\(|\)/g).map(normalize).filter(Boolean);
    return v.some(x => x === a || a.includes(x) || x.includes(a));
  };

  const startTestRecog = (expectedWord: string, lang: string) => {
    setTestRecog(true);
    setTestRecError("");
    setTestRecResult("");
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setTestRecog(false);
      setTestRecError("browser");
      return;
    }
    try {
      const r = new SpeechRec();
      r.lang = lang;
      r.maxAlternatives = 1;
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e: any) => {
        const t = Array.from(e.results).map((x: any) => x[0].transcript).join("").trim();
        if (t) {
          const correct = isCorrect(t, expectedWord);
          setTestRecResult(correct ? `✅ Верно! Услышано: "${t}"` : `❓ Услышано: "${t}" (ожидалось "${expectedWord}")`);
        } else {
          setTestRecError("no-speech");
        }
        setTestRecog(false);
      };
      r.onerror = (e: any) => {
        console.error("Test speech recognition error:", e.error);
        if (e.error === "not-allowed" || e.error === "permission-denied" || e.error === "service-not-allowed") {
          setTestRecError("not-allowed");
        } else {
          setTestRecError(e.error || "error");
        }
        setTestRecog(false);
      };
      r.onend = () => {
        setTestRecog(false);
      };
      r.start();
    } catch (err) {
      setTestRecError("error");
      setTestRecog(false);
    }
  };

  const choices = useMemo(() => {
    if (!cur || mode !== "choice") return [];
    const others = words.filter(w => w.id !== cur.id).map(w => pDir === "en-ru" ? w.ru : w.en);
    return shuffle([expected, ...shuffle(others).slice(0, 3)]);
  }, [cur?.id, mode, pDir, expected, words]);

  useEffect(() => {
    if (mode === "written") {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 200);
    }
  }, [cur?.id, mode]);

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

  const getPool = () => {
    if (sessionType === "learn") return words.filter(w => !w.learned);
    if (sessionType === "review") return words.filter(w => w.learned && getNextReviewTimeMs(w) === 0);
    return words.filter(w => w.learned);
  };

  // Sound signals
  const beep = (isCorrect: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const c = new AudioCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.setValueAtTime(isCorrect ? 660 : 220, c.currentTime);
      o.frequency.setValueAtTime(isCorrect ? 880 : 180, c.currentTime + 0.08);
      g.gain.setValueAtTime(0.12, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2);
      o.start();
      o.stop(c.currentTime + 0.2);
    } catch (e) {}
  };

  const handleAns = (a: string) => {
    if (!cur || answered) return;
    const dontRemember = a === "__dont_remember__";
    const correct = dontRemember ? false : isCorrect(a, expected);
    const finalAns = dontRemember ? expected : a;

    setOk(correct);
    setAnswered(true);
    setAns(finalAns);
    beep(correct);

    if (mode !== "cards" && mode !== "voice") {
      setTimeout(() => speak(cur.en), 400);
    }

    setScore(s => ({ c: s.c + (correct ? 1 : 0), w: s.w + (correct ? 0 : 1) }));

    if (!correct) {
      setWrongIds(prev => prev.includes(cur.id) ? prev : [...prev, cur.id]);
    }

    const today = new Date().toISOString().slice(0, 10);
    const updatedWord: Word = {
      ...cur,
      correct: cur.correct + (correct ? 1 : 0),
      wrong: cur.wrong + (correct ? 0 : 1),
      streak: correct ? cur.streak + 1 : 0,
      learned: correct ? (sessionType === "learn" || cur.learned) : cur.learned,
      learnedDate: correct && sessionType === "learn" && !cur.learned ? today : cur.learnedDate,
      lastReviewed: correct ? today : cur.lastReviewed
    };

    onSaveWord(updatedWord);

    // Update progress
    const currentDaily = { ...(stats.daily || {}) };
    const ds = { ...(currentDaily[today] || { date: today, learned: 0, reviewed: 0, correct: 0, wrong: 0 }) };
    if (correct) ds.correct++; else ds.wrong++;
    if (sessionType === "learn" && correct && !cur.learned) ds.learned++;
    if (sessionType !== "learn") ds.reviewed++;
    
    currentDaily[today] = ds;

    const newProgress: UserProgress = {
      ...stats,
      daily: currentDaily
    };

    onSaveProgress(newProgress);
  };

  const next = () => {
    // Reset test voice feedback on card change
    setTestRecResult("");
    setTestRecError("");

    if (idx + 1 >= queue.length) {
      if (wrongIds.length > 0) {
        // Repeat the wrong ones!
        const wrongWords = queue.filter(w => wrongIds.includes(w.id));
        setQueue(shuffle(wrongWords));
        setWrongIds([]);
        setIdx(0);
        setAnswered(false);
        setAns("");
        setOk(null);
        setHint(false);
        setIsRepeatRound(true);
      } else {
        setStage("done");
        setIsRepeatRound(false);
      }
    } else {
      setIdx(idx + 1);
      setAnswered(false);
      setAns("");
      setOk(null);
      setHint(false);
    }
  };

  const startRecog = () => {
    setRecog(true);
    setRecMsg("");
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setRecog(false);
      setRecMsg("browser");
      return;
    }
    try {
      const r = new SpeechRec();
      r.lang = aLang;
      r.maxAlternatives = 1;
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e: any) => {
        const t = Array.from(e.results).map((x: any) => x[0].transcript).join("").trim();
        if (t) {
          handleAns(t);
          setRecog(false);
          setRecMsg("");
        } else {
          setRecMsg("no-speech");
          setRecog(false);
        }
      };
      r.onerror = (e: any) => {
        console.error("Speech recognition error:", e.error);
        if (e.error === "not-allowed" || e.error === "permission-denied" || e.error === "service-not-allowed") {
          setRecMsg("not-allowed");
        } else {
          setRecMsg(e.error || "error");
        }
        setRecog(false);
      };
      r.onend = () => {
        setRecog(false);
      };
      r.start();
    } catch (err) {
      setRecMsg("");
      setRecog(false);
    }
  };

  if (stage === "mode") {
    return (
      <div className="fade-in">
        <button className="back-btn" onClick={onExit}>← Назад</button>
        <h2 className="section-title" style={{ textAlign: "center", marginTop: 16 }}>
          {sessionType === "learn" ? "Как будем учить?" : "Как повторяем?"}
        </h2>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {([
            { v: "cards", l: "🃏 Карточки", s: "Флип-карточки" },
            { v: "choice", l: "🎯 Выбор варианта", s: "Выбери из 4 вариантов" },
            { v: "written", l: "✍️ Письменно", s: "Напиши ответ" },
            { v: "voice", l: "🎤 Голосом", s: "Произнеси ответ" }
          ] as const).map(m => (
            <button 
              key={m.v} 
              className="card btn" 
              style={{ textAlign: "left", padding: 18 }} 
              onClick={() => {
                if (m.v === "voice" && micGranted === null) {
                  navigator.mediaDevices?.getUserMedia({ audio: true }).then(s => {
                    s.getTracks().forEach(t => t.stop());
                    setMicGranted(true);
                    setMode("voice");
                    setStage("dir");
                  }).catch(() => setMicGranted(false));
                  return;
                }
                setMode(m.v);
                setStage("dir");
              }}
            >
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 18 }}>{m.l}</div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>{m.s}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (stage === "dir") {
    return (
      <div className="fade-in">
        <button className="back-btn" onClick={() => {
          if (sessionType === "learn") {
            onExit();
          } else {
            setStage("mode");
          }
        }}>← Назад</button>
        <h2 className="section-title" style={{ textAlign: "center", marginTop: 16 }}>Направление</h2>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {([
            { v: "en-ru", l: "English → Русский" },
            { v: "ru-en", l: "Русский → English" },
            { v: "mixed", l: "Смешанный режим" }
          ] as const).map(d => (
            <button 
              key={d.v} 
              className="card btn" 
              style={{ textAlign: "left", padding: 18 }} 
              onClick={() => {
                setDir(d.v);
                const pool = getPool();
                const withErrors = shuffle(pool.filter(w => w.wrong > w.correct));
                const rest = shuffle(pool.filter(w => w.wrong <= w.correct));
                setQueue([...withErrors, ...rest].slice(0, 15));
                setIdx(0);
                setWrongIds([]);
                setIsRepeatRound(false);
                setAnswered(false);
                setAns("");
                setOk(null);
                setHint(false);
                setScore({ c: 0, w: 0 });
                setStage("session");
              }}
            >
              <div style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 18 }}>{d.l}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="fade-in" style={{ textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontSize: 56 }}>🕊️</div>
        <h2 className="section-title">Отлично!</h2>
        <p className="sub-text">Сессия завершена</p>
        <div className="card" style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><div className="stat-num" style={{ color: "var(--sage)" }}>{score.c}</div><div className="stat-label">верно</div></div>
          <div><div className="stat-num" style={{ color: "var(--rose)" }}>{score.w}</div><div className="stat-label">ошибки</div></div>
        </div>
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 20, padding: 16 }} onClick={onExit}>Завершить</button>
      </div>
    );
  }

  if (!cur) {
    return (
      <div style={{ textAlign: "center", paddingTop: 40 }}>
        <p style={{ marginBottom: 12 }}>В этой категории нет доступных слов для тренировки.</p>
        <button className="btn btn-primary" onClick={onExit}>Назад</button>
      </div>
    );
  }

  if (mode === "cards") {
    const cardFlipped = ans === "flipped";
    return (
      <div className="fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <button className="back-btn" onClick={onExit}>✕</button>
          <span className="badge">{idx + 1}/{queue.length}</span>
          <span style={{ fontSize: 12, color: "var(--sage)", fontWeight: 600 }}>{score.c}✓</span>
        </div>

        {isRepeatRound && (
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <span className="badge" style={{ backgroundColor: "rgba(220, 95, 95, 0.08)", color: "var(--rose)", border: "1.5px solid rgba(220, 95, 95, 0.2)" }}>
              🔁 Повторение ошибок в случайном порядке
            </span>
          </div>
        )}

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(idx / queue.length) * 100}%` }} />
        </div>
        <div 
          className="card" 
          style={{ 
            marginTop: 18, 
            paddingTop: 0, 
            paddingBottom: 0, 
            paddingLeft: 0, 
            paddingRight: 0, 
            borderRadius: "1.75rem", 
            overflow: "hidden",
            transition: "all 0.25s ease",
            border: answered 
              ? (ok ? "2.5px solid var(--sage)" : "2.5px solid var(--rose)") 
              : "1px solid rgba(180,180,180,.2)",
            boxShadow: answered
              ? (ok ? "0 8px 20px rgba(148,161,135,.2)" : "0 8px 20px rgba(220,95,95,.15)")
              : "none"
          }}
        >
          <div className="flip-card" onClick={() => { if (!answered) setAns(cardFlipped ? "" : "flipped"); }}>
            <div className={`flip-inner ${cardFlipped ? "flipped" : ""}`}>
              <div className="flip-front">
                <div style={{ paddingTop: 20, paddingBottom: 20 }}>
                  <div className="sub-text" style={{ marginBottom: 8 }}>{pDir === "en-ru" ? "Русский" : "English"}</div>
                  <div className="study-word">{pDir === "en-ru" ? cur.ru : cur.en}</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 16 }}>Нажми чтобы увидеть перевод →</div>
                </div>
                <button className="btn btn-ghost" style={{ fontSize: 18, paddingLeft: 20, paddingRight: 20, paddingBottom: 20 }} onClick={(e) => { e.stopPropagation(); speak(pDir === "en-ru" ? cur.ru : cur.en, pDir === "en-ru" ? "ru-RU" : "en-US"); }}>🔊</button>
              </div>
              <div className="flip-back">
                <div style={{ paddingTop: 20, paddingBottom: 20 }}>
                  <div className="sub-text" style={{ marginBottom: 8 }}>{pDir === "en-ru" ? "English" : "Русский"}</div>
                  <div className="study-word">{pDir === "en-ru" ? cur.en : cur.ru}</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 16 }}>← Нажми чтобы вернуться</div>
                </div>
                <button className="btn btn-ghost" style={{ fontSize: 18, paddingLeft: 20, paddingRight: 20, paddingBottom: 20 }} onClick={(e) => { e.stopPropagation(); speak(pDir === "en-ru" ? cur.en : cur.ru, pDir === "en-ru" ? "en-US" : "ru-RU"); }}>🔊</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          <button 
            className="btn btn-outline" 
            style={{ flex: 1, padding: 15 }} 
            disabled={answered}
            onClick={() => { 
              handleAns("__dont_remember__"); 
              setTimeout(next, 600); 
            }}
          >
            👈 Не знаю
          </button>
          <button 
            className="btn btn-primary" 
            style={{ flex: 1, padding: 15 }} 
            disabled={answered}
            onClick={() => { 
              handleAns(expected); 
              setTimeout(next, 600); 
            }}
          >
            👉 Знаю
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button className="back-btn" onClick={onExit}>✕</button>
        <span className="badge">{idx + 1}/{queue.length}</span>
        <span style={{ fontSize: 12, color: "var(--sage)", fontWeight: 600 }}>{score.c}✓</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(idx / queue.length) * 100}%` }} />
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="study-card">
          <div className="sub-text" style={{ marginBottom: 8 }}>{pDir === "en-ru" ? "English" : "Russian"}</div>
          <div className="study-word">{prompt}</div>
          {!answered && <button className="btn btn-ghost" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setHint(!hint)}>{hint ? <span className="hint-box">🔑 «{expected[0]}» · {expected.length} симв.</span> : "💡 Подсказка"}</button>}
          {answered && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4, color: ok ? "var(--sage)" : "var(--rose)" }}>{ok ? "Perfect ✨" : "Неверно"}</div>
              <div style={{ fontSize: 18, fontWeight: 500 }}>{expected}</div>
              <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => speak(cur.en)}>🔊 Послушать</button>
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        {mode === "choice" && !answered && choices.map(c => (
          <button key={c} className="choice-btn btn" style={{ marginBottom: 8 }} onClick={() => handleAns(c)}>{c}</button>
        ))}
        {mode === "written" && !answered && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input ref={inputRef} className="input" style={{ textAlign: "center", fontSize: 18 }} value={ans} onChange={e => setAns(e.target.value)} onKeyDown={e => e.key === "Enter" && ans.trim() && handleAns(ans)} placeholder="Ваш ответ..." />
            <button className="btn btn-primary" style={{ width: "100%", padding: 15 }} onClick={() => ans.trim() && handleAns(ans)} disabled={!ans.trim()}>Проверить</button>
            <button className="btn btn-ghost" style={{ color: "#ccc" }} onClick={() => handleAns("__dont_remember__")}>🤍 Не помню</button>
          </div>
        )}
        {mode === "voice" && !answered && (
          <div style={{ textAlign: "center" }}>
            <button className={`voice-btn btn ${recog ? "listening" : "idle"}`} onClick={startRecog}>🎤</button>
            {recog && <p className="sub-text" style={{ marginTop: 12 }}>Слушаю...</p>}
            {!recog && !recMsg && <p className="sub-text" style={{ marginTop: 12 }}>Нажмите и говорите</p>}
            {recMsg === "browser" && (
              <p className="sub-text" style={{ marginTop: 12, color: "var(--rose)", fontWeight: 500 }}>
                ⚠️ Голосовой ввод не поддерживается вашим браузером. Рекомендуем Google Chrome.
              </p>
            )}
            {recMsg === "not-allowed" && (
              <div style={{ marginTop: 12, padding: "10px 16px", background: "rgba(220, 95, 95, 0.08)", borderRadius: "0.5rem", border: "1px solid rgba(220, 95, 95, 0.15)", maxWidth: "340px", marginLeft: "auto", marginRight: "auto" }}>
                <p style={{ fontSize: 13, color: "var(--rose)", fontWeight: 600, marginBottom: 4 }}>
                  🎙️ Доступ к микрофону заблокирован
                </p>
                <p style={{ fontSize: 12, color: "#666", lineHeight: "1.4" }}>
                  Браузер часто блокирует микрофон внутри фрейма в целях безопасности. Пожалуйста, <strong>откройте приложение в новой вкладке</strong> (иконка со стрелочкой вверху справа) и разрешите доступ к микрофону!
                </p>
              </div>
            )}
            {recMsg === "no-speech" && (
              <p className="sub-text" style={{ marginTop: 12, color: "var(--rose)" }}>
                ⚠️ Речь не распознана. Попробуйте еще раз.
              </p>
            )}
            {recMsg && recMsg !== "browser" && recMsg !== "not-allowed" && recMsg !== "no-speech" && (
              <p className="sub-text" style={{ marginTop: 12, color: "var(--rose)" }}>
                ⚠️ Ошибка микрофона ({recMsg}). Попробуйте открыть приложение в новой вкладке!
              </p>
            )}
          </div>
        )}
        {answered && <button className="btn btn-secondary" style={{ width: "100%", padding: 15, marginTop: 8 }} onClick={next}>{idx + 1 >= queue.length ? "Завершить" : "Дальше →"}</button>}
      </div>
    </div>
  );
}
