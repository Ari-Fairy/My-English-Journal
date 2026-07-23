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

// Получение полного URL для API запросов при развертывании на любых платформах (Vercel, Cloud Run, local, etc.)
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // 1. Если задан VITE_BACKEND_URL через переменные окружения, используем его
  const customBackend = import.meta.env.VITE_BACKEND_URL;
  if (customBackend && typeof customBackend === "string" && customBackend.trim().length > 0) {
    const baseUrl = customBackend.trim().replace(/\/+$/, "");
    return `${baseUrl}${cleanPath}`;
  }
  
  // 2. Если сайт открыт с внешнего хостинга (например, Vercel, Netlify, GitHub Pages, etc.),
  // перенаправляем API-запросы на рабочий облачный бэкенд Cloud Run
  if (typeof window !== "undefined" && window.location) {
    const hostname = window.location.hostname;
    const isLocalOrCloudRun = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".run.app");
    if (!isLocalOrCloudRun) {
      // Иконка / статический адрес бэкенда с рабочим Express & Gemini API
      const defaultBackendUrl = "https://ais-dev-ublfoomiup7spn7ad7vnhk-540843270034.us-east1.run.app";
      return `${defaultBackendUrl}${cleanPath}`;
    }
  }

  // 3. В остальных случаях (localhost, Cloud Run) используем относительный путь
  return cleanPath;
}

// Получить статус кулдауна на повторение слов (минимальный интервал отдыха в 20 минут после сессии) - ОТКЛЮЧЕН
export function getReviewCooldownStatus(stats: UserProgress) {
  return { active: false, timeLeftMs: 0 };
}

// Получить время следующего повторения слова в ms
export function getWordNextReviewTimeMs(w: Word): number {
  if (!w.learned) return Infinity;
  if (w.nextReviewDate) {
    return new Date(w.nextReviewDate).getTime();
  }
  const lastRev = w.lastReviewed ? new Date(w.lastReviewed).getTime() : (w.learnedDate ? new Date(w.learnedDate).getTime() : Date.now());
  const intervalMin = w.intervalMinutes || 240; // по умолчанию 4 часа
  return lastRev + intervalMin * 60 * 1000;
}

// Получить эффективный список слов на повторение (максимум за сессию с плавным интервалом)
export function getEffectiveDueWords(words: Word[], stats: UserProgress): { 
  dueWords: Word[]; 
  totalOverdueCount: number;
  allDueWordsSorted: Word[];
} {
  const now = Date.now();

  // 1. Фильтруем выученные слова, которые еще не усвоены навсегда (streak < 10)
  const learnedWords = words.filter(w => w.learned && (w.streak || 0) < 10);

  // 2. Применяем правило автоматического сокращения интервала для слов, провисевших в очереди > 24 часов
  const processedWords = learnedWords.map(w => {
    const dueTimeMs = getWordNextReviewTimeMs(w);
    const overdueMs = now - dueTimeMs;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (overdueMs > oneDayMs && w.intervalMinutes) {
      let newInterval = w.intervalMinutes;
      if (w.intervalMinutes === 10080) { // 7 дней -> 3 дня
        newInterval = 4320;
      } else if (w.intervalMinutes === 4320) { // 3 дня -> 24 часа
        newInterval = 1440;
      } else if (w.intervalMinutes === 1440) { // 24 часа -> 4 часа
        newInterval = 240;
      }

      if (newInterval !== w.intervalMinutes) {
        return {
          ...w,
          intervalMinutes: newInterval,
          nextReviewDate: new Date(now).toISOString(), // становится доступно прямо сейчас
          lastReviewed: new Date(now - newInterval * 60 * 1000).toISOString()
        };
      }
    }
    return w;
  });

  // 3. Отбираем слова, готовые к повторению
  const dueWordsPool = processedWords.filter(w => getWordNextReviewTimeMs(w) <= now);

  // 4. Приоритетное ранжирование
  // Приоритет всегда у слов с самым коротким интервалом и с самым большим количеством ошибок.
  // Проблемные слова (isProblematic) попадают первыми.
  const getPriorityScore = (w: Word): number => {
    let score = 0;
    if (w.isProblematic) score += 50000;
    if (w.isMandatoryEndOfDay) score += 30000;
    score += (w.consecutiveErrors || 0) * 10000;
    
    // Короткие интервалы имеют наивысший приоритет
    const interval = w.intervalMinutes || 240;
    score += (100000 / interval); 
    
    // Больше ошибок -> выше приоритет
    score += w.wrong * 100;
    return score;
  };

  const allDueWordsSorted = [...dueWordsPool].sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
  const totalOverdueCount = allDueWordsSorted.length;

  // Если активен минимальный 20-минутный перерыв, то доступных слов на повторение сейчас 0
  const cooldown = getReviewCooldownStatus(stats);
  if (cooldown.active) {
    return { dueWords: [], totalOverdueCount, allDueWordsSorted };
  }

  // 5. Ограничение на размер сессии
  const limit = stats.sessionReviewLimit || stats.dailyWordsLimit || 15;
  const dueWords = allDueWordsSorted.slice(0, limit);

  return { dueWords, totalOverdueCount, allDueWordsSorted };
}



