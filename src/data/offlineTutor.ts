export interface OfflineTopic {
  title: string;
  text: string;
  translation: string;
  sourceUrl?: string;
  audio?: string | null;
}

export const OFFLINE_TOPICS_POOL: OfflineTopic[] = [
  {
    title: "Daily Practice & Reflection",
    text: "What was the most interesting or memorable part of your day today?",
    translation: "Что было самым интересным или запоминающимся событием вашего сегодняшнего дня?"
  },
  {
    title: "Technology & Artificial Intelligence",
    text: "How do you think smart devices and AI are changing our daily routines and work habits?",
    translation: "Как, по вашему мнению, умные устройства и ИИ меняют нашу повседневную жизнь и рабочие привычки?"
  },
  {
    title: "Travel & Dream Destinations",
    text: "If you could board a plane right now to any country in the world, where would you go and why?",
    translation: "Если бы вы могли прямо сейчас сесть в самолет в любую страну мира, куда бы вы отправились и почему?"
  },
  {
    title: "Food & Culinary Culture",
    text: "What is your favorite comfort food, and what traditional dish from your region should everyone try?",
    translation: "Какое ваше любимое блюдо для души и какое традиционное блюдо вашего региона должен попробовать каждый?"
  },
  {
    title: "Hobbies & Unwinding",
    text: "What is your favorite way to relax and recharge after a long, busy week?",
    translation: "Каков ваш любимый способ расслабиться и восстановить силы после долгой и насыщенной недели?"
  },
  {
    title: "Books & Cinema",
    text: "Is there a movie, TV show, or book that recently surprised or inspired you?",
    translation: "Есть ли фильм, сериал или книга, которые недавно вас удивили или вдохновили?"
  },
  {
    title: "Future Goals & Learning",
    text: "What is one new skill or language technique you would love to master this year?",
    translation: "Каким новым навыком или приемом изучения языка вы бы хотели овладеть в этом году?"
  },
  {
    title: "Morning & Night Routines",
    text: "Do you consider yourself a morning lark or a night owl? How does that affect your day?",
    translation: "Вы считаете себя жаворонком или совой? Как это влияет на ваш день?"
  },
  {
    title: "Music & Inspiration",
    text: "What kind of music do you listen to when you need to focus, relax, or get energized?",
    translation: "Какую музыку вы слушаете, когда вам нужно сосредоточиться, расслабиться или зарядиться энергией?"
  },
  {
    title: "Seasons & Nature",
    text: "Which season of the year brings you the most joy, and what activities do you enjoy during it?",
    translation: "Какое время года приносит вам больше всего радости и чем вам нравится заниматься в этот период?"
  },
  {
    title: "Friendship & Communication",
    text: "What qualities do you value most in a good friend or colleague?",
    translation: "Какие качества вы больше всего цените в хорошем друге или коллеге?"
  },
  {
    title: "Healthy Lifestyle",
    text: "What is one small healthy habit that makes you feel great when you do it regularly?",
    translation: "Какая одна небольшая здоровая привычка заставляет вас чувствовать себя отлично при регулярном выполнении?"
  }
];

let topicIndex = 0;

export function getNextOfflineTopic(currentTitle?: string): OfflineTopic {
  topicIndex = (topicIndex + 1) % OFFLINE_TOPICS_POOL.length;
  let topic = OFFLINE_TOPICS_POOL[topicIndex];
  if (topic.title === currentTitle && OFFLINE_TOPICS_POOL.length > 1) {
    topicIndex = (topicIndex + 1) % OFFLINE_TOPICS_POOL.length;
    topic = OFFLINE_TOPICS_POOL[topicIndex];
  }
  return topic;
}

