import { Word, IrregularVerb, UserProgress } from "./types";

export const POS_DEFAULT: { [key: string]: string } = {
  verb: "Глагол",
  phrasal_verb: "Фразовый глагол",
  noun: "Существительное",
  adjective: "Прилагательное",
  adverb: "Наречие",
  participle: "Причастие",
  phrase: "Фраза"
};

export const TOPICS_DEFAULT: { [key: string]: string } = {
  home: "🏠 Дом",
  hobby: "🎨 Хобби",
  weather: "🌦 Погода",
  study: "📚 Учёба",
  work: "💼 Работа",
  food: "🍽 Еда",
  time: "⏰ Время",
  family: "👨‍👧 Семья",
  travel: "✈️ Путешествия",
  general: "🌐 Общее",
  diary: "📔 Дневник"
};

export const DIARY_WORDS = [
  { en: "such", ru: "такой", pos: "adjective", topic: "diary" },
  { en: "genius", ru: "гений", pos: "noun", topic: "diary" },
  { en: "by the way", ru: "кстати", pos: "phrase", topic: "diary" },
  { en: "person", ru: "человек", pos: "noun", topic: "diary" },
  { en: "shine", ru: "светить", pos: "verb", topic: "diary" },
  { en: "sit", ru: "сидеть", pos: "verb", topic: "diary" },
  { en: "next to", ru: "рядом", pos: "phrase", topic: "diary" },
  { en: "her", ru: "её", pos: "noun", topic: "diary" },
  { en: "his", ru: "его", pos: "noun", topic: "diary" },
  { en: "him", ru: "ему", pos: "noun", topic: "diary" },
  { en: "warm", ru: "тёплый", pos: "adjective", topic: "diary" },
  { en: "near", ru: "около", pos: "adverb", topic: "diary" },
  { en: "adventures", ru: "приключения", pos: "noun", topic: "diary" },
  { en: "explore", ru: "исследовать", pos: "verb", topic: "diary" },
  { en: "outside", ru: "снаружи", pos: "adverb", topic: "diary" },
  { en: "pack", ru: "упаковывать", pos: "verb", topic: "diary" },
  { en: "map", ru: "карта", pos: "noun", topic: "diary" },
  { en: "step", ru: "шагать", pos: "verb", topic: "diary" },
  { en: "river", ru: "река", pos: "noun", topic: "diary" },
  { en: "flow", ru: "течь, течение", pos: "verb", topic: "diary" },
  { en: "over", ru: "над", pos: "adverb", topic: "diary" },
  { en: "bridge", ru: "мост", pos: "noun", topic: "diary" },
  { en: "below", ru: "внизу", pos: "adverb", topic: "diary" },
  { en: "wind", ru: "ветер", pos: "noun", topic: "diary" },
  { en: "blow", ru: "дуть", pos: "verb", topic: "diary" },
  { en: "suddenly", ru: "внезапно", pos: "adverb", topic: "diary" },
  { en: "someone", ru: "кто-то", pos: "noun", topic: "diary" },
  { en: "turn", ru: "поворачивать", pos: "verb", topic: "diary" },
  { en: "follow", ru: "следовать", pos: "verb", topic: "diary" },
  { en: "field", ru: "поле", pos: "noun", topic: "diary" },
  { en: "their", ru: "их", pos: "noun", topic: "diary" },
  { en: "talk for hours", ru: "разговаривать часами", pos: "phrase", topic: "diary" },
  { en: "heart", ru: "сердце", pos: "noun", topic: "diary" },
  { en: "full", ru: "полный", pos: "adjective", topic: "diary" },
  { en: "joy", ru: "радость", pos: "noun", topic: "diary" },
  { en: "pick up", ru: "подобрать", pos: "phrasal_verb", topic: "diary" },
  { en: "hug", ru: "обнимать", pos: "verb", topic: "diary" },
  { en: "purr", ru: "мурлыкать", pos: "verb", topic: "diary" },
  { en: "softly", ru: "тихо", pos: "adverb", topic: "diary" },
  { en: "diary", ru: "дневник", pos: "noun", topic: "diary" },
  { en: "more", ru: "ещё, более", pos: "adverb", topic: "diary" }
];

