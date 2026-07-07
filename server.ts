import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const app = express();

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
const getOfflineClassification = (enVal: string, ruVal?: string) => {
  const word = enVal.trim().toLowerCase();
  const ruWord = ruVal ? ruVal.trim().toLowerCase() : "";

  // 1. Pronouns
  const pronouns = [
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", 
    "my", "your", "his", "their", "our", "this", "that", "these", "those", 
    "who", "what", "which", "someone", "somebody", "something", "anyone", 
    "anybody", "anything", "everyone", "everybody", "everything", "nobody", "nothing",
    "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves", 
    "whose", "whom", "each", "both", "some", "any", "all", "few", "many", "several"
  ];
  if (pronouns.includes(word)) {
    return {
      pos: "pronoun",
      topic: "general",
      newPos: { key: "pronoun", label: "Местоимение" },
      isGuess: true
    };
  }

  // 2. Adverbs
  const adverbs = [
    "how", "where", "when", "why", "now", "today", "tomorrow", "yesterday", 
    "always", "never", "sometimes", "often", "usually", "seldom", "quickly", 
    "slowly", "easily", "happily", "really", "suddenly", "softly", "outside", 
    "below", "over", "near", "above", "already", "yet", "still", "just", 
    "then", "there", "here", "quite", "very", "too", "almost", "enough", 
    "hardly", "scarcely", "everywhere", "nowhere", "somewhere"
  ];
  if (adverbs.includes(word)) {
    return { pos: "adverb", topic: "general", isGuess: true };
  }

  // 3. Prepositions
  const prepositions = [
    "in", "on", "at", "under", "over", "with", "by", "for", "about", "near", 
    "to", "from", "of", "into", "through", "during", "before", "after", 
    "between", "among", "without", "against", "behind", "below", "beside", 
    "beyond", "except", "inside", "like", "outside", "since", "throughout", 
    "toward", "towards", "upon", "within"
  ];
  if (prepositions.includes(word)) {
    return {
      pos: "preposition",
      topic: "general",
      newPos: { key: "preposition", label: "Предлог" },
      isGuess: true
    };
  }

  // 4. Conjunctions
  const conjunctions = [
    "and", "but", "or", "because", "if", "although", "though", "since", 
    "unless", "while", "whereas", "so", "for", "yet", "nor", "as", "once", 
    "until", "whenever", "wherever"
  ];
  if (conjunctions.includes(word)) {
    return {
      pos: "conjunction",
      topic: "general",
      newPos: { key: "conjunction", label: "Союз" },
      isGuess: true
    };
  }

  // 5. Basic greetings and set phrases
  if (word.includes(" ") || ["hello", "hi", "bye", "please", "thanks", "thank you", "welcome"].includes(word)) {
    return { pos: "phrase", topic: "general", isGuess: true };
  }

  // --- HEURISTICS / GUESSES ---
  let guessedPos = "noun"; // Default guess
  let isGuess = true;

  // Space-separated is likely a phrase
  if (word.includes(" ") || ruWord.includes(" ")) {
    guessedPos = "phrase";
  }
  // Check English suffixes
  else if (word.endsWith("ly") && word.length > 4) {
    guessedPos = "adverb";
  } else if (
    word.endsWith("able") ||
    word.endsWith("ible") ||
    word.endsWith("ful") ||
    word.endsWith("less") ||
    word.endsWith("ous") ||
    word.endsWith("ive") ||
    word.endsWith("ic") ||
    (word.endsWith("ish") && word.length > 4) ||
    (word.endsWith("al") && word.length > 4)
  ) {
    guessedPos = "adjective";
  } else if (
    word.endsWith("ize") ||
    word.endsWith("ise") ||
    word.endsWith("ify") ||
    (word.endsWith("ate") && word.length > 4)
  ) {
    guessedPos = "verb";
  } else if (
    word.endsWith("tion") ||
    word.endsWith("sion") ||
    word.endsWith("ness") ||
    word.endsWith("ment") ||
    word.endsWith("ity") ||
    word.endsWith("ship") ||
    word.endsWith("ism")
  ) {
    guessedPos = "noun";
  }
  // Check Russian translations for endings
  else if (ruWord) {
    if (ruWord.endsWith("ть") || ruWord.endsWith("ться") || ruWord.endsWith("ти") || ruWord.endsWith("уть")) {
      guessedPos = "verb";
    } else if (
      ruWord.endsWith("ый") ||
      ruWord.endsWith("ий") ||
      ruWord.endsWith("ое") ||
      ruWord.endsWith("ая") ||
      ruWord.endsWith("ые") ||
      ruWord.endsWith("ие")
    ) {
      guessedPos = "adjective";
    } else if (ruWord.endsWith("о") && ruWord.length > 3) {
      const commonONouns = ["окно", "лицо", "молоко", "слово", "дело", "утро", "небо", "солнце", "пиво", "кино", "метро", "фото", "яблоко", "озеро"];
      if (!commonONouns.includes(ruWord)) {
        guessedPos = "adverb";
      }
    }
  }

  // Map topic based on keywords in English or Russian
  let guessedTopic = "general";
  const topicKeywords: { [key: string]: string[] } = {
    home: ["home", "house", "room", "door", "window", "kitchen", "bed", "chair", "table", "дом", "комната", "дверь", "окно", "кухня", "кровать", "стол", "стул"],
    hobby: ["play", "sport", "game", "music", "song", "dance", "read", "book", "film", "movie", "хобби", "игра", "спорт", "музыка", "книга", "фильм", "читать", "петь"],
    weather: ["weather", "sun", "rain", "snow", "wind", "cold", "hot", "cloud", "sky", "погода", "солнце", "дождь", "снег", "ветер", "холод", "небо"],
    study: ["study", "learn", "school", "class", "teacher", "student", "book", "pen", "write", "учеба", "школа", "класс", "учитель", "ученик", "ручка", "писать"],
    work: ["work", "job", "office", "boss", "colleague", "money", "salary", "business", "работа", "офис", "деньги", "бизнес", "коллега", "зарплата"],
    food: ["food", "eat", "drink", "apple", "bread", "water", "meat", "milk", "tea", "coffee", "еда", "пить", "яблоко", "хлеб", "вода", "чай", "кофе", "молоко"],
    time: ["time", "day", "night", "morning", "evening", "hour", "minute", "week", "month", "year", "время", "день", "ночь", "утро", "вечер", "час", "минута", "неделя", "месяц", "год"],
    family: ["family", "mother", "father", "son", "daughter", "brother", "sister", "friend", "семья", "мама", "папа", "сын", "дочь", "брат", "сестра", "друг"],
    travel: ["travel", "trip", "journey", "car", "plane", "train", "bus", "hotel", "road", "city", "путешествие", "машина", "самолет", "поезд", "отель", "город"]
  };

  for (const [topicKey, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(kw => word.includes(kw) || ruWord.includes(kw))) {
      guessedTopic = topicKey;
      break;
    }
  }

  return {
    pos: guessedPos,
    topic: guessedTopic,
    isGuess: isGuess
  };
};