export function getOfflineChatTutorReply(
  userMessage: string, 
  role: string, 
  userLevel: string, 
  clientLocalTime?: string
): { replyText: string; evaluatedLevel: string; wordToAdd: any } {
  const msg = (userMessage || "").trim().toLowerCase();

  // Word translation query detection (e.g. "как будет арбуз", "как по-английски арбуз")
  const dictWords: { [key: string]: { en: string; emoji: string; pos: string; topic: string } } = {
    "арбуз": { en: "watermelon", emoji: "🍉", pos: "noun", topic: "food" },
    "яблоко": { en: "apple", emoji: "🍎", pos: "noun", topic: "food" },
    "банан": { en: "banana", emoji: "🍌", pos: "noun", topic: "food" },
    "дыня": { en: "melon", emoji: "🍈", pos: "noun", topic: "food" },
    "клубника": { en: "strawberry", emoji: "🍓", pos: "noun", topic: "food" },
    "апельсин": { en: "orange", emoji: "🍊", pos: "noun", topic: "food" },
    "персик": { en: "peach", emoji: "🍑", pos: "noun", topic: "food" },
    "груша": { en: "pear", emoji: "🍐", pos: "noun", topic: "food" },
    "вишня": { en: "cherry", emoji: "🍒", pos: "noun", topic: "food" },
    "виноград": { en: "grapes", emoji: "🍇", pos: "noun", topic: "food" },
    "огурец": { en: "cucumber", emoji: "🥒", pos: "noun", topic: "food" },
    "помидор": { en: "tomato", emoji: "🍅", pos: "noun", topic: "food" },
    "картошка": { en: "potato", emoji: "🥔", pos: "noun", topic: "food" },
    "морковь": { en: "carrot", emoji: "🥕", pos: "noun", topic: "food" },
    "сыр": { en: "cheese", emoji: "🧀", pos: "noun", topic: "food" },
    "молоко": { en: "milk", emoji: "🥛", pos: "noun", topic: "food" },
    "кошка": { en: "cat", emoji: "🐱", pos: "noun", topic: "home" },
    "кот": { en: "cat", emoji: "🐱", pos: "noun", topic: "home" },
    "собака": { en: "dog", emoji: "🐶", pos: "noun", topic: "home" },
    "хлеб": { en: "bread", emoji: "🍞", pos: "noun", topic: "food" },
    "вода": { en: "water", emoji: "💧", pos: "noun", topic: "food" },
    "дом": { en: "house", emoji: "🏠", pos: "noun", topic: "home" },
    "книга": { en: "book", emoji: "📚", pos: "noun", topic: "study" },
    "машина": { en: "car", emoji: "🚗", pos: "noun", topic: "travel" },
    "солнце": { en: "sun", emoji: "☀️", pos: "noun", topic: "weather" },
    "время": { en: "time", emoji: "⏰", pos: "noun", topic: "time" },
    "семья": { en: "family", emoji: "👨‍👩‍👧", pos: "noun", topic: "family" },
    "мечта": { en: "dream", emoji: "✨", pos: "noun", topic: "general" },
    "работа": { en: "work", emoji: "💼", pos: "noun", topic: "work" },
    "погода": { en: "weather", emoji: "🌤️", pos: "noun", topic: "weather" }
  };

  for (const [ruKey, info] of Object.entries(dictWords)) {
    if (msg.includes(ruKey)) {
      let replyText = "";
      if (role === "sophia") {
        replyText = `Слово "${ruKey}" по-английски будет **${info.en}** ${info.emoji}!\n\nПример употребления: "I really love ${info.en}!" (Я очень люблю ${ruKey}).\n\nХотите сохранить это слово в свой словарь? И о каких ещё словах вам хотелось бы узнать? 🌸`;
      } else if (role === "oliver") {
        replyText = `По-английски "${ruKey}" переводится как **${info.en}** ${info.emoji}.\n\nОбратите внимание на правильное произношение и грамматику. Попробуйте составить предложение с этим словом!`;
      } else {
        replyText = `Yo! "${ruKey}" по-английски — это **${info.en}** ${info.emoji}!\n\nSuper easy! What other words do you wanna learn today? ⚡`;
      }
      return {
        replyText,
        evaluatedLevel: userLevel,
        wordToAdd: { en: info.en, ru: ruKey, pos: info.pos, topic: info.topic }
      };
    }
  }

  // Generic Russian phrase translation request parser ("как будет...", "как переводится...", "как по-английски...")
  if (msg.includes("как будет") || msg.includes("как переводится") || msg.includes("по-английски") || msg.includes("как сказать")) {
    const extractedWord = msg
      .replace(/как будет/gi, "")
      .replace(/как переводится/gi, "")
      .replace(/по-английски/gi, "")
      .replace(/как сказать/gi, "")
      .replace(/слово/gi, "")
      .replace(/[?.,!]/g, "")
      .trim();

    if (extractedWord) {
      let replyText = "";
      if (role === "sophia") {
        replyText = `Замечательный вопрос! 😊 Вы спросили про слово "**${extractedWord}**".\n\nВ английском языке его перевод зависит от контекста. Попробуйте отправить его в чат или воспользоваться помощью с переводом! Хотите разобрать ещё выражения? 🌸`;
      } else if (role === "oliver") {
        replyText = `Для точного перевода слова "**${extractedWord}**" требуется учитывать контекст предложения. Пожалуйста, сформулируйте предложение на английском с этим словом.`;
      } else {
        replyText = `Great word to ask about! 🚀 "**${extractedWord}**" is awesome to learn! What other phrases are on your mind? ⚡`;
      }
      return {
        replyText,
        evaluatedLevel: userLevel,
        wordToAdd: { en: extractedWord, ru: extractedWord, pos: "noun", topic: "general" }
      };
    }
  }

  // Grammar Exercise Request Parser
  if (msg.includes("упражнение на грамматику") || msg.includes("предложение с пропуском") || msg.includes("грамматик")) {
    let replyText = "";
    if (role === "sophia") {
      replyText = `С удовольствием проведу упражнение на грамматику! 📝✨\n\nВот предложение с пропуском:\n**She ___ (to work) at a hospital every day.**\n\nВыберите правильную форму:\n**a) work**\n**b) works**\n**c) is working**\n\nНапишите букву ответа или слово, а я с любовью подробно объясню правило! 🌸`;
    } else if (role === "oliver") {
      replyText = `Принято. Начинаем упражнение по грамматике.\n\nЗаполните пропуск в предложении:\n**She ___ (to work) at a hospital every day.**\n\nВарианты ответа:\n**a) work**\n**b) works**\n**c) is working**\n\nВ случае ошибки правило будет подробно разъяснено на русском.`;
    } else {
      replyText = `Grammar time! 🔥 Вот предложение с пропуском:\n**She ___ (to work) at a hospital every day.**\n\nВыбирай вариант:\n**a) work**\n**b) works**\n**c) is working**\n\nКакой вариант правильный? Напиши в ответ! ⚡`;
    }
    return {
      replyText,
      evaluatedLevel: userLevel,
      wordToAdd: { en: "grammar", ru: "грамматика", pos: "noun", topic: "study" }
    };
  }

  // Answer checking for Grammar Exercise ("a", "b", "c", "works")
  if (msg === "a" || msg === "b" || msg === "c" || msg.includes("works") || msg.includes("is working") || msg === "b) works") {
    const isCorrect = msg === "b" || msg.includes("works") || msg === "b) works";
    let replyText = "";
    if (isCorrect) {
      if (role === "sophia") {
        replyText = `Абсолютно верно! 🎉 Браво! Правильный ответ — **b) works**.\n\n**Правило:** Для подлежащего в 3-м лице единственного числа (*she, he, it*) в Present Simple к глаголу добавляется окончание **-s** или **-es** (*work ➔ works*), так как действие происходит регулярно (*every day*).\n\nСледующее задание:\n**They ___ (to play) football right now.**\n**a) play**\n**b) plays**\n**c) are playing**\n\nКакой вариант выберешь? 🌸`;
      } else if (role === "oliver") {
        replyText = `Совершенно верно. Правильный ответ: **b) works**.\n\n**Анализ правила:** В Present Simple с местоимениями 3-го лица единственного числа к основе глагола добавляется флексия **-s**. Маркер *every day* указывает на регулярность.\n\nСледующий вопрос:\n**They ___ (to play) football right now.**\n**a) play**\n**b) plays**\n**c) are playing**`;
      } else {
        replyText = `Spot on! ⚡ **b) works** is 100% correct!\n\nRule: Present Simple + third person singular (she/he/it) = add **-s**!\n\nNext question:\n**They ___ (to play) football right now.**\n**a) play**\n**b) plays**\n**c) are playing**\n\nDrop your answer! 🔥`;
      }
    } else {
      if (role === "sophia") {
        replyText = `Хорошая попытка! 😊 Но верный ответ — **b) works**.\n\n**Объяснение:** В предложении есть маркер *every day* (каждый день), поэтому нужен Present Simple. Так как подлежащее **She** (она), к глаголу добавляется **-s**: *she works*.\n\nДавай попробуем следующее закрепить:\n**He ___ (to speak) English very well.**\n**a) speak**\n**b) speaks**\n**c) is speaking**\n\nКакой вариант правильный? 🌸`;
      } else if (role === "oliver") {
        replyText = `Неверно. Правильный вариант: **b) works**.\n\n**Грамматический анализ:** Словосочетание *every day* обозначает повторяющееся действие, требуя Present Simple. С подлежащим 3-го лица единственного числа (*she*) обязателен суффикс **-s** (*works*).\n\nПовторное задание:\n**He ___ (to speak) English very well.**\n**a) speak**\n**b) speaks**\n**c) is speaking**`;
      } else {
        replyText = `Close, but not quite! 💡 The right option is **b) works**.\n\nWhy? Because *every day* means routine ➔ Present Simple! And for *she*, we add **-s**!\n\nTry this one:\n**He ___ (to speak) English very well.**\n**a) speak**\n**b) speaks**\n**c) is speaking**\n\nWhat's your pick? ⚡`;
      }
    }
    return {
      replyText,
      evaluatedLevel: userLevel,
      wordToAdd: { en: "exercise", ru: "упражнение", pos: "noun", topic: "study" }
    };
  }

  // Topic Proposal Request Parser ("предложи мне интересную тему", "тему для обсуждения", "первый вопрос")
  if (msg.includes("предложи") || msg.includes("интересную тему") || msg.includes("тему для обсуждения") || msg.includes("первый вопрос")) {
    let replyText = "";
    if (role === "sophia") {
      replyText = `С удовольствием! 🗣️✨ Предлагаю обсудить отличную тему: **"Travel & Dream Vacation"** (Путешествия и отпуск мечты).\n\nМой первый вопрос к тебе:\n*If you could travel to any country in the world tomorrow for free, where would you go and why?*\n\nОтветь на английском (можно 1-2 простых предложения), а я с любовью помогу с языком! 🌸`;
    } else if (role === "oliver") {
      replyText = `Предлагаю тему для академического обсуждения: **"Modern Technology & Daily Habits"** (Технологии и ежедневные привычки).\n\nПервый вопрос для оценки логики и грамматики:\n*In your opinion, how has smart technology changed our daily work and study routines?*\n\nСформулируйте ваш ответ на английском языке.`;
    } else {
      replyText = `Yo! Let's talk about something fun! 🚀 Тема дня: **"Hobbies & Free Time"** (Хобби и свободное время).\n\nHere is my first question for you:\n*What is your favorite way to chill out on weekends when you have no work or study?*\n\nDrop your answer in English! Let's go! ⚡`;
    }
    return {
      replyText,
      evaluatedLevel: userLevel,
      wordToAdd: { en: "discussion", ru: "обсуждение, дискуссия", pos: "noun", topic: "general" }
    };
  }

  // Dictation / Vocabulary check query detection (e.g. "словарный диктант", "проведи диктант", "называй по одному слову")
  if (msg.includes("диктант") || msg.includes("словарный") || msg.includes("называй по одному слову") || msg.includes("диктант слов")) {
    let replyText = "";
    if (role === "sophia") {
      replyText = `Отличная идея! С удовольствием проведу словарный диктант! 🎙️📚\n\nДавай начнем с первого слова:\nКак переводится на русский слово **watermelon**? 🍉\n\nНапиши перевод в ответ, а затем я дам следующее слово! 🌸`;
    } else if (role === "oliver") {
      replyText = `Принято. Начинаем словарный диктант по одному слову.\n\nПервое слово:\n**watermelon** 🍉\n\nНапишите точный перевод этого слова на русский язык.`;
    } else {
      replyText = `Yo! Let's do a dictation! 🔥\n\nFirst word:\n**watermelon** 🍉\n\nWhat does it mean in Russian? Drop your answer! ⚡`;
    }
    return {
      replyText,
      evaluatedLevel: userLevel,
      wordToAdd: { en: "dictation", ru: "диктант", pos: "noun", topic: "study" }
    };
  }

  // Basic grammar corrections
  let correction = "";
  if (msg.includes("ago days") || msg.includes("ago weeks") || msg.includes("ago months") || msg.includes("ago years") || / \d+ ago /i.test(msg) || /ago \d+/i.test(msg)) {
    correction = "\n\n💡 **Небольшая подсказка по грамматике:** В английском языке слово **'ago'** всегда ставится ПОСЛЕ отрезка времени. Правильно говорить: **'3 days ago'** (а не '3 ago days'). 😊";
  } else if (msg.includes("i am agree") || msg.includes("i'm agree")) {
    correction = "\n\n💡 **Подсказка:** Правильно говорить **'I agree'** (без 'am'), так как *agree* — это глагол. 😊";
  } else if (msg.includes("feel myself")) {
    correction = "\n\n💡 **Подсказка:** О хорошем самочувствии говорят **'I feel good / happy'** (без *myself*). 🌸";
  } else if (msg.includes("he go ") || msg.endsWith("he go")) {
    correction = "\n\n💡 **Подсказка:** Используйте **'he goes'** для 3-го лица единственного числа в Present Simple.";
  } else if (msg.includes("she go ") || msg.endsWith("she go")) {
    correction = "\n\n💡 **Подсказка:** Используйте **'she goes'** для 3-го лица единственного числа.";
  } else if (msg.includes("i have 20 years") || msg.includes("i have ") && msg.includes(" years")) {
    correction = "\n\n💡 **Подсказка:** Для возраста используют глагол *to be*: **'I am 20 years old'**.";
  }

  const isNumberedAnswers = /1[\s\.\)].*2[\s\.\)]/i.test(msg) || (msg.includes("friend") && msg.includes("read"));
  const isAskingIfCorrect = msg.includes("правильно") || msg.includes("верно") || msg.includes("так") || msg.includes("correct") || msg.includes("right");

  // Check if message is strictly a standalone short greeting without additional clauses
  const isExplicitGreeting = msg.length < 25 && /^(hello|hi|hey|good morning|good afternoon|good evening|привет|здравствуй|добрый день|доброе утро|добрый вечер)[\!\?\.\s]*$/i.test(msg);

  let timeGreetingPrefix = "";
  if (isExplicitGreeting) {
    let hour = new Date().getHours();
    if (clientLocalTime) {
      try { hour = new Date(clientLocalTime).getHours(); } catch (e) {}
    }
    const isMorning = hour >= 5 && hour < 12;
    const isAfternoon = hour >= 12 && hour < 17;
    const isEvening = hour >= 17 && hour < 23;

    if (isMorning) {
      timeGreetingPrefix = role === "sophia" ? "Good morning! ☀️ " : role === "oliver" ? "Good morning. " : "Morning! 🌅 ";
    } else if (isAfternoon) {
      timeGreetingPrefix = role === "sophia" ? "Good afternoon! 🌸 " : role === "oliver" ? "Good afternoon. " : "Hey, good afternoon! ☀️ ";
    } else if (isEvening) {
      timeGreetingPrefix = role === "sophia" ? "Good evening! 🌌 " : role === "oliver" ? "Good evening. " : "Good evening! 🌆 ";
    } else {
      timeGreetingPrefix = role === "sophia" ? "Hello! 🌸 " : role === "oliver" ? "Hello. " : "Hey there! ⚡ ";
    }
  }

  let replyText = "";
  let wordToAdd = null;

  // 1. Birthday / Party / Celebration Topic
  if (msg.includes("birthday") || msg.includes("party") || msg.includes("день рождения") || msg.includes("праздник") || msg.includes("отмечал") || msg.includes("отпраздновал") || msg.includes("отметил")) {
    wordToAdd = { en: "celebration", ru: "празднование, торжество", pos: "noun", topic: "general" };
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}Happy Birthday! 🥳🎉 Поздравляю с днем рождения (или с прошедшим праздником)! Счастья, радости и море вдохновения! How was your birthday party? Did you get nice presents or have a delicious birthday cake with your friends? Tell me all about it! 🌸${correction}`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Happy Birthday. 🎉 Примите мои поздравления с днем рождения. Желаю успехов и академической точности в изучении английского языка. How did you celebrate your birthday party? Please describe the event in 2-3 structured English sentences.${correction}`;
    } else {
      replyText = `${timeGreetingPrefix}Yo, Happy Birthday! 🥳🎉 С днем рождения! Hope your birthday party was absolute fire! What was the coolest gift or best moment of your birthday? Spill the details! ⚡${correction}`;
    }
  }
  // 2. User submitting numbered answers or translations
  else if (msg.includes("sun") || msg.includes("family") || msg.includes("quckly") || msg.includes("quickly") || msg.includes("dream") || /1[\s\.\)].*2[\s\.\)]/i.test(msg)) {
    wordToAdd = { en: "dream", ru: "мечта, мечтать", pos: "noun", topic: "general" };
    const hasQucklySpelling = msg.includes("quckly");
    const spellingNote = hasQucklySpelling ? " (обрати внимание на опечатку: *quckly* ➔ **quickly**!)" : "";
    const hasNeZnayu = msg.includes("не знаю") || msg.includes("незнаю") || msg.includes("don't know");
    const dreamEval = hasNeZnayu ? "**dream** (ты написала 'не знаю' — запомни: Мечта = dream! 🌸)" : "**dream** ✅";

    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}Отличная попытка! 🌟 Разберём твой перевод:
