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

  // Basic grammar corrections
  let correction = "";
  if (msg.includes("i am agree") || msg.includes("i'm agree")) {
    correction = " (By the way, in English we say 'I agree' instead of 'I am agree' because 'agree' is a verb! 😊)";
  } else if (msg.includes("feel myself")) {
    correction = " (Quick tip: in English we say 'I feel good' or 'I feel happy' instead of 'I feel myself' when talking about emotions! 🌸)";
  } else if (msg.includes("he go ") || msg.endsWith("he go")) {
    correction = " (Remember to use 'he goes' for the third person singular!)";
  } else if (msg.includes("she go ") || msg.endsWith("she go")) {
    correction = " (Remember to use 'she goes' for the third person singular!)";
  } else if (msg.includes("he have") || msg.includes("she have")) {
    correction = " (Just a tiny note: use 'has' for he/she/it, like 'he has' or 'she has'! 📚)";
  }

  // Detect time context
  let hour = new Date().getHours();
  if (clientLocalTime) {
    try { hour = new Date(clientLocalTime).getHours(); } catch (e) {}
  }
  const isMorning = hour >= 5 && hour < 12;
  const isAfternoon = hour >= 12 && hour < 17;
  const isEvening = hour >= 17 && hour < 23;

  let timeGreetingPrefix = "";
  if (isMorning) {
    timeGreetingPrefix = role === "sophia" ? "Good morning! ☀️ " : role === "oliver" ? "Good morning. " : "Morning! 🌅 ";
  } else if (isAfternoon) {
    timeGreetingPrefix = role === "sophia" ? "Good afternoon! 🌸 " : role === "oliver" ? "Good afternoon. " : "Hey, good afternoon! ☀️ ";
  } else if (isEvening) {
    timeGreetingPrefix = role === "sophia" ? "Good evening! 🌌 " : role === "oliver" ? "Good evening. " : "Good evening! 🌆 ";
  }

  let replyText = "";
  let wordToAdd = null;

  if (msg.includes("food") || msg.includes("eat") || msg.includes("cook") || msg.includes("dish") || msg.includes("dinner") || msg.includes("pizza")) {
    wordToAdd = { en: "delicious", ru: "очень вкусный", pos: "adjective", topic: "food" };
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}That sounds delicious! I love talking about culinary traditions. What is your absolute favorite meal to prepare or enjoy?${correction}`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Culinary topics are quite engaging. From a structural perspective, 'delicious' is an expressive adjective. What ingredients do you use most frequently?${correction}`;
    } else {
      replyText = `${timeGreetingPrefix}Oh man, now I'm hungry! 🍕 That sounds awesome. What's your go-to comfort food when hanging out?${correction}`;
    }
  } else if (msg.includes("travel") || msg.includes("trip") || msg.includes("city") || msg.includes("fly") || msg.includes("country") || msg.includes("visit")) {
    wordToAdd = { en: "breathtaking", ru: "захватывающий дух", pos: "adjective", topic: "travel" };
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}Traveling is such a wonderful way to expand our world! What was the most breathtaking place you have ever visited, or where would you love to go next?${correction}`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Exploring new cultures enriches one's linguistic perspectives. Which destination has left the strongest impression on you?${correction}`;
    } else {
      replyText = `${timeGreetingPrefix}Yo, traveling is the best! ✈️ Nothing beats exploring a new city. What's the coolest place you've ever been to?${correction}`;
    }
  } else if (msg.includes("hobby") || msg.includes("game") || msg.includes("play") || msg.includes("sport") || msg.includes("book") || msg.includes("music") || msg.includes("movie")) {
    wordToAdd = { en: "passionate", ru: "увлеченный, увлеченно", pos: "adjective", topic: "hobby" };
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}How wonderful! Hobbies bring so much joy to our lives. How long have you been doing that, and what do you enjoy most about it?${correction}`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}Engaging in leisure activities is essential for mental balance. How do you allocate time for your interests?${correction}`;
    } else {
      replyText = `${timeGreetingPrefix}That is so cool! 🎸 I love spending free time on fun activities too. How did you get into that? Tell me more!${correction}`;
    }
  } else {
    wordToAdd = { en: "cozy", ru: "уютный", pos: "adjective", topic: "general" };
    if (role === "sophia") {
      replyText = `${timeGreetingPrefix}Thank you for sharing that with me! You are expressing your thoughts very clearly. What are your plans or goals for today?${correction}`;
    } else if (role === "oliver") {
      replyText = `${timeGreetingPrefix}I appreciate your input. Your sentence structure is progressing nicely. Could you elaborate a bit more on your main point?${correction}`;
    } else {
      replyText = `${timeGreetingPrefix}Awesome! Thanks for sharing. How's everything else going with you today? What else is on your mind?${correction}`;
    }
  }

  return {
    replyText,
    evaluatedLevel: userLevel || "A1",
    wordToAdd
  };
}