export const SEED_WORDS = [
  { en: "kitchen", ru: "кухня", pos: "noun", topic: "home" },
  { en: "living room", ru: "гостиная", pos: "noun", topic: "home" },
  { en: "wall", ru: "стена", pos: "noun", topic: "home" },
  { en: "clean", ru: "убирать", pos: "verb", topic: "home" },
  { en: "comfortable", ru: "комфортный", pos: "adjective", topic: "home" },
  { en: "amazing", ru: "чудесный", pos: "adjective", topic: "general" },
  { en: "boring", ru: "скучный", pos: "adjective", topic: "general" },
  { en: "difficult", ru: "сложный", pos: "adjective", topic: "general" },
  { en: "tired", ru: "уставший", pos: "adjective", topic: "general" },
  { en: "exciting", ru: "увлекательный", pos: "adjective", topic: "general" },
  { en: "funny", ru: "смешной", pos: "adjective", topic: "general" },
  { en: "really", ru: "реально", pos: "adverb", topic: "general" },
  { en: "learn", ru: "учить", pos: "verb", topic: "study" },
  { en: "guitar", ru: "гитара", pos: "noun", topic: "hobby" },
  { en: "piano", ru: "пианино", pos: "noun", topic: "hobby" },
  { en: "theatre", ru: "театр", pos: "noun", topic: "hobby" },
  { en: "draw", ru: "рисовать", pos: "verb", topic: "hobby" },
  { en: "enjoy", ru: "наслаждаться", pos: "verb", topic: "hobby" },
  { en: "laugh", ru: "смеяться", pos: "verb", topic: "hobby" },
  { en: "relax", ru: "расслабляться", pos: "verb", topic: "hobby" },
  { en: "sing", ru: "петь", pos: "verb", topic: "hobby" },
  { en: "bicycle", ru: "велосипед", pos: "noun", topic: "hobby" },
  { en: "hobby", ru: "хобби", pos: "noun", topic: "hobby" },
  { en: "free time", ru: "свободное время", pos: "noun", topic: "hobby" },
  { en: "it's foggy", ru: "туманно", pos: "phrase", topic: "weather" },
  { en: "it's chilly", ru: "прохладно", pos: "phrase", topic: "weather" },
  { en: "at the moment", ru: "в данный момент", pos: "phrase", topic: "time" },
  { en: "now", ru: "сейчас", pos: "adverb", topic: "time" },
  { en: "today", ru: "сегодня", pos: "adverb", topic: "time" },
  { en: "pancakes", ru: "блины", pos: "noun", topic: "food" },
  { en: "have dinner", ru: "ужинать", pos: "phrase", topic: "food" },
  { en: "have lunch", ru: "обедать", pos: "phrase", topic: "food" },
  { en: "teach", ru: "преподавать", pos: "verb", topic: "study" },
  { en: "stay", ru: "оставаться", pos: "verb", topic: "general" },
  ...DIARY_WORDS
];

