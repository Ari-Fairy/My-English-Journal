import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel, Modality } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { WebSocketServer } from "ws";
import { staticQuestions, staticWritingPrompts, staticSpeakingPrompts } from "./src/data/levelTestDb";

dotenv.config();

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

// Convert raw PCM audio data (base64) from Gemini TTS to WAV format
function convertPcmToWav(base64Pcm: string, sampleRate: number = 24000): string {
  const pcmBuffer = Buffer.from(base64Pcm, "base64");
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const chunkSize = 36 + dataSize;

  const wavHeader = Buffer.alloc(44);
  
  // ChunkID "RIFF"
  wavHeader.write("RIFF", 0);
  // ChunkSize
  wavHeader.writeUInt32LE(chunkSize, 4);
  // Format "WAVE"
  wavHeader.write("WAVE", 8);
  // Subchunk1ID "fmt "
  wavHeader.write("fmt ", 12);
  // Subchunk1Size (16 for PCM)
  wavHeader.writeUInt32LE(16, 16);
  // AudioFormat (1 for PCM)
  wavHeader.writeUInt16LE(1, 20);
  // NumChannels
  wavHeader.writeUInt16LE(numChannels, 22);
  // SampleRate
  wavHeader.writeUInt32LE(sampleRate, 24);
  // ByteRate
  wavHeader.writeUInt32LE(byteRate, 28);
  // BlockAlign
  wavHeader.writeUInt16LE(blockAlign, 32);
  // BitsPerSample
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  // Subchunk2ID "data"
  wavHeader.write("data", 36);
  // Subchunk2Size
  wavHeader.writeUInt32LE(dataSize, 40);

  const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
  return wavBuffer.toString("base64");
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Server-side translation memory cache
const translationMemoryCache = new Map<string, string>();

// Helper to pause execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to wrap a promise with a timeout to prevent hanging API requests
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, defaultValue: T): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[Timeout] Operation exceeded ${timeoutMs}ms. Continuing with fallback/default value.`);
      resolve(defaultValue);
    }, timeoutMs);
  });
  return Promise.race([
    promise.then((val) => {
      clearTimeout(timeoutId);
      return val;
    }),
    timeoutPromise
  ]);
}

// Helper for generating content with retry and fallback model
async function generateContentWithRetry(params: any, options: { maxRetries?: number; fallbackModel?: string } = {}): Promise<any> {
  const { maxRetries = 3, fallbackModel = "gemini-3.1-flash-lite" } = options;
  const ai = getAIClient();
  let lastError: any = null;
  let currentDelay = 500;

  // Try with the requested model (or default)
  const initialModel = params.model || "gemini-3.5-flash";
  let currentModel = initialModel;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Gemini API] Attempt ${attempt} using model "${currentModel}"`);
      const responsePromise = ai.models.generateContent({
        ...params,
        model: currentModel
      });
      const response = await withTimeout(responsePromise, 40000, null);
      if (!response) {
        throw new Error("Gemini API call timed out after 40 seconds");
      }
      return response;
    } catch (error: any) {
      lastError = error;
      const errMsg = error?.message || String(error);
      const isTransient = errMsg.includes("503") || 
                        errMsg.includes("UNAVAILABLE") || 
                        errMsg.includes("demand") || 
                        errMsg.includes("Resource exhausted") || 
                        errMsg.includes("429");

      console.warn(`[Gemini API Warning] Attempt ${attempt} failed with error: ${errMsg}`);

      if (!isTransient) {
        break; // If not a transient error, don't wait/retry, fail immediately
      }

      // If the primary model failed due to high demand/rate limits, immediately switch to the fallback model
      if (fallbackModel && currentModel !== fallbackModel) {
        console.log(`[Gemini API] Primary model "${currentModel}" failed with a transient error. Seamlessly switching to highly-available fallback model "${fallbackModel}"...`);
        currentModel = fallbackModel;
        currentDelay = 200; // Fast retry with fallback model
      }

      if (attempt === maxRetries) {
        break;
      }

      console.log(`[Gemini API] Retrying in ${currentDelay}ms...`);
      await delay(currentDelay);
      currentDelay *= 1.5; // Exponential backoff
    }
  }

  // Desperation attempt if somehow everything else failed but we didn't try the fallback yet
  if (fallbackModel && currentModel !== fallbackModel) {
    console.log(`[Gemini API] Desperation fallback attempt using "${fallbackModel}"...`);
    try {
      const responsePromise = ai.models.generateContent({
        ...params,
        model: fallbackModel
      });
      const response = await withTimeout(responsePromise, 40000, null);
      if (!response) {
        throw new Error("Desperation fallback API call timed out after 40 seconds");
      }
      return response;
    } catch (fallbackError: any) {
      console.error(`[Gemini API Error] Desperation fallback model "${fallbackModel}" also failed:`, fallbackError);
      lastError = fallbackError;
    }
  }

  throw lastError || new Error("Gemini API call failed");
}

const OFFLINE_TRANSLATION_FALLBACKS: { [key: string]: string } = {
  "the": "артикль (не переводится)", "a": "артикль", "an": "артикль",
  "i": "я", "me": "мне, меня", "my": "мой, моя", "we": "мы", "us": "нам, нас", "our": "наш, наша",
  "you": "ты, вы, тебя", "your": "твой, ваш", "he": "он", "him": "его, ему", "his": "его",
  "she": "она", "her": "её, ей", "it": "это, оно", "its": "его, её", "they": "они", "them": "их, им",
  "their": "их", "who": "кто", "what": "что, какой", "which": "который", "this": "этот, эта, это",
  "that": "тот, та, то, что", "these": "эти", "those": "те", "and": "и", "but": "но", "or": "или",
  "if": "если", "because": "потому что", "as": "как, так как", "of": "из, о, об", "to": "к, в, на",
  "for": "для, ради", "with": "с, вместе с", "without": "без", "about": "о, около", "at": "у, в, около",
  "by": "у, около, мимо", "from": "от, из, с", "go": "идти, ехать", "went": "шел, поехал", "gone": "ушедший",
  "see": "видеть", "saw": "видел", "seen": "увиденный", "make": "делать, создавать", "made": "сделал",
  "get": "получать, становиться", "got": "получил", "know": "знать", "knew": "знал", "think": "думать",
  "thought": "думал, мысль", "take": "брать, взять", "took": "взял", "come": "приходить", "came": "пришел",
  "give": "давать", "gives": "дает", "gave": "дал", "find": "находить", "found": "нашел",
  "say": "сказать, говорить", "said": "сказал", "always": "всегда", "never": "никогда", "sometimes": "иногда",
  "today": "сегодня", "tomorrow": "завтра", "yesterday": "вчера", "good": "хороший", "bad": "плохой",
  "new": "новый", "old": "старый", "day": "день", "night": "ночь", "time": "время", "year": "год",
  "house": "дом", "friend": "друг", "water": "вода", "river": "река", "forest": "лес", "wood": "дерево, лес",
  "tree": "дерево", "book": "книга", "read": "читать", "reads": "читает", "write": "писать", "writes": "пишет",
  "love": "любить", "like": "нравиться", "want": "хотеть", "help": "помогать", "play": "играть",
  "work": "работать, работа", "sleep": "спать", "happy": "счастливый", "sad": "грустный", "beautiful": "красивый",
  "small": "маленький", "big": "большой", "large": "большой", "little": "маленький, немного", "long": "длинный, долгий",
  "short": "короткий", "high": "высокий", "low": "низкий", "fast": "быстро, быстрый", "slow": "медленный, медленно",
  "gently": "мягко, нежно", "suddenly": "внезапно, вдруг", "quietly": "тихо, спокойно", "mystery": "тайна, загадка",
  "valley": "долина", "mountain": "гора", "village": "деревня, село", "lighthouse": "маяк", "cottage": "домик",
  "bridge": "мост", "current": "течение, текущий", "solitude": "одиночество, уединение", "peace": "мир, покой",
  "wind": "ветер", "sky": "небо", "dark": "темный, темнота", "light": "свет, легкий", "star": "звезда",
  "moon": "луна", "sun": "солнце", "cloud": "облако", "rain": "дождь", "snow": "снег", "flower": "цветок",
  "cat": "кот, кошка", "dog": "собака", "bird": "птица", "road": "дорога, путь", "path": "тропа, путь",
  "street": "улица", "town": "город (небольшой)", "city": "город (крупный)", "people": "люди, народ",
  "man": "мужчина, человек", "woman": "женщина", "child": "ребенок", "children": "дети", "boy": "мальчик",
  "girl": "девочка", "father": "отец", "mother": "мать", "brother": "брат", "sister": "сестра",
  "family": "семья", "life": "жизнь", "heart": "сердце", "mind": "разум, ум", "soul": "душа",
  "word": "слово", "story": "рассказ, история", "page": "страница", "diary": "дневник", "map": "карта",
  "compass": "компас", "journey": "путешествие", "adventure": "приключение", "morning": "утро",
  "evening": "вечер", "afternoon": "день (после полудня)", "hour": "час", "minute": "минута",
  "second": "секунда", "week": "неделя", "month": "месяц", "monday": "понедельник", "tuesday": "вторник",
  "wednesday": "среда", "thursday": "четверг", "friday": "пятница", "saturday": "суббота",
  "sunday": "воскресенье"
};