1. Солнце ➔ **sun** ✅
2. Семья ➔ **family** ✅
3. Время ➔ **time** ✅
4. Мечта ➔ ${dreamEval}
5. Быстро ➔ **quickly / fast** ✅${spellingNote}

Ты большая молодец! 4 из 5 переведены верно, а про мечту теперь запомнишь. Хочешь ещё упражнение или обсудим интересную тему?`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Good effort. Here is the evaluation of your answers:
1. Солнце ➔ **sun** (Correct)
2. Семья ➔ **family** (Correct)
3. Время ➔ **time** (Correct)
4. Мечта ➔ **dream** (Note: "не знаю" was entered; 'dream' is the correct noun)
5. Быстро ➔ **quickly**${hasQucklySpelling ? " (Spelling correction: 'quckly' ➔ 'quickly')" : " (Correct)"}

Accuracy score: 80%. Would you like to proceed with another set?`;
    } else {
      replyText = `${timeGreetingPrefix}Nice job! 🚀 Check out your translations:
1. sun ✅  2. family ✅  3. time ✅  4. dream (Мечта!)  5. quickly ✅${spellingNote}

High five! ✋ What would you like to practice next?`;
    }
  } else if (isNumberedAnswers) {
    wordToAdd = { en: "accurate", ru: "точный, правильный", pos: "adjective", topic: "study" };
    const spellingNote = msg.includes("allways") ? " (всегда — 'always', с одной 'l'!)" : "";

    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}Отличная работа! 🌟 You translated all 5 words so well!