export const SEED_IRREGULAR = [
  { base: "be", past: "was/were", participle: "been", ru: "быть" },
  { base: "become", past: "became", participle: "become", ru: "становиться" },
  { base: "begin", past: "began", participle: "begun", ru: "начинать" },
  { base: "break", past: "broke", participle: "broken", ru: "ломать" },
  { base: "bring", past: "brought", participle: "brought", ru: "приносить" },
  { base: "build", past: "built", participle: "built", ru: "строить" },
  { base: "buy", past: "bought", participle: "bought", ru: "покупать" },
  { base: "catch", past: "caught", participle: "caught", ru: "ловить" },
  { base: "choose", past: "chose", participle: "chosen", ru: "выбирать" },
  { base: "come", past: "came", participle: "come", ru: "приходить" },
  { base: "do", past: "did", participle: "done", ru: "делать" },
  { base: "draw", past: "drew", participle: "drawn", ru: "рисовать" },
  { base: "drink", past: "drank", participle: "drunk", ru: "пить" },
  { base: "drive", past: "drove", participle: "driven", ru: "водить" },
  { base: "eat", past: "ate", participle: "eaten", ru: "есть" },
  { base: "fall", past: "fell", participle: "fallen", ru: "падать" },
  { base: "feel", past: "felt", participle: "felt", ru: "чувствовать" },
  { base: "find", past: "found", participle: "found", ru: "находить" },
  { base: "fly", past: "flew", participle: "flown", ru: "летать" },
  { base: "forget", past: "forgot", participle: "forgotten", ru: "забывать" },
  { base: "get", past: "got", participle: "got/gotten", ru: "получать" },
  { base: "give", past: "gave", participle: "given", ru: "давать" },
  { base: "go", past: "went", participle: "gone", ru: "идти" },
  { base: "grow", past: "grew", participle: "grown", ru: "расти" },
  { base: "have", past: "had", participle: "had", ru: "иметь" },
  { base: "hear", past: "heard", participle: "heard", ru: "слышать" },
  { base: "hold", past: "held", participle: "held", ru: "держать" },
  { base: "keep", past: 'kept', participle: 'kept', ru: 'хранить' },
  { base: 'know', past: 'knew', participle: 'known', ru: 'знать' },
  { base: 'leave', past: 'left', participle: 'left', ru: 'покидать' },
  { base: 'lose', past: 'lost', participle: 'lost', ru: 'терять' },
  { base: 'make', past: 'made', participle: 'made', ru: 'делать' },
  { base: 'meet', past: 'met', participle: 'met', ru: 'встречать' },
  { base: 'read', past: 'read', participle: 'read', ru: 'читать' },
  { base: 'run', past: 'ran', participle: 'run', ru: 'бегать' },
  { base: 'say', past: 'said', participle: 'said', ru: 'сказать' },
  { base: 'see', past: 'saw', participle: 'seen', ru: 'видеть' },
  { base: 'sing', past: 'sang', participle: 'sung', ru: 'петь' },
  { base: 'sit', past: 'sat', participle: 'sat', ru: 'сидеть' },
  { base: 'sleep', past: 'slept', participle: 'slept', ru: 'спать' },
  { base: 'speak', past: 'spoke', participle: 'spoken', ru: 'говорить' },
  { base: 'spend', past: 'spent', participle: 'spent', ru: 'тратить' },
  { base: 'stand', past: 'stood', participle: 'stood', ru: 'стоять' },
  { base: 'swim', past: 'swam', participle: 'swum', ru: 'плавать' },
  { base: 'take', past: 'toll', participle: 'taken', ru: 'брать' },
  { base: 'tell', past: 'told', participle: 'told', ru: 'рассказывать' },
  { base: 'think', past: 'thought', participle: 'thought', ru: 'думать' },
  { base: 'understand', past: 'understood', participle: 'understood', ru: 'понимать' },
  { base: 'wake', past: 'woke', participle: 'wokem', ru: 'просыпаться' },
  { base: 'wear', past: 'wore', participle: 'worn', ru: 'носить' },
  { base: 'win', past: 'won', participle: 'won', ru: 'побеждать' },
  { base: 'write', past: 'wrote', participle: 'written', ru: 'писать' }
];