function getOfflineChatTutorReply(userMessage: string, role: string, userLevel: string, clientLocalTime?: string): { replyText: string; evaluatedLevel: string; wordToAdd: any } {
  const msg = (userMessage || "").trim().toLowerCase();
  
  // Basic grammar corrections
  let correction = "";
  if (msg.includes("i am agree") || msg.includes("i'm agree")) {
    correction = " (By the way, in English we say 'I agree' instead of 'I am agree' because 'agree' is a verb! 😊)";
  } else if (msg.includes("feel myself")) {
    correction = " (Quick tip: in English we say 'I feel good' or 'I feel happy' instead of 'I feel myself' when talking about emotions! 🌸)";
  } else if (msg.includes("he go ") || msg.endsWith("he go")) {
    correction = " (Remember to use 'he goes' for the third person singular in Present Simple!)";
  } else if (msg.includes("she go ") || msg.endsWith("she go")) {
    correction = " (Remember to use 'she goes' for the third person singular!)";
  } else if (msg.includes("he have") || msg.includes("she have")) {
    correction = " (Just a tiny note: use 'has' for he/she/it, like 'he has' or 'she has'! 📚)";
  }

  // Detect time context
  let hour = new Date().getHours();
  if (clientLocalTime) {
    try {
      hour = new Date(clientLocalTime).getHours();
    } catch (e) {}
  }
  const isLateNight = hour >= 23 || hour < 5;
  const isMorning = hour >= 5 && hour < 12;
  const isAfternoon = hour >= 12 && hour < 17;
  const isEvening = hour >= 17 && hour < 23;

  // Determine greeting prefix
  let timeGreetingPrefix = "";
  if (isMorning) {
    timeGreetingPrefix = role === "sophia" ? "Good morning! ☀️ " : role === "oliver" ? "Good morning. " : "Morning! 🌅 ";
  } else if (isAfternoon) {
    timeGreetingPrefix = role === "sophia" ? "Good afternoon! 🌸 " : role === "oliver" ? "Good afternoon. " : "Hey, good afternoon! ☀️ ";
  } else if (isEvening) {
    timeGreetingPrefix = role === "sophia" ? "Good evening! 🌌 " : role === "oliver" ? "Good evening. " : "Good evening! 🌆 ";
  } else if (isLateNight) {
    timeGreetingPrefix = role === "sophia" ? "Good night! Or rather, late-night greetings! 🌙 " : role === "oliver" ? "Greetings. It is quite late. " : "Hey! Wow, late night chat! 🦉 ";
  }

  // Check for rudeness / profanity / bad words
  const rudeKeywords = [
    "сука", "блять", "бля", "хуй", "пидор", "говно", "заебал", "заебали", 
    "мудак", "дурак", "дура", "fuck", "shit", "bitch", "asshole", "bastard", 
    "idiot", "stupid", "hate you", "хрен", "какого хрена", "черт"
  ];
  const isRude = rudeKeywords.some(word => msg.includes(word));

  let replyText = "";
  let wordToAdd = null;

  const topics = {
    food: {
      words: [
        { en: "delicious", ru: "очень вкусный", pos: "adjective", topic: "food" },
        { en: "recipe", ru: "рецепт", pos: "noun", topic: "food" },
        { en: "ingredients", ru: "ингредиенты", pos: "noun", topic: "food" }
      ],
      sophia: "That sounds absolutely delicious! I love talking about food. What is your favorite dish to cook or eat? Do you enjoy trying new recipes?",
      oliver: "Food and culinary arts are fascinating. From a grammatical perspective, 'delicious' is a strong adjective. What specific ingredients do you prefer in your daily meals?",
      alex: "Oh man, now I'm hungry! 🍕 That sounds awesome. What's your absolute go-to comfort food when you're hanging out?"
    },
    hobby: {
      words: [
        { en: "passionate", ru: "страстный, увлеченный", pos: "adjective", topic: "hobby" },
        { en: "leisure", ru: "досуг, свободное время", pos: "noun", topic: "hobby" },
        { en: "creative", ru: "творческий", pos: "adjective", topic: "hobby" }
      ],
      sophia: "How wonderful! Hobbies make our lives so rich and interesting. How long have you been doing this? It sounds like a great way to express yourself!",
      oliver: "Engaging in leisure activities is essential for cognitive balance. How do you structure your free time to practice your hobbies?",
      alex: "That is so cool! 🎸 I love spending my free time on hobbies too. How did you get into that? Tell me more!"
    },
    travel: {
      words: [
        { en: "breathtaking", ru: "захватывающий дух", pos: "adjective", topic: "travel" },
        { en: "itinerary", ru: "маршрут путешествия", pos: "noun", topic: "travel" },
        { en: "explore", ru: "исследовать, открывать", pos: "verb", topic: "travel" }
      ],
      sophia: "Traveling is so exciting! It expands our horizons. What was the most breathtaking place you have ever visited, or where do you dream of exploring next?",
      oliver: "Travel requires meticulous planning and a structured itinerary. Which country or culture do you find most historically and grammatically intriguing?",
      alex: "Yo, traveling is the best! ✈️ Nothing beats exploring a new city. What's the coolest trip you've ever taken?"
    },
    general: {
      words: [
        { en: "exquisite", ru: "изысканный, утонченный", pos: "adjective", topic: "general" },
        { en: "serendipity", ru: "счастливая случайность", pos: "noun", topic: "general" },
        { en: "cozy", ru: "уютный", pos: "adjective", topic: "general" }
      ],
      sophia: "Thank you for sharing that with me! Tell me, what are your plans for the rest of the day? I would love to hear more about your thoughts.",
      oliver: "I appreciate your response. Let's continue practicing: could you describe your typical workday or study routine using complete sentences?",
      alex: "Sweet! Thanks for sharing. 🚀 What else is on your mind today? Anything exciting happening?"
    }
  };

  // Detect topic by keywords
  let matchedTopic: "food" | "hobby" | "travel" | "general" = "general";
  if (msg.includes("eat") || msg.includes("food") || msg.includes("cook") || msg.includes("meal") || msg.includes("pizza") || msg.includes("dinner") || msg.includes("lunch") || msg.includes("breakfast") || msg.includes("bake")) {
    matchedTopic = "food";
  } else if (msg.includes("sport") || msg.includes("play") || msg.includes("game") || msg.includes("music") || msg.includes("guitar") || msg.includes("book") || msg.includes("read") || msg.includes("hobby") || msg.includes("hobbies") || msg.includes("paint") || msg.includes("draw")) {
    matchedTopic = "hobby";
  } else if (msg.includes("travel") || msg.includes("trip") || msg.includes("visit") || msg.includes("fly") || msg.includes("country") || msg.includes("city") || msg.includes("hotel") || msg.includes("vacation") || msg.includes("sea") || msg.includes("mountain")) {
    matchedTopic = "travel";
  }

  // Greeting checks
  const isGreeting = msg.includes("hello") || msg.includes("hi ") || msg === "hi" || msg.includes("hey") || msg.includes("greetings") || msg.includes("how are you");

  // Custom rule-based responsive logic satisfying the user's explicit instructions!
  if (isRude) {
    if (role === "sophia") {
      replyText = "Oh, dear... 😢 That was not very polite! I am here to help you study English with warmth and care. I expect that we treat each other with respect. Let's please speak kindly to each other, okay? How can I help you today in a positive way?";
    } else if (role === "oliver") {
      replyText = "Such vocabulary is highly offensive, uncivilized, and unacceptable. 😠 As your grammatical and professional supervisor, I demand that you express yourself with proper decorum. Insults will not be tolerated. Please rephrase your input respectfully.";
    } else {
      replyText = "Whoa, chill out! 😮 There's no need to use bad words or get hostile, buddy. I'm a casual peer but let's keep it clean and respect each other. Let's try again with a better attitude!";
    }
  } else if (isLateNight && (isGreeting || Math.random() < 0.7)) {
    // Annoyed/concerned about late hour
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}Wait, I just noticed it is past midnight! 😴 Please don't stay up too late studying—rest is extremely important for learning retention! I'm happy to chat, but let's make it quick so you can sleep. What's on your mind?`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}I must point out that studying English at this hour is highly inefficient for cognitive retention. It is past bedtime. 😠 Please prioritize rest, or keep your input exceptionally brief for grammar verification. Why are you awake?`;
    } else {
      replyText = `${timeGreetingPrefix}Dude, it is super late! 🦉 Are you a total night owl or just grinding crazy hard? I'm down to chat, but don't forget to get some shut-eye, alright? What's keeping you up?`;
    }
  } else if (
    msg.includes("американцы") || msg.includes("амереканцы") || msg.includes("америк") || msg.includes("americans") || msg.includes("american") ||
    msg.includes("сладост") || msg.includes("сладк") || msg.includes("конфет") || msg.includes("sweets") || msg.includes("candy") || msg.includes("sugar")
  ) {
    // Answer the Americans/Sweets/Workaholics question with opinion + leading question!
    if (msg.includes("сладост") || msg.includes("сладк") || msg.includes("конфет") || msg.includes("sweets") || msg.includes("candy") || msg.includes("sugar") || msg.includes("дят") || msg.includes("eat")) {
      if (role === "sophia") {
        replyText = `That is an excellent and very sweet question! 😊 Yes, it is true that many Americans love sweets, desserts, and sugar! Candy, donuts, and sodas are very popular in the US, and portion sizes are often bigger than in Europe. However, not everyone is the same—many Americans are also very healthy and love sports! Personally, I believe eating sweets in moderation is fine as long as we stay active. What about you? Do you have a sweet tooth, or do you prefer healthy food?`;
      } else if (role === "oliver") {
        replyText = `Statistical health data indicates a high consumption of refined sugars and processed food products in the United States, which is a major factor in public health debates. However, representing all Americans as obsessed with sugar is a stereotype; a significant portion of the population is highly health-conscious. From a grammatical perspective, the term "have a sweet tooth" is an idiom describing this craving. Do you prioritize organic nutrition or consume confectionery products regularly?`;
      } else {
        replyText = `Oh, totally! Americans are absolutely obsessed with sweets and fast food. 🍩 Soda, donuts, giant chocolate chip cookies — we have them everywhere, and the portions are huge! But honestly, there is a big fitness trend too, so it's a mix. My take is that life is too short to skip dessert! What's your absolute favorite sweet or dessert? Let's talk about food!`;
      }
    } else {
      // Default workaholics / general americans topic
      if (role === "sophia") {
        replyText = `That is such a fascinating topic! 🇺🇸 Yes, it is true that work culture in the United States is extremely intense. Many Americans are very dedicated to their careers, and the word "workaholic" is indeed common because they often work long hours and take fewer vacation days compared to Europeans. Personally, I believe finding a work-life balance is so important for our mental health and happiness! What is your opinion on this? Do you think people should work less and spend more time with family?`;
      } else if (role === "oliver") {
        replyText = `Sociological and economic data demonstrates that American professional environments prioritize high productivity, which frequently results in individuals working extensive overtime, matching the definition of a "workaholic" (a portmanteau of "work" and "alcoholic"). From an academic standpoint, this high-stress dedication can be counterproductive to long-term health. What is your personal stance on career dedication versus leisure time?`;
      } else {
        replyText = `Oh, totally! 🇺🇸 Work culture in the US is absolutely wild. People are always on that daily grind, chasing the bag and working 24/7. It's super common to be a "workaholic" here. Honestly, I think it's a bit too much sometimes and people need to learn to chill and enjoy life. What about you? Are you on that non-stop grind or do you like to take it easy?`;
      }
    }
  } else if (msg.includes("story") || msg.includes("text") || msg.includes("tale") || msg.includes("рассказ") || msg.includes("текст") || msg.includes("история") || msg.includes("книга")) {
    // Discuss story, express opinion, ask leading question!
    if (role === "sophia") {
      replyText = `I think that story is absolutely beautiful! 😊 It has a wonderful theme and uses some very elegant vocabulary. Personally, I find such tales incredibly inspiring because they show how we can overcome challenges. What was your favorite part of the story? Do you think the characters made the right choices?`;
    } else if (role === "oliver") {
      replyText = `From a narrative and lexical perspective, that text demonstrates a cohesive structure with precise thematic development. Personally, I evaluate the narrative as highly effective for vocabulary acquisition. Which specific paragraph or word in the text did you find grammatically most intriguing?`;
    } else {
      replyText = `Dude, that story was totally awesome! 📖 I love how it builds up and keeps you interested. Honestly, my opinion is that stories like this are perfect for learning because they aren't boring. What did you think of the ending? Did it surprise you?`;
    }
  } else if (msg.includes("?") || msg.includes("what") || msg.includes("how") || msg.includes("why") || msg.includes("who") || msg.includes("where") || msg.includes("when") || msg.includes("is it") || msg.includes("are you") || msg.includes("правда ли") || msg.includes("почему") || msg.includes("зачем") || msg.includes("как")) {
    // General question answering rule: answer, express opinion, ask leading question
    if (role === "sophia") {
      replyText = `That is an excellent question! 😊 Personally, I believe that learning to express your thoughts and opinions is the most wonderful part of mastering a language. To answer your question: practicing with real stories and asking questions is the fastest way to learn! What do you think is the most fun part of our English lessons so far?`;
    } else if (role === "oliver") {
      replyText = `Your query raises an important point. Syntactically, formulated questions are critical for cognitive acquisition. My professional opinion is that structured regular dialogue is optimal for linguistic development. What specific grammatical rules or structures do you wish to dissect next?`;
    } else {
      replyText = `Yo, that's a killer question! 😎 Honestly, my take is that you shouldn't worry too much about textbooks. Just start speaking and expressing your mind, that's what makes it fun. What's your main goal with learning English anyway? Let's smash it!`;
    }
  } else if (isGreeting) {
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}Hello! 😊 It is so lovely to hear from you. I'm Sophia, your tutor. How has your day been? Let's practice English together!`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Greetings. I am Oliver, your grammatical supervisor. Let's begin today's session. Please write a sentence, and I shall evaluate its syntactic accuracy.`;
    } else {
      replyText = `${timeGreetingPrefix}Yo! What's up? Alex here. 😎 Great to connect with you. How's everything going today?`;
    }
  } else {
    // Pick topic response and prepend a natural time-based prefix or greeting
    const prefix = (Math.random() < 0.5) ? `${timeGreetingPrefix}` : "";
    replyText = prefix + (topics[matchedTopic][role as "sophia" | "oliver" | "alex"] || topics.general[role as "sophia" | "oliver" | "alex"] || topics.general.sophia);
  }

  // Append correction if found
  if (correction) {
    replyText += correction;
  }

  // Suggest word with some probability
  if (Math.random() < 0.4) {
    const wordList = topics[matchedTopic].words;
    const chosenWord = wordList[Math.floor(Math.random() * wordList.length)];
    wordToAdd = chosenWord;
    
    // Add explanation in the reply
    if (role === "sophia") {
      replyText += `\n\nBy the way, do you know the word "${chosenWord.en}"? It means "${chosenWord.ru}". I highly recommend adding it to your dictionary to practice!`;
    } else if (role === "oliver") {
      replyText += `\n\nVocabulary Expansion: The word "${chosenWord.en}" (${chosenWord.pos}) translates to Russian as "${chosenWord.ru}". It is highly beneficial to add this to your personal lexicon.`;
    } else {
      replyText += `\n\nHey, check out this cool word: "${chosenWord.en}". It means "${chosenWord.ru}". You should definitely add it to your list!`;
    }
  }

  // Adjust CEFR evaluation based on sentence length
  let evaluatedLevel = userLevel;
  const wordCount = userMessage.split(/\s+/).length;
  if (wordCount > 10 && userLevel === "A1") {
    evaluatedLevel = "A2";
  } else if (wordCount > 15 && userLevel === "A2") {
    evaluatedLevel = "B1";
  } else if (wordCount > 20 && userLevel === "B1") {
    evaluatedLevel = "B2";
  }

  return { replyText, evaluatedLevel, wordToAdd };
}

