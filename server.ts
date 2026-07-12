import express from "express";
import path from "path";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import webpush from "web-push";

dotenv.config();

// Configure Web Push VAPID details
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BGkFSDAE_LEse1Eo0kgle9UUMP_7qAnt4lHu_PJACXW1jHi7tmnojJ-EebXwQu4xl4iYq_UvdPLSl9NayMVF3Fo";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "Je717vCYArlSifcGimzgJvpLfgtgl7E0NMUoZLWrnt8";

webpush.setVapidDetails(
  "mailto:admin-scheduler@englishjournal.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const PORT = 3000;
const app = express();

// Custom CORS middleware to allow Vercel or local frontend to call this backend
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// Set up JSON body parser with increased limit to handle base64 images
app.use(express.json({ limit: "10mb" }));

// Lazy initializer for Google Gen AI client
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required server-side.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Server-side Firebase Setup & Background Scheduler
import { initializeApp as initFirebaseApp } from "firebase/app";
import { 
  getFirestore as getFirebaseFirestore, 
  collection as getFirebaseCollection, 
  getDocs as getFirebaseDocs, 
  updateDoc as updateFirebaseDoc, 
  doc as getFirebaseDoc, 
  query as queryFirebase, 
  where as whereFirebase 
} from "firebase/firestore";
import { 
  getAuth as getFirebaseAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from "firebase/auth";
import fs from "fs";

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let serverDb: any = null;
let serverAuth: any = null;

if (fs.existsSync(configPath)) {
  try {
    const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const firebaseConfig = {
      apiKey: process.env.VITE_FIREBASE_API_KEY || configData.apiKey,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || configData.authDomain,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || configData.projectId,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || configData.storageBucket,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || configData.messagingSenderId,
      appId: process.env.VITE_FIREBASE_APP_ID || configData.appId,
      measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || configData.measurementId,
    };
    const firebaseApp = initFirebaseApp(firebaseConfig, "server-instance");
    serverDb = getFirebaseFirestore(firebaseApp);
    serverAuth = getFirebaseAuth(firebaseApp);
    console.log("Firebase Client SDK initialized on server for background scheduling.");
    
    // Proactively start auth
    ensureAuthenticated();
  } catch (err) {
    console.error("Failed to initialize Firebase on server:", err);
  }
}

async function ensureAuthenticated(): Promise<boolean> {
  if (!serverAuth) return false;
  if (serverAuth.currentUser) return true;
  
  const adminEmail = "admin-scheduler@englishjournal.app";
  const adminPassword = process.env.ADMIN_SCHEDULER_PASSWORD || "A-Super-Secure-Scheduler-Admin-Password-2026-X!";
  
  try {
    await signInWithEmailAndPassword(serverAuth, adminEmail, adminPassword);
    return true;
  } catch (err: any) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-email" || err.code === "auth/invalid-credential") {
      try {
        await createUserWithEmailAndPassword(serverAuth, adminEmail, adminPassword);
        console.log("[Scheduler] Successfully created admin scheduler user in Firebase Auth.");
        return true;
      } catch (createErr) {
        console.error("[Scheduler] Failed to create scheduler user:", createErr);
      }
    }
    console.error("[Scheduler] Authentication failed:", err);
    return false;
  }
}

// Helper to calculate word review timings
function getServerWordNextReviewTimeMs(w: any): number {
  if (!w.learned) return Infinity;
  if (w.nextReviewDate) {
    return new Date(w.nextReviewDate).getTime();
  }
  const lastRev = w.lastReviewed ? new Date(w.lastReviewed).getTime() : (w.learnedDate ? new Date(w.learnedDate).getTime() : Date.now());
  const intervalMin = w.intervalMinutes || 240; // 4 hours by default
  return lastRev + intervalMin * 60 * 1000;
}

// Helper to filter words ready for repetition
function getServerDueWords(words: any[]): any[] {
  const now = Date.now();
  const learnedWords = words.filter(w => w.learned && (w.streak || 0) < 10);
  const dueWordsPool = learnedWords.filter(w => getServerWordNextReviewTimeMs(w) <= now);
  
  return dueWordsPool.sort((a, b) => {
    const aPriority = (a.isProblematic ? 50000 : 0) + (a.consecutiveErrors || 0) * 10000 + (100000 / (a.intervalMinutes || 240));
    const bPriority = (b.isProblematic ? 50000 : 0) + (b.consecutiveErrors || 0) * 10000 + (100000 / (b.intervalMinutes || 240));
    return bPriority - aPriority;
  });
}

