import { Word, UserProgress } from "./types";

// Cached speech synthesis voices
let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesPrimed = false;

export function primeSpeechSynthesis() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    cachedVoices = window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        cachedVoices = window.speechSynthesis.getVoices();
      };
    }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    if (!voicesPrimed) {
      voicesPrimed = true;
      // Trigger a silent utterance on first user interaction to warm up Web Speech API context
      const silent = new SpeechSynthesisUtterance(" ");
      silent.volume = 0;
      silent.rate = 10;
      window.speechSynthesis.speak(silent);
    }
  } catch (e) {
    // Ignore priming error
  }
}

// Pre-prime on load if window exists
if (typeof window !== "undefined" && window.speechSynthesis) {
  try {
    primeSpeechSynthesis();
    window.addEventListener("touchstart", primeSpeechSynthesis, { once: true, passive: true });
    window.addEventListener("click", primeSpeechSynthesis, { once: true, passive: true });
  } catch (e) {}
}

// Natural Speech Synthesis helper with zero latency
export function speak(text: string, lang = "en-US") {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    
    // Ensure speech synthesis is active and resumed
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Cancel current queued or stuck utterances
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    
    if (!cachedVoices || cachedVoices.length === 0) {
      cachedVoices = window.speechSynthesis.getVoices();
    }

    const langPrefix = lang.split("-")[0].toLowerCase();
    const targetVoices = cachedVoices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));

    const naturalVoice = targetVoices.find(v => 
      v.name.includes("Natural") || 
      v.name.includes("Google") || 
      v.name.includes("Samantha") || 
      v.name.includes("Karen") || 
      v.name.includes("Daniel") || 
      v.name.includes("Microsoft") || 
      v.name.includes("Enhanced")
    ) || targetVoices[0] || cachedVoices.find(v => v.lang.toLowerCase().startsWith("en"));
    
    if (naturalVoice) {
      u.voice = naturalVoice;
    }

    // Immediate playback
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

  if (typeof window !== "undefined") {
    const savedBackend = localStorage.getItem("custom_backend_url");
    if (savedBackend && savedBackend.trim()) {
      return `${savedBackend.trim().replace(/\/+$/, "")}${cleanPath}`;
    }
    if ((window as any).__CUSTOM_BACKEND_URL__) {
      return `${String((window as any).__CUSTOM_BACKEND_URL__).trim().replace(/\/+$/, "")}${cleanPath}`;
    }
  }

  // 1. Если задан VITE_BACKEND_URL через переменные окружения, используем его
  const customBackend = import.meta.env.VITE_BACKEND_URL;
  if (customBackend && typeof customBackend === "string" && customBackend.trim().length > 0) {
    const baseUrl = customBackend.trim().replace(/\/+$/, "");
    return `${baseUrl}${cleanPath}`;
  }

  // 2. Относительный путь для вызова своего собственного сервера Express
  return cleanPath;
}

// Получение заголовков для API запросов с поддержкой кастомного ключа Gemini
export function getApiHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders
  };
  if (typeof window !== "undefined") {
    const customKey = localStorage.getItem("user_gemini_api_key");
    if (customKey && customKey.trim()) {
      headers["X-Gemini-API-Key"] = customKey.trim();
    }
  }
  return headers;
}

// Получить статус кулдауна на повторение слов (минимальный интервал отдыха в 20 минут после сессии) - ОТКЛЮЧЕН
export function getReviewCooldownStatus(stats: UserProgress) {
  return { active: false, timeLeftMs: 0 };
}