1. Друг ➔ **friend** ✅
2. Читать ➔ **read** ✅
3. Город ➔ **city** ✅
4. Вода ➔ **water** ✅
5. Всегда ➔ **always** ✅${spellingNote}

Всё переведено верно! Ты отлично справляешься. Хочешь новое задание или обсудим интересную тему?`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Excellent accuracy. Your answers:
1. Friend — correct.
2. Read — correct.
3. City — correct.
4. Water — correct.
5. Always — correct${spellingNote}.

Your vocabulary is remarkably precise. Would you like to proceed with another set or discuss grammar rules?`;
    } else {
      replyText = `${timeGreetingPrefix}Awesome job! 🚀 You nailed all 5 translations:
1. friend ✅ 2. read ✅ 3. city ✅ 4. water ✅ 5. always ✅${spellingNote}

High five! ✋ What's next on your learning list today?`;
    }
  } 
  // 2. User asking if their previous translation was correct in Russian
  else if (isAskingIfCorrect && !isNumberedAnswers) {
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}Да, ты перевела всё абсолютно правильно! 🌟 Все 5 слов (*friend, read, city, water, always*) у тебя подобраны верно. Ты умница! Хочешь дам ещё 5 новых слов для перевода?`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Yes, your translations were completely correct. Excellent attention to detail. Shall we move on to the next set of vocabulary?`;
    } else {
      replyText = `${timeGreetingPrefix}Yes! You got them 100% right! 🔥 You're doing amazing! Ready for 5 more words, or want to chat about something else?`;
    }
  }
  // 3. User asking to generate a text / story / essay on a topic
  else if (msg.includes("напиши") || msg.includes("составь") || msg.includes("придумай") || msg.includes("write") || msg.includes("generate") || msg.includes("create") || (msg.includes("текст") && (msg.includes("тему") || msg.includes("уровн") || msg.includes("про")))) {
    if (msg.includes("гендер") || msg.includes("стереотип") || msg.includes("мужчин") || msg.includes("женщин") || msg.includes("gender")) {
      wordToAdd = { en: "stereotype", ru: "стереотип", pos: "noun", topic: "general" };
      if (role === "sophia") {
        replyText = `С удовольствием подготовила для тебя текст уровня A2 на тему гендерных стереотипов! 🌸\n\n### 📖 Gender Stereotypes in Modern Society\n\nIn many societies, people have traditional ideas about men and women. For a long time, people believed that men should be the main workers and earn money, while women should stay at home, cook meals, and take care of children.\n\nHowever, the world is changing quickly today. Women can become scientists, pilots, CEOs, and politicians, while men can also take care of children and work at home. Equality means that every person can choose their own path without fear of judgment.\n\nToday, young people believe that kindness, hard work, and intelligence are important for everyone, regardless of gender.\n\n---\n💡 **Полезный словарь:**\n- **Stereotype** (*стереотип*) — a fixed idea about a group of people.\n- **Equality** (*равенство*) — having the same rights and opportunities.\n- **Judgment** (*осуждение, мнение*) — making opinions about someone.\n\n**Мой вопрос к тебе:** *What do you think about gender stereotypes in your city or country? Do you think they are disappearing?* (Ответь в 1-2 простых предложениях на английском!)`;
      } else if (role === "oliver") {
        replyText = `Текст уровня A2 на тему гендерных стереотипов составлен согласно академическим стандартам:\n\n### 📝 Gender Stereotypes and Social Expectations\n\nGender stereotypes are traditional social beliefs about how men and women should behave. Historically, men were expected to focus on career and leadership, whereas women were expected to manage household duties.\n\nIn contemporary society, these traditional boundaries are fading. Both men and women now share professional responsibilities and domestic tasks equally. Gender equality allows individuals to pursue personal goals based on talent rather than gender stereotypes.\n\n---\n📚 **Академическая лексика:**\n- **Contemporary** (*современный*)\n- **Responsibilities** (*обязанности*)\n- **Boundaries** (*границы*)\n\n**Задание:** Сформулируйте ваш ответ на английском: *Do you agree that modern society promotes equal opportunities for everyone?*`;
      } else {
        replyText = `Yo! Here is a super cool A2 text about gender stereotypes! 🔥\n\n### ⚡ Gender Stereotypes: Old Ideas vs Modern Life\n\nGender stereotypes are old rules about what men and women "should" do. In the past, people thought guys had to be tough and work all day, while girls had to stay home and do chores.\n\nThat is so outdated! Today, anyone can do anything! Girls can play sports or lead tech companies, and guys can cook or express their emotions freely. It is all about freedom and respect!\n\n---\n🚀 **Cool Words:**\n- **Outdated** (*устаревший*)\n- **Freedom** (*свобода*)\n- **Respect** (*уважение*)\n\n**Your turn:** *What is one stereotype you think is silly? Drop your answer in English!*`;
      }
    } else {
      wordToAdd = { en: "creative", ru: "творческий", pos: "adjective", topic: "study" };
      replyText = `С удовольствием подготовила для тебя этот текст на английском языке (уровень A2)! 📝✨\n\n### 🌟 Learning and Growing Every Day\n\nLearning a new language opens up incredible opportunities in life. When we practice reading, speaking, and listening regularly, our mind grows stronger and more adaptable.\n\nEvery small step counts. Even practicing for ten minutes a day helps you become fluent and confident over time!\n\n---\n💡 **Полезные слова:**\n- **Opportunity** (*возможность*)\n- **Adaptable** (*гибкий*)\n- **Confident** (*уверенный в себе*)\n\nWhat are your thoughts on this topic? Tell me in English! 🌸`;
    }
  }
  // 4. User asking for a new task/exercise or words to translate ("дай задание", "дай еще слов", "перевод", "дай пять слов")
  else if (msg.includes("задание") || msg.includes("слов") || msg.includes("упражнение") || msg.includes("give me words") || msg.includes("task") || msg.includes("exercise")) {
    wordToAdd = { en: "challenge", ru: "сложное задание, вызов", pos: "noun", topic: "study" };
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}С удовольствием! Вот 5 новых слов на русском, переведи их на английский:
1. **Солнце**
2. **Семья**
3. **Время**
4. **Мечта**
5. **Быстро**