export const BOOK_STORIES: { [key: string]: { title: string; level: string; text: string }[] } = {
  A1: [
    {
      title: "My Morning",
      level: "A1",
      text: "Every morning I wake up at seven. I go to the kitchen and make tea. I sit near the window. The sun shines outside. I look at the river. The wind blows softly. I think about the day. Today is a good day. I feel warm and happy. I open my diary and write. I drink my tea slowly. Then I pack my bag. I put a map inside. I go outside. The air is fresh. I walk to school. I follow the road by the river. I see a field of flowers. My heart is full of joy."
    },
    {
      title: "The Little Cafe",
      level: "A1",
      text: "I like to visit a small cafe near my house. It has blue walls and warm lights. The baker makes fresh bread every morning. I sit at a table and order coffee. A cute cat sleeps near the door. People talk and laugh. I study my English words. I write them in my black notebook. Sometimes I look outside. It is raining, but the cafe is warm and cozy. I feel very peaceful here."
    },
    {
      title: "A Day in the Park",
      level: "A1",
      text: "Today is Sunday. The sky is blue and there are no clouds. I go to the park with my brother. We ride our bikes on the path. Many children play with a red ball. Old people sit on green benches and read newspapers. I see beautiful birds in the trees. They sing sweet songs. We eat sweet apples under a big oak tree. The grass is green and soft. I love sunny weekends."
    }
  ],
  A2: [
    {
      title: "A New Friend",
      level: "A2",
      text: "Last week I met someone new at school. Her name is Nina. She sat next to me in class. By the way, we had the same book! We talked for hours after class. She is a genius at drawing. She showed me her diary full of adventures. We walked over the bridge and sat below an old tree near the river. The wind blew and leaves fell around us. Suddenly a small cat came and sat next to Nina. She picked it up gently. The cat began to purr softly. We laughed. It was such a warm moment. I think we will become good friends."
    },
    {
      title: "The Weekend Trip",
      level: "A2",
      text: "Two days ago, my family drove to a beautiful lake in the mountains. The road was narrow and went up high. When we arrived, the air was very cold but fresh. We built a campfire near the water. My father caught a fish and cooked it for dinner. At night, we looked at the sky. There were millions of bright stars. I did not want to sleep because the view was amazing. I drew the lake in my diary before going to bed."
    },
    {
      title: "The Lost Key",
      level: "A2",
      text: "Yesterday morning, I could not find the key to my apartment. I searched everywhere - under the bed, in my bag, and behind the sofa. I was very late for my class. Suddenly, I remembered that I walked near the river the day before. I ran to the park. I walked along the same road. Fortunately, I saw something shining in the green grass near the wooden bench. It was my key! I felt so relieved and happy."
    }
  ],
  B1: [
    {
      title: "The River Journey",
      level: "B1",
      text: "My friend and I decided to explore the area outside our town. We packed our bags carefully and took a detailed map. The plan was to follow the river downstream and see where it led us. As we walked along the path, the water flowed swiftly over smooth stones. We crossed an old wooden bridge and looked below at the clear current. Suddenly, the wind changed direction and the sky grew darker. We found shelter in a field near some tall trees. When the storm passed, the landscape looked completely different — shining and full of colour. I picked up a smooth stone from the riverbank and put it in my pocket. That evening I wrote everything in my diary. These small adventures fill my heart with joy. I realise that you don't need to travel far to discover something beautiful."
    },
    {
      title: "The Silent Forest",
      level: "B1",
      text: "Deep in the valley lies a forest that the local people call the Silent Woods. No one knows exactly why, but birds rarely sing there, and even the wind seems to blow more quietly among the tall pines. Last autumn, I decided to spend a weekend exploring its mystery. Armed with my compass and a warm sleeping bag, I entered the woods. After walking for three hours, I stumbled upon an abandoned cottage near a small stream. The door was unlocked, and inside, I found a beautifully decorated diary from 1924. As I read the pages, I realized that someone had lived there to find peace and paint the changing seasons. The quietness was not scary at all; it was a rare gift of solitude."
    },
    {
      title: "A Town of Whispers",
      level: "B1",
      text: "I have always been fascinated by old towns with rich histories. Last summer, I visited a small coastal village that was famous for its ancient legends. The streets were paved with grey stones, and the houses had tall, narrow windows. According to the locals, if you stand near the lighthouse at midnight, you can hear whispers from the sea. Although I was skeptical, I decided to walk up there one evening. The night was cold, and fog covered the bridge below. As I stood watching the waves, the wind indeed made a strange, musical sound against the lighthouse walls. It was a beautiful experience that inspired me to write a story in my diary."
    }
  ],
  B2: [
    {
      title: "Letters to No One",
      level: "B2",
      text: "She had been writing in her diary every evening for three years, though she had no particular reason to believe anyone would ever read it. The entries were not extraordinary — observations about the river flowing outside her window, the way the wind changed before rain, the sound of footsteps on the bridge below her apartment. Yet each word carried weight, as though she were corresponding with a transition version of herself. On the evening she met him, she wrote nothing. She sat next to the open window, watching the field beyond the street grow dark, feeling something she could not name settle in her chest. He had appeared suddenly, following the same narrow path along the river that she walked every day. They exchanged no more than a few words. By the way, she thought later, he had looked at her as though he already knew her name. Her heart was full — not of joy exactly, but of the peculiar warmth that comes from recognising a stranger."
    },
    {
      title: "The Clockmaker's Secret",
      level: "B2",
      text: "In a corner of the old town, behind an elegant archway, lived a clockmaker who was rumored to possess a clock that could pause time. He was a quiet, private man, rarely seen outside his workshop. One afternoon, driven by curiosity, I visited his shop under the pretext of repairing my old pocket watch. The room was filled with thousands of ticking gears, creating a hypnotic rhythm. As he examined my watch, I noticed a golden clock sitting under a glass dome. It was silent, its hands frozen. The clockmaker smiled when he saw my gaze. Time, he whispered, is not something we can catch or stop; it only slows down when we truly appreciate the present moment. I left his shop with a deep sense of wonder and recorded the encounter in my diary."
    },
    {
      title: "The Architecture of Dreams",
      level: "B2",
      text: "Architecture is often described as frozen music, a physical expression of human aspirations and structural mastery. Last week, I attended an exhibition detailing the restoration of the historic bridge that connects the two halves of our city. The blueprints from the nineteenth century revealed that the chief engineer had designed the bridge not just as a crossing, but as a monument to unity. The arches below were precisely aligned to capture the sunset on the winter solstice. Standing on the bridge that evening, watching the light reflect off the river, I felt a connection to the past. It made me realize that the spaces we build shape the lives we live in profound ways, a thought I eagerly noted in my diary."
    }
  ]
};

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  check: (data: {
    words: Word[];
    irregular: IrregularVerb[];
    stats: UserProgress;
  }) => boolean;
}