// Получить время следующего повторения слова в ms
export function getWordNextReviewTimeMs(w: Word): number {
  if (!w.learned) return Infinity;

  // Minimum interval rule: 2+ errors -> 90 mins (1h 30m). Otherwise minimum 240 mins (4 hours).
  const is2PlusErrors = (w.consecutiveErrors || 0) >= 2 || w.isProblematic;
  const minAllowed = is2PlusErrors ? 90 : 240;
  const baseIntervalMin = Math.max(minAllowed, w.intervalMinutes || minAllowed);

  if (w.nextReviewDate) {
    const t = new Date(w.nextReviewDate).getTime();
    if (!isNaN(t)) {
      if (w.lastReviewed) {
        const lastT = new Date(w.lastReviewed).getTime();
        if (!isNaN(lastT)) {
          // Guarantee at least minAllowed minutes passed since last review
          return Math.max(t, lastT + minAllowed * 60 * 1000);
        }
      }
      return t;
    }
  }
  if (w.lastReviewed) {
    const t = new Date(w.lastReviewed).getTime();
    if (!isNaN(t)) {
      return t + baseIntervalMin * 60 * 1000;
    }
  }
  if (w.learnedDate) {
    const t = new Date(w.learnedDate).getTime();
    if (!isNaN(t)) {
      return t + baseIntervalMin * 60 * 1000;
    }
  }

  return Infinity;
}

// Получить эффективный список слов на повторение (полный батч по лимиту сессии)
export function getEffectiveDueWords(words: Word[], stats: UserProgress): { 
  dueWords: Word[]; 
  totalOverdueCount: number;
  allDueWordsSorted: Word[];
} {
  const now = Date.now();
  const limit = stats.sessionReviewLimit || 15;

  // 1. Фильтруем выученные слова, которые еще не усвоены навсегда (streak < 10)
  const learnedWords = words.filter(w => w.learned && (w.streak || 0) < 10);

  // 2. Отбираем слова, у которых подошёл срок повторения
  const rawDueWordsPool = learnedWords.filter(w => getWordNextReviewTimeMs(w) <= now);

  // Приоритетное ранжирование
  const getPriorityScore = (w: Word): number => {
    let score = 0;
    if (w.isProblematic) score += 50000;
    if (w.isMandatoryEndOfDay) score += 30000;
    score += (w.consecutiveErrors || 0) * 10000;
    const interval = w.intervalMinutes || 240;
    score += (100000 / interval); 
    score += w.wrong * 100;
    return score;
  };

  const dueSorted = [...rawDueWordsPool].sort((a, b) => getPriorityScore(b) - getPriorityScore(a));

  // Если есть хотя бы 1 слово, подошедшее к повторению — формируем ПОЛНЫЙ батч размером limit (15, 30 и т.д.)
  // беря сначала просроченные слова, а затем дополняя лучшими выученными словами из этой категории
  let resultWords: Word[] = [];

  if (dueSorted.length > 0) {
    resultWords = [...dueSorted];
    if (resultWords.length < limit) {
      const dueIds = new Set(resultWords.map(w => w.id));
      const remainingLearned = learnedWords
        .filter(w => !dueIds.has(w.id))
        .sort((a, b) => getWordNextReviewTimeMs(a) - getWordNextReviewTimeMs(b));
      
      const needed = limit - resultWords.length;
      resultWords.push(...remainingLearned.slice(0, needed));
    } else {
      resultWords = resultWords.slice(0, limit);
    }
  }

  const cooldown = getReviewCooldownStatus(stats);
  if (cooldown.active) {
    return { dueWords: [], totalOverdueCount: rawDueWordsPool.length, allDueWordsSorted: dueSorted };
  }

  return { 
    dueWords: resultWords, 
    totalOverdueCount: rawDueWordsPool.length, 
    allDueWordsSorted: resultWords 
  };
}