// Scheduled email sending implementation
async function sendScheduledEmailHelper(email: string, userId: string, hour: number, offset: number): Promise<boolean> {
  try {
    if (!serverDb) return false;
    
    // Fetch user's actual words using Client SDK with admin permissions
    const wordsCol = getFirebaseCollection(serverDb, "words");
    const q = queryFirebase(wordsCol, whereFirebase("userId", "==", userId));
    const wordsSnap = await getFirebaseDocs(q);
    const words: any[] = [];
    wordsSnap.forEach(snap => {
      words.push(snap.data());
    });
    
    const dueWords = getServerDueWords(words);
    
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === "true";
    const fromAddress = process.env.SMTP_FROM || '"My English Journal" <no-reply@englishjournal.app>';

    let transporter;
    let isFallback = false;

    if (host && user && pass) {
      transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
    } else {
      console.log("No SMTP credentials. Using pre-registered Ethereal account...");
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: "sbds45poeyqw3zz7@ethereal.email",
          pass: "VNr8v33J8uH7qtvDNY",
        },
      });
      isFallback = true;
    }

    const appUrl = process.env.APP_URL || "https://ai.studio/build";
    
    let wordsListHtml = "";
    if (dueWords.length > 0) {
      wordsListHtml = `
        <div style="background-color: #fcfbfa; border-left: 3px solid #8fa080; padding: 12px 16px; margin-bottom: 24px; border-radius: 4px;">
          <p style="font-size: 12px; font-weight: bold; color: #6a665d; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">СЛОВА, КОТОРЫЕ ЖДУТ ТВОЕГО ПОВТОРЕНИЯ (${dueWords.length}):</p>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #2e2a25;">
            ${dueWords.slice(0, 5).map(w => `<li><strong>${w.en}</strong> — ${w.ru}</li>`).join("")}
          </ul>
          ${dueWords.length > 5 ? `<p style="font-size: 12px; color: #6a665d; margin: 6px 0 0 0; font-style: italic;">...и ещё ${dueWords.length - 5} слов</p>` : ""}
        </div>
      `;
    } else {
      wordsListHtml = `
        <div style="background-color: #fcfbfa; border-left: 3px solid #8fa080; padding: 12px 16px; margin-bottom: 24px; border-radius: 4px;">
          <p style="font-size: 13px; color: #4a463d; margin: 0;">
            ✨ У тебя пока нет слов на повторение! Отличная работа! Самое время добавить несколько новых слов или прочитать рассказ, чтобы расширить свой словарный запас.
          </p>
        </div>
      `;
    }

    const mailOptions = {
      from: isFallback ? '"My English Journal (Scheduled)" <no-reply@ethereal.email>' : fromAddress,
      to: email,
      subject: "My English Journal: Время повторить слова! 📚✨",
      html: `
<div style="font-family: 'Georgia', serif; background-color: #f7f6f2; color: #2e2a25; padding: 40px 20px; max-width: 600px; margin: 0 auto; border-radius: 12px; border: 1px solid #e1ded5;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="font-style: italic; font-weight: normal; font-size: 28px; color: #8fa080; margin: 0;">My English Journal 📚</h1>
    <p style="color: #6a665d; font-size: 11px; margin-top: 4px; letter-spacing: 1px; text-transform: uppercase;">Твой уютный дневник английского</p>
  </div>
  
  <div style="background-color: #ffffff; border-radius: 8px; padding: 24px; box-shadow: 0 4px 12px rgba(46, 42, 37, 0.03); border: 1px solid #eeece5;">
    <h2 style="font-style: italic; font-weight: normal; font-size: 20px; color: #d68060; margin-top: 0; margin-bottom: 16px; border-bottom: 1px solid #f0eee8; padding-bottom: 10px;">
      Время ежедневного занятия! 🌟
    </h2>
    
    <p style="font-size: 14px; line-height: 1.6; color: #4a463d; margin-bottom: 20px;">
      Привет! Пора уделить английскому всего 5 минут. Это поможет закрепить знания в долгосрочной памяти и сохранить твою серию дней обучения!
    </p>

    ${wordsListHtml}

    <div style="text-align: center; margin-top: 28px; margin-bottom: 10px;">
      <a href="${appUrl}" style="background-color: #8fa080; color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 15px; font-weight: 500; border-radius: 30px; display: inline-block;">
        Открыть мой журнал и заниматься →
      </a>
    </div>
  </div>
  
  <div style="text-align: center; margin-top: 30px; font-size: 11px; color: #9c988f; line-height: 1.4;">
    Вы получили это письмо, потому что включили email-напоминания в настройках My English Journal.<br>
    Настройки времени отправки: ежедневно в ${String(hour).padStart(2, "0")}:00.<br>
    Вы можете отключить подписку в любой момент в приложении.
  </div>
</div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Scheduler] Email successfully sent to ${email}: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[Scheduler] Error sending scheduled email to user ${userId}:`, err);
    return false;
  }
}

// Send a Push Notification to a subscription
async function sendPushNotification(subscriptionJsonStr: string, title: string, body: string) {
  try {
    const subscription = JSON.parse(subscriptionJsonStr);
    await webpush.sendNotification(subscription, JSON.stringify({ title, body }));
    console.log(`[Web Push] Notification sent successfully to subscription`);
    return true;
  } catch (err) {
    console.error("[Web Push] Failed to send push notification:", err);
    return false;
  }
}