// Endpoint to automatically classify part of speech and topic for a word
app.post("/api/classify", async (req, res) => {
  const { en, ru, existingPos, existingTopics } = req.body || {};
  if (!en || !ru) {
    res.status(400).json({ error: "Missing en or ru word fields" });
    return;
  }

  try {
    const ai = getAIClient();

    const systemInstruction = `You are an expert lexicographer and English-Russian linguist.
You analyze an English word/phrase and its Russian translation to determine its part of speech (POS) and its vocabulary topic.

Your classification MUST be highly accurate according to standard English and Russian grammar:
- Pronouns like "I", "you", "he", "she", "it", "we", "they", "this", "that", "him", "her", "their", "me" should be classified as pronouns ("pronoun"). If "pronoun" is not in the list of available keys, you should invent it with the label "Местоимение".
- Interrogative and relative adverbs like "how" (как), "where" (где), "when" (когда), "why" (почему) must be classified as adverbs ("adverb", Наречие), NOT nouns or phrases!
- Prepositions like "in", "on", "at", "under", "with", "by", "for", "about", "near" are prepositions ("preposition", Предлог).
- Conjunctions like "and", "but", "or", "because", "if" are conjunctions ("conjunction", Союз).
- Normal verbs are "verb" (Глагол).
- Multi-word verbs are "phrasal_verb" (Фразовый глагол).
- Adjectives are "adjective" (Прилагательное).
- Nouns are "noun" (Существительное).
- Set phrases, idioms, or sentences (e.g. "by the way", "at the moment", "good morning") are "phrase" (Фраза).

Available Parts of Speech keys:
${existingPos || "verb, noun, adjective, adverb, participle, phrase"}

Available Topic keys:
${existingTopics || "home, hobby, weather, study, work, food, time, family, travel, general, diary"}

If the word fits an existing key, return its key exactly (e.g. "adverb" for "how" -> "как").
Only if it strictly does not fit any existing keys, you can invent a new lowercase key for POS (e.g. "pronoun", "preposition") or Topic (e.g. "nature"). If you invent a new Topic, provide an appropriate emoji and a Russian label (e.g., "🌳 Природа"). If you invent a new POS, provide a Russian label (e.g., "Местоимение").`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Word: "${en}" -> Translation: "${ru}"`,
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL
        },
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
    console.warn("Classification API error, attempting local fallback:", error);
    const fallback = getOfflineClassification(en, ru);
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start full-stack server:", err);
});