// Helper to robustly parse an import line into English word and Russian translation
export function parseImportLine(line: string): { en: string; ru: string } {
  let trimmed = line.trim();
  if (!trimmed) return { en: "", ru: "" };

  // 1. Spaced separator: " - ", " — ", " – ", " : "
  const spacedMatch = trimmed.match(/^(.+?)\s+[\u2014\u2013\-:]\s+(.+)$/);
  if (spacedMatch) {
    return {
      en: spacedMatch[1].trim(),
      ru: spacedMatch[2].trim()
    };
  }

  // 2. English on left, Russian on right with separator (even without spaces around dash, e.g. "reveal-раскрывать")
  const latinCyrillicMatch = trimmed.match(/^([a-zA-Z0-9\s'\/,()]+)[\u2014\u2013\-:]([\u0400-\u04FF\s'\/,().;!?-]+)$/);
  if (latinCyrillicMatch) {
    return {
      en: latinCyrillicMatch[1].trim(),
      ru: latinCyrillicMatch[2].trim()
    };
  }

  // 3. Fallback separator: if left is English and right is Russian
  const lastResortMatch = trimmed.match(/^(.+?)[\u2014\u2013\-:](.+)$/);
  if (lastResortMatch) {
    const left = lastResortMatch[1].trim();
    const right = lastResortMatch[2].trim();
    const hasCyrillicOnRight = /[\u0400-\u04FF]/.test(right);
    const hasLatinOnLeft = /[a-zA-Z]/.test(left);
    if (hasCyrillicOnRight || (hasLatinOnLeft && !/[a-zA-Z]/.test(right))) {
      return { en: left, ru: right };
    }
  }

  // If no separator found, check character set
  if (/[\u0400-\u04FF]/.test(trimmed) && !/[a-zA-Z]/.test(trimmed)) {
    return { en: "", ru: trimmed };
  }
  return { en: trimmed, ru: "" };
}

// Local heuristic offline classifier for common grammatical words to avoid unnecessary network hits or API errors
export function getOfflineClassification(
  enVal: string,
  ruVal: string,
  availablePos: { [key: string]: string } = {},
  availableTopics: { [key: string]: string } = {}
) {
  const word = enVal.trim().toLowerCase();
  const ruWord = ruVal ? ruVal.trim().toLowerCase() : "";
  
  const modalVerbs = ["must", "can", "could", "may", "might", "will", "would", "shall", "should", "ought", "need", "dare"];
  const commonVerbs = [
    "reveal", "show", "come", "go", "make", "take", "give", "find", "think", "know", 
    "see", "look", "use", "get", "tell", "ask", "work", "seem", "feel", "try", 
    "leave", "call", "become", "bring", "keep", "hold", "write", "stand", "hear", 
    "let", "mean", "set", "meet", "run", "pay", "sit", "speak", "lie", "lead", 
    "read", "grow", "lose", "fall", "send", "build", "understand", "draw", "break", 
    "spend", "cut", "rise", "drive", "buy", "wear", "choose"
  ];
  
  // Standard list of pronouns, prepositions, conjunctions, adverbs
  const pronouns = [
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", 
    "my", "your", "his", "their", "our", "this", "that", "these", "those", 
    "who", "what", "which", "someone", "somebody", "something", "anyone", 
    "anybody", "anything", "everyone", "everybody", "everything", "nobody", "nothing",
    "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves", 
    "whose", "whom", "each", "both", "some", "any", "all", "few", "many", "several"
  ];
  const prepositions = [
    "in", "on", "at", "under", "over", "with", "by", "for", "about", "near", 
    "to", "from", "of", "into", "through", "during", "before", "after", 
    "between", "among", "without", "against", "behind", "below", "beside", 
    "beyond", "except", "inside", "like", "outside", "since", "throughout", 
    "toward", "towards", "upon", "within"
  ];
  const conjunctions = [
    "and", "but", "or", "because", "if", "although", "though", "since", 
    "unless", "while", "whereas", "so", "for", "yet", "nor", "as", "once", 
    "until", "whenever", "wherever"
  ];
  const adverbs = [
    "how", "where", "when", "why", "now", "today", "tomorrow", "yesterday", 
    "always", "never", "sometimes", "often", "usually", "seldom", "quickly", 
    "slowly", "easily", "happily", "really", "suddenly", "softly", "outside", 
    "below", "over", "near", "above", "already", "yet", "still", "just", 
    "then", "there", "here", "quite", "very", "too", "almost", "enough", 
    "hardly", "scarcely", "everywhere", "nowhere", "somewhere"
  ];

  let guessedPos = "noun";
  let isGuess = true;
  let newPos: { key: string; label: string } | undefined = undefined;

  // Exact grammatical categories mapping
  const isRuInfinitive = ruWord && (
    ruWord.endsWith("ть") || ruWord.endsWith("ти") || ruWord.endsWith("чь") ||
    ruWord.includes("раскрывать") || ruWord.includes("показывать") || ruWord.includes("делать")
  ) && !ruWord.includes("сущ") && !ruWord.includes("прилагательное");

  if (modalVerbs.includes(word) || commonVerbs.includes(word) || isRuInfinitive) {
    guessedPos = "verb";
    isGuess = false;
  } else if (pronouns.includes(word)) {
    guessedPos = availablePos["pronoun"] ? "pronoun" : "noun";
    isGuess = false;
    newPos = { key: "pronoun", label: "Местоимение" };
  } else if (prepositions.includes(word)) {
    guessedPos = availablePos["preposition"] ? "preposition" : (availablePos["adverb"] ? "adverb" : "noun");
    isGuess = false;
    newPos = { key: "preposition", label: "Предлог" };
  } else if (conjunctions.includes(word)) {
    guessedPos = availablePos["conjunction"] ? "conjunction" : (availablePos["phrase"] ? "phrase" : "noun");
    isGuess = false;
    newPos = { key: "conjunction", label: "Союз" };
  } else if (adverbs.includes(word) || ruWord === "сквозь" || ruWord === "через") {
    guessedPos = "adverb";
    isGuess = false;
    newPos = { key: "adverb", label: "Наречие" };
  } else if (word.endsWith("ly") && word.length > 4) {
    guessedPos = "adverb";
    isGuess = true;
  } else if (word.endsWith("ing") || word.endsWith("ed")) {
    guessedPos = "verb";
    isGuess = true;
  } else if (word.endsWith("ful") || word.endsWith("less") || word.endsWith("able") || word.endsWith("ive")) {
    guessedPos = "adjective";
    isGuess = true;
  }

  // Basic topic heuristics
  let guessedTopic = "general";
  if (word.match(/family|mother|father|sister|brother|son|daughter|parent|child|uncle|aunt/)) {
    guessedTopic = "family";
  } else if (word.match(/work|job|boss|office|salary|career|interview|company|business/)) {
    guessedTopic = "work";
  } else if (word.match(/travel|hotel|airport|flight|ticket|passport|luggage|vacation|tour/)) {
    guessedTopic = "travel";
  } else if (word.match(/food|apple|bread|water|milk|coffee|tea|dinner|lunch|breakfast|restaurant/)) {
    guessedTopic = "food";
  } else if (word.match(/school|lesson|study|teacher|student|book|pen|exam|university|class/)) {
    guessedTopic = "study";
  } else if (word.match(/fog|mist|rain|snow|cloud|wind|weather|sun|sky|storm/)) {
    guessedTopic = "weather";
  }

  return {
    pos: guessedPos,
    topic: guessedTopic,
    isGuess,
    newPos
  };
}