// Background scheduler function to check for scheduled reminder emails and push notifications
async function checkAndSendScheduledEmails() {
  const authOk = await ensureAuthenticated();
  if (!authOk || !serverDb) return;
  console.log("[Scheduler] Checking for scheduled reminder emails and push notifications...");
  try {
    const usersCol = getFirebaseCollection(serverDb, "users");
    // Retrieve all users to process their preferences (email or push)
    const snapshot = await getFirebaseDocs(usersCol);
    
    const nowUtc = Date.now();
    
    for (const userDoc of snapshot.docs) {
      const userData = userDoc.data();
      const userId = userData.userId || userDoc.id;
      
      const email = userData.email;
      const targetHour = userData.emailNotifHour ?? 12;
      const offset = userData.emailNotifOffset ?? 0;
      
      // Calculate user's current local hour and local date based on offset
      const userLocalTime = new Date(nowUtc - (offset * 60 * 1000));
      const currentLocalHour = userLocalTime.getUTCHours();
      const currentLocalDate = userLocalTime.toISOString().split("T")[0]; // "YYYY-MM-DD"
      
      // If user's local hour matches their target hour:
      if (currentLocalHour === targetHour) {
        
        // 1. Handle Email reminders
        if (userData.emailNotifEnabled && email) {
          const lastSentEmailDate = userData.lastEmailSentDate || "";
          if (lastSentEmailDate !== currentLocalDate) {
            console.log(`[Scheduler] Sending scheduled email to ${email} (target hour: ${targetHour}, local hour: ${currentLocalHour}, date: ${currentLocalDate})`);
            const sent = await sendScheduledEmailHelper(email, userId, targetHour, offset);
            if (sent) {
              await updateFirebaseDoc(getFirebaseDoc(serverDb, "users", userDoc.id), {
                lastEmailSentDate: currentLocalDate
              });
              console.log(`[Scheduler] Successfully updated lastEmailSentDate for ${email} to ${currentLocalDate}`);
            }
          }
        }
        
        // 2. Handle Push reminders
        if (userData.pushSubscription) {
          const lastSentPushDate = userData.lastPushSentDate || "";
          if (lastSentPushDate !== currentLocalDate) {
            console.log(`[Scheduler] Sending scheduled push notification to user ${userId} (target hour: ${targetHour}, local hour: ${currentLocalHour}, date: ${currentLocalDate})`);
            const sent = await sendPushNotification(
              userData.pushSubscription,
              "🦉 Время английского! ✨",
              "Пора уделить всего 5 минут английскому сегодня, чтобы закрепить прогресс и сохранить серию дней! 📚"
            );
            if (sent) {
              await updateFirebaseDoc(getFirebaseDoc(serverDb, "users", userDoc.id), {
                lastPushSentDate: currentLocalDate
              });
              console.log(`[Scheduler] Successfully updated lastPushSentDate for user ${userId} to ${currentLocalDate}`);
            }
          }
        }
        
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error running scheduled notifications check:", err);
  }
}

// Start background interval checker
const CHECK_INTERVAL_MS = 60 * 1000; // run every 1 minute
setInterval(() => {
  checkAndSendScheduledEmails();
}, CHECK_INTERVAL_MS);

// Also run once immediately on startup after a small delay
setTimeout(() => {
  checkAndSendScheduledEmails();
}, 10000);

// Server-side translation memory cache
const translationMemoryCache = new Map<string, string>();

// Endpoint to translate an English word/phrase to Russian using Gemini
app.post("/api/translate", async (req, res) => {
  try {
    const { word, context } = req.body || {};
    if (!word) {
      res.status(400).json({ error: "Missing word parameter" });
      return;
    }

    const cacheKey = `${word.toLowerCase().trim()}:${context ? context.toLowerCase().trim() : ""}`;
    if (translationMemoryCache.has(cacheKey)) {
      res.json({ translation: translationMemoryCache.get(cacheKey) });
      return;
    }

    const ai = getAIClient();
    
    let prompt = `Translate the English word or phrase "${word}" to Russian.`;
    if (context) {
      prompt += ` This word was clicked in the following context: "${context}". Please provide the most appropriate Russian translation for this specific context.`;
    }
    prompt += ` Return ONLY the direct translation, single word or short list of synonym translations (like "пыль, вытирать пыль"), with no extra words, explanations, quotation marks, or markdown formatting. Just the clean Russian translation string.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [prompt]
    });

    const translation = (response.text || "").trim().replace(/^["']|["']$/g, "");
    if (translation) {
      translationMemoryCache.set(cacheKey, translation);
    }
    res.json({ translation });
  } catch (error: any) {
    console.error("Translate API error:", error);
    res.status(500).json({ error: error?.message || "Translation failed" });
  }
});

// Endpoint to process handwritten word list photos using Gemini API
app.post("/api/ocr", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      res.status(400).json({ error: "Missing image base64 data" });
      return;
    }

    const base64Data = image.split(",")[1] || image;
    const ai = getAIClient();

    const prompt = `This is an image of a handwritten or typed vocabulary list of English-Russian words. 
Extract all word pairs in the format "English — Russian". 
Return ONLY a valid, standard JSON array of objects with "en" and "ru" fields. 
For example: [{"en": "genius", "ru": "гений"}, {"en": "such", "ru": "такой"}]. 
Return absolutely nothing else, no markdown wrapping, no explanation, just raw valid JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: "image/jpeg",
          },
        },
        prompt,
      ],
    });

    const text = response.text || "";
    // Clean potential markdown blocks
    const cleanText = text.replace(/```json|```/g, "").trim();
    
    try {
      const parsedPairs = JSON.parse(cleanText);
      res.json({ pairs: parsedPairs });
    } catch (parseError) {
      console.error("Failed to parse Gemini OCR response as JSON. Raw text was:", text);
      res.status(500).json({ error: "Failed to parse OCR response as JSON", raw: text });
    }
  } catch (error: any) {
    console.error("OCR API error:", error);
    res.status(500).json({ error: error?.message || "Internal server error during image OCR" });
  }
});

