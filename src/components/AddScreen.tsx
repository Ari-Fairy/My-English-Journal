import React, { useState, useRef } from "react";
import { Word, UserProgress } from "../types";
import { POS_DEFAULT, TOPICS_DEFAULT } from "../data";

interface AddScreenProps {
  words: Word[];
  stats: UserProgress;
  onSaveWord: (word: Word) => void;
  onSaveProgress: (stats: UserProgress) => void;
  onBack: () => void;
}

export default function AddScreen({
  words,
  stats,
  onSaveWord,
  onSaveProgress,
  onBack
}: AddScreenProps) {
  const [tab, setTab] = useState<"one" | "photo" | "bulk" | "manage">("one");
  const [en, setEn] = useState("");
  const [ru, setRu] = useState("");
  const [pos, setPos] = useState("noun");
  const [topic, setTopic] = useState("general");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);

  // Bulk state
  const [bulkText, setBulkText] = useState("");
  const [bPos, setBPos] = useState("noun");
  const [bTopic, setBTopic] = useState("general");

  // Photo state
  const [img, setImg] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{ en: string; ru: string }[]>([]);
  const [review, setReview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Manage state
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicEmoji, setNewTopicEmoji] = useState("");
  const [newPosName, setNewPosName] = useState("");
  const [newPosKey, setNewPosKey] = useState("");
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [showPosForm, setShowPosForm] = useState(false);

  const deletedTopics = stats.deletedTopics || [];
  const deletedPos = stats.deletedPos || [];

  const allTopics: { [key: string]: string } = {};
  Object.entries(TOPICS_DEFAULT).forEach(([k, v]) => {
    if (!deletedTopics.includes(k)) {
      allTopics[k] = v;
    }
  });
  Object.entries(stats.customTopics || {}).forEach(([k, v]) => {
    allTopics[k] = v;
  });

  const allPos: { [key: string]: string } = {};
  Object.entries(POS_DEFAULT).forEach(([k, v]) => {
    if (!deletedPos.includes(k)) {
      allPos[k] = v;
    }
  });
  Object.entries(stats.customPos || {}).forEach(([k, v]) => {
    allPos[k] = v;
  });

  const trimmedEn = en.trim().toLowerCase();
  const duplicateWord = trimmedEn
    ? (words || []).find(w => w.en.trim().toLowerCase() === trimmedEn && w.partOfSpeech === pos)
    : undefined;

  const photoDuplicates = parsed.filter(p => {
    const trimmed = p.en.trim().toLowerCase();
    return trimmed && (words || []).some(w => w.en.trim().toLowerCase() === trimmed);
  });

  const bulkLinesParsed = bulkText.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const match = l.match(/^(.+?)\s*[\u2014\u2013\-:]\s*(.+)$/);
    return match ? { en: match[1]!.trim(), ru: match[2]!.trim() } : null;
  }).filter(Boolean) as { en: string; ru: string }[];

  const bulkDuplicates = bulkLinesParsed.filter(b => {
    const trimmed = b.en.toLowerCase();
    return trimmed && (words || []).some(w => w.en.trim().toLowerCase() === trimmed);
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImg(reader.result as string);
    reader.readAsDataURL(f);
  };

  // Perform Gemini OCR using our server API
  const handleOCR = async () => {
    if (!img) return;
    setParsing(true);
    setMsg("");
    setParsed([]);
    setReview(false);

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: img })
      });
      const resText = await res.text();
      const data = resText ? JSON.parse(resText) : {};
      if (data.pairs && Array.isArray(data.pairs)) {
        setParsed(data.pairs);
        setReview(true);
      } else {
        setMsg("❌ Не удалось распознать слова. Попробуйте вкладку Список.");
      }
    } catch (err) {
      console.error(err);
      setMsg("❌ Ошибка при отправке изображения.");
    } finally {
      setParsing(false);
    }
  };

  const handleAddPhotoWords = () => {
    const valid = parsed.filter(p => p.en && p.en.trim());
    if (!valid.length) {
      setMsg("❌ Нет распознанных слов для добавления.");
      return;
    }

    valid.forEach(p => {
      const w: Word = {
        id: Math.random().toString(36).slice(2),
        userId: stats.userId,
        en: p.en.trim(),
        ru: (p.ru || "—").trim(),
        partOfSpeech: bPos,
        topic: bTopic,
        note: "Из фото",
        learned: false,
        learnedDate: null,
        lastReviewed: null,
        correct: 0,
        wrong: 0,
        streak: 0,
        created: new Date().toISOString()
      };
      onSaveWord(w);
    });

    setImg(null);
    setParsed([]);
    setReview(false);
    setMsg(`✅ Успешно добавлено ${valid.length} слов!`);
    setTimeout(() => setMsg(""), 3000);
  };

  // Local heuristic offline classifier for common grammatical words to avoid network hits or API errors
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
        ruKeywords: ["дом", "комната", "дверь", "окно", "кухня", "кровать", "стул", "стол", "диван", "пол", "стена", "потолок", "крыша", "квартира", "ванная", "туалет", "душ", "раковина", "зеркало", "шкаф", "ключ", "подушка", "одеяло", "лампа", "телевизор"]
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
        ruKeywords: ["путешествие", "поездка", "машина", "самолет", "поезд", "автобус", "таксо", "велосипед", "лодка", "корабль", "полет", "билет", "отель", "гостиница", "багаж", "сумка", "чемодан", "карта", "гид", "граница", "страна", "город", "дорога", "улица", "станция", "аэропорт"]
      },
      {
        id: "animals",
        matchPatterns: ["animal", "животн", "птиц", "bird", "beast", "звер"],
        enKeywords: ["lion", "tiger", "bear", "fox", "wolf", "dog", "cat", "horse", "cow", "sheep", "pig", "rabbit", "deer", "elephant", "monkey", "mouse", "rat", "bird", "eagle", "hawk", "pigeon", "duck", "chicken", "snake", "frog", "fish", "shark", "whale", "dolphin", "spider", "bee", "ant", "butterfly", "insect"],
        ruKeywords: ["животное", "зверь", "животные", "собака", "кошка", "кот", "пес", "лошадь", "корова", "овца", "свинья", "кролик", "лев", "тигр", "медведь", "лиса", "волк", "слон", "обезьяна", "мышь", "крыса", "птица", "птицы", "орел", "ястреб", "голубь", "утка", "курица", "змея", "лягушка", "рыба", "акула", "кит", "дельфин", "паук", "пчела", "муравей", "бабочка", "насекомое"]
      },
      {
        id: "body",
        matchPatterns: ["body", "тело", "част", "organ"],
        enKeywords: ["body", "head", "face", "hair", "eye", "ear", "nose", "mouth", "lip", "tooth", "teeth", "tongue", "neck", "shoulder", "arm", "hand", "finger", "thumb", "chest", "heart", "stomach", "leg", "knee", "foot", "feet", "toe", "skin", "bone", "brain", "blood"],
        ruKeywords: ["тело", "голова", "лицо", "волосы", "глаз", "глаза", "ухо", "уши", "нос", "рот", "губа", "губы", "зуб", "зубы", "язык", "шея", "плечо", "рука", "руки", "палец", "пальцы", "грудь", "сердце", "живот", "нога", "ноги", "колено", "ступня", "кожа", "кость", "мозг", "кровь"]
      },
      {
        id: "musical_instruments",
        matchPatterns: ["instrument", "инструмент", "музык", "music", "musical"],
        enKeywords: ["violin", "guitar", "piano", "drums", "flute", "trumpet", "sax", "saxophone", "cello", "harp", "accordion", "synthesizer", "clarinet", "oboe"],
        ruKeywords: ["скрипка", "гитара", "пианино", "барабаны", "флейта", "труба", "саксофон", "виолончель", "арфа", "аккордеон", "синтезатор", "кларнет", "гобой"]
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

  // Auto classify word and update form selection live
  const autoClassify = async (targetEn = en, targetRu = ru) => {
    const trimmedEn = targetEn.trim();
    const trimmedRu = targetRu.trim();
    if (!trimmedEn || !trimmedRu) return;

    const cacheKey = `${trimmedEn.toLowerCase()}:${trimmedRu.toLowerCase()}`;
    let cachedResult = null;
    try {
      const cacheRaw = localStorage.getItem("word_classifier_cache");
      if (cacheRaw) {
        const cache = JSON.parse(cacheRaw);
        if (cache[cacheKey]) {
          cachedResult = cache[cacheKey];
        }
      }
    } catch (e) {
      console.warn("Failed to read from classification cache:", e);
    }

    if (cachedResult) {
      let finalPos = cachedResult.pos;
      let finalTopic = cachedResult.topic;
      let customPos = { ...(stats.customPos || {}) };
      let customTopics = { ...(stats.customTopics || {}) };
      let updatedStats = { ...stats };
      let hasUpdates = false;

      if (cachedResult.newPos?.key && cachedResult.newPos?.label) {
        customPos[cachedResult.newPos.key] = cachedResult.newPos.label;
        finalPos = cachedResult.newPos.key;
        updatedStats.customPos = customPos;
        hasUpdates = true;
      }
      if (cachedResult.newTopic?.key && cachedResult.newTopic?.label) {
        customTopics[cachedResult.newTopic.key] = cachedResult.newTopic.label;
        finalTopic = cachedResult.newTopic.key;
        updatedStats.customTopics = customTopics;
        hasUpdates = true;
      }

      setPos(finalPos);
      setTopic(finalTopic);

      if (hasUpdates) {
        onSaveProgress(updatedStats);
      }

      const posLabel = allPos[finalPos] || cachedResult.newPos?.label || finalPos;
      const topicLabel = allTopics[finalTopic] || cachedResult.newTopic?.label || finalTopic;
      setMsg(`✨ Извлечено из истории: ${posLabel}, Тема: ${topicLabel}`);
      setTimeout(() => setMsg(""), 4000);
      return;
    }

    // Check offline dictionary first for common grammatical words (Pronoun, Adverbs, Prepositions, Conjunctions)
    const offlineResult = getOfflineClassification(trimmedEn, trimmedRu, allPos, allTopics);
    if (offlineResult && !offlineResult.isGuess) {
      let finalPos = offlineResult.pos;
      let finalTopic = offlineResult.topic;
      let customPos = { ...(stats.customPos || {}) };
      let updatedStats = { ...stats };
      let hasUpdates = false;

      if (offlineResult.newPos?.key && offlineResult.newPos?.label) {
        // Automatically register newly discovered POS (like pronoun, preposition, conjunction)
        customPos[offlineResult.newPos.key] = offlineResult.newPos.label;
        finalPos = offlineResult.newPos.key;
        updatedStats.customPos = customPos;
        hasUpdates = true;
      }

      setPos(finalPos);
      setTopic(finalTopic);

      if (hasUpdates) {
        onSaveProgress(updatedStats);
      }

      const posLabel = allPos[finalPos] || offlineResult.newPos?.label || finalPos;
      const topicLabel = allTopics[finalTopic] || finalTopic;
      setMsg(`✨ Определено автоматически: ${posLabel}, Тема: ${topicLabel}`);
      setTimeout(() => setMsg(""), 4000);

      // Cache this result
      try {
        const cacheRaw = localStorage.getItem("word_classifier_cache");
        const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
        cache[cacheKey] = { pos: finalPos, topic: finalTopic, newPos: offlineResult.newPos };
        localStorage.setItem("word_classifier_cache", JSON.stringify(cache));
      } catch (e) {
        console.warn("Failed to write to classification cache:", e);
      }
      return;
    }

    setIsClassifying(true);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          en: trimmedEn,
          ru: trimmedRu,
          existingPos: Object.entries(allPos).map(([k, v]) => `${k}:${v}`).join(", "),
          existingTopics: Object.entries(allTopics).map(([k, v]) => `${k}:${v}`).join(", "),
          allPos: allPos,
          allTopics: allTopics
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Ошибка сервера (Код ${res.status})`);
      }
      
      const classification = await res.json();
      if (classification.error) {
        throw new Error(classification.error);
      }
      
      let finalPos = classification.pos || pos;
      let finalTopic = classification.topic || topic;
      let customTopics = { ...(stats.customTopics || {}) };
      let customPos = { ...(stats.customPos || {}) };
      let updatedStats = { ...stats };
      let hasUpdates = false;

      if (classification.newTopic?.key && classification.newTopic?.label) {
        customTopics[classification.newTopic.key] = classification.newTopic.label;
        finalTopic = classification.newTopic.key;
        updatedStats.customTopics = customTopics;
        hasUpdates = true;
      }
      if (classification.newPos?.key && classification.newPos?.label) {
        customPos[classification.newPos.key] = classification.newPos.label;
        finalPos = classification.newPos.key;
        updatedStats.customPos = customPos;
        hasUpdates = true;
      }

      setPos(finalPos);
      setTopic(finalTopic);

      if (hasUpdates) {
        onSaveProgress(updatedStats);
      }

      const posLabel = allPos[finalPos] || classification.newPos?.label || finalPos;
      const topicLabel = allTopics[finalTopic] || classification.newTopic?.label || finalTopic;
      if (classification.isGuess) {
        setMsg("💡 Использовано авто-определение (ИИ временно занят). Вы можете скорректировать выбор вручную.");
      } else {
        setMsg(`🤖 ИИ определил: ${posLabel}, Тема: ${topicLabel}`);
      }
      setTimeout(() => setMsg(""), 5000);

      // Save to localStorage cache for subsequent offline hits
      try {
        const cacheRaw = localStorage.getItem("word_classifier_cache");
        const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
        cache[cacheKey] = {
          pos: finalPos,
          topic: finalTopic,
          newPos: classification.newPos,
          newTopic: classification.newTopic,
          isGuess: classification.isGuess
        };
        localStorage.setItem("word_classifier_cache", JSON.stringify(cache));
      } catch (e) {
        console.warn("Failed to write to classification cache:", e);
      }
    } catch (err: any) {
      console.warn("Auto classification fallback active, using offline guess:", err?.message || err);
      
      // When network fails or Gemini has quota issues, seamlessly use our rich client-side heuristics!
      if (offlineResult) {
        let finalPos = offlineResult.pos;
        let finalTopic = offlineResult.topic;
        let customPos = { ...(stats.customPos || {}) };
        let updatedStats = { ...stats };
        let hasUpdates = false;

        if (offlineResult.newPos?.key && offlineResult.newPos?.label) {
          customPos[offlineResult.newPos.key] = offlineResult.newPos.label;
          finalPos = offlineResult.newPos.key;
          updatedStats.customPos = customPos;
          hasUpdates = true;
        }

        setPos(finalPos);
        setTopic(finalTopic);

        if (hasUpdates) {
          onSaveProgress(updatedStats);
        }

        const posLabel = allPos[finalPos] || offlineResult.newPos?.label || finalPos;
        const topicLabel = allTopics[finalTopic] || finalTopic;
        setMsg(`💡 Использовано локальное авто-определение (ИИ временно занят или недоступен). Ч.речи: ${posLabel}, Тема: ${topicLabel}`);

        // Cache this offline guess result too so we don't spam requests for it
        try {
          const cacheRaw = localStorage.getItem("word_classifier_cache");
          const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
          cache[cacheKey] = { pos: finalPos, topic: finalTopic, newPos: offlineResult.newPos, isGuess: true };
          localStorage.setItem("word_classifier_cache", JSON.stringify(cache));
        } catch (e) {
          console.warn("Failed to write to classification cache:", e);
        }
      } else {
        const isVercel = window.location.hostname.includes("vercel.app");
        if (isVercel) {
          setMsg("⚠️ На Vercel отсутствует бэкенд для ИИ (код 404). Пожалуйста, выберите значения вручную.");
        } else {
          setMsg(`⚠️ Ошибка связи с ИИ (${err?.message || "ошибка сети"}). Пожалуйста, выберите значения вручную.`);
        }
      }
      setTimeout(() => setMsg(""), 8000);
    } finally {
      setIsClassifying(false);
    }
  };

  // Add One Word - saves using form states directly
  const handleAddOneWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!en.trim() || !ru.trim()) return;
    if (duplicateWord) {
      setMsg(`⚠️ Слово "${duplicateWord.en}" уже есть в словаре!`);
      return;
    }

    setLoading(true);
    setMsg("");

    try {
      const w: Word = {
        id: Math.random().toString(36).slice(2),
        userId: stats.userId,
        en: en.trim(),
        ru: ru.trim(),
        partOfSpeech: pos,
        topic: topic,
        note: note.trim(),
        learned: false,
        learnedDate: null,
        lastReviewed: null,
        correct: 0,
        wrong: 0,
        streak: 0,
        created: new Date().toISOString()
      };

      onSaveWord(w);
      setMsg(`✨ Добавлено: "${w.en}" [Тема: ${allTopics[topic] || topic}]`);
      setEn("");
      setRu("");
      setNote("");
    } catch (err) {
      console.error(err);
      setMsg("❌ Ошибка при добавлении слова.");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 3500);
    }
  };

  const handleAddBulk = () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    let count = 0;
    lines.forEach(l => {
      const match = l.match(/^(.+?)\s*[\u2014\u2013\-:]\s*(.+)$/);
      if (!match) return;

      const w: Word = {
        id: Math.random().toString(36).slice(2),
        userId: stats.userId,
        en: match[1]!.trim(),
        ru: (match[2] || "—").trim(),
        partOfSpeech: bPos,
        topic: bTopic,
        note: "",
        learned: false,
        learnedDate: null,
        lastReviewed: null,
        correct: 0,
        wrong: 0,
        streak: 0,
        created: new Date().toISOString()
      };
      onSaveWord(w);
      count++;
    });

    setBulkText("");
    setMsg(`✅ Успешно добавлено ${count} слов!`);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleAddCustomTopic = () => {
    if (!newTopicName.trim()) return;
    const key = "custom_" + Math.random().toString(36).slice(2, 8);
    const label = `${newTopicEmoji || "📌"} ${newTopicName.trim()}`;
    
    onSaveProgress({
      ...stats,
      customTopics: { ...(stats.customTopics || {}), [key]: label }
    });

    setNewTopicName("");
    setNewTopicEmoji("");
    setShowTopicForm(false);
    setMsg(`✅ Создана новая тема: ${label}`);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleAddCustomPos = () => {
    if (!newPosName.trim() || !newPosKey.trim()) return;
    const key = newPosKey.trim().toLowerCase().replace(/\s+/g, "_");
    
    onSaveProgress({
      ...stats,
      customPos: { ...(stats.customPos || {}), [key]: newPosName.trim() }
    });

    setNewPosName("");
    setNewPosKey("");
    setShowPosForm(false);
    setMsg(`✅ Создана новая часть речи: ${newPosName}`);
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button className="back-btn" onClick={onBack}>← Назад</button>
        <h2 className="section-title" style={{ margin: 0 }}>Добавить</h2>
        <span />
      </div>

      {msg && (
        <div className="card" style={{ textAlign: "center", marginBottom: 12, padding: 11, fontSize: 14, color: "var(--sage)" }}>
          {msg}
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={`tab ${tab === "one" ? "active" : ""}`} onClick={() => setTab("one")}>✍️ Одно слово</button>
        <button className={`tab ${tab === "photo" ? "active" : ""}`} onClick={() => { setTab("photo"); setReview(false); }}>📸 Фото (AI OCR)</button>
        <button className={`tab ${tab === "bulk" ? "active" : ""}`} onClick={() => setTab("bulk")}>📋 Список</button>
        <button className={`tab ${tab === "manage" ? "active" : ""}`} onClick={() => setTab("manage")}>⚙️ Темы</button>
      </div>

      {/* Tab: One Word */}
      {tab === "one" && (
        <form onSubmit={handleAddOneWord} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>
              💡 Введите слово и перевод, ИИ автоматически подберет тему и часть речи!
            </p>
          </div>
          <input 
            className="input" 
            value={en} 
            onChange={e => setEn(e.target.value)} 
            onBlur={() => { if (en.trim() && ru.trim()) autoClassify(en, ru); }}
            placeholder="English Word (например: family)" 
            style={{ marginBottom: 8 }} 
            required 
          />
          
          {duplicateWord && (
            <div style={{ color: "var(--rose, #ff4d4d)", fontSize: "13px", marginTop: "-4px", marginBottom: "8px", fontWeight: "500", padding: "6px 10px", background: "rgba(255, 77, 77, 0.1)", borderRadius: "8px", border: "1px solid rgba(255, 77, 77, 0.2)" }}>
              ⚠️ Слово "{duplicateWord.en}" ({allPos[duplicateWord.partOfSpeech] || duplicateWord.partOfSpeech}) уже есть в словаре с переводом "{duplicateWord.ru}"! (Тема: {allTopics[duplicateWord.topic] || duplicateWord.topic})
            </div>
          )}

          <input 
            className="input" 
            value={ru} 
            onChange={e => setRu(e.target.value)} 
            onBlur={() => { if (en.trim() && ru.trim()) autoClassify(en, ru); }}
            placeholder="Перевод (например: семья)" 
            style={{ marginBottom: 8 }} 
            required 
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#aaa" }}>Часть речи и Тема:</span>
            {en.trim() && ru.trim() && (
              <button 
                type="button" 
                onClick={() => autoClassify(en, ru)} 
                disabled={isClassifying}
                style={{ background: "none", border: "none", color: "var(--rose, #ff4d4d)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, textDecoration: "underline" }}
              >
                {isClassifying ? "⏳ Определяем..." : "🤖 Переопределить по ИИ"}
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select className="select" style={{ flex: 1, minWidth: 0 }} value={pos} onChange={e => setPos(e.target.value)}>
              {Object.entries(allPos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select" style={{ flex: 1, minWidth: 0 }} value={topic} onChange={e => setTopic(e.target.value)}>
              {Object.entries(allTopics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          
          {isClassifying && (
            <div style={{ fontSize: "12px", color: "var(--rose, #ff4d4d)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
              ⏳ ИИ анализирует контекст слова для подбора темы...
            </div>
          )}

          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Заметка (необязательно)" style={{ marginBottom: 12 }} />
          
          <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: 14 }} disabled={loading || !!duplicateWord}>
            {loading ? "⏳ Добавление..." : "Добавить в журнал"}
          </button>
        </form>
      )}

      {/* Tab: Photo OCR */}
      {tab === "photo" && !review && (
        <div className="card" style={{ textAlign: "center" }}>
          <h3 className="section-title" style={{ fontSize: 18 }}>Распознавание списка по фото</h3>
          <p style={{ fontSize: 12, color: "#aaa", margin: "6px 0 18px" }}>Сфотографируйте список — Gemini автоматически извлечет все слова!</p>
          {!img ? (
            <button className="btn" style={{ width: "100%", padding: 36, border: "2px dashed rgba(212,165,165,.3)", borderRadius: "2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }} onClick={() => fileRef.current?.click()}>
              <span style={{ fontSize: 36 }}>📷</span>
              <span style={{ fontSize: 14, color: "var(--rose)", fontWeight: 500 }}>Выбрать изображение</span>
            </button>
          ) : (
            <div>
              <img src={img} style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 16, marginBottom: 12 }} alt="OCR Input" />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setImg(null)}>Сбросить</button>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleOCR} disabled={parsing}>
                  {parsing ? "⏳ Обработка..." : "🔍 Распознать"}
                </button>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden-input" />
        </div>
      )}

      {tab === "photo" && review && (
        <div className="fade-in card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 className="section-title" style={{ fontSize: 18, margin: 0 }}>Найдено {parsed.length} слов</h3>
            <button className="btn btn-ghost" onClick={() => setReview(false)}>← Сбросить</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <select className="select" style={{ flex: 1 }} value={bPos} onChange={e => setBPos(e.target.value)}>
              {Object.entries(allPos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select" style={{ flex: 1 }} value={bTopic} onChange={e => setBTopic(e.target.value)}>
              {Object.entries(allTopics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {photoDuplicates.length > 0 && (
            <div style={{ color: "var(--rose, #ff4d4d)", fontSize: "13px", marginBottom: "12px", fontWeight: "500", background: "rgba(255, 77, 77, 0.1)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 77, 77, 0.2)", lineHeight: "1.4" }}>
              ⚠️ Некоторые слова уже есть в словаре: {photoDuplicates.map(d => `"${d.en}"`).join(", ")}. Измените их или удалите (нажав на ✕), чтобы добавить остальные слова.
            </div>
          )}

          <div style={{ maxHeight: 250, overflowY: "auto", marginBottom: 12 }}>
            {parsed.map((p, i) => {
              const isDup = p.en.trim() && (words || []).some(w => w.en.trim().toLowerCase() === p.en.trim().toLowerCase());
              return (
                <div key={i} className="word-row" style={isDup ? { border: "1px solid rgba(255, 77, 77, 0.4)", background: "rgba(255, 77, 77, 0.05)", padding: "6px", borderRadius: "8px", margin: "4px 0" } : {}}>
                  <input 
                    value={p.en} 
                    onChange={e => { const list = [...parsed]; list[i]!.en = e.target.value; setParsed(list); }} 
                    style={{ flex: 1, minWidth: 80, color: isDup ? "var(--rose, #ff4d4d)" : "inherit", fontWeight: isDup ? "600" : "normal" }} 
                    placeholder="Слово"
                  />
                  <span>—</span>
                  <input 
                    value={p.ru} 
                    onChange={e => { const list = [...parsed]; list[i]!.ru = e.target.value; setParsed(list); }} 
                    style={{ flex: 1, minWidth: 80 }} 
                    placeholder="Перевод"
                  />
                  <button className="speak-btn" onClick={() => setParsed(parsed.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              );
            })}
          </div>
          <button className="btn btn-primary" style={{ width: "100%", padding: 14 }} onClick={handleAddPhotoWords} disabled={photoDuplicates.length > 0}>
            Добавить все ({parsed.length})
          </button>
        </div>
      )}

      {/* Tab: Bulk */}
      {tab === "bulk" && (
        <div className="card">
          <p style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>Формат ввода: английское_слово — русский_перевод (каждое слово на новой строчке)</p>
          <textarea className="textarea" value={bulkText} onChange={e => setBulkText(e.target.value)} rows={7} placeholder="such — такой&#10;genius — гений&#10;warm — теплый" style={{ marginBottom: 10 }} />
          
          {bulkDuplicates.length > 0 && (
            <div style={{ color: "var(--rose, #ff4d4d)", fontSize: "13px", marginBottom: "12px", fontWeight: "500", background: "rgba(255, 77, 77, 0.1)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 77, 77, 0.2)", lineHeight: "1.4" }}>
              ⚠️ Эти слова уже есть в словаре: {bulkDuplicates.map(d => `"${d.en}"`).join(", ")}. Измените или удалите эти строки из списка, чтобы продолжить.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <select className="select" style={{ flex: 1, minWidth: 0 }} value={bPos} onChange={e => setBPos(e.target.value)}>
              {Object.entries(allPos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="select" style={{ flex: 1, minWidth: 0 }} value={bTopic} onChange={e => setBTopic(e.target.value)}>
              {Object.entries(allTopics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" style={{ width: "100%", padding: 14 }} onClick={handleAddBulk} disabled={bulkDuplicates.length > 0}>Добавить список</button>
        </div>
      )}

      {/* Tab: Manage topics */}
      {tab === "manage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Пользовательские Темы</h3>
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowTopicForm(!showTopicForm)}>
                {showTopicForm ? "Скрыть" : "+ Новая"}
              </button>
            </div>
            
            {showTopicForm && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" value={newTopicEmoji} onChange={e => setNewTopicEmoji(e.target.value)} placeholder="Эмодзи (🎨)" style={{ width: 70 }} />
                  <input className="input" value={newTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder="Название темы" />
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleAddCustomTopic}>Создать тему</button>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {Object.entries(allTopics).map(([k, v]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(245,230,211,.3)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                  {v}
                  <button style={{ border: "none", background: "none", cursor: "pointer", color: "#999", marginLeft: 4 }} onClick={() => {
                    if (stats.customTopics?.[k]) {
                      const ct = { ...stats.customTopics };
                      delete ct[k];
                      onSaveProgress({ ...stats, customTopics: ct });
                    } else {
                      const dt = [...(stats.deletedTopics || []), k];
                      onSaveProgress({ ...stats, deletedTopics: dt });
                    }
                  }}>✕</button>
                </span>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Части Речи</h3>
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowPosForm(!showPosForm)}>
                {showPosForm ? "Скрыть" : "+ Новая"}
              </button>
            </div>

            {showPosForm && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <input className="input" value={newPosName} onChange={e => setNewPosName(e.target.value)} placeholder="Название (напр: Междометие)" />
                <input className="input" value={newPosKey} onChange={e => setNewPosKey(e.target.value)} placeholder="Код (напр: interjection)" />
                <button className="btn btn-primary btn-sm" onClick={handleAddCustomPos}>Создать часть речи</button>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {Object.entries(allPos).map(([k, v]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(245,230,211,.3)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                  {v}
                  <button style={{ border: "none", background: "none", cursor: "pointer", color: "#999", marginLeft: 4 }} onClick={() => {
                    if (stats.customPos?.[k]) {
                      const cp = { ...stats.customPos };
                      delete cp[k];
                      onSaveProgress({ ...stats, customPos: cp });
                    } else {
                      const dp = [...(stats.deletedPos || []), k];
                      onSaveProgress({ ...stats, deletedPos: dp });
                    }
                  }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