export function normalizeWordEn(en: string): string {
  return (en || "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function normalizePos(pos?: string): string {
  if (!pos) return "";
  return pos.toLowerCase().trim();
}

export function findDuplicateWord(newEn: string, newPos: string | undefined, existingWords: Word[]): Word | undefined {
  const normEn = normalizeWordEn(newEn);
  if (!normEn) return undefined;
  
  const normP = normalizePos(newPos);
  
  return existingWords.find(w => {
    const wNormEn = normalizeWordEn(w.en);
    if (wNormEn !== normEn) return false;
    
    const wNormP = normalizePos(w.partOfSpeech);
    return wNormP === normP;
  });
}

export function cleanUpWordsAndEp1(rawWords: Word[], _userId: string): Word[] {
  if (!rawWords || !Array.isArray(rawWords)) return [];

  // Map any top-level parent categories to their default subcategory so words appear in subcategory views
  const parentToFirstSubCat: Record<string, string> = {
    cat_movie_8: "cat_movie_8_ep1",
    cat_main: "cat_base",
    cat_books: "cat_books_a1",
    cat_tutor: "cat_tutor_lesson1"
  };

  return rawWords.map(w => {
    if (w.categoryId && parentToFirstSubCat[w.categoryId]) {
      return { ...w, categoryId: parentToFirstSubCat[w.categoryId] };
    }
    return w;
  });
}