// Heuristic offline classifier for common grammatical words used as fallback when Gemini is unavailable
const getOfflineClassification = (
  enVal: string,
  ruVal: string,
  availablePos: { [key: string]: string } = {},
  availableTopics: { [key: string]: string } = {}
) => {
  const word = enVal.trim().toLowerCase();
  const ruWord = ruVal ? ruVal.trim().toLowerCase() : "";

  // 1. Identify parts of speech first
  // Standard list of pronouns, prepositions, conjunctions
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
  let newPos = undefined;

  // Exact grammatical categories mapping
  if (pronouns.includes(word)) {
    guessedPos = "pronoun";
    isGuess = false;
    newPos = { key: "pronoun", label: "Местоимение" };
  } else if (prepositions.includes(word)) {
    guessedPos = "preposition";
    isGuess = false;
    newPos = { key: "preposition", label: "Предлог" };
  } else if (conjunctions.includes(word)) {
    guessedPos = "conjunction";
    isGuess = false;
    newPos = { key: "conjunction", label: "Союз" };
  } else if (adverbs.includes(word)) {
    guessedPos = "adverb";
    isGuess = false;
  } else if (["hello", "hi", "bye", "please", "thanks", "thank you", "welcome"].includes(word)) {
    guessedPos = "phrase";
    isGuess = false;
  } else {
    // Advanced parsing for phrases and alternative synonyms/translations
    // Strip common leading helper words from English to check core part of speech
    let cleanEn = word;
    if (cleanEn.startsWith("to ")) {
      cleanEn = cleanEn.substring(3).trim();
    } else if (cleanEn.startsWith("a ")) {
      cleanEn = cleanEn.substring(2).trim();
    } else if (cleanEn.startsWith("an ")) {
      cleanEn = cleanEn.substring(3).trim();
    } else if (cleanEn.startsWith("the ")) {
      cleanEn = cleanEn.substring(4).trim();
    }

    // Split options by slashes, commas, semicolons
    const enParts = cleanEn.split(/[\/,;]/).map(x => x.trim()).filter(Boolean);
    const ruParts = ruWord.split(/[\/,;]/).map(x => x.trim()).filter(Boolean);

    // If English actually contains a multi-word phrase (after stripping "to", etc., and after splitting slashes)
    // For example "take care" is a phrase. But "dust/clean" is not.
    const isEnPhrase = enParts.some(p => p.includes(" "));

    if (isEnPhrase) {
      guessedPos = "phrase";
      isGuess = false;
    } else {
      // Analyze parts to detect core grammatical markers
      let foundVerb = false;
      let foundAdjective = false;
      let foundAdverb = false;

      // Check Russian translations
      for (const part of ruParts) {
        const firstWord = part.split(/\s+/)[0] || "";
        // Check standard verb suffixes
        if (
          part.endsWith("ть") || part.endsWith("ться") || part.endsWith("ти") || part.endsWith("уть") || part.endsWith("ать") || part.endsWith("ить") || part.endsWith("еть") ||
          firstWord.endsWith("ть") || firstWord.endsWith("ться") || firstWord.endsWith("ти") || firstWord.endsWith("уть") || firstWord.endsWith("ать") || firstWord.endsWith("ить") || firstWord.endsWith("еть")
        ) {
          foundVerb = true;
        }
        // Check standard adjective suffixes
        if (
          part.endsWith("ый") || part.endsWith("ий") || part.endsWith("ая") || part.endsWith("ые") || part.endsWith("ие") || part.endsWith("ой") ||
          firstWord.endsWith("ый") || firstWord.endsWith("ий") || firstWord.endsWith("ая") || firstWord.endsWith("ые") || firstWord.endsWith("ие") || firstWord.endsWith("ой")
        ) {
          foundAdjective = true;
        }
        // Check Russian adverb suffixes (ending in 'о', but not nouns)
        if (part.endsWith("о") && part.length > 3) {
          const commonONouns = ["окно", "лицо", "молоко", "слово", "дело", "утро", "небо", "солнце", "пиво", "кино", "метро", "фото", "яблоко", "озеро"];
          if (!commonONouns.includes(part) && !commonONouns.includes(firstWord)) {
            foundAdverb = true;
          }
        }
      }

      if (foundVerb) {
        guessedPos = "verb";
        isGuess = false;
      } else if (foundAdjective) {
        guessedPos = "adjective";
        isGuess = false;
      } else if (foundAdverb) {
        guessedPos = "adverb";
        isGuess = false;
      } else {
        // If Russian doesn't yield a clear hint, look at English suffixes for any of the parts
        let hasAdverb = false;
        let hasAdjective = false;
        let hasVerb = false;
        let hasNoun = false;

        for (const p of enParts) {
          if (p.endsWith("ly") && p.length > 4) {
            hasAdverb = true;
          } else if (
            p.endsWith("able") ||
            p.endsWith("ible") ||
            p.endsWith("ful") ||
            p.endsWith("less") ||
            p.endsWith("ous") ||
            p.endsWith("ive") ||
            p.endsWith("ic") ||
            (p.endsWith("ish") && p.length > 4) ||
            (p.endsWith("al") && p.length > 4)
          ) {
            hasAdjective = true;
          } else if (
            p.endsWith("ize") ||
            p.endsWith("ise") ||
            p.endsWith("ify") ||
            (p.endsWith("ate") && p.length > 4)
          ) {
            hasVerb = true;
          } else if (
            p.endsWith("tion") ||
            p.endsWith("sion") ||
            p.endsWith("ness") ||
            p.endsWith("ment") ||
            p.endsWith("ity") ||
            p.endsWith("ship") ||
            p.endsWith("ism")
          ) {
            hasNoun = true;
          }
        }

        if (hasAdverb) {
          guessedPos = "adverb";
          isGuess = false;
        } else if (hasAdjective) {
          guessedPos = "adjective";
          isGuess = false;
        } else if (hasVerb) {
          guessedPos = "verb";
          isGuess = false;
        } else if (hasNoun) {
          guessedPos = "noun";
          isGuess = false;
        } else {
          // Default guess is noun if no rules apply
          guessedPos = "noun";
          isGuess = true;
        }
      }
    }
  }

  // If the guessed POS is not in availablePos, offer to register it
  if (guessedPos && !availablePos[guessedPos]) {
    const posLabels: { [key: string]: string } = {
      pronoun: "Местоимение",
      preposition: "Предлог",
      conjunction: "Союз",
      participle: "Причастие",
      phrasal_verb: "Фразовый глагол",
      phrase: "Фраза",
      noun: "Существительное",
      verb: "Глагол",
      adjective: "Прилагательное",
      adverb: "Наречие"
    };
    if (posLabels[guessedPos]) {
      newPos = { key: guessedPos, label: posLabels[guessedPos] };
    }
  }

  // 2. Identify the dynamic Topic based on rich keyword directory mapping!
  const categories = [
    {
      id: "clothes",
      matchPatterns: ["clothe", "cloth", "wear", "одежд", "вещ", "гардероб", "wardrobe"],
      enKeywords: ["shirt", "t-shirt", "pants", "trousers", "dress", "skirt", "jacket", "coat", "sweater", "hoodie", "suit", "jeans", "shorts", "socks", "glove", "scarf", "hat", "cap", "tie", "pajamas", "underwear", "wear", "blouse", "belt", "outfit"],
      ruKeywords: ["одежда", "рубашка", "футболка", "брюки", "штаны", "платье", "юбка", "куртка", "пальто", "свитер", "худи", "костюм", "джинсы", "шорты", "носки", "перчатки", "шарф", "шапка", "кепка", "галстук", "пижама", "белье", "блузка", "ремень", "вещи"]
    },
    {
      id: "shoes",
      matchPatterns: ["shoe", "boot", "обув", "footwear"],
      enKeywords: ["shoes", "boot", "boots", "sneakers", "trainers", "sandals", "slippers", "heels", "footwear", "shoe", "clog"],
      ruKeywords: ["обувь", "ботинки", "сапоги", "кроссовки", "кеды", "сандалии", "тапочки", "туфли", "каблуки", "полуботинки"]
    },
    {
      id: "nature",
      matchPatterns: ["nature", "природ", "environment", "animal", "животн", "beast", "pet", "ecology", "world", "дерев", "forest"],
      enKeywords: ["nature", "tree", "forest", "wood", "river", "lake", "sea", "ocean", "mountain", "flower", "grass", "plant", "animal", "bird", "fish", "insect", "dog", "cat", "horse", "cow", "sheep", "lion", "tiger", "bear", "fox", "wolf", "sun", "moon", "star", "sky", "stone", "rock", "earth", "land", "wind", "rain", "snow", "pet", "leaf", "leaves", "woodlands"],
      ruKeywords: ["природа", "дерево", "лес", "река", "озеро", "море", "океан", "гора", "цветок", "трава", "растение", "животное", "птица", "рыба", "насекомое", "собака", "кошка", "лошадь", "корова", "лев", "тигр", "медведь", "лиса", "волк", "солнце", "луна", "звезда", "небо", "камень", "земля", "ветер", "дождь", "снег", "питомец", "лист", "листья"]
    },
    {
      id: "mood",
      matchPatterns: ["mood", "настроен", "emotion", "feeling", "чувств", "эмоци", "state", "радост", "груст"],
      enKeywords: ["mood", "emotion", "feeling", "happy", "sad", "angry", "scared", "excited", "tired", "bored", "surprised", "nervous", "proud", "jealous", "calm", "peaceful", "lonely", "love", "hate", "joy", "sorrow", "fear", "anger", "laugh", "cry", "smile", "worry", "shock", "stress", "glad", "delighted", "afraid"],
      ruKeywords: ["настроение", "эмоция", "чувство", "счастливый", "грустный", "злой", "испуганный", "уставший", "скучный", "удивленный", "нервный", "гордый", "спокойный", "одинокий", "любовь", "ненависть", "радость", "горе", "страх", "гнев", "смеяться", "плакать", "улыбка", "беспокоиться", "шок", "стресс", "рад", "испуг"]
    },
    {
      id: "colors",
      matchPatterns: ["color", "colour", "цвет", "краск"],
      enKeywords: ["color", "colour", "red", "blue", "green", "yellow", "black", "white", "pink", "purple", "orange", "brown", "grey", "gray", "violet", "gold", "silver", "beige", "rainbow", "shade", "bright", "dark"],
      ruKeywords: ["цвет", "красный", "синий", "зеленый", "желтый", "черный", "белый", "розовый", "фиолетовый", "оранжевый", "коричневый", "серый", "золотой", "серебряный", "бежевый", "радуга", "оттенок", "яркий", "темный", "голубой"]
    },
    {
      id: "drinks",
      matchPatterns: ["drink", "beverage", "напит", "liquid", "чай", "кофе"],
      enKeywords: ["drink", "beverage", "water", "tea", "coffee", "juice", "milk", "beer", "wine", "soda", "lemonade", "alcohol", "cocktail", "vodka", "whiskey", "champagne", "mug", "cup", "bottle", "coke"],
      ruKeywords: ["напиток", "напитки", "вода", "чай", "кофе", "сок", "молоко", "пиво", "вино", "газировка", "лимонад", "алкоголь", "коктейль", "водка", "виски", "шампанское", "кружка", "чашка", "бутылка"]
    },
    {
      id: "home",
      matchPatterns: ["home", "house", "room", "дом", "квартир", "комнат", "мебель", "furniture"],
      enKeywords: ["home", "house", "room", "door", "window", "kitchen", "bed", "chair", "table", "sofa", "desk", "floor", "wall", "ceiling", "roof", "apartment", "flat", "bathroom", "toilet", "shower", "sink", "mirror", "wardrobe", "key", "pillow", "blanket", "lamp", "tv"],
      ruKeywords: ["дом", "комната", "дверь", "окно", "кухня", "кровать", "стул", "стол", "диван", "пол", "стена", "потолок", "крыша", "квартира", " ванная", "туалет", "душ", "раковина", "зеркало", "шкаф", "ключ", "подушка", "одеяло", "лампа", "телевизор"]
    },
    {
      id: "hobby",
      matchPatterns: ["hobby", "хобб", "sport", "спорт", "game", "игр", "music", "музык"],
      enKeywords: ["hobby", "play", "sport", "game", "music", "song", "dance", "read", "book", "film", "movie", "paint", "draw", "guitar", "piano", "chess", "tennis", "football", "soccer", "gym", "run", "swim", "climb", "photo", "camera", "guitar", "instrument", "bicycle", "bike"],
      ruKeywords: ["хобби", "игра", "спорт", "музыка", "песня", "танец", "читать", "книга", "фильм", "рисовать", "гитара", "пианино", "шахматы", "теннис", "футбол", "бегать", "плавать", "фото", "камера", "инструмент", "велосипед"]
    },
    {
      id: "weather",
      matchPatterns: ["weather", "погод", "climate", "climat"],
      enKeywords: ["weather", "sun", "rain", "snow", "wind", "cold", "hot", "cloud", "sky", "fog", "mist", "storm", "lightning", "thunder", "forecast", "temperature", "warm", "freezing", "icy", "wet", "dry", "climate"],
      ruKeywords: ["погода", "солнце", "дождь", "снег", "ветер", "холод", "тепло", "облако", "туча", "небо", "туман", "гроза", "молния", "гром", "прогноз", "температура", "теплый", "мороз", "лед", "влажный", "сухой", "климат"]
    },
    {
      id: "study",
      matchPatterns: ["study", "learn", "учёб", "учеб", "школ", "school", "education", "образован"],
      enKeywords: ["study", "learn", "school", "class", "teacher", "student", "book", "pen", "write", "pencil", "notebook", "desk", "exam", "test", "subject", "language", "history", "math", "science", "lesson", "homework", "college", "university"],
      ruKeywords: ["учеба", "учить", "школа", "класс", "учитель", "ученик", "книга", "ручка", "писать", "карандаш", "тетрадь", "парта", "экзамен", "тест", "предмет", "язык", "история", "математика", "урок", "домашнее задание", "колледж", "университет"]
    },
    {
      id: "work",
      matchPatterns: ["work", "job", "работ", "бизнес", "business", "career", "карьер"],
      enKeywords: ["work", "job", "office", "boss", "colleague", "money", "salary", "business", "project", "client", "manager", "meeting", "report", "contract", "company", "employ", "worker", "trade", "career"],
      ruKeywords: ["работа", "офис", "босс", "коллега", "деньги", "зарплата", "бизнес", "проект", "клиент", "менеджер", "встреча", "отчет", "контракт", "компания", "нанимать", "рабочий", "торговля", "карьера"]
    },
    {
      id: "food",
      matchPatterns: ["food", "eat", "еда", "пищ", "meal", "продукт"],
      enKeywords: ["food", "eat", "bread", "butter", "cheese", "meat", "fish", "chicken", "egg", "rice", "pasta", "vegetable", "fruit", "apple", "banana", "orange", "sugar", "salt", "pepper", "soup", "salad", "breakfast", "lunch", "dinner", "meal", "cook", "kitchen", "taste", "delicious", "pancakes"],
      ruKeywords: ["еда", "кушать", "есть", "хлеб", "масло", "сыр", "мясо", "рыба", "курица", "яйцо", "рис", "макароны", "овощи", "фрукты", "яблоко", "банан", "сахар", "соль", "перец", "суп", "салат", "завтрак", "обед", "ужин", "готовить", "вкусно", "блины"]
    },
    {
      id: "time",
      matchPatterns: ["time", "время", "date", "дат", "calendar", "календар"],
      enKeywords: ["time", "day", "night", "morning", "evening", "hour", "minute", "second", "week", "month", "year", "today", "yesterday", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "calendar", "clock", "watch", "season", "spring", "summer", "autumn", "winter"],
      ruKeywords: ["время", "день", "ночь", "утро", "вечер", "час", "минута", "секунда", "неделя", "месяц", "год", "сегодня", "вчера", "завтра", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье", "январь", "февраль", "календарь", "часы", "сезон", "весна", "лето", "осень", "зима"]
    },
    {
      id: "family",
      matchPatterns: ["family", "семь", "friend", "друг", "people", "люд"],
      enKeywords: ["family", "mother", "father", "son", "daughter", "brother", "sister", "friend", "parent", "husband", "wife", "child", "children", "baby", "uncle", "aunt", "cousin", "grandfather", "grandmother", "people", "person", "man", "woman", "boy", "girl"],
      ruKeywords: ["семья", "мама", "папа", "сын", "дочь", "брат", "сестра", "друг", "родители", "муж", "жена", "ребенок", "дети", "младенец", "дядя", "тетя", "дедушка", "бабушка", "люди", "человек", "мужчина", "женщина", "мальчик", "девочка"]
    },
    {
      id: "travel",
      matchPatterns: ["travel", "путешеств", "trip", "поездк", "transport", "транспорт"],
      enKeywords: ["travel", "trip", "journey", "car", "plane", "train", "bus", "bike", "taxi", "bicycle", "boat", "ship", "flight", "ticket", "hotel", "luggage", "bag", "suitcase", "map", "guide", "border", "country", "city", "town", "road", "street", "station", "airport"],
      ruKeywords: ["путешествие", "поездка", "машина", "самолет", "поезд", "автобус", "такси", "велосипед", "лодка", "корабль", "полет", "билет", "отель", "гостиница", "багаж", "сумка", "чемодан", "карта", "гид", "граница", "страна", "город", "дорога", "улица", "станция", "аэропорт"]
    }
  ];

  let matchedTopicKey = "general";

  // Look for any of the categories matching keywords
  for (const cat of categories) {
    const wordMatches = cat.enKeywords.some(kw => word === kw || word.includes(kw)) ||
                        cat.ruKeywords.some(kw => ruWord === kw || ruWord.includes(kw));
    
    if (wordMatches) {
      // Find if we have a matching key or label in availableTopics
      let foundKey = Object.keys(availableTopics).find(k => k.toLowerCase() === cat.id);
      
      if (!foundKey) {
        // Try searching availableTopics for key matching patterns
        foundKey = Object.keys(availableTopics).find(k => 
          cat.matchPatterns.some(p => k.toLowerCase().includes(p))
        );
      }

      if (!foundKey) {
        // Try searching availableTopics for labels containing patterns
        foundKey = Object.keys(availableTopics).find(k => {
          const label = availableTopics[k].toLowerCase();
          return cat.matchPatterns.some(p => label.includes(p));
        });
      }

      if (foundKey) {
        matchedTopicKey = foundKey;
        break;
      }
    }
  }

  // Fallback to direct name match if still general
  if (matchedTopicKey === "general") {
    const foundDirectKey = Object.keys(availableTopics).find(k => 
      word.includes(k.toLowerCase()) || k.toLowerCase().includes(word)
    );
    if (foundDirectKey && foundDirectKey !== "general") {
      matchedTopicKey = foundDirectKey;
    }
  }

  return {
    pos: guessedPos,
    topic: matchedTopicKey,
    isGuess: isGuess,
    newPos: newPos
  };
};

// Endpoint to automatically classify part of speech and topic for a word
app.post("/api/classify", async (req, res) => {
  const { en, ru, existingPos, existingTopics, allPos, allTopics } = req.body || {};
  if (!en || !ru) {
    res.status(400).json({ error: "Missing en or ru word fields" });
    return;
  }

  // Parse existing lists to use for offline fallback
  const parsedPos: { [key: string]: string } = allPos || {};
  const parsedTopics: { [key: string]: string } = allTopics || {};

  if (!allPos && existingPos) {
    existingPos.split(",").forEach((item: string) => {
      const parts = item.split(":");
      if (parts.length >= 2) {
        parsedPos[parts[0].trim()] = parts.slice(1).join(":").trim();
      }
    });
  }
  if (!allTopics && existingTopics) {
    existingTopics.split(",").forEach((item: string) => {
      const parts = item.split(":");
      if (parts.length >= 2) {
        parsedTopics[parts[0].trim()] = parts.slice(1).join(":").trim();
      }
    });
  }

  try {
    const ai = getAIClient();

    const systemInstruction = `You are an expert lexicographer and English-Russian linguist.
You analyze an English word/phrase and its Russian translation to determine its part of speech (POS) and its vocabulary topic.

Your classification MUST be highly accurate according to standard English and Russian grammar:
- If the English input or Russian translation contains separators like slashes ("/"), commas (","), or semicolons (";"), it represents multiple synonym options (e.g. "dust / clean" -> "вытирать пыль", or "dust" -> "пыль, вытирать пыль"). Do NOT classify it as a "phrase" (Фраза) just because it has slashes, commas, or multiple words in the translation! A "phrase" is ONLY for actual multi-word English expressions or idioms (like "by the way", "take care", "good morning"). Single English words with multiple synonym choices or a multi-word translation (like "dust" -> "вытирать пыль") are NOT phrases. Determine their primary part of speech (e.g., "dust" as "вытирать пыль" is a "verb", "dust" as "пыль" is a "noun").
- Pronouns like "I", "you", "he", "she", "it", "we", "they", "this", "that", "him", "her", "their", "me" should be classified as pronouns ("pronoun"). If "pronoun" is not in the list of available keys, you should invent it with the label "Местоимение".
- Interrogative and relative adverbs like "how" (как), "where" (где), "when" (когда), "why" (почему) must be classified as adverbs ("adverb", Наречие), NOT nouns or phrases!
- Prepositions like "in", "on", "at", "under", "with", "by", "for", "about", "near" are prepositions ("preposition", Предлог).
- Conjunctions like "and", "but", "or", "because", "if" are conjunctions ("conjunction", Союз).
- Normal verbs are "verb" (Глагол).
- Multi-word verbs are "phrasal_verb" (Фразовый глагол).
- Adjectives are "adjective" (Прилагательное).
- Nouns are "noun" (Существительное).
- Set phrases, idioms, or sentences (e.g. "by the way", "at the moment", "good morning") are "phrase" (Фраза).

Available Parts of Speech keys (format is key:label):
${existingPos || "verb:Существительное, noun:Существительное, adjective:Прилагательное, adverb:Наречие, phrase:Фраза"}

Available Topic keys (format is key:label):
${existingTopics || "home:🏠 Дом, hobby:🎨 Хобби, weather:⛅ Погода, study:📚 Учеба, work:💼 Работа, food:🍎 Еда, time:🕒 Время, family:👨‍👩‍👧‍👦 Семья, travel:✈️ Путешествия, general:🌐 Общее, diary:📓 Личный дневник"}

CRITICAL REQUIREMENT:
You MUST map the word/phrase to one of the provided "Available Parts of Speech keys" and "Available Topic keys" if it fits.
The user can create custom topics and parts of speech which will have random keys (e.g., keys starting with "custom_" or some other code, like "custom_a3f8b9:🎸 Музыкальные инструменты" or "custom_j8f3d4:👕 Одежда").
You MUST analyze the SEMANTIC MEANING of the Russian labels of these custom keys!
For example:
- If the word is "violin" (скрипка) and there is a key like "custom_a3f8b9:🎸 Музыкальные инструменты", you MUST return its key "custom_a3f8b9" because "Музыкальные инструменты" is the perfect semantic match for violin! Never map it to "animal", "body", "hobby", or "general" if a specific custom key's label matches perfectly.
- If the word is "shirt" (рубашка) and there is a key like "custom_j8f3d4:👕 Одежда", you MUST return "custom_j8f3d4"!
- If the word is "lion" (лев) and there is a key like "custom_xyz:🦁 Животные", you MUST return "custom_xyz"!
Always prioritize mapping to the custom keys in the provided list based on their labels. Only if a word absolutely does not fit any of the provided keys or custom labels, you can invent a new lowercase key for POS or Topic. If you invent a new Topic, provide an appropriate emoji and a Russian label (e.g., "🌳 Природа").`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Word: "${en}" -> Translation: "${ru}"`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pos: { type: Type.STRING, description: "The part of speech key (e.g. verb, noun, adverb, adjective, phrase, pronoun)" },
            topic: { type: Type.STRING, description: "The topic key" },
            newTopic: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                label: { type: Type.STRING, description: "emoji Russian_Label" }
              }
            },
            newPos: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                label: { type: Type.STRING, description: "Russian_Label" }
              }
            }
          },
          required: ["pos", "topic"]
        }
      }
    });

    const text = response.text || "";
    const cleanText = text.replace(/```json|```/g, "").trim();

    try {
      const parsedClassification = JSON.parse(cleanText);
      res.json(parsedClassification);
    } catch (parseError) {
      console.error("Failed to parse classification JSON. Raw response was:", text);
      res.status(500).json({ error: "Failed to parse classification JSON", raw: text });
    }
  } catch (error: any) {
    const errorMsg = error?.message || "";
    const isQuotaError = errorMsg.includes("quota") || errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED");
    const isUnavailableError = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("demand");

    if (isQuotaError) {
      console.warn(`[Gemini API Quota Exceeded] 429 Rate Limit hit for "${en}". Seamlessly using offline heuristic classifier.`);
    } else if (isUnavailableError) {
      console.warn(`[Gemini API Unavailable] 503 High Demand for "${en}". Seamlessly using offline heuristic classifier.`);
    } else {
      console.warn(`[Gemini API Error] "${en}": ${error?.message || error}. Using offline fallback.`);
    }

    const fallback = getOfflineClassification(en, ru, parsedPos, parsedTopics);
    res.json(fallback);
  }
});

// Endpoint to generate a daily story dynamically based on CEFR level
app.post("/api/generate-story", async (req, res) => {
  try {
    const { level, date } = req.body;
    if (!level) {
      res.status(400).json({ error: "Missing level field" });
      return;
    }

    const ai = getAIClient();

    const systemInstruction = `You are an expert English teacher who writes simple, highly engaging short stories for English language learners. 
You must write a story specifically tailored to the English CEFR level ${level}.

Guidelines:
- Level A1: Extremely simple vocabulary, short sentences, present tense only, around 80-120 words.
- Level A2: Simple vocabulary, simple past and present tenses, basic conjunctions, around 120-170 words.
- Level B1: Moderate vocabulary, compound sentences, past/present/future/perfect tenses, interesting themes, around 170-240 words.
- Level B2: Upper-intermediate vocabulary, complex sentences, sub-clauses, rich idioms, around 240-350 words.

The story must have:
1. A unique, beautiful, inspiring, or cozy title.
2. An engaging and grammatically correct English text.
3. It must feel like a genuine, high-quality literary story or diary entry.

Return ONLY a valid JSON object in this exact shape:
{
  "title": "Story Title",
  "level": "${level}",
  "text": "The full text of the story..."
}
Return absolutely nothing else, no markdown formatting, no comments, just raw JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: systemInstruction },
        { text: `Generate a brand new, unique story for level ${level} on date ${date || "today"}. Make it highly cozy, inspiring, and different from any other story.` }
      ],
    });

    const text = response.text || "";
    const cleanText = text.replace(/```json|```/g, "").trim();

    try {
      const parsedStory = JSON.parse(cleanText);
      res.json(parsedStory);
    } catch (parseError) {
      console.error("Failed to parse story JSON. Raw response was:", text);
      res.status(500).json({ error: "Failed to parse story JSON", raw: text });
    }
  } catch (error: any) {
    console.error("Story Generation API error:", error);
    res.status(500).json({ error: error?.message || "Internal server error during story generation" });
  }
});

