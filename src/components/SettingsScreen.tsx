import React, { useState } from "react";
import { Word, IrregularVerb, UserProgress } from "../types";
import { wipeUserAccountData } from "../firebaseSync";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";

interface SettingsScreenProps {
  user: any; // Firebase user or "guest"
  words: Word[];
  irregular: IrregularVerb[];
  stats: UserProgress;
  onLogout: () => void;
  onImportData: (data: { words: Word[]; irregular: IrregularVerb[]; progress: UserProgress }) => void;
  onBack: () => void;
}

export default function SettingsScreen({
  user,
  words,
  irregular,
  stats,
  onLogout,
  onBack,
  onImportData
}: SettingsScreenProps) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const notify = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 3500);
  };

  const handleLogout = async () => {
    try {
      if (user !== "guest") {
        await signOut(auth);
      }
      onLogout();
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify({ words, irregular, stats }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `my-english-progress-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("✅ Прогресс успешно скачан!");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (parsed.words && parsed.irregular && parsed.stats) {
          onImportData(parsed);
          notify("✅ Прогресс успешно импортирован!");
        } else {
          notify("❌ Неверный формат файла прогресса.");
        }
      } catch (err) {
        notify("❌ Не удалось прочесть файл прогресса.");
      }
    };
    reader.readAsText(file);
  };

  const handleWipeData = async () => {
    const ok = confirm("Вы уверены, что хотите УДАЛИТЬ все свои данные из облака? Это действие необратимо!");
    if (!ok) return;

    setLoading(true);
    try {
      if (user !== "guest") {
        await wipeUserAccountData(stats.userId);
      }
      // Reset local cache & refresh
      localStorage.clear();
      notify("🔥 Все данные были удалены.");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error(err);
      notify("❌ Ошибка при удалении данных.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in max-w-md mx-auto">
      <button className="back-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Назад</button>
      <h2 className="section-title" style={{ marginBottom: 16 }}>Настройки</h2>

      {msg && (
        <div className="card" style={{ textAlign: "center", marginBottom: 12, padding: 11, fontSize: 14 }}>
          {msg}
        </div>
      )}

      {/* Account Sync Status */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>☁️ Синхронизация</h3>
        {user === "guest" ? (
          <div>
            <p style={{ fontSize: 12, color: "#aaa", marginBottom: 12 }}>
              Вы вошли как гость. Ваши данные хранятся локально в кэше браузера. Зарегистрируйтесь, чтобы получить доступ с телефона и ноутбука!
            </p>
            <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={onLogout}>
              Создать аккаунт или Войти
            </button>
          </div>
        ) : (
          <div style={{ background: "rgba(148,161,135,.1)", border: "1.5px solid rgba(148,161,135,.25)", borderRadius: "1rem", padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--sage)", marginBottom: 8 }}>✓ Автоматическое сохранение включено</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Аккаунт: {user?.email}</div>
            <button 
              className="btn btn-outline btn-sm" 
              style={{ width: "100%", borderColor: "rgba(148,161,135,.35)", color: "var(--sage)" }}
              onClick={handleLogout}
            >
              Выйти из аккаунта
            </button>
          </div>
        )}
      </div>

      {/* Manual Import / Export */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>💾 Резервное копирование</h3>
        <button className="btn btn-outline" style={{ width: "100%", padding: 11, marginBottom: 8, fontSize: 13 }} onClick={handleExportData}>
          ⬇️ Скачать файл прогресса (JSON)
        </button>
        <label className="btn btn-outline" style={{ width: "100%", padding: 11, display: "block", textAlign: "center", cursor: "pointer", fontSize: 13 }}>
          ⬆️ Загрузить файл прогресса (JSON)
          <input type="file" accept=".json" onChange={handleImportFile} className="hidden-input" />
        </label>
      </div>

      {/* Stats Summary */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Данные журнала</h3>
        <p style={{ fontSize: 13, color: "#888" }}>
          Слов в словаре: {words.length} · Выучено слов: {words.filter(w => w.learned).length} · Неправильных глаголов: {irregular.length}
        </p>
      </div>

      {/* Danger Zone */}
      <button 
        className="btn" 
        style={{ width: "100%", padding: 13, color: "var(--rose)", border: "1.5px solid rgba(212,165,165,.25)", borderRadius: "999px" }} 
        onClick={handleWipeData}
        disabled={loading}
      >
        🗑 Сбросить и УДАЛИТЬ все данные
      </button>
    </div>
  );
}
