import React, { useState } from "react";
import { Word, IrregularVerb, UserProgress } from "../types";
import { wipeUserAccountData } from "../firebaseSync";
import { auth } from "../firebase";
import { signOut, deleteUser } from "firebase/auth";
import { getLocalDateString } from "../utils";

interface SettingsScreenProps {
  user: any; // Firebase user or "guest"
  words: Word[];
  irregular: IrregularVerb[];
  stats: UserProgress;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onResetProgress: () => Promise<void>;
  onWipeData: () => Promise<void>;
  onLogout: () => void;
  onImportData: (data: { words: Word[]; irregular: IrregularVerb[]; progress: UserProgress }) => void;
  onBack: () => void;
}

export default function SettingsScreen({
  user,
  words,
  irregular,
  stats,
  theme,
  onToggleTheme,
  onResetProgress,
  onWipeData,
  onLogout,
  onBack,
  onImportData
}: SettingsScreenProps) {
  const [msg, setMsg] = useState("");
  const [isPersistent, setIsPersistent] = useState(false);
  const [loading, setLoading] = useState(false);

  const [notifPermission, setNotifPermission] = useState<string>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [notifFrequency, setNotifFrequency] = useState<string>(
    localStorage.getItem("my-eng-notif-freq") || "daily-20"
  );

  const sendImmediateNotification = (title: string, body: string) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: "my-eng-reminder"
        } as any);
      } catch (e) {
        console.error("Notification constructor failed:", e);
      }
    }
  };

  const handleRequestNotifPermission = async () => {
    if (!("Notification" in window)) {
      alert("К сожалению, ваш браузер или устройство не поддерживает системные уведомления.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission === "granted") {
        notify("🎉 Уведомления успешно включены!");
        sendImmediateNotification(
          "🦉 Журнал английского",
          "Привет! Уведомления настроены отлично. Мы напомним тебе заниматься, чтобы твоя серия дней не сгорела! 🔥"
        );
      } else if (permission === "denied") {
        notify("🔕 Уведомления заблокированы. Вы можете разрешить их в настройках браузера.");
      }
    } catch (e) {
      console.error("Failed to request notification permission:", e);
    }
  };

  const handleFrequencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setNotifFrequency(val);
    localStorage.setItem("my-eng-notif-freq", val);
    notify("✅ Частота уведомлений успешно сохранена!");
  };

  const handleSendTestNotification = () => {
    sendImmediateNotification(
      "🦉 Время английского! (Тест)",
      "Отлично! Твои уведомления работают. Не забудь заглянуть сегодня, чтобы продолжить обучение и сохранить свою серию дней! ✨"
    );
  };

  const notify = (text: string, persistent = false) => {
    setMsg(text);
    setIsPersistent(persistent);
    if (!persistent) {
      setTimeout(() => {
        setMsg(current => current === text ? "" : current);
      }, 3500);
    }
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
    const today = getLocalDateString();
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

  const handleResetProgress = async () => {
    const ok = confirm("Вы уверены, что хотите сбросить только прогресс обучения, серии дней и достижения? Все добавленные в словарь слова и глаголы ОСТАНУТСЯ.");
    if (!ok) return;

    setLoading(true);
    try {
      await onResetProgress();
      notify("✅ Статистика и прогресс сброшены! Словарь и глаголы сохранены.");
    } catch (err) {
      console.error(err);
      notify("❌ Ошибка при сбросе прогресса.");
    } finally {
      setLoading(false);
    }
  };

  const handleWipeData = async () => {
    const ok = confirm("Вы уверены, что хотите УДАЛИТЬ все свои данные (словарь, неправильные глаголы и прогресс)? Это действие абсолютно необратимо, списки будут полностью пустыми!");
    if (!ok) return;

    setLoading(true);
    try {
      await onWipeData();
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

  const handleDeleteAccount = async () => {
    const ok = confirm("ВНИМАНИЕ! Вы уверены, что хотите навсегда УДАЛИТЬ свой аккаунт и все связанные с ним данные? Это действие абсолютно необратимо!");
    if (!ok) return;

    setLoading(true);
    try {
      if (user !== "guest" && auth.currentUser) {
        // 1. Wipe data from cloud
        await wipeUserAccountData(stats.userId, true);

        // 2. Delete Firebase auth user
        await deleteUser(auth.currentUser);
      }
      
      // Reset local cache, log out and notify
      localStorage.clear();
      onLogout();
      notify("🔥 Ваш аккаунт и все данные были успешно и полностью удалены.");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/requires-recent-login") {
        notify("🔒 Для удаления аккаунта требуется повторный вход. Пожалуйста, выйдите из аккаунта, войдите заново и сразу же повторите удаление.", true);
      } else {
        notify("❌ Ошибка при удалении аккаунта: " + (err.message || err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in max-w-md mx-auto">
      <button className="back-btn" onClick={onBack} style={{ marginBottom: 16 }}>← Назад</button>
      <h2 className="section-title" style={{ marginBottom: 16 }}>Настройки</h2>

      {msg && (
        <div className="card" style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          gap: "10px",
          marginBottom: 12, 
          padding: "11px 14px", 
          fontSize: 14,
          borderLeft: isPersistent ? "4px solid var(--rose)" : "none",
          background: isPersistent ? "rgba(181, 93, 76, 0.05)" : undefined,
          borderRadius: "12px"
        }}>
          <span style={{ flex: 1, textAlign: "left", lineHeight: "1.4" }}>{msg}</span>
          <button 
            onClick={() => setMsg("")} 
            style={{ 
              background: "none", 
              border: "none", 
              fontSize: "18px", 
              cursor: "pointer", 
              padding: "2px 6px",
              color: "var(--text-muted)",
              opacity: 0.8,
              lineHeight: 1
            }}
            title="Закрыть"
          >
            ×
          </button>
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

      {/* Theme Settings */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🎨 Оформление</h3>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--warm)" }}>Режим отображения</span>
          <button 
            className="btn btn-outline btn-sm"
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 6,
              fontSize: 13,
              borderColor: "var(--border)",
              background: "var(--card)"
            }}
            onClick={onToggleTheme}
          >
            {theme === "dark" ? "🌙 Тёмная тема" : "☀️ Светлая тема"}
          </button>
        </div>
      </div>

      {/* Push Notifications Settings */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🔔 Напоминания на устройство</h3>
        
        {notifPermission === "unsupported" ? (
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            ⚠️ К сожалению, ваш текущий браузер или устройство не поддерживает системные уведомления.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
              Включите уведомления, чтобы получать напоминания о повторении слов и защитить свою серию дней от сгорания!
            </p>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Статус разрешений:</span>
              <span style={{ 
                fontSize: 12, 
                padding: "3px 8px", 
                borderRadius: 999, 
                fontWeight: 600,
                background: notifPermission === "granted" ? "rgba(124, 139, 114, 0.12)" : "rgba(181, 93, 76, 0.08)",
                color: notifPermission === "granted" ? "var(--sage)" : "var(--rose)"
              }}>
                {notifPermission === "granted" ? "✅ Разрешено" : notifPermission === "denied" ? "🚫 Заблокировано" : "🔕 Не настроено"}
              </span>
            </div>

            {notifPermission !== "granted" && (
              <button 
                className="btn btn-primary btn-sm" 
                style={{ width: "100%", padding: 10, fontSize: 13 }}
                onClick={handleRequestNotifPermission}
              >
                🔔 Разрешить уведомления
              </button>
            )}

            {notifPermission === "granted" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label htmlFor="notif-freq-select" style={{ fontSize: 13, color: "var(--warm)" }}>Частота напоминаний</label>
                  <select 
                    id="notif-freq-select"
                    className="select" 
                    value={notifFrequency}
                    onChange={handleFrequencyChange}
                    style={{ fontSize: 13, padding: "6px 10px" }}
                  >
                    <option value="off">📴 Отключить</option>
                    <option value="every-4h">🕒 Каждые 4 часа</option>
                    <option value="every-12h">🕒 Каждые 12 часов</option>
                    <option value="daily-12">☀️ Каждый день в 12:00</option>
                    <option value="daily-18">🌇 Каждый день в 18:00</option>
                    <option value="daily-20">🌃 Каждый день в 20:00</option>
                  </select>
                </div>

                <button 
                  className="btn btn-outline btn-sm" 
                  style={{ width: "100%", padding: 8, fontSize: 12, borderColor: "var(--border)" }}
                  onClick={handleSendTestNotification}
                >
                  🧪 Отправить тестовое уведомление
                </button>
              </div>
            )}
            
            {notifPermission === "denied" && (
              <p style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", textAlign: "center" }}>
                Уведомления заблокированы в браузере. Сбросьте настройки разрешений сайта в адресной строке, чтобы включить их обратно.
              </p>
            )}
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
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
        <button 
          className="btn" 
          style={{ 
            width: "100%", 
            padding: 13, 
            color: "var(--sage)", 
            border: "1.5px solid rgba(124, 139, 114, 0.35)", 
            borderRadius: "999px",
            background: "transparent",
            fontSize: 14,
            fontWeight: 500
          }} 
          onClick={handleResetProgress}
          disabled={loading}
        >
          🔄 Сбросить только прогресс обучения
        </button>

        <button 
          className="btn" 
          style={{ width: "100%", padding: 13, color: "var(--rose)", border: "1.5px solid rgba(212,165,165,.25)", borderRadius: "999px" }} 
          onClick={handleWipeData}
          disabled={loading}
        >
          🗑 Сбросить и УДАЛИТЬ все данные
        </button>

        {user !== "guest" && (
          <button 
            className="btn" 
            style={{ 
              width: "100%", 
              padding: 13, 
              color: "#fff", 
              background: "var(--rose)", 
              borderRadius: "999px",
              fontWeight: 600,
              boxShadow: "0 4px 14px rgba(181, 93, 76, 0.18)"
            }} 
            onClick={handleDeleteAccount}
            disabled={loading}
          >
            🚨 Полностью УДАЛИТЬ этот аккаунт
          </button>
        )}
      </div>
    </div>
  );
}