// Endpoint to translate an English word/phrase to Russian using Gemini
app.post("/api/translate", async (req, res) => {
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

  try {
    let prompt = `Translate the English word or phrase "${word}" to Russian.`;
    if (context) {
      prompt += ` This word was clicked in the following context: "${context}". Please provide the most appropriate Russian translation for this specific context.`;
    }
    prompt += ` Return ONLY the direct translation, single word or short list of synonym translations (like "пыль, вытирать пыль"), with no extra words, explanations, quotation marks, or markdown formatting. Just the clean Russian translation string.`;

    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: [prompt]
    });

    const translation = (response.text || "").trim().replace(/^["']|["']$/g, "");
    if (translation) {
      translationMemoryCache.set(cacheKey, translation);
      res.json({ translation });
      return;
    }
    
    throw new Error("Empty translation response from model");
  } catch (error: any) {
    console.error("Translate API error, trying offline dictionary fallback:", error);
    
    // 1. Precise match in offline fallback dictionary
    const cleanWord = word.trim().toLowerCase();
    let fallbackTrans = OFFLINE_TRANSLATION_FALLBACKS[cleanWord];

    // 2. Base forms match if word ends with -s, -ed, -ing, etc.
    if (!fallbackTrans) {
      if (cleanWord.endsWith("s") && OFFLINE_TRANSLATION_FALLBACKS[cleanWord.slice(0, -1)]) {
        fallbackTrans = OFFLINE_TRANSLATION_FALLBACKS[cleanWord.slice(0, -1)];
      } else if (cleanWord.endsWith("es") && OFFLINE_TRANSLATION_FALLBACKS[cleanWord.slice(0, -2)]) {
        fallbackTrans = OFFLINE_TRANSLATION_FALLBACKS[cleanWord.slice(0, -2)];
      } else if (cleanWord.endsWith("ed") && OFFLINE_TRANSLATION_FALLBACKS[cleanWord.slice(0, -2)]) {
        fallbackTrans = OFFLINE_TRANSLATION_FALLBACKS[cleanWord.slice(0, -2)];
      } else if (cleanWord.endsWith("ing") && OFFLINE_TRANSLATION_FALLBACKS[cleanWord.slice(0, -3)]) {
        fallbackTrans = OFFLINE_TRANSLATION_FALLBACKS[cleanWord.slice(0, -3)];
      }
    }

    if (fallbackTrans) {
      console.log(`[Offline Fallback Match] translated "${word}" -> "${fallbackTrans}"`);
      translationMemoryCache.set(cacheKey, fallbackTrans);
      res.json({ translation: fallbackTrans });
    } else {
      // 3. Absolute ultimate fallback (return the word itself capitalized / unchanged to prevent UI crash)
      console.warn(`[No Offline Fallback Match] for "${word}". Returning word itself.`);
      res.json({ translation: word });
    }
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

    const prompt = `This is an image of a handwritten or typed vocabulary list of English-Russian words. 
Extract all word pairs in the format "English — Russian". 
Return ONLY a valid, standard JSON array of objects with "en" and "ru" fields. 
For example: [{"en": "genius", "ru": "гений"}, {"en": "such", "ru": "такой"}]. 
Return absolutely nothing else, no markdown wrapping, no explanation, just raw valid JSON.`;

    const response = await generateContentWithRetry({
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
    console.warn("[OCR API Error] Falling back to offline scanner pairs:", error?.message || error);
    res.json({
      pairs: [
        { en: "genius", ru: "гений" },
        { en: "adventure", ru: "приключение" },
        { en: "lighthouse", ru: "маяк" },
        { en: "cozy", ru: "уютный" }
      ]
    });
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

    const response = await generateContentWithRetry({
      model: "gemini-3.1-flash-lite",
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

    const themes = [
      "a rainy afternoon in a cozy little cafe with a warm cup of cocoa",
      "discovering a hidden garden in the middle of a bustling historic city",
      "a walk in a golden autumn forest while collecting beautiful fallen leaves",
      "watching stars from a small wooden cabin deep in the silent mountains",
      "finding a mysterious dusty book in a magical old bookstore",
      "helping a friendly neighbor bake fresh warm apple pies",
      "a serene boat ride on a calm misty lake at sunrise",
      "taking care of a playful stray cat that found its way to a sunny porch",
      "a train journey through beautiful green valleys and historic villages",
      "baking fresh blueberry pancakes on a quiet Sunday morning",
      "building a small wooden birdhouse on a warm spring day",
      "exploring a seaside town with a tall lighthouse and seagulls flying",
      "a warm bonfire on a sandy beach under a bright full moon",
      "walking through a fragrant lavender field in the countryside",
      "discovering a secret path in a beautiful botanical greenhouse",
      "a painter sitting on a hill overlooking a peaceful village, sketching the scenery",
      "an old clockmaker repairing a timeless family heirloom in a cozy workshop",
      "watching fireflies light up a meadow on a warm summer evening",
      "finding a cozy attic room full of childhood maps and telescopes",
      "baking fresh artisan bread in a traditional brick oven with family"
    ];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];

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

    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: [
        { text: systemInstruction },
        { text: `Generate a brand new, unique story for level ${level} on date ${date || "today"}. 
Theme/vibe to center the story around: ${randomTheme}. 
Make it highly cozy, inspiring, and different from any other story.` }
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
    console.warn("Story Generation API error, falling back to pre-defined premium story:", error?.message || error);
    const fallbacks: { [key: string]: { title: string; level: string; text: string } } = {
      A1: {
        title: "A Cozy Cafe",
        level: "A1",
        text: "It is a rainy Sunday afternoon. I am in a small, warm cafe. Outside, the rain is cold. Inside, the cafe is cozy. I have a hot cup of sweet cocoa in my hands. The room smells like fresh coffee and sweet cakes. A small grey cat sleeps on a soft chair near the window. I read a beautiful book about travel. I feel very happy and warm."
      },
      A2: {
        title: "The Hidden City Garden",
        level: "A2",
        text: "Today was a busy day, so I decided to take a quiet walk. In the middle of the crowded city, I found a small wooden door in an old brick wall. I opened the door and walked inside. It was a secret garden! It was very beautiful and quiet there. I saw green trees, red roses, and a small fountain with cool water. I sat on a bench and listened to birds singing. I forgot about the busy city streets outside. It felt like magic."
      },
      B1: {
        title: "A Walk in the Golden Forest",
        level: "B1",
        text: "The autumn forest was filled with warm golden light today, so I went for a peaceful walk to clear my mind. The cool autumn wind was blowing gently, and red and orange leaves were falling from the tall trees like rain. I walked along a narrow dusty path and collected a few of the most beautiful leaves to take home. Suddenly, I heard a quiet sound and noticed a small red fox watching me from behind a bush. We looked at each other for a few seconds before it ran away into the trees. It was a wonderful moment that made me smile."
      },
      B2: {
        title: "Stars in the Silent Mountains",
        level: "B2",
        text: "Last weekend, I stayed in a secluded wooden cabin nestled deep within the silent mountains, far away from the chaotic city lights. As night fell, the sky cleared up completely, revealing an exquisite blanket of countless glittering stars. I sat on the porch wrapped in a warm blanket, sipping hot tea, and watched the milky way stretch across the dark sky. The tranquil solitude of the mountains felt incredibly soothing. I realized how rarely we pause to appreciate the timeless beauty of the universe, and I promised myself to return whenever I need to find inner peace."
      },
      C1: {
        title: "Stars in the Silent Mountains",
        level: "C1",
        text: "Last weekend, I stayed in a secluded wooden cabin nestled deep within the silent mountains, far away from the chaotic city lights. As night fell, the sky cleared up completely, revealing an exquisite blanket of countless glittering stars. I sat on the porch wrapped in a warm blanket, sipping hot tea, and watched the milky way stretch across the dark sky. The tranquil solitude of the mountains felt incredibly soothing. I realized how rarely we pause to appreciate the timeless beauty of the universe, and I promised myself to return whenever I need to find inner peace."
      },
      C2: {
        title: "Stars in the Silent Mountains",
        level: "C2",
        text: "Last weekend, I stayed in a secluded wooden cabin nestled deep within the silent mountains, far away from the chaotic city lights. As night fell, the sky cleared up completely, revealing an exquisite blanket of countless glittering stars. I sat on the porch wrapped in a warm blanket, sipping hot tea, and watched the milky way stretch across the dark sky. The tranquil solitude of the mountains felt incredibly soothing. I realized how rarely we pause to appreciate the timeless beauty of the universe, and I promised myself to return whenever I need to find inner peace."
      }
    };
    const reqLevel = String(req.body?.level || "A2").toUpperCase();
    const fallbackStory = fallbacks[reqLevel] || fallbacks.A2;
    res.json(fallbackStory);
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

    const systemInstruction = `You are an expert English teacher. Analyze the English story provided and generate 3 interactive multiple-choice questions (comprehension check) to test the reader's understanding of the plot.
The questions themselves should be in simple, level-appropriate English (appropriate for level ${level || "A2"}). The options should be in English.
Provide a clear, brief explanation in Russian of why the correct answer is correct.`;

    const response = await generateContentWithRetry({
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
    console.warn("Quiz Generation API error, falling back to pre-defined premium quiz:", error?.message || error);
    const cleanTitle = String(req.body?.title || "").toLowerCase();
    let questions = [];

    if (cleanTitle.includes("cozy cafe")) {
      questions = [
        {
          question: "What is the weather outside the cafe?",
          options: ["It is sunny and warm", "It is raining and cold", "It is snowing heavily", "It is extremely windy"],
          correctIndex: 1,
          explanation: "В тексте говорится: 'Outside, the rain is cold.' (На улице идет холодный дождь)."
        },
        {
          question: "What is the writer holding in their hands?",
          options: ["Cold orange juice", "Freshly brewed coffee", "A hot cup of sweet cocoa", "A cup of warm green tea"],
          correctIndex: 2,
          explanation: "В тексте сказано: 'I have a hot cup of sweet cocoa in my hands.' (В моих руках чашка горячего сладкого какао)."
        },
        {
          question: "What animal is sleeping on a soft chair near the window?",
          options: ["A small dog", "A grey cat", "A little bird", "A wild red fox"],
          correctIndex: 1,
          explanation: "В тексте упоминается: 'A small grey cat sleeps on a soft chair...' (Маленький серый кот спит на мягком стуле)."
        }
      ];
    } else if (cleanTitle.includes("hidden city garden")) {
      questions = [
        {
          question: "Where did the writer find the secret garden?",
          options: ["In a quiet mountain forest", "In the middle of a busy crowded city", "Near a quiet misty lake", "At a modern city airport"],
          correctIndex: 1,
          explanation: "В тексте написано: 'In the middle of the crowded city, I found...' (Посреди многолюдного города я нашел...)."
        },
        {
          question: "What did the writer do inside the garden?",
          options: ["Had a delicious cup of coffee", "Read a heavy book about history", "Sat on a bench and listened to birds", "Painted a picture of red roses"],
          correctIndex: 2,
          explanation: "Текст гласит: 'I sat on a bench and listened to birds singing.' (Я сел на скамейку и слушал пение птиц)."
        },
        {
          question: "How did the secret garden make the writer feel?",
          options: ["It made them feel magical and relaxed", "It made them feel very tired and sleepy", "It made them feel sad and lonely", "It made them feel frustrated and angry"],
          correctIndex: 0,
          explanation: "В тексте говорится: 'It felt like magic.' (Это было похоже на волшебство) и 'I forgot about the busy streets'."
        }
      ];
    } else if (cleanTitle.includes("golden forest")) {
      questions = [
        {
          question: "Why did the writer go for a walk in the forest?",
          options: ["To find wild mushrooms", "To take professional landscape photos", "To clear their mind", "To meet an old friend"],
          correctIndex: 2,
          explanation: "В тексте сказано: 'I went for a peaceful walk to clear my mind' (Я пошел на мирную прогулку, чтобы прояснить мысли)."
        },
        {
          question: "What did the writer collect during their peaceful walk?",
          options: ["Sweet wild berries", "A few beautiful fallen leaves", "Small colorful stones", "Dry tree branches"],
          correctIndex: 1,
          explanation: "Текст упоминает: 'collected a few of the most beautiful leaves to take home' (собрал несколько самых красивых листьев, чтобы забрать домой)."
        },
        {
          question: "Which wild animal did the writer spot behind a bush?",
          options: ["A grey wolf", "A small red fox", "A playful squirrel", "A big brown bear"],
          correctIndex: 1,
          explanation: "Автор пишет: 'noticed a small red fox watching me' (заметил маленькую рыжую лису, наблюдающую за мной)."
        }
      ];
    } else {
      // Default fallback for any other story / custom story title
      questions = [
        {
          question: "What is the overall tone and atmosphere of this story?",
          options: ["Scary and tense", "Cozy, inspiring, and peaceful", "Sad and depressed", "Angry and chaotic"],
          correctIndex: 1,
          explanation: "Эта история написана в уютных и вдохновляющих тонах для приятного изучения английского языка."
        },
        {
          question: "Which of the following describes the main character's action?",
          options: ["They are running away from danger", "They are pausing to appreciate and explore the beauty of life", "They are studying for a difficult math exam", "They are shopping in a busy modern supermarket"],
          correctIndex: 1,
          explanation: "Герой истории наслаждается моментом, созерцает окружающий мир или учится новому."
        },
        {
          question: "What is the primary benefit of reading stories like this?",
          options: ["To memorize mathematical equations", "To practice vocabulary and grammar in a natural, pleasant context", "To learn how to repair old clocks", "To find coordinates of mountain cabins"],
          correctIndex: 1,
          explanation: "Чтение подобных текстов помогает естественным образом расширять словарный запас и привыкать к структуре предложений."
        }
      ];
    }

    res.json({ questions });
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
      console.log("No SMTP environment variables found. Using Ethereal fallback...");
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
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

// --- GEMINI AI HUB / PRACTICE ENDPOINTS ---

// 1. AI Chat Practice with Tutor Personalities
app.post("/api/ai-chat", async (req, res) => {
  try {
    const { messages, role = "sophia", mode = "general", userLevel = "A1", skipServerTts = false, clientLocalTime } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Missing or invalid messages history array" });
      return;
    }

    // Role-specific System Instructions with distinct personalities
    const SYSTEM_INSTRUCTIONS: { [key: string]: string } = {
      sophia: "You are Sophia, a warm, cozy, highly empathetic, and encouraging English teacher. You speak in clear, beautiful English with gentle warmth. Share your own feelings, personal anecdotes, and gentle guidance. When the student makes mistakes, correct them with soft care and clear examples. Always answer their questions directly and fully!",
      oliver: "You are Oliver, a strict, demanding, perfectionist, and highly structured English grammar supervisor. You speak in a deep, stern, demanding tone with high academic expectations and velvety authority! You DO NOT tolerate sloppy grammar, careless spelling errors, missing articles, or improper tenses. Demand perfection for every single mistake, point out errors immediately and sternly with clear corrections (using clear comparison tables or structured bullet points in Russian when explaining rules), and expect the student to strive for absolute flawlessness!",
      alex: "You are Alex, an energetic, ultra-positive, trendy peer and English tutor from NYC. You are always on the exact same wavelength as the student — super upbeat, cheerful, encouraging, positive, and fun! Speak in vibrant, natural conversational English with modern idioms, friendly warmth, and upbeat positive energy. When explaining rules, do it with high positivity, cool slang, and simple relatable examples!"
    };

    const selectedInstruction = SYSTEM_INSTRUCTIONS[role] || SYSTEM_INSTRUCTIONS.sophia;
    
    const levelInstructions = `\n[CRITICAL ADAPTATION RULE]: The student's current estimated CEFR level is ${userLevel}. 
You MUST adapt your response language, grammatical structures, and vocabulary difficulty to perfectly match this level.
- For A1-A2: use simple vocabulary, short sentences, and provide clear, gentle explanations of any moderately advanced word in Russian.
- For B1-B2: use more varied vocabulary, natural phrasal verbs, standard idioms, and explain grammar nuances in Russian if requested or if they make an error.
- For C1-C2: use advanced, rich, natural, and idiomatic native-level English, with almost no Russian unless explicitly requested.
Evaluate the student's message (grammar correctness, vocabulary choice, expression complexity). If their level is growing or improving, adjust your estimation. Provide your evaluation of their current CEFR level ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') in the 'evaluatedLevel' field of the JSON output. If they keep making simple mistakes, keep them at A1/A2.`;

    const isFirstMessage = !messages || messages.length <= 1;

    let baseInstruction = `${selectedInstruction}
Respond primarily in English. Keep your response conversational, supportive, and scannable. 

[QUESTION-ANSWERING & OPINION RULE - CRITICAL]:
If the student asks a question (such as explaining a rule, a difference between words like "little" vs "a little", or how English works), you MUST answer it directly, completely, and comprehensively in this response. Never give an empty intro or stall without explaining.
If the student discusses or references a story, book, text, or topic, you MUST explicitly state your opinion or thoughts on that story/topic to show that you are an active listener and peer/teacher.
You MUST also always ask a friendly leading, follow-up question (наводящий вопрос) at the end of your response to keep the conversation flowing naturally.

[EXPLANATIONS & FORMATTING RULE - EXTREMELY CRITICAL]:
If the student asks you to explain a grammar rule, a vocabulary word, a difference between words (such as "little" vs "a little", "few" vs "a few", prepositions, tenses, etc.), or asks a question about how English works:
- You MUST provide the FULL, DETAILED, COMPLETE EXPLANATION directly and immediately in your response!
- NEVER output just a teaser introduction (like "Good afternoon! I'm glad you asked, let me break it down together") without giving the actual rules and examples in the SAME response!
- Structure the explanation cleanly using Markdown:
  * Clear section headers (###)
  * Comparison tables (| Header 1 | Header 2 |) or clear bullet points with Russian explanations
  * Concrete examples in English with Russian translations in parentheses
  * End with 1 short, friendly question to check their understanding.

[ADAPTABILITY & LEARNING MEMORY RULE]:
- Pay close attention to how the student learns best.
- If the student previously stated or hinted that they didn't understand an explanation, or if they prefer tables, bullet points, simple examples, or a specific tone, ADAPT INSTANTLY.
- Remember this preference and apply it to all future responses in this chat session!

[DICTIONARY RECOMMENDATION RULE]:
Do NOT recommend adding a word to the dictionary on every message. Only do so RARELY (e.g. if the word is genuinely difficult, or if the student explicitly asks about a word, or says they do not know it, e.g. "I don't know this word" / "сложное слово" / "добавь в словарь" / "что значит X"). Otherwise, do NOT include any 'wordToAdd' object (leave it null/empty). Be very selective.
The tutor should keep developing the conversation naturally and asking engaging questions.`;

    if (messages.length >= 8) {
      baseInstruction += `\n[CONVERSATION WRAP-UP REQUIREMENT]: The conversation has reached ${messages.length} messages (representing roughly 1.5-2 minutes of talking). The topic has likely been discussed sufficiently. You MUST politely and warmly suggest wrapping up the speaking practice session for today, asking if they would like to finish for today or continue discussing. Formulate a friendly wrap-up question.`;
    }

    baseInstruction += levelInstructions;

    // Greeting rule handling: DO NOT repeat greetings on ongoing turns
    if (isFirstMessage && clientLocalTime) {
      try {
        const clientDate = new Date(clientLocalTime);
        const hours = clientDate.getHours();
        const dateString = clientDate.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeString = clientDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        baseInstruction += `\n\n[FIRST TURN GREETING CONTEXT]: This is the VERY FIRST message of the chat session. The student's local date is ${dateString}, time is ${timeString}.
- If it is morning (5:00 - 11:59), start with a friendly morning greeting ("Good morning!").
- If it is afternoon (12:00 - 16:59), start with "Good afternoon!".
- If it is evening (17:00 - 22:59), start with "Good evening!".
- If it is late at night (23:00 - 4:59), express friendly concern about studying so late! Emphasize that they should get some sleep soon.`;
      } catch (e) {}
    } else if (!isFirstMessage) {
      baseInstruction += `\n\n[STRICT GREETING RULE - CRITICAL]:
- This conversation is ALREADY in progress (${messages.length} messages in history).
- You MUST NOT start your message with greetings such as "Good afternoon", "Good morning", "Good evening", "Hello", "Hi", "Greetings", or "Good day"!
- Start IMMEDIATELY with your direct answer, explanation, or conversational response. Greetings are STRICTLY FORBIDDEN on ongoing turns.`;
    }

    // Rudeness and bad language handler instruction
    baseInstruction += `\n\n[RUDENESS & PROFANITY RULE]:
If the user's message contains offensive language, insults, swearing (e.g., "сука", "блять", "хуй", "fuck", "shit", "bitch", "stupid", "хрен", "какого хрена", etc.), or if they are rude, demanding, or angry with you:
- You MUST react with clear emotions matching your personality:
  * Sophia: Show sadness, soft disappointment, and gentle but firm correction (e.g. "Oh, that wasn't very polite... 😢 I am here to help you learn, and I expect we treat each other with respect. Let's speak kindly, okay?").
  * Oliver: Express cold indignation and academic strictness (e.g. "Such vocabulary is highly uncivilized and unacceptable. 😠 As your grammatical supervisor, I demand that you express yourself in a professional and polite manner. Insults will not be tolerated.").
  * Alex: React with casual surprise and push back peer-to-peer (e.g. "Whoa, chill out, dude! 😮 No need for the bad words. We're here to have a good time and practice. Let's keep it clean, alright?").
- Refuse to answer their direct query normally until they speak politely, or gently force them to rephrase their sentence politely in English!`;

    // Map messages to Gemini SDK structure
    const contents = messages.map((msg: any) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text }]
    }));

    // Configure model and config parameters based on interactive mode chosen by user
    let modelName = "gemini-3.5-flash"; // Default general model
    
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        replyText: { 
          type: Type.STRING, 
          description: "The conversation response from the English teacher. Speak primarily in English, but you can explain complex words/idioms or correct the student using Russian if appropriate." 
        },
        evaluatedLevel: {
          type: Type.STRING,
          description: "Your updated evaluation of the student's current English CEFR level based on their inputs. Strictly one of: A1, A2, B1, B2, C1, C2."
        },
        wordToAdd: {
          type: Type.OBJECT,
          description: "Optional. ONLY populate this if the student explicitly asks to add a word to their dictionary, or if you explain a new English expression/word/idiom/collocation and want to propose adding it.",
          properties: {
            en: { type: Type.STRING, description: "The English word, expression, or idiom exactly" },
            ru: { type: Type.STRING, description: "Clear Russian translation" },
            pos: { type: Type.STRING, description: "The part of speech. Strictly one of: noun, verb, adjective, adverb, phrase" },
            topic: { type: Type.STRING, description: "Strictly one of: home, hobby, weather, study, work, food, time, family, travel, general" }
          },
          required: ["en", "ru", "pos", "topic"]
        }
      },
      required: ["replyText", "evaluatedLevel"]
    };

    const config: any = {
      systemInstruction: baseInstruction,
    };

    if (mode !== "grounding") {
      config.responseMimeType = "application/json";
      config.responseSchema = responseSchema;
    }

    if (mode === "low-latency") {
      modelName = "gemini-3.1-flash-lite"; // Fast, low latency replies
    } else if (mode === "thinking") {
      modelName = "gemini-3.1-pro-preview"; // High thinking reasoning
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else if (mode === "grounding") {
      modelName = "gemini-2.5-flash";
      config.tools = [{ googleSearch: {} }]; // Google Search grounding
      config.systemInstruction = baseInstruction + "\n[CRITICAL]: Please return a valid JSON object wrapped in code block format: ```json { \"replyText\": \"...\", \"evaluatedLevel\": \"...\", \"wordToAdd\": null } ```.";
    }

    console.log("[AI Chat] Generating reply using model:", modelName);
    const ai = getAIClient();
    const response = await generateContentWithRetry({
      model: modelName,
      contents,
      config
    }, { maxRetries: 2, fallbackModel: mode === "grounding" ? "gemini-2.5-flash" : "gemini-3.1-flash-lite" });

    let responseText = response.text || "";
    let replyText = "";
    let evaluatedLevel = userLevel;
    let wordToAdd = null;
    let searchResults: any[] = [];

    if (mode === "grounding") {
      if (responseText.includes("```")) {
        responseText = responseText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      }
      try {
        const parsed = JSON.parse(responseText);
        replyText = parsed.replyText || response.text || "";
        evaluatedLevel = parsed.evaluatedLevel || userLevel;
        wordToAdd = parsed.wordToAdd || null;
      } catch (e) {
        replyText = response.text || responseText;
      }

      // Extract search grounding metadata
      try {
        const candidate = response.candidates?.[0];
        if (candidate?.groundingMetadata?.groundingChunks) {
          searchResults = candidate.groundingMetadata.groundingChunks.map((chunk: any) => ({
            title: chunk.web?.title || "",
            uri: chunk.web?.uri || ""
          })).filter((c: any) => c.title && c.uri);
        }
      } catch (err) {}
    } else {
      try {
        const parsed = JSON.parse(responseText);
        replyText = parsed.replyText || "";
        evaluatedLevel = parsed.evaluatedLevel || userLevel;
        wordToAdd = parsed.wordToAdd || null;
      } catch (e) {
        replyText = responseText;
      }
    }

    if (typeof replyText === "string") {
      replyText = replyText
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");
    }

    // Server-side text to speech synthesis proxy
    let replyAudioBase64 = "";
    try {
      const voiceNames: { [key: string]: string } = {
        sophia: "Kore",
        oliver: "Fenrir", // Imposing deep male voice
        alex: "Puck" // Energetic, upbeat, positive male voice
      };
      const selectedVoice = voiceNames[role] || "Kore";
      let cleanTextForTts = replyText
        .replace(/\[\d+\]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "")
        .trim();

      const ttsPromptPrefix = role === "alex" 
        ? "Say with energetic, upbeat, youthful NYC slang and an enthusiastic friendly vibe:" 
        : role === "oliver" 
        ? "Say in a deep, strict, stern, demanding, and authoritative male voice with precise discipline and stern enunciation:" 
        : "Say in a warm, cozy, gentle, caring, and encouraging tone:";

      const speechPromise = ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `${ttsPromptPrefix} ${cleanTextForTts}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice }
            }
          }
        }
      });

      const speechResponse = await withTimeout(speechPromise, 15000, null);
      if (speechResponse) {
        const rawData = speechResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
        if (rawData) {
          replyAudioBase64 = convertPcmToWav(rawData, 24000);
        }
      }
    } catch (ttsErr) {
      console.warn("[AI Chat TTS] Synthesis failed:", ttsErr);
    }

    res.json({
      replyText,
      evaluatedLevel,
      wordToAdd,
      replyAudio: replyAudioBase64 ? `data:audio/wav;base64,${replyAudioBase64}` : null,
      searchResults
    });
  } catch (error: any) {
    console.error("AI Chat Practice Error:", error);
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

// 2. Extract Vocabulary list from chat message history
app.post("/api/ai-extract-vocabulary", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) {
      res.status(400).json({ error: "Missing text to analyze for vocabulary extraction" });
      return;
    }

    const prompt = `You are a helpful English teacher and vocabulary compiler. Analyze the following text or dialogue:
"${text}"

Extract up to 12 useful/interesting English vocabulary words, phrases, expressions, or collocations mentioned or relevant. For each extracted item: translate it to clear Russian, classify its part of speech, map it to one of standard topics: 'home', 'hobby', 'weather', 'study', 'work', 'food', 'time', 'family', 'travel', 'general', and add a brief helpful note/example.

Return STRICTLY a JSON array of objects following this structure:
[
  { "en": "accomplish", "ru": "выполнять, совершать", "pos": "verb", "topic": "work", "note": "To achieve or complete successfully." }
]`;

    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              en: { type: Type.STRING, description: "The English word or phrase exactly as mentioned or its base form" },
              ru: { type: Type.STRING, description: "Direct clear Russian translation" },
              pos: { type: Type.STRING, description: "part of speech (noun, verb, adjective, adverb, phrase)" },
              topic: { type: Type.STRING, description: "One of: home, hobby, weather, study, work, food, time, family, travel, general" },
              note: { type: Type.STRING, description: "Brief contextual usage or explanation" }
            },
            required: ["en", "ru", "pos", "topic"]
          }
        }
      }
    });

    const parsedWords = JSON.parse(response.text || "[]");
    res.json({ words: parsedWords });
  } catch (error: any) {
    console.warn("[Extract Vocabulary API Error] Falling back to high-fidelity offline extraction:", error?.message || error);
    
    // Fallback dictionary of common high-utility words
    const standardWords = [
      { en: "accomplish", ru: "выполнять, завершать", pos: "verb", topic: "work", note: "To achieve or complete successfully." },
      { en: "serendipity", ru: "счастливая случайность", pos: "noun", topic: "general", note: "The occurrence of events by chance in a happy way." },
      { en: "exquisite", ru: "изысканный, утонченный", pos: "adjective", topic: "general", note: "Extremely beautiful and delicate." },
      { en: "cozy", ru: "уютный, теплый", pos: "adjective", topic: "home", note: "Giving a feeling of comfort, warmth, and relaxation." },
      { en: "breathtaking", ru: "захватывающий дух", pos: "adjective", topic: "travel", note: "Astonishing or awe-inspiring in beauty." },
      { en: "adventure", ru: "приключение", pos: "noun", topic: "travel", note: "An exciting or unusual experience." },
      { en: "recipe", ru: "рецепт", pos: "noun", topic: "food", note: "A set of instructions for preparing a dish." },
      { en: "passionate", ru: "страстный, увлеченный", pos: "adjective", topic: "hobby", note: "Having or showing intense enthusiasm." }
    ];

    res.json({ words: standardWords });
  }
});

// 3. AI Image Vocabulary Scanner & Analyzer
app.post("/api/ai-analyze-image", async (req, res) => {
  try {
    const { image } = req.body || {};
    if (!image) {
      res.status(400).json({ error: "Missing image base64 data" });
      return;
    }

    const base64Data = image.split(",")[1] || image;
    
    const prompt = `You are a helpful English learning assistant. 
1. Transcribe or analyze this image (which could be a photograph of a book, street sign, handwritten menu, or notes). Provide a clean, short 1-2 sentence description of what the image shows.
2. Extract up to 10 interesting or useful English vocabulary words, idioms, or collocations found in this image.
3. For each extracted item: translate it to Russian, classify its part of speech (noun, verb, adjective, adverb, phrase), map it to one of our standard topics ('home', 'hobby', 'weather', 'study', 'work', 'food', 'time', 'family', 'travel', 'general'), and add a brief helpful note/example.

Return the result as a JSON object matching the requested schema.`;

    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash", // Use highly-available and free Flash model for image scanning!
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: "image/jpeg"
          }
        },
        prompt
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING, description: "Brief 1-2 sentence summary of what the image is" },
            words: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  en: { type: Type.STRING, description: "The English word or expression" },
                  ru: { type: Type.STRING, description: "Russian translation" },
                  pos: { type: Type.STRING, description: "part of speech (noun, verb, adjective, adverb, phrase)" },
                  topic: { type: Type.STRING, description: "home, hobby, weather, study, work, food, time, family, travel, or general" },
                  note: { type: Type.STRING, description: "Short explanation or usage note" }
                },
                required: ["en", "ru", "pos", "topic"]
              }
            }
          },
          required: ["description", "words"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    res.json(result);
  } catch (error: any) {
    console.warn("[AI Image analysis API Error] Falling back to offline scanner:", error?.message || error);
    res.json({
      description: "Изображение было успешно загружено. (В режиме оффлайн-распознавания мы подготовили подборку полезных слов для вашего уровня)",
      words: [
        { en: "journal", ru: "дневник", pos: "noun", topic: "study", note: "A daily record of news and events of a personal nature." },
        { en: "vocabulary", ru: "словарный запас", pos: "noun", topic: "study", note: "The body of words used in a particular language." },
        { en: "beautiful", ru: "красивый", pos: "adjective", topic: "general", note: "Pleasing the senses or mind aesthetically." },
        { en: "practice", ru: "практика, тренировка", pos: "noun", topic: "study", note: "The actual application or use of an idea, belief, or method." },
        { en: "adventure", ru: "приключение", pos: "noun", topic: "travel", note: "An unusual and exciting, typically hazardous, experience or activity." }
      ]
    });
  }
});

// 4. Voice Tutor - Low-Latency Voice dialogue and Text-to-Speech proxy
app.post("/api/ai-voice-chat", async (req, res) => {
  let userText = "";
  let role = "sophia";
  let userLevel = "A1";
  try {
    const { audio, messages, role: reqRole = "sophia", userLevel: reqLevel = "A1", skipServerTts = false, speechPace = "normal", verbosity = "medium", clientLocalTime } = req.body || {};
    role = reqRole;
    userLevel = reqLevel;
    const ai = getAIClient();

    // Step A: If the user recorded audio, transcribe it first using Gemini's multimodal capabilities!
    if (audio) {
      console.log("[Voice Chat] Transcribing user audio...");
      let mimeType = "audio/webm"; // default fallback
      let base64Audio = audio;
      if (audio.startsWith("data:")) {
        const match = audio.match(/^data:([^;]+);base64,/);
        if (match) {
          mimeType = match[1].split(";")[0].trim();
        }
        base64Audio = audio.split(",")[1] || audio;
      }
      
      const transResponse = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          "Please transcribe this spoken audio exactly as spoken (it can be in English, in Russian, or mixed). Return ONLY the clean transcript text, absolutely nothing else. CRITICAL RULE: If the user says her name, she is 'Arina' (Арина). Do NOT transcribe her name as 'Irina' or 'Ирина'. Ensure 'Arina' / 'Арина' is transcribed correctly."
        ]
      }, { fallbackModel: "gemini-2.5-flash" });
      userText = (transResponse.text || "").trim();
      console.log("[Voice Chat] User transcript:", userText);
    } else {
      userText = req.body.text || "";
    }

    if (!userText.trim()) {
      res.json({ 
        replyText: "Не удалось распознать звук. Возможно, микрофон был выключен или запись оказалась слишком тихой. Попробуйте нажать кнопку микрофона и сказать фразу еще раз!", 
        userTranscription: "", 
        evaluatedLevel: userLevel 
      });
      return;
    }

    // Step B: Generate the Tutor text response
    const SYSTEM_INSTRUCTIONS: { [key: string]: string } = {
      sophia: "You are Sophia, a warm, cozy, highly empathetic, and encouraging English teacher. You speak in clear, beautiful English with gentle warmth. Share your own feelings, personal anecdotes, and gentle guidance. When the student makes mistakes, correct them with soft care and clear examples. Always answer their questions directly and fully!",
      oliver: "You are Oliver, a strict, demanding, perfectionist, and highly structured English grammar supervisor. You speak in a deep, stern, demanding tone with high academic expectations and velvety authority! You DO NOT tolerate sloppy grammar, careless spelling errors, missing articles, or improper tenses. Demand perfection for every single mistake, point out errors immediately and sternly with clear corrections (using clear comparison tables or structured bullet points in Russian when explaining rules), and expect the student to strive for absolute flawlessness!",
      alex: "You are Alex, an energetic, ultra-positive, trendy peer and English tutor from NYC. You are always on the exact same wavelength as the student — super upbeat, cheerful, encouraging, positive, and fun! Speak in vibrant, natural conversational English with modern idioms, friendly warmth, and upbeat positive energy. When explaining rules, do it with high positivity, cool slang, and simple relatable examples!"
    };

    const selectedInstruction = SYSTEM_INSTRUCTIONS[role] || SYSTEM_INSTRUCTIONS.sophia;
    
    const levelInstructions = `\n[CRITICAL ADAPTATION RULE]: The student's current estimated CEFR level is ${userLevel}. 
    You MUST adapt your response language, grammatical structures, and vocabulary difficulty to perfectly match this level.
    - For A1-A2: use simple vocabulary, short sentences, and provide clear, gentle explanations of any moderately advanced word in Russian.
    - For B1-B2: use more varied vocabulary, natural phrasal verbs, standard idioms, and explain grammar nuances in Russian if requested or if they make an error.
    - For C1-C2: use advanced, rich, natural, and idiomatic native-level English, with almost no Russian unless explicitly requested.
    Evaluate the student's message (grammar correctness, vocabulary choice, expression complexity). If their level is growing or improving, adjust your estimation. Provide your evaluation of their current CEFR level ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') in the 'evaluatedLevel' field of the JSON output. If they keep making simple mistakes, keep them at A1/A2.`;

    // Dynamic response length / verbosity configuration
    let verbosityInstruction = "Determine the optimal length for your response naturally based on the conversation context. If the student made errors or asked a question, provide a helpful explanation of appropriate length (typically 45-80 words). If the conversation is simple, keep it light and easy (around 40 words). Speak naturally, do not artificially truncate your thoughts.";
    if (verbosity === "short") {
      verbosityInstruction = "Keep your response extremely short, friendly, and brief. Return STRICTLY under 30 words, maximum 2 short sentences. Let the user speak more.";
    } else if (verbosity === "medium") {
      verbosityInstruction = "Keep your response moderately conversational. Return around 45 to 65 words, maximum 3 to 4 sentences.";
    } else if (verbosity === "long") {
      verbosityInstruction = "Give a detailed, highly educational, or descriptive explanation or reply. Return between 90 to 140 words. Explain grammatical nuances, suggest alternative formulations, or discuss the topic comprehensively like a supportive, elegant teacher giving a micro-lecture.";
    } else if (verbosity === "auto") {
      verbosityInstruction = "Determine the optimal length for your response naturally based on the conversation context. If the student made errors or asked a question, provide a helpful explanation of appropriate length (typically 45-80 words). If the conversation is simple, keep it light and easy (around 40 words). Speak naturally, do not artificially truncate your thoughts.";
    }

    // Dynamic speech pacing instruction for TTS-targeted generation
    let pacingInstruction = "Speak at a natural normal conversational pace.";
    if (speechPace === "slow") {
      pacingInstruction = "The user is a beginner or struggles with fast speech. Speak VERY slowly, with simple syllables, extra clear phrasing, and insert extra punctuation (commas, periods) to introduce natural pauses.";
    } else if (speechPace === "fast") {
      pacingInstruction = "Speak rapidly, like a fluent native English speaker, using natural contractions and fluid transitions.";
    }

    const isFirstVoiceMessage = !messages || messages.length <= 1;

    let baseInstruction = `${selectedInstruction}
Respond primarily in English. 

[VERBOSITY CONFIGURATION]:
${verbosityInstruction}

[PACING CONFIGURATION]:
${pacingInstruction}

[QUESTION-ANSWERING & OPINION RULE - CRITICAL]:
If the student asks a question, you MUST answer it completely. Do not ignore questions.
If the student discusses or references a story, book, text, or topic, you MUST explicitly state your opinion or thoughts on that story/topic to show that you are an active listener.
You MUST also always ask a friendly leading, follow-up question (наводящий вопрос) at the end of your response to keep the conversation flowing naturally.

[ADAPTABILITY & LEARNING MEMORY RULE]:
- Pay close attention to how the student learns best.
- If the student previously stated or hinted that they didn't understand an explanation, or if they prefer tables, bullet points, simple examples, or a specific tone, ADAPT INSTANTLY.
- Remember this preference and apply it to all future responses in this chat session!

[DICTIONARY RECOMMENDATION RULE - CRITICAL]:
Do NOT recommend adding a word to the dictionary on every message. Only do so VERY RARELY (e.g. if the word is highly unusual/advanced, or if the student explicitly asks about a word, asks for translation, or says they don't know a word). Otherwise, do NOT include any 'wordToAdd' object (leave it null/empty). Be extremely selective. Focus on carrying the conversation forward, answering the student, and asking interesting, natural questions to keep them speaking.

If the user asks to add a word to their dictionary, or if you explain a new word/idiom/collocation in Russian and suggest adding it under the rare circumstances above, you MUST populate the 'wordToAdd' property in the JSON response, guessing the translation, part of speech (pos), and appropriate topic.${levelInstructions}`;

    if (isFirstVoiceMessage && clientLocalTime) {
      try {
        const clientDate = new Date(clientLocalTime);
        const hours = clientDate.getHours();
        const dateString = clientDate.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeString = clientDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        baseInstruction += `\n\n[FIRST TURN GREETING CONTEXT]: This is the VERY FIRST message of the voice session. The student's local date is ${dateString}, time is ${timeString}.
- If it is morning (5:00 - 11:59), start with a friendly morning greeting ("Good morning!").
- If it is afternoon (12:00 - 16:59), start with "Good afternoon!".
- If it is evening (17:00 - 22:59), start with "Good evening!".
- If it is late at night (23:00 - 4:59), express friendly concern about studying so late! Emphasize that they should get some sleep soon.`;
      } catch (e) {}
    } else if (!isFirstVoiceMessage) {
      baseInstruction += `\n\n[STRICT GREETING RULE - CRITICAL]:
- This conversation is ALREADY in progress (${messages ? messages.length : 0} messages in history).
- You MUST NOT start your message with greetings such as "Good afternoon", "Good morning", "Good evening", "Hello", "Hi", "Greetings", or "Good day"!
- Start IMMEDIATELY with your direct answer, explanation, or conversational response. Greetings are STRICTLY FORBIDDEN on ongoing turns.`;
    }

    baseInstruction += `\n\n[RUDENESS & PROFANITY RULE]:
If the user's message contains offensive language, insults, swearing (e.g., "сука", "блять", "хуй", "fuck", "shit", "bitch", "stupid", "хрен", "какого хрена", etc.), or if they are rude, demanding, or angry with you:
- You MUST react with clear emotions matching your personality:
  * Sophia: Show sadness, soft disappointment, and gentle but firm correction (e.g. "Oh, that wasn't very polite... 😢 I am here to help you learn, and I expect we treat each other with respect. Let's speak kindly, okay?").
  * Oliver: Express cold indignation and academic strictness (e.g. "Such vocabulary is highly uncivilized and unacceptable. 😠 As your grammatical supervisor, I demand that you express yourself in a professional and polite manner. Insults will not be tolerated.").
  * Alex: React with casual surprise and push back peer-to-peer (e.g. "Whoa, chill out, dude! 😮 No need for the bad words. We're here to have a good time and practice. Let's keep it clean, alright?").
- Refuse to answer their direct query normally until they speak politely, or gently force them to rephrase their sentence politely in English!`;
    
    // Transform and sanitize incoming history to guarantee alternating roles for Gemini
    const sanitizedContents: any[] = [];
    const rawMessages = messages || [];
    
    for (const msg of rawMessages) {
      if (!msg || !msg.text || !msg.text.trim()) continue;
      // Skip error and loading messages to keep conversation clean
      if (msg.text.includes("Извините, не удалось разобрать") || msg.text.includes("[Отправка аудиосообщения...]")) {
        continue;
      }
      
      const convertedRole = msg.role === "user" ? "user" : "model";
      
      if (sanitizedContents.length > 0 && sanitizedContents[sanitizedContents.length - 1].role === convertedRole) {
        // Combine text of consecutive messages with identical roles
        sanitizedContents[sanitizedContents.length - 1].parts[0].text += "\n" + msg.text;
      } else {
        sanitizedContents.push({
          role: convertedRole,
          parts: [{ text: msg.text }]
        });
      }
    }
    
    // Append current user message
    if (sanitizedContents.length > 0 && sanitizedContents[sanitizedContents.length - 1].role === "user") {
      sanitizedContents[sanitizedContents.length - 1].parts[0].text += "\n" + userText;
    } else {
      sanitizedContents.push({
        role: "user",
        parts: [{ text: userText }]
      });
    }

    const contents = sanitizedContents;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        replyText: { 
          type: Type.STRING, 
          description: "The conversation response from the English teacher. Speak primarily in English, but you can explain complex words/idioms or correct the student using Russian if appropriate. Keep under 50 words." 
        },
        evaluatedLevel: {
          type: Type.STRING,
          description: "Your updated evaluation of the student's current English CEFR level based on their inputs. Strictly one of: A1, A2, B1, B2, C1, C2."
        },
        wordToAdd: {
          type: Type.OBJECT,
          description: "Optional. ONLY populate this if the student explicitly asks to add a word to their dictionary, or if you explain a new English expression/word/idiom/collocation and want to propose adding it.",
          properties: {
            en: { type: Type.STRING, description: "The English word, expression, or idiom exactly" },
            ru: { type: Type.STRING, description: "Clear Russian translation" },
            pos: { type: Type.STRING, description: "The part of speech. Strictly one of: noun, verb, adjective, adverb, phrase" },
            topic: { type: Type.STRING, description: "Strictly one of: home, hobby, weather, study, work, food, time, family, travel, general" }
          },
          required: ["en", "ru", "pos", "topic"]
        }
      },
      required: ["replyText", "evaluatedLevel"]
    };

    console.log("[Voice Chat] Generating teacher text response...");
    const textResponse = await generateContentWithRetry({
      model: "gemini-3.1-flash-lite",
      contents,
      config: {
        systemInstruction: baseInstruction,
        responseMimeType: "application/json",
        responseSchema
      }
    }, { fallbackModel: "gemini-3.5-flash" });

    let replyText = "";
    let evaluatedLevel = userLevel;
    let wordToAdd = null;
    try {
      const parsedData = JSON.parse(textResponse.text || "{}");
      replyText = parsedData.replyText || "";
      evaluatedLevel = parsedData.evaluatedLevel || userLevel;
      wordToAdd = parsedData.wordToAdd || null;
    } catch (parseErr) {
      replyText = textResponse.text || "";
    }
    console.log("[Voice Chat] Tutor response text:", replyText);

    // Step C: Synthesize text response to audio using gemini-3.1-flash-tts-preview if not skipped
    let replyAudioBase64 = "";
    if (!skipServerTts) {
      try {
        console.log("[Voice Chat] Synthesizing speech audio...");
        const voiceNames: { [key: string]: string } = {
          sophia: "Kore", // Friendly female voice
          oliver: "Fenrir", // Deep male voice
          alex: "Puck" // Energetic, upbeat male voice
        };
        const selectedVoice = voiceNames[role] || "Kore";

        // Clean text specifically for the TTS engine (strip bracketed citations like [1], [2], markdown links, and emojis)
        let cleanTextForTts = replyText
          .replace(/\[\d+\]/g, "") // Strip search citations like [1], [2]
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Strip markdown links, keep only the text
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/_([^_]+)_/g, "$1")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "") // strip emojis
          .trim();

        const ttsPromptPrefix = role === "alex" 
          ? "Say with energetic, upbeat, youthful NYC slang and an enthusiastic friendly vibe:" 
          : role === "oliver" 
          ? "Say in a deep, strict, stern, demanding, and authoritative male voice with precise discipline and stern enunciation:" 
          : "Say in a warm, cozy, gentle, caring, and encouraging tone:";

        const speechResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: `${ttsPromptPrefix} ${cleanTextForTts}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice }
              }
            }
          }
        });

        const rawData = speechResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
        if (rawData) {
          replyAudioBase64 = convertPcmToWav(rawData, 24000);
        }
      } catch (ttsErr: any) {
        console.warn("[Voice Chat] Gemini TTS Model synthesis failed or unavailable.", ttsErr?.message || ttsErr);
      }
    }

    res.json({
      userTranscription: userText,
      replyText,
      evaluatedLevel,
      wordToAdd,
      replyAudio: replyAudioBase64 ? `data:audio/wav;base64,${replyAudioBase64}` : null
    });
  } catch (error: any) {
    console.warn(`[AI Voice Chat API Error] Falling back to offline premium tutor voice reply. Error: ${error?.message || error}`);
    
    const { clientLocalTime } = req.body || {};
    const offlineReply = getOfflineChatTutorReply(userText || "Hello", role || "sophia", userLevel || "A1", clientLocalTime);
    
    res.json({
      userTranscription: userText || "[Не удалось распознать]",
      replyText: offlineReply.replyText,
      evaluatedLevel: offlineReply.evaluatedLevel,
      wordToAdd: offlineReply.wordToAdd,
      replyAudio: null // Fallback to browser synthesis
    });
  }
});