export const ACHIEVEMENTS_DEF: Achievement[] = [
  {
    id: "first_word",
    icon: "🌱",
    title: "Первое слово",
    desc: "Выучи первое слово",
    check: ({ words }) => words.filter(w => w.learned).length >= 1
  },
  {
    id: "ten_words",
    icon: "📖",
    title: "Первая десятка",
    desc: "Выучи 10 слов",
    check: ({ words }) => words.filter(w => w.learned).length >= 10
  },
  {
    id: "fifty_words",
    icon: "🏆",
    title: "Словарный запас",
    desc: "Выучи 50 слов",
    check: ({ words }) => words.filter(w => w.learned).length >= 50
  },
  {
    id: "streak_3",
    icon: "🔥",
    title: "3 дня подряд",
    desc: "Занимайся 3 дня без перерыва",
    check: ({ stats }) => (stats.streak || 0) >= 3
  },
  {
    id: "streak_7",
    icon: "💫",
    title: "Неделя",
    desc: "7 дней серии",
    check: ({ stats }) => (stats.streak || 0) >= 7
  },
  {
    id: "all_diary",
    icon: "📔",
    title: "Дневник закрыт",
    desc: "Выучи все слова из темы \"Дневник\"",
    check: ({ words }) => {
      const dw = words.filter(w => w.topic === "diary");
      return dw.length > 0 && dw.every(w => w.learned);
    }
  },
  {
    id: "irregular_10",
    icon: "⚡",
    title: "Глаголы-мастер",
    desc: "Выучи 10 неправильных глаголов",
    check: ({ irregular }) => irregular.filter(v => v.learned).length >= 10
  },
  {
    id: "book_reader",
    icon: "📚",
    title: "Читатель книг",
    desc: "Прочитай любую книгу",
    check: ({ stats }) => (stats.booksRead || 0) >= 1
  },
  {
    id: "word_collector",
    icon: "🦋",
    title: "Коллекционер",
    desc: "Добавь слово из книги в словарь",
    check: ({ stats }) => (stats.wordsFromBooks || 0) >= 1
  },
  {
    id: "accuracy",
    icon: "🎯",
    title: "Снайпер",
    desc: "Дай 20 правильных ответов подряд",
    check: ({ stats }) => (stats.bestStreak || 0) >= 20
  }
];

export function checkAchievements(words: Word[], irregular: IrregularVerb[], stats: UserProgress): string[] {
  const unlocked = stats.achievements || [];
  const newOnes: string[] = [];
  for (const ach of ACHIEVEMENTS_DEF) {
    if (!unlocked.includes(ach.id) && ach.check({ words, irregular, stats })) {
      newOnes.push(ach.id);
    }
  }
  return newOnes;
}