// Endpoint to generate 3 quiz questions for a book story using Gemini API
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { title, text: storyText, level } = req.body;
    if (!title || !storyText) {
      res.status(400).json({ error: "Missing story title or text" });
      return;
    }

    const ai = getAIClient();

    const systemInstruction = `You are an expert English teacher. Analyze the English story provided and generate 3 interactive multiple-choice questions (comprehension check) to test the reader's understanding of the plot.
The questions themselves should be in simple, level-appropriate English (appropriate for level ${level || "A2"}). The options should be in English.
Provide a clear, brief explanation in Russian of why the correct answer is correct.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: systemInstruction },
        { text: `Story Title: "${title}"\nStory Content:\n"${storyText}"` }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              description: "Array of exactly 3 multiple choice questions based on the story content.",
              items: {
                type: Type.OBJECT,
                properties: {
                  question: {
                    type: Type.STRING,
                    description: "The question text in English, appropriate for the given CEFR level."
                  },
                  options: {
                    type: Type.ARRAY,
                    description: "Exactly 4 options in English.",
                    items: {
                      type: Type.STRING
                    }
                  },
                  correctIndex: {
                    type: Type.INTEGER,
                    description: "0-based index of the correct option (integer 0 to 3)."
                  },
                  explanation: {
                    type: Type.STRING,
                    description: "A short, encouraging explanation in Russian explaining why this answer is correct."
                  }
                },
                required: ["question", "options", "correctIndex", "explanation"]
              }
            }
          },
          required: ["questions"]
        }
      }
    });

    const text = response.text || "";

    try {
      const parsedQuiz = JSON.parse(text.trim());
      res.json(parsedQuiz);
    } catch (parseError) {
      console.error("Failed to parse quiz JSON. Raw response was:", text);
      res.status(500).json({ error: "Failed to parse quiz JSON", raw: text });
    }
  } catch (error: any) {
    console.error("Quiz Generation API error:", error);
    res.status(500).json({ error: error?.message || "Internal server error during quiz generation" });
  }
});

// Endpoint to send a beautiful test notification email
app.post("/api/send-test-email", async (req, res) => {
  try {
    const { email, userId, hour, offset } = req.body;
    if (!email) {
      res.status(400).json({ error: "Не указан email-адрес." });
      return;
    }

    console.log(`Starting test email sending process to: ${email}`);

    // Check if SMTP credentials are provided in the environment
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === "true";
    const fromAddress = process.env.SMTP_FROM || '"My English Journal" <no-reply@englishjournal.app>';

    let transporter;
    let isFallback = false;
    let previewUrl = null;

    if (host && user && pass) {
      console.log(`Using custom SMTP server: ${host}:${port}`);
      transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
    } else {
      console.log("No SMTP environment variables found. Using Ethereal static fallback...");
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: "sbds45poeyqw3zz7@ethereal.email",
          pass: "VNr8v33J8uH7qtvDNY",
        },
      });
      isFallback = true;
    }

    const appUrl = process.env.APP_URL || "https://ai.studio/build";

    const mailOptions = {
      from: isFallback ? '"My English Journal (Test Mailer)" <no-reply@ethereal.email>' : fromAddress,
      to: email,
      subject: "My English Journal: Тестовое напоминание 📚",
      html: `