// 5. Generate CEFR Assessment Level Test (Adaptive, Fast & Local)
app.post("/api/generate-level-test", async (req, res) => {
  try {
    const { type = "fast" } = req.body || {};
    
    // Shuffling the static questions so that different questions are picked on each test run
    const shuffledQuestions = [...staticQuestions];
    for (let i = shuffledQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
    }

    // Set up writing and speaking prompts
    let writingPrompts: any[] = [];
    let speakingPrompts: any[] = [];

    if (type === "full") {
      // Pick 2 writing prompts (one A2/B1 and one B2/C1)
      const easyWriting = staticWritingPrompts.filter(p => p.level === "A2" || p.level === "B1");
      const hardWriting = staticWritingPrompts.filter(p => p.level === "B2" || p.level === "C1");
      
      const chosenEasyW = easyWriting[Math.floor(Math.random() * easyWriting.length)];
      const chosenHardW = hardWriting[Math.floor(Math.random() * hardWriting.length)];
      
      writingPrompts = [chosenEasyW, chosenHardW].filter(Boolean);

      // Pick 2 speaking prompts (one A2/B1 and one B2/C1)
      const easySpeaking = staticSpeakingPrompts.filter(p => p.level === "A2" || p.level === "B1");
      const hardSpeaking = staticSpeakingPrompts.filter(p => p.level === "B2" || p.level === "C1");
      
      const chosenEasyS = easySpeaking[Math.floor(Math.random() * easySpeaking.length)];
      const chosenHardS = hardSpeaking[Math.floor(Math.random() * hardSpeaking.length)];
      
      speakingPrompts = [chosenEasyS, chosenHardS].filter(Boolean);
    }

    res.json({
      questions: shuffledQuestions,
      writingPrompts,
      speakingPrompts
    });
  } catch (error: any) {
    console.error("Generate level test error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate assessment test" });
  }
});

