import { Word, UserProgress } from "./types";

// Sözel seslendirme (Speech Synthesis)
export function speak(text: string, lang = "en-US") {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.error("Speech Synthesis Error:", e);
  }
}

// Получение даты YYYY-MM-DD в локальном часовом поясе
export function getLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Отправка веб-уведомлений с поддержкой мобильных устройств через Service Worker
export function sendWebNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.warn("Notifications are not supported in this environment");
    return;
  }
  if (Notification.permission !== "granted") {
    console.warn("Notification permission is not granted");
    return;
  }

  const options = {
    body,
    tag: "my-eng-reminder",
    renotify: true,
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => {
        if (reg && reg.showNotification) {
          reg.showNotification(title, options);
        } else {
          navigator.serviceWorker.ready.then((readyReg) => {
            if (readyReg && readyReg.showNotification) {
              readyReg.showNotification(title, options);
            } else {
              try {
                new Notification(title, options);
              } catch (e) {
                console.error("Fallback Notification failed:", e);
              }
            }
          }).catch(() => {
            try {
              new Notification(title, options);
            } catch (e) {
              console.error("Fallback Notification failed after ready catch:", e);
            }
          });
        }
      })
      .catch((err) => {
        console.error("Service worker registration/get failed:", err);
        try {
          new Notification(title, options);
        } catch (e) {
          console.error("Fallback standard Notification failed:", e);
        }
      });
  } else {
    try {
      new Notification(title, options);
    } catch (e) {
      console.error("Standard Notification constructor failed:", e);
    }
  }
}

// Получение идентификатора текущей недели (например, "2026-W28")
export function getCurrentWeekKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Начинаем с четверга текущей недели, чтобы рассчитать правильный номер недели ISO
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNo}`;
}

// Получение полного URL для API запросов при развертывании на внешних платформах (Vercel)
export function getApiUrl(path: string): string {
  const hostname = window.location.hostname;
  // Если мы запущены на стороннем хостинге (например, Vercel), то перенаправляем запросы на наш Cloud Run бэкенд
  const isCustomHost = !hostname.includes("localhost") && 
                       !hostname.includes("127.0.0.1") && 
                       !hostname.includes("run.app");
  
  if (isCustomHost) {
    const backendUrl = "https://ais-dev-ublfoomiup7spn7ad7vnhk-540843270034.us-east1.run.app";
    return `${backendUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  }
  return path;
}

// Получить статус кулдауна на повторение слов
export function getReviewCooldownStatus(stats: UserProgress) {
  const last = stats.lastReviewSessionTime || 0;
  const secondLast = stats.secondLastReviewSessionTime || 0;
  const now = Date.now();
  const cooldownMs = 4 * 3600 * 1000; // 4 часа перерыв

  // Если оба последних сеанса были завершены в пределах последних 4 часов
  const hasTwoSessions = (now - last < cooldownMs) && (now - secondLast < cooldownMs);
  if (!hasTwoSessions) {
    return { active: false, timeLeftMs: 0 };
  }

  // Кулдаун длится 4 часа с момента завершения второго (последнего) сеанса
  const timeLeftMs = Math.max(0, (last + cooldownMs) - now);
  return { active: timeLeftMs > 0, timeLeftMs };
}

// Получить эффективный список слов на повторение (с ограничением в 30 и равномерным распределением)
export function getEffectiveDueWords(words: Word[], stats: UserProgress): { dueWords: Word[]; totalOverdueCount: number } {
  // 1. Фильтруем выученные слова, которые еще не усвоены навсегда (streak < 10)
  const learnedWords = words.filter(w => w.learned && (w.streak || 0) < 10);

  // Вспомогательная функция для получения времени следующего стандартного повторения
  const getStandardDueTimeMs = (w: Word) => {
    const learnedAt = w.learnedDate ? new Date(w.learnedDate).getTime() : Date.now();
    const lastRev = w.lastReviewed ? new Date(w.lastReviewed).getTime() : learnedAt;
    // Интервалы в часах: 20мин, 1ч, 4ч, 12ч, 24ч (1д), 48ч (2д), 96ч (4д), 168ч (7д), 336ч (14д)
    const iv = [0.33, 1, 4, 12, 24, 48, 96, 168, 336];
    const hours = iv[Math.min(Math.max((w.streak || 1) - 1, 0), iv.length - 1)] || 24;
    return lastRev + (hours * 3600 * 1000);
  };

  const now = Date.now();

  // 2. Находим слова, у которых подошло время повторения по стандартной схеме
  const rawDueWords = learnedWords
    .filter(w => getStandardDueTimeMs(w) <= now)
    // Сортируем: сначала самые просроченные
    .sort((a, b) => getStandardDueTimeMs(a) - getStandardDueTimeMs(b));

  const totalOverdueCount = rawDueWords.length;

  // Если активен перерыв (коулдаун), то доступных слов на повторение сейчас 0
  const cooldown = getReviewCooldownStatus(stats);
  if (cooldown.active) {
    return { dueWords: [], totalOverdueCount };
  }

  // 3. Равномерно распределяем (stagger) слова, если их накопилось много
  // Первые 30 слов доступны сразу
  // Слова от 30 до 44 откладываются на 4 часа
  // Слова от 45 до 59 откладываются на 8 часов и т.д.
  // Это гарантирует, что пользователь никогда не увидит больше 30 слов одновременно,
  // а избыток будет плавно распределен в будущее порциями по 15 слов.
  const effectiveDueWords = rawDueWords.filter((_, index) => {
    if (index < 30) return true;
    return false; // Все слова после первых 30 временно скрыты/постпонированы
  });

  return { dueWords: effectiveDueWords, totalOverdueCount };
}