Не спеши, напиши свои варианты в ответ! 🌸`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Certainly. Here are 5 words to translate into English:
1. **Солнце**
2. **Семья**
3. **Время**
4. **Мечта**
5. **Быстро**

Take your time to structure your response.`;
    } else {
      replyText = `${timeGreetingPrefix}Let's do this! 🔥 Here are 5 fresh words to translate:
1. **Солнце**
2. **Семья**
3. **Время**
4. **Мечта**
5. **Быстро**

Drop your translations below when ready! ⚡`;
    }
  }
  // 4. Food topic
  else if (msg.includes("food") || msg.includes("eat") || msg.includes("cook") || msg.includes("dish") || msg.includes("dinner") || msg.includes("pizza") || msg.includes("еда") || msg.includes("готовить")) {
    wordToAdd = { en: "delicious", ru: "очень вкусный", pos: "adjective", topic: "food" };
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}That sounds delicious! I love talking about culinary traditions. What is your absolute favorite meal to prepare or enjoy?${correction}`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Culinary topics are quite engaging. From a structural perspective, 'delicious' is an expressive adjective. What ingredients do you use most frequently?${correction}`;
    } else {
      replyText = `${timeGreetingPrefix}Oh man, now I'm hungry! 🍕 That sounds awesome. What's your go-to comfort food when hanging out?${correction}`;
    }
  } 
  // 5. Travel topic
  else if (msg.includes("travel") || msg.includes("trip") || msg.includes("city") || msg.includes("fly") || msg.includes("country") || msg.includes("visit") || msg.includes("путешестви") || msg.includes("город")) {
    wordToAdd = { en: "breathtaking", ru: "захватывающий дух", pos: "adjective", topic: "travel" };
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}Traveling is such a wonderful way to expand our world! What was the most breathtaking place you have ever visited, or where would you love to go next?${correction}`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Exploring new cultures enriches one's linguistic perspectives. Which destination has left the strongest impression on you?${correction}`;
    } else {
      replyText = `${timeGreetingPrefix}Yo, traveling is the best! ✈️ Nothing beats exploring a new city. What's the coolest place you've ever been to?${correction}`;
    }
  } 
  // 6. Hobby topic
  else if (msg.includes("hobby") || msg.includes("game") || msg.includes("play") || msg.includes("sport") || msg.includes("book") || msg.includes("music") || msg.includes("movie") || msg.includes("хобби") || msg.includes("музыка") || msg.includes("фильм")) {
    wordToAdd = { en: "passionate", ru: "увлеченный, увлеченно", pos: "adjective", topic: "hobby" };
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}How wonderful! Hobbies bring so much joy to our lives. How long have you been doing that, and what do you enjoy most about it?${correction}`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Engaging in leisure activities is essential for mental balance. How do you allocate time for your interests?${correction}`;
    } else {
      replyText = `${timeGreetingPrefix}That is so cool! 🎸 I love spending free time on fun activities too. How did you get into that? Tell me more!${correction}`;
    }
  } 
  // 7. Dynamic conversational / Russian questions handler
  else {
    wordToAdd = { en: "cozy", ru: "уютный", pos: "adjective", topic: "general" };
    const isRussian = /[а-яА-Я]/i.test(msg);
    const hasNameArina = msg.includes("арина") || msg.includes("arina") || msg.includes("меня зовут");
    
    if (hasNameArina) {
      wordToAdd = { en: "delighted", ru: "очень рад(а)", pos: "adjective", topic: "general" };
      if (role === "sophia") {
        replyText = `${timeGreetingPrefix}Nice to meet you, Arina! 🌸 Рада знакомству! How are you feeling today, and what are you planning to do?`;
      } else if (role === "oliver") {
        replyText = `${timeGreetingPrefix}Pleased to make your acquaintance, Arina. Good enunciation. Let's maintain this structured approach to our lessons.`;
      } else {
        replyText = `${timeGreetingPrefix}Hey Arina! ⚡ Super cool to meet you! How's your day going in your city?`;
      }
    } else if (isRussian) {
      if (msg.includes("как дела") || msg.includes("как ты") || msg.includes("как жизнь")) {
        if (role === "sophia") {
          replyText = `${timeGreetingPrefix}У меня всё замечательно, спасибо! I'm doing great, thank you! How are you doing today? What's new with you? 😊`;
        } else if (role === "oliver") {
          replyText = `${timeGreetingPrefix}I am functioning efficiently, thank you. Let me ask you in English: how is your day progressing?`;
        } else {
          replyText = `${timeGreetingPrefix}I'm feeling awesome! 🚀 Thanks for asking, my friend! How about you? What are you up to today?`;
        }
      } else if (msg.includes("что делаешь") || msg.includes("чем занимаешься")) {
        if (role === "sophia") {
          replyText = `${timeGreetingPrefix}Я с радостью помогаю тебе учить английский! I'm here helping you practice English! What are you working on right now? 🌸`;
        } else if (role === "oliver") {
          replyText = `${timeGreetingPrefix}I am evaluating your speech and grammar patterns. Tell me in English: what is your primary task today?`;
        } else {
          replyText = `${timeGreetingPrefix}Just hanging out and chatting with you! 🎧 What fun things are you doing today?`;
        }
      } else if (msg.includes("почему") || msg.includes("зачем") || msg.includes("как сказать") || msg.includes("объясни") || msg.includes("правило")) {
        if (role === "sophia") {
          replyText = `${timeGreetingPrefix}Отличный вопрос! 💡 В английском языке это зависит от контекста. Например, когда мы говорим о действиях, происходящих прямо сейчас, мы используем Present Continuous (*I am speaking*), а для регулярных привычек — Present Simple (*I speak*). Попробуешь применить в предложении?`;
        } else if (role === "oliver") {
          replyText = `${timeGreetingPrefix}Let's analyze this grammatical concept strictly. In English, structure determines meaning. Please formulate your question using clear English terms.`;
        } else {
          replyText = `${timeGreetingPrefix}Great question! ⚡ Here's the deal: English likes simple rules. Keep subject + verb + object! Try writing a short example in English!`;
        }
      } else {
        // Varied general Russian responses so it never repeats the exact same string
        const sophiaVariants = [
          `${timeGreetingPrefix}Понимаю тебя! I understand what you mean. 🌸 Tell me a little bit more about that in English! How do you feel about it?`,
          `${timeGreetingPrefix}Замечательно! That is very interesting. 😊 How would you say that in simple English? Try one short sentence!`,
          `${timeGreetingPrefix}Спасибо, что поделилась! I'm glad you mentioned it. 🌟 What else would you like to discuss today?`
        ];
        const oliverVariants = [
          `${timeGreetingPrefix}I understand your point. Let's translate that concept into clear English. How would you structure this sentence?`,
          `${timeGreetingPrefix}Noted. Let's refine your English phrasing. Try expressing this idea with correct grammar.`,
          `${timeGreetingPrefix}Understood. Continuous practice improves precision. What specific aspect of English shall we focus on next?`
        ];
        const alexVariants = [
          `${timeGreetingPrefix}Got it, my friend! ⚡ That's awesome. Tell me in English: what's the most exciting thing about that?`,
          `${timeGreetingPrefix}Cool! I hear ya! 🎧 Let me ask you: how are you feeling about your English progress today?`,
          `${timeGreetingPrefix}Nice! Let's keep the vibe going! 🔥 What's next on your mind today?`
        ];

        const salt = Math.abs(msg.length + (msg.charCodeAt(0) || 0)) % 3;
        if (role === "sophia") replyText = sophiaVariants[salt];
        else if (role === "oliver") replyText = oliverVariants[salt];
        else replyText = alexVariants[salt];
      }
    } else {
      const cleanUserMsg = (userMessage || "").trim();
      if (role === "sophia") {
        replyText = `${timeGreetingPrefix}That's so interesting! I love hearing about what you're doing. 🌸 You said: "${cleanUserMsg}". Tell me a bit more details about that! What was the best part?${correction}`;
      } else if (role === "oliver") {
        replyText = `${timeGreetingPrefix}I have reviewed your English statement: "${cleanUserMsg}". Let's continue practicing. Please expand on this topic in 2-3 additional sentences.${correction}`;
      } else {
        replyText = `${timeGreetingPrefix}Awesome! You said: "${cleanUserMsg}"! ⚡ That sounds super cool. What else happened? Tell me more!${correction}`;
      }
    }
  }

  return {
    replyText,
    evaluatedLevel: userLevel || "A1",
    wordToAdd
  };
}