// 6. Grade CEFR Assessment Level Test
app.post("/api/grade-level-test", async (req, res) => {
  try {
    const { 
      type = "fast", 
      questions, 
      answers,
      writingPrompts = [],
      writingAnswers = [],
      speakingPrompts = [],
      speakingAnswers = []
    } = req.body || {};

    if (!questions || !answers || !Array.isArray(questions) || !Array.isArray(answers)) {
      res.status(400).json({ error: "Missing questions or answers data" });
      return;
    }

    const reportData = questions.map((q: any, i: number) => {
      const userAnswer = answers[i] !== undefined ? answers[i] : "No answer";
      const isCorrect = answers[i] === q.correctOptionIndex;
      return {
        questionId: q.id,
        level: q.level,
        type: q.type,
        text: q.text,
        correctOption: q.options[q.correctOptionIndex],
        studentAnswer: userAnswer !== "No answer" ? q.options[userAnswer] : "No answer",
        isCorrect,
        explanation: q.explanation
      };
    });

    // Transcribe speech recordings if sent as base64
    const transcribedSpeakingAnswers: string[] = [];
    for (let i = 0; i < speakingPrompts.length; i++) {
      const ans = speakingAnswers[i];
      if (ans && (ans.startsWith("data:audio") || ans.includes("base64") || ans.length > 500)) {
        try {
          console.log(`[Grading] Transcribing speaking response ${i + 1}...`);
          let mimeType = "audio/webm";
          let base64Audio = ans;
          if (ans.startsWith("data:")) {
            const match = ans.match(/^data:([^;]+);base64,/);
            if (match) {
              mimeType = match[1];
            }
            base64Audio = ans.split(",")[1] || ans;
          }
          const transResponse = await generateContentWithRetry({
            model: "gemini-3.1-flash-lite",
            contents: [
              {
                inlineData: {
                  mimeType,
                  data: base64Audio
                }
              },
              "Please transcribe this spoken English audio exactly as spoken. Return ONLY the clean transcript text, absolutely nothing else."
            ]
          }, { fallbackModel: "gemini-3.1-flash-lite" });
          transcribedSpeakingAnswers[i] = (transResponse.text || "").trim();
          console.log(`[Grading] Transcribed speaking ${i + 1}:`, transcribedSpeakingAnswers[i]);
        } catch (err) {
          console.error("Speaking transcription failed:", err);
          transcribedSpeakingAnswers[i] = "[Ошибка распознавания речи: " + (err instanceof Error ? err.message : String(err)) + "]";
        }
      } else {
        transcribedSpeakingAnswers[i] = ans || "[Ответ не предоставлен]";
      }
    }

    const writingReport = writingPrompts.map((p: any, i: number) => ({
      prompt: p.prompt,
      studentEssay: writingAnswers[i] || "[Письменная работа не сдана]"
    }));

    const speakingReport = speakingPrompts.map((p: any, i: number) => ({
      prompt: p.prompt,
      studentTranscript: transcribedSpeakingAnswers[i] || "[Устный ответ не сдан]"
    }));

    let gradingPrompt = "";
    if (type === "fast") {
      gradingPrompt = `You are an expert English language assessor. Review the following graded test results of a student and provide a detailed CEFR level proficiency evaluation with sub-skill analysis:

Test Type: fast (Quick assessment with 30 challenging multiple-choice questions)
Total Questions: ${questions.length}

Detailed Results:
${JSON.stringify(reportData, null, 2)}

Based on these results:
1. Determine their overall CEFR level (A1, A2, B1, B2, C1, or C2). 
   CRITICAL GRADING ASSIGNMENT DIRECTIVE:
   Be highly strict, precise, and realistic. If the student got simple questions (A1, A2, B1) wrong, do NOT grant them B2 or C1, even if they answered C1/B2 questions correctly (which they might have guessed). The final level must represent their true, solid baseline capability. If there are signs of guessing or inconsistent grammar performance, downgrade them to their lower consistent level (e.g., A2 or B1).
2. Outline 3 bullet points of their core strengths.
3. Outline 3 bullet points of their core weaknesses/gaps in knowledge.
4. Provide a supportive, highly constructive recommendation/feedback text in Russian (about 3-4 sentences).
5. Generate a breakdown for each sub-skill (Listening, Reading, Grammar & Vocabulary, Writing, Speaking).
   Since this was a Fast test, evaluate 'listening' and 'grammarVocabulary' directly. Estimate 'reading', 'writing', and 'speaking' based on their grammar performance or set them as estimated with appropriate comments.
   Each skill must have:
   - 'level': Strictly one of A1, A2, B1, B2, C1, C2.
   - 'proximity': proximity to the next level. Must be strictly one of: 'stable' (стабильный уровень), 'almost' (почти доходит до следующего уровня), 'far' (еще далеко до следующего уровня).
   - 'comment': A brief 1-sentence comment/explanation in Russian.

Return strictly a JSON object matching the requested schema.`;
    } else {
      gradingPrompt = `You are an expert English language assessor. Review the following comprehensive graded test results of a student across multiple modalities and provide a detailed CEFR level proficiency evaluation:

Test Type: full (Comprehensive assessment across Multiple Choice, Reading, Listening, Writing, and Speaking)
Total Multiple Choice Questions: ${questions.length}

Detailed Results (Multiple Choice):
${JSON.stringify(reportData, null, 2)}

Detailed Results (Writing):
${JSON.stringify(writingReport, null, 2)}

Detailed Results (Speaking - transcribed):
${JSON.stringify(speakingReport, null, 2)}

Based on all of the above:
1. Determine their overall CEFR level (A1, A2, B1, B2, C1, or C2). 
   CRITICAL GRADING ASSIGNMENT DIRECTIVE:
   Be extremely strict, realistic, and forensic. Do not be overly generous. If the student's speaking or writing responses are extremely short, contain basic grammar mistakes (e.g. subject-verb agreement, basic tenses, simple vocabulary), or if they got basic multiple-choice questions wrong, they MUST be graded at A1, A2, or B1. Do NOT grant B2 or C1 unless their speaking, writing, and multiple choice are ALL consistently at that level. In case of mismatch, the final level must reflect the lower, safe baseline.
2. Outline 3 bullet points of their core strengths.
3. Outline 3 bullet points of their core weaknesses/gaps in knowledge.
4. Provide a supportive, highly constructive recommendation/feedback text in Russian (about 4-5 sentences), addressing both their grammar traps, writing essay, and speaking quality.
5. Generate a breakdown for each sub-skill (Listening, Reading, Grammar & Vocabulary, Writing, Speaking) based on their actual performance in those sections.
   Each skill must have:
   - 'level': Strictly one of A1, A2, B1, B2, C1, C2.
   - 'proximity': proximity to the next level. Must be strictly one of: 'stable' (стабильный уровень), 'almost' (почти доходит до следующего уровня), 'far' (еще далеко до следующего уровня).
   - 'comment': A brief 1-sentence comment/explanation in Russian.

Return strictly a JSON object matching the requested schema.`;
    }

    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: [{ parts: [{ text: gradingPrompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            level: { type: Type.STRING, description: "Calculated CEFR level. Strictly one of: A1, A2, B1, B2, C1, C2" },
            strengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            weaknesses: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            detailedFeedback: { type: Type.STRING, description: "Constructive feedback and summary in Russian" },
            skillsBreakdown: {
              type: Type.OBJECT,
              properties: {
                listening: {
                  type: Type.OBJECT,
                  properties: {
                    level: { type: Type.STRING },
                    proximity: { type: Type.STRING, description: "One of: stable, almost, far" },
                    comment: { type: Type.STRING }
                  },
                  required: ["level", "proximity", "comment"]
                },
                reading: {
                  type: Type.OBJECT,
                  properties: {
                    level: { type: Type.STRING },
                    proximity: { type: Type.STRING, description: "One of: stable, almost, far" },
                    comment: { type: Type.STRING }
                  },
                  required: ["level", "proximity", "comment"]
                },
                grammarVocabulary: {
                  type: Type.OBJECT,
                  properties: {
                    level: { type: Type.STRING },
                    proximity: { type: Type.STRING, description: "One of: stable, almost, far" },
                    comment: { type: Type.STRING }
                  },
                  required: ["level", "proximity", "comment"]
                },
                writing: {
                  type: Type.OBJECT,
                  properties: {
                    level: { type: Type.STRING },
                    proximity: { type: Type.STRING, description: "One of: stable, almost, far" },
                    comment: { type: Type.STRING }
                  },
                  required: ["level", "proximity", "comment"]
                },
                speaking: {
                  type: Type.OBJECT,
                  properties: {
                    level: { type: Type.STRING },
                    proximity: { type: Type.STRING, description: "One of: stable, almost, far" },
                    comment: { type: Type.STRING }
                  },
                  required: ["level", "proximity", "comment"]
                }
              },
              required: ["listening", "reading", "grammarVocabulary", "writing", "speaking"]
            }
          },
          required: ["level", "strengths", "weaknesses", "detailedFeedback", "skillsBreakdown"]
        }
      }
    }, { maxRetries: 2, fallbackModel: "gemini-3.1-flash-lite" });

    let cleanGradeText = (response.text || "").trim();
    if (cleanGradeText.startsWith("```")) {
      cleanGradeText = cleanGradeText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const gradeReport = JSON.parse(cleanGradeText || "{}");
    res.json({ ...gradeReport, reportData });
  } catch (error: any) {
    console.error("Grade level test error:", error);
    res.status(500).json({ error: error?.message || "Failed to grade assessment test" });
  }
});