<div style="font-family: 'Georgia', serif; background-color: #f7f6f2; color: #2e2a25; padding: 40px 20px; max-width: 600px; margin: 0 auto; border-radius: 12px; border: 1px solid #e1ded5;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="font-style: italic; font-weight: normal; font-size: 28px; color: #8fa080; margin: 0;">My English Journal 📚</h1>
    <p style="color: #6a665d; font-size: 11px; margin-top: 4px; letter-spacing: 1px; text-transform: uppercase;">Твой уютный дневник английского</p>
  </div>
  
  <div style="background-color: #ffffff; border-radius: 8px; padding: 24px; box-shadow: 0 4px 12px rgba(46, 42, 37, 0.03); border: 1px solid #eeece5;">
    <h2 style="font-style: italic; font-weight: normal; font-size: 20px; color: #d68060; margin-top: 0; margin-bottom: 16px; border-bottom: 1px solid #f0eee8; padding-bottom: 10px;">
      Теплое напоминание заниматься! ✨
    </h2>
    
    <p style="font-size: 14px; line-height: 1.6; color: #4a463d; margin-bottom: 20px;">
      Привет! Это твой ежедневный вестник знаний. Время уделить английскому всего 5 минут, чтобы закрепить прогресс и продлить твою серию занятий!
    </p>

    <div style="background-color: #fcfbfa; border-left: 3px solid #8fa080; padding: 12px 16px; margin-bottom: 24px; border-radius: 4px;">
      <p style="font-size: 12px; font-weight: bold; color: #6a665d; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">СЛОВА НА СЕГОДНЯШНЕЕ ПОВТОРЕНИЕ:</p>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #2e2a25;">
        <li><strong>serendipity</strong> — счастливая случайность</li>
        <li><strong>exquisite</strong> — изысканный, утонченный</li>
        <li><strong>cozy</strong> — уютный, теплый</li>
      </ul>
    </div>

    <div style="text-align: center; margin-top: 28px; margin-bottom: 10px;">
      <a href="${appUrl}" style="background-color: #8fa080; color: #ffffff; text-decoration: none; padding: 12px 28px; font-size: 15px; font-weight: 500; border-radius: 30px; display: inline-block;">
        Открыть мой журнал и заниматься →
      </a>
    </div>
  </div>

  <div style="text-align: center; margin-top: 30px; font-size: 11px; color: #9c988f; line-height: 1.4;">
    Вы получили это письмо, потому что включили email-напоминания в настройках My English Journal.<br>
    Настройки времени отправки: ежедневно в ${String(hour).padStart(2, "0")}:00.<br>
    Вы можете отключить подписку в любой момент в приложении.
  </div>
