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
  } else if (word.includes(" ") || ruWord.includes(" ")) {
    guessedPos = "phrase";
    isGuess = false;
  } else if (["hello", "hi", "bye", "please", "thanks", "thank you", "welcome"].includes(word)) {
    guessedPos = "phrase";
    isGuess = false;
  } else if (word.endsWith("ly") && word.length > 4) {
    guessedPos = "adverb";
    isGuess = false;
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
    isGuess = false;
  } else if (
    word.endsWith("ize") ||
    word.endsWith("ise") ||
    word.endsWith("ify") ||
    (word.endsWith("ate") && word.length > 4)
  ) {
    guessedPos = "verb";
    isGuess = false;
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
    isGuess = false;
  } else if (ruWord) {
    // Check Russian suffix rules
    if (ruWord.endsWith("ть") || ruWord.endsWith("ться") || ruWord.endsWith("ти") || ruWord.endsWith("уть") || ruWord.endsWith("ать") || ruWord.endsWith("ить") || ruWord.endsWith("еть")) {
      guessedPos = "verb";
      isGuess = false;
    } else if (
      ruWord.endsWith("ый") ||
      ruWord.endsWith("ий") ||
      ruWord.endsWith("ое") ||
      ruWord.endsWith("ая") ||
      ruWord.endsWith("ые") ||
      ruWord.endsWith("ие") ||
      ruWord.endsWith("ой")
    ) {
      guessedPos = "adjective";
      isGuess = false;
    } else if (ruWord.endsWith("о") && ruWord.length > 3) {
      const commonONouns = ["окно", "лицо", "молоко", "слово", "дело", "утро", "небо", "солнце", "пиво", "кино", "метро", "фото", "яблоко", "озеро"];
      if (!commonONouns.includes(ruWord)) {
        guessedPos = "adverb";
        isGuess = false;
      } else {
        guessedPos = "noun";
        isGuess = false;
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