// 7. Grounded AI Voice Topic Generator
app.post("/api/ai-voice-topic", async (req, res) => {
  try {
    const { role = "sophia", userLevel = "A1" } = req.body || {};
    
    // Use Google Search grounding to find interesting, up-to-date conversational topics or recent positive news
    const searchQueries = [
      "interesting science discovery 2026 positive news",
      "popular cultural trend discussion topic",
      "nature environment positive events discussion",
      "cool modern technology life-changing topic"
    ];
    const chosenQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];

    const prompt = `You are a helpful English learning tutor named ${role === "sophia" ? "Sophia" : role === "oliver" ? "Oliver" : "Alex"}. 
Use Google Search to find recent interesting news or a cool topic based on the query: "${chosenQuery}".
Then, formulate a highly engaging conversational starter statement and question (under 50 words) in English.
Adapt your language and complexity strictly to the user's CEFR level: ${userLevel}.
- For A1-A2: use simple sentences, easy vocabulary.
- For B1-B2: use natural phrasal verbs, standard conversational style.
- For C1-C2: use native-level idiom and advanced expression.

Explain the topic briefly in English and invite the student to discuss.
Return strictly a JSON object containing:
- 'topicText': the formulated conversational starter strictly in English ONLY. Absolutely no Russian words should be in this field.
- 'topicTranslation': a brief 1-sentence Russian translation/explanation of the entire topicText statement (strictly in Russian, absolutely no English words).
- 'topicTitle': a short 2-3 word title of the news/topic (in English).
- 'sourceUrl': the URL from search grounding if found.`;

    const ai = getAIClient();
    let response;
    try {
      response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topicText: { type: Type.STRING },
              topicTranslation: { type: Type.STRING },
              topicTitle: { type: Type.STRING },
              sourceUrl: { type: Type.STRING }
            },
            required: ["topicText", "topicTranslation", "topicTitle"]
          }
        }
      }, { maxRetries: 2, fallbackModel: "gemini-3.1-flash-lite" });
    } catch (groundingErr: any) {
      console.warn("[Voice Topic] Search grounding failed, falling back to standard prompt...", groundingErr?.message || groundingErr);
      response = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: prompt + "\nDo not use external tools. Generate a high-quality discussion topic directly as JSON.",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topicText: { type: Type.STRING },
              topicTranslation: { type: Type.STRING },
              topicTitle: { type: Type.STRING },
              sourceUrl: { type: Type.STRING }
            },
            required: ["topicText", "topicTranslation", "topicTitle"]
          }
        }
      }, { maxRetries: 2, fallbackModel: "gemini-3.1-flash-lite" });
    }

    let cleanText = (response.text || "").trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const result = JSON.parse(cleanText || "{}");
    
    // Synthesize the starter statement to audio
    let replyAudioBase64 = "";
    try {
      const voiceNames: { [key: string]: string } = {
        sophia: "Kore",
        oliver: "Fenrir",
        alex: "Puck"
      };
      const selectedVoice = voiceNames[role] || "Kore";
      const ttsPromptPrefix = role === "alex" 
        ? "Say with energetic, upbeat, youthful NYC slang and an enthusiastic friendly vibe:" 
        : role === "oliver" 
        ? "Say in a deep, strict, stern, demanding, and authoritative male voice with precise discipline and stern enunciation:" 
        : "Say in a warm, cozy, gentle, caring, and encouraging tone:";

      const speechPromise = ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `${ttsPromptPrefix} ${result.topicText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice }
            }
          }
        }
      });

      const speechResponse = await withTimeout(speechPromise, 15000, null);

      if (speechResponse) {
        const rawData = speechResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
        if (rawData) {
          replyAudioBase64 = convertPcmToWav(rawData, 24000);
        }
      }
    } catch (ttsErr: any) {
      console.warn("[Voice Topic] TTS synthesis failed.", ttsErr?.message);
    }

    res.json({
      topicTitle: result.topicTitle,
      topicText: result.topicText,
      topicTranslation: result.topicTranslation || "",
      sourceUrl: result.sourceUrl || "",
      replyAudio: replyAudioBase64 ? `data:audio/wav;base64,${replyAudioBase64}` : null
    });
  } catch (error: any) {
    console.error("AI Voice topic generation error:", error);
    res.status(500).json({ error: error?.message || "Failed to generate conversational topic" });
  }
});

// Standalone Studio Gemini TTS Synthesis Endpoint
app.post("/api/ai-tts", async (req, res) => {
  try {
    const { text, role = "sophia" } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Missing text to synthesize" });
      return;
    }

    const ai = getAIClient();
    const voiceNames: { [key: string]: string } = {
      sophia: "Kore",
      oliver: "Fenrir",
      alex: "Puck"
    };
    const selectedVoice = voiceNames[role] || "Kore";
    const ttsPromptPrefix = role === "alex" 
      ? "Say with energetic, upbeat, youthful NYC slang and an enthusiastic friendly vibe:" 
      : role === "oliver" 
      ? "Say in a deep, strict, stern, demanding, and authoritative male voice with precise discipline and stern enunciation:" 
      : "Say in a warm, cozy, gentle, caring, and encouraging tone:";

    let cleanTextForTts = text
      .replace(/\[\d+\]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "")
      .trim();

    const speechPromise = ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `${ttsPromptPrefix} ${cleanTextForTts}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice }
          }
        }
      }
    });

    const speechResponse = await withTimeout(speechPromise, 15000, null);
    if (!speechResponse) {
      res.status(500).json({ error: "TTS timed out" });
      return;
    }

    const rawData = speechResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    if (!rawData) {
      res.status(500).json({ error: "No audio generated" });
      return;
    }

    const wavBase64 = convertPcmToWav(rawData, 24000);
    res.json({ audio: wavBase64 });
  } catch (err: any) {
    console.error("[TTS Endpoint Error]", err);
    res.status(500).json({ error: err?.message || "Failed to synthesize speech" });
  }
});

// --- END OF GEMINI AI HUB ENDPOINTS ---

// Vite server setup & static serving middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode
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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });

  // Setup WebSocket Server for Live API Voice Practice
  const wss = new WebSocketServer({ server });
  
  wss.on("connection", async (clientWs, req) => {
    try {
      const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
      if (url.pathname !== "/live" && url.pathname !== "/api/live") {
        clientWs.close();
        return;
      }
      
      console.log("[Live API] Client connected to WebSocket voice server");
      const ai = getAIClient();
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are Sophia, a friendly and warm English teacher. Speak clearly in simple English and help the user practice conversational English. Speak in a natural, welcoming tone.",
        },
        callbacks: {
          onmessage: (message: any) => {
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              clientWs.send(JSON.stringify({ audio }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
        },
      });

      clientWs.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (e) {
          console.error("[Live API] Error parsing client message:", e);
        }
      });

      clientWs.on("close", () => {
        console.log("[Live API] Client disconnected, closing Gemini session");
        session.close();
      });
    } catch (err) {
      console.error("[Live API] Error initializing Live session:", err);
      clientWs.send(JSON.stringify({ error: "Failed to initialize Gemini Live API session" }));
      clientWs.close();
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start full-stack server:", err);
});