</div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Message sent successfully: %s", info.messageId);

    if (isFallback) {
      previewUrl = nodemailer.getTestMessageUrl(info);
      console.log("Ethereal Preview URL: %s", previewUrl);
    }

    res.json({
      success: true,
      messageId: info.messageId,
      previewUrl,
      isFallback
    });
  } catch (error: any) {
    console.error("Test email sending error:", error);
    res.status(500).json({ error: error?.message || "Failed to send test email" });
  }
});

// Endpoint to send a beautiful test push notification
app.post("/api/send-test-push", async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) {
      res.status(400).json({ error: "Не найден объект подписки для push-уведомлений." });
      return;
    }

    console.log("Sending test push notification to subscription...");
    await webpush.sendNotification(
      JSON.parse(subscription),
      JSON.stringify({
        title: "🦉 Время английского! (Тест) ✨",
        body: "Прекрасно! Твои push-уведомления работают отлично. Теперь они будут приходить, даже когда приложение закрыто! 📚"
      })
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error("Test push sending error:", error);
    res.status(500).json({ error: error?.message || "Failed to send test push" });
  }
});

// Endpoint to trigger scheduled email notifications from an external cron job or manually
app.get("/api/cron/check-reminders", async (req, res) => {
  console.log("[API Cron] External trigger for scheduled email notifications received.");
  try {
    await checkAndSendScheduledEmails();
    res.json({ success: true, message: "Scheduled reminder emails check complete." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || err });
  }
});

// Vite server setup & static serving middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware loaded.");
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving built static files in production mode.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

// Only start the Express listener if not running in a Vercel Serverless environment
const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL;
if (!isVercel) {
  startServer().catch((err) => {
    console.error("Failed to start full-stack server:", err);
  });
}

export default app;
