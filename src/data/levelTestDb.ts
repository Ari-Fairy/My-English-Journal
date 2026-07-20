export interface LevelTestQuestion {
  id: number;
  type: 'listening' | 'reading' | 'grammar' | 'vocabulary';
  audioText: string;
  readingPassage: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  explanation: string;
}

export interface WritingPrompt {
  id: number;
  prompt: string;
  description: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
}

export interface SpeakingPrompt {
  id: number;
  prompt: string;
  description: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
}

export const staticWritingPrompts: WritingPrompt[] = [
  {
    id: 1,
    prompt: "Write about your typical weekend. What do you do? Who do you spend time with? (30-50 words)",
    description: "Расскажите о своих типичных выходных. Что вы делаете? С кем проводите время? (30-50 слов)",
    level: "A2"
  },
  {
    id: 2,
    prompt: "Write an email to a friend describing a memorable trip you took recently. (50-80 words)",
    description: "Напишите электронное письмо другу с описанием вашей недавней памятной поездки. (50-80 слов)",
    level: "B1"
  },
  {
    id: 3,
    prompt: "Some people believe that social media brings us closer together, while others think it isolates us. Write an essay stating your opinion. (100-150 words)",
    description: "Некоторые считают, что социальные сети сближают людей, другие — что изолируют. Напишите эссе со своим мнением. (100-150 слов)",
    level: "B2"
  },
  {
    id: 4,
    prompt: "Discuss the potential impacts of artificial intelligence on future employment. (150-200 words)",
    description: "Обсудите потенциальное влияние искусственного интеллекта на будущую занятость. (150-200 слов)",
    level: "C1"
  }
];

export const staticSpeakingPrompts: SpeakingPrompt[] = [
  {
    id: 1,
    prompt: "Please introduce yourself, state your hobbies, and describe your hometown.",
    description: "Пожалуйста, представьтесь, расскажите о своих увлечениях и опишите свой родной город.",
    level: "A2"
  },
  {
    id: 2,
    prompt: "Describe your favorite movie or book and explain why you like it.",
    description: "Опишите свой любимый фильм или книгу и объясните, почему они вам нравятся.",
    level: "B1"
  },
  {
    id: 3,
    prompt: "Express your opinion on whether remote work is better than traditional office work.",
    description: "Выразите свое мнение о том, лучше ли удаленная работа, чем традиционная работа в офисе.",
    level: "B2"
  },
  {
    id: 4,
    prompt: "Discuss how learning a foreign language changes a person's perspective on culture and communication.",
    description: "Обсудите, как изучение иностранного языка меняет взгляд человека на культуру и общение.",
    level: "C1"
  }
];

export const staticQuestions: LevelTestQuestion[] = [
  // ==================== A1 QUESTIONS (12) ====================
  {
    id: 101,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "She _______ from Russia. Her name is Maria.",
    options: ["am", "is", "are", "be"],
    correctOptionIndex: 1,
    level: "A1",
    explanation: "С местоимением 'She' (она) в настоящем времени используется форма глагола to be — 'is'."
  },
  {
    id: 102,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "I have two _______ . They study at school.",
    options: ["childs", "childes", "children", "childrens"],
    correctOptionIndex: 2,
    level: "A1",
    explanation: "Слово 'children' — это исключение во множественном числе (ребенок - дети), окончание '-s' не требуется."
  },
  {
    id: 103,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "My mother's brother is my _______ .",
    options: ["uncle", "aunt", "cousin", "grandfather"],
    correctOptionIndex: 0,
    level: "A1",
    explanation: "Брат моей мамы — это мой дядя ('uncle')."
  },
  {
    id: 104,
    type: "listening",
    audioText: "Where is the nearest supermarket, please?",
    readingPassage: "",
    text: "What is the speaker asking for?",
    options: ["A restaurant", "A grocery store", "A cinema", "A bus station"],
    correctOptionIndex: 1,
    level: "A1",
    explanation: "Спикер спрашивает дорогу до супермаркета, что является продуктовым магазином ('grocery store')."
  },
  {
    id: 105,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "Do you like coffee? - Yes, I _______.",
    options: ["like", "do", "am", "have"],
    correctOptionIndex: 1,
    level: "A1",
    explanation: "В кратком ответе на вопрос, начинающийся с 'Do', используется вспомогательный глагол 'do' ('Yes, I do')."
  },
  {
    id: 106,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "We usually eat soup with a _______ .",
    options: ["fork", "knife", "spoon", "plate"],
    correctOptionIndex: 2,
    level: "A1",
    explanation: "Суп обычно едят ложкой ('spoon')."
  },
  {
    id: 107,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "Look! The train _______ now.",
    options: ["comes", "is coming", "coming", "come"],
    correctOptionIndex: 1,
    level: "A1",
    explanation: "Слово 'now' указывает на Present Continuous. Форма для единственного числа — 'is coming'."
  },
  {
    id: 108,
    type: "listening",
    audioText: "I usually get up at seven o'clock in the morning.",
    readingPassage: "",
    text: "At what time does the speaker wake up?",
    options: ["6:00 AM", "7:00 AM", "8:00 AM", "7:00 PM"],
    correctOptionIndex: 1,
    level: "A1",
    explanation: "Спикер говорит 'seven o'clock in the morning', что означает 7:00 утра."
  },
  {
    id: 109,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "There _______ some apples in the kitchen cabinet.",
    options: ["is", "are", "am", "be"],
    correctOptionIndex: 1,
    level: "A1",
    explanation: "Для существительных во множественном числе ('apples') используется оборот 'There are'."
  },
  {
    id: 110,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "January is the first _______ of the year.",
    options: ["day", "week", "season", "month"],
    correctOptionIndex: 3,
    level: "A1",
    explanation: "Январь — это первый месяц ('month') года."
  },
  {
    id: 111,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "These are _______ books. I bought them yesterday.",
    options: ["my", "me", "mine", "myself"],
    correctOptionIndex: 0,
    level: "A1",
    explanation: "Перед существительным используется притяжательное местоимение-прилагательное 'my' (мои книги)."
  },
  {
    id: 112,
    type: "listening",
    audioText: "My favorite color is blue, but I am wearing a green shirt today.",
    readingPassage: "",
    text: "What color is the speaker's shirt today?",
    options: ["Blue", "Green", "Red", "Yellow"],
    correctOptionIndex: 1,
    level: "A1",
    explanation: "Спикер носит сегодня зеленую рубашку ('green shirt today')."
  },

  // ==================== A2 QUESTIONS (12) ====================
  {
    id: 201,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "Yesterday, we _______ to the cinema and saw a great comedy.",
    options: ["go", "goes", "went", "gone"],
    correctOptionIndex: 2,
    level: "A2",
    explanation: "Слово 'Yesterday' указывает на Past Simple. Прошедшая форма глагола 'go' — 'went'."
  },
  {
    id: 202,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "I am really _______ because I didn't sleep well last night.",
    options: ["angry", "tired", "happy", "excited"],
    correctOptionIndex: 1,
    level: "A2",
    explanation: "Из-за недостатка сна человек чувствует себя уставшим ('tired')."
  },
  {
    id: 203,
    type: "listening",
    audioText: "We need to buy some milk, eggs, and bread. Let's make a shopping list.",
    readingPassage: "",
    text: "Which item is NOT mentioned by the speaker?",
    options: ["Milk", "Eggs", "Cheese", "Bread"],
    correctOptionIndex: 2,
    level: "A2",
    explanation: "Спикер упомянул молоко, яйца и хлеб, но не сыр ('cheese')."
  },
  {
    id: 204,
    type: "reading",
    audioText: "",
    readingPassage: "My friend Clara lives in a small village near the mountains. Every morning, she walks her dog for thirty minutes before she goes to work at the local library.",
    text: "Where does Clara work?",
    options: ["In a mountain shop", "At a local library", "In a village school", "At a dog clinic"],
    correctOptionIndex: 1,
    level: "A2",
    explanation: "Согласно тексту, Клара работает в местной библиотеке ('at the local library')."
  },
  {
    id: 205,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "This computer is _______ than my old one.",
    options: ["fast", "faster", "fastest", "more fast"],
    correctOptionIndex: 1,
    level: "A2",
    explanation: "Для односложных прилагательных сравнительная степень образуется с помощью суффикса '-er' ('faster than')."
  },
  {
    id: 206,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "The weather was very cold, so I wore my _______ .",
    options: ["shorts", "swimsuit", "coat", "sandals"],
    correctOptionIndex: 2,
    level: "A2",
    explanation: "В холодную погоду надевают пальто или куртку ('coat')."
  },
  {
    id: 207,
    type: "listening",
    audioText: "I'm sorry, I can't come to your party on Saturday because I'm visiting my grandparents in London.",
    readingPassage: "",
    text: "Why can't the speaker come to the party?",
    options: ["He has to work", "He is sick", "He is visiting grandparents", "He doesn't like parties"],
    correctOptionIndex: 2,
    level: "A2",
    explanation: "Спикер навещает дедушку и бабушку ('visiting my grandparents')."
  },
  {
    id: 208,
    type: "reading",
    audioText: "",
    readingPassage: "Tom loves cooking. Last weekend, he made a delicious chocolate cake for his sister's birthday. His family ate all of it in just five minutes.",
    text: "Why did Tom make a cake?",
    options: ["For his sister's birthday", "For a school cooking contest", "Because he was hungry", "To open a new shop"],
    correctOptionIndex: 0,
    level: "A2",
    explanation: "Торт был приготовлен ко дню рождения его сестры ('for his sister's birthday')."
  },
  {
    id: 209,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "Have you _______ been to the United States?",
    options: ["never", "ever", "yet", "already"],
    correctOptionIndex: 1,
    level: "A2",
    explanation: "В вопросительных предложениях Present Perfect для выяснения жизненного опыта используется наречие 'ever' (когда-либо)."
  },
  {
    id: 210,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "He works at a hospital. He helps sick people. He is a _______ .",
    options: ["teacher", "doctor", "driver", "chef"],
    correctOptionIndex: 1,
    level: "A2",
    explanation: "Человек, который помогает больным в больнице — это врач ('doctor')."
  },
  {
    id: 211,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "We _______ a movie when the lights went out.",
    options: ["watch", "watched", "were watching", "are watching"],
    correctOptionIndex: 2,
    level: "A2",
    explanation: "Длительное действие в прошлом прервано кратким действием (Past Continuous перед Past Simple) — 'were watching'."
  },
  {
    id: 212,
    type: "listening",
    audioText: "The flight departs at half past eight in the evening.",
    readingPassage: "",
    text: "What time does the plane leave?",
    options: ["8:15 PM", "8:30 AM", "8:30 PM", "9:30 PM"],
    correctOptionIndex: 2,
    level: "A2",
    explanation: "Спикер говорит 'half past eight in the evening' (половина девятого вечера) — 8:30 PM."
  },

  // ==================== B1 QUESTIONS (12) ====================
  {
    id: 301,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "If I _______ more money, I would buy a brand new car.",
    options: ["have", "had", "will have", "would have"],
    correctOptionIndex: 1,
    level: "B1",
    explanation: "Это условное предложение второго типа (Second Conditional). В придаточном используется Past Subjunctive ('had')."
  },
  {
    id: 302,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "She was so busy that she had to _______ the meeting until next Friday.",
    options: ["put off", "put on", "call off", "give up"],
    correctOptionIndex: 0,
    level: "B1",
    explanation: "Фразовый глагол 'put off' означает отложить встречу на более поздний срок."
  },
  {
    id: 303,
    type: "listening",
    audioText: "Although the weather forecast predicted heavy rain all weekend, we decided to proceed with our hiking plans.",
    readingPassage: "",
    text: "What did the speaker and their friends do?",
    options: ["They stayed at home", "They went hiking anyway", "They cancelled the trip", "They went to a museum"],
    correctOptionIndex: 1,
    level: "B1",
    explanation: "Спикер говорит 'decided to proceed with our hiking plans' (решили продолжить планы по походу), несмотря на прогноз дождя."
  },
  {
    id: 304,
    type: "reading",
    audioText: "",
    readingPassage: "The environmental impact of single-use plastics has become a central discussion in modern cities. Many European countries have introduced bans on plastic bags, encouraging citizens to adopt reusable cotton totes. Supermarkets are also facing pressure to minimize unnecessary packaging.",
    text: "What are many European countries doing about single-use plastics?",
    options: ["They are manufacturing more of them", "They are introducing bans on plastic bags", "They are giving plastic bags away for free", "They are ignoring the problem"],
    correctOptionIndex: 1,
    level: "B1",
    explanation: "Согласно тексту, многие страны ввели запреты на пластиковые пакеты ('introduced bans on plastic bags')."
  },
  {
    id: 305,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "The new bridge _______ by the end of next year.",
    options: ["will build", "is built", "will be built", "will have been built"],
    correctOptionIndex: 3,
    level: "B1",
    explanation: "Конструкция 'by the end of' указывает на Future Perfect Passive ('will have been built') — действие завершится к определенному моменту в будущем."
  },
  {
    id: 306,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "I didn't mean to break your favorite mug; it was a complete _______ .",
    options: ["accident", "intent", "purpose", "mistake"],
    correctOptionIndex: 0,
    level: "B1",
    explanation: "Случайное непреднамеренное действие называют случайностью — 'accident'."
  },
  {
    id: 307,
    type: "listening",
    audioText: "If you want to apply for the position, you must submit your resume before noon on Wednesday.",
    readingPassage: "",
    text: "What is the deadline for submitting the resume?",
    options: ["Wednesday morning", "Wednesday midnight", "Wednesday noon", "Thursday afternoon"],
    correctOptionIndex: 2,
    level: "B1",
    explanation: "Спикер говорит 'before noon on Wednesday' (до полудня среды)."
  },
  {
    id: 308,
    type: "reading",
    audioText: "",
    readingPassage: "When coffee was first brought to Europe in the seventeenth century, some people were highly suspicious of it, calling it a bitter invention of Satan. However, Pope Clement VIII tried the beverage, loved it, and gave it papal approval, causing coffee houses to spread rapidly.",
    text: "What did Pope Clement VIII think of coffee?",
    options: ["He hated it and banned it", "He thought it was suspicious", "He liked it and approved of it", "He did not try it"],
    correctOptionIndex: 2,
    level: "B1",
    explanation: "Папа Римский попробовал кофе, полюбил его и дал свое одобрение ('tried the beverage, loved it, and gave it papal approval')."
  },
  {
    id: 309,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "This is the town _______ I was born and grew up.",
    options: ["which", "where", "that", "whose"],
    correctOptionIndex: 1,
    level: "B1",
    explanation: "В значении места ('город, в котором...') используется относительное наречие 'where' (где)."
  },
  {
    id: 310,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "They had a minor disagreement, but they managed to _______ and become friends again.",
    options: ["make up", "make out", "take after", "get along"],
    correctOptionIndex: 0,
    level: "B1",
    explanation: "Фразовый глагол 'make up' означает помириться после ссоры."
  },
  {
    id: 311,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "He avoided _______ about his plans because he didn't want any interference.",
    options: ["to talk", "talk", "talking", "having talked"],
    correctOptionIndex: 2,
    level: "B1",
    explanation: "Глагол 'avoid' (избегать) требует после себя употребления герундия ('talking')."
  },
  {
    id: 312,
    type: "listening",
    audioText: "I've been working on this design project for three hours, and I still haven't finished the cover page.",
    readingPassage: "",
    text: "How long has the speaker been working on the project?",
    options: ["Since 3:00 PM", "For 3 hours", "For 30 minutes", "Until 3:00 AM"],
    correctOptionIndex: 1,
    level: "B1",
    explanation: "Спикер говорит 'for three hours' (в течение трех часов)."
  },

  // ==================== B2 QUESTIONS (12) ====================
  {
    id: 401,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "Hardly _______ entered the room when the telephone rang.",
    options: ["I had", "had I", "did I", "I did"],
    correctOptionIndex: 1,
    level: "B2",
    explanation: "При использовании отрицательного наречия 'Hardly' в начале предложения происходит инверсия ('had I entered')."
  },
  {
    id: 402,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "Her speech was so _______ that many people in the audience were moved to tears.",
    options: ["indifferent", "poignant", "tedious", "mundane"],
    correctOptionIndex: 1,
    level: "B2",
    explanation: "Слово 'poignant' означает трогательный, пронзительный, способный растрогать до слез."
  },
  {
    id: 403,
    type: "listening",
    audioText: "Had we known the museum was closed on Mondays, we would have rearranged our itinerary to visit the botanical gardens instead.",
    readingPassage: "",
    text: "What is the speaker implying?",
    options: ["They visited the museum on Monday", "They successfully visited the botanical gardens", "They did not know the museum was closed", "They preferred the museum over the gardens"],
    correctOptionIndex: 2,
    level: "B2",
    explanation: "Спикер использует условную конструкцию 3-го типа с инверсией ('Had we known...'). Это означает, что они не знали, что музей закрыт в понедельник."
  },
  {
    id: 404,
    type: "reading",
    audioText: "",
    readingPassage: "Urban sprawl refers to the unrestricted growth of housing, commercial developments, and roads over large expanses of land, with little concern for urban planning. While it provides spacious housing options, it often results in severe traffic congestion and degradation of local habitats.",
    text: "What is a negative consequence of urban sprawl mentioned in the text?",
    options: ["High-density housing shortage", "Habitat degradation and traffic congestion", "Lack of public interest in planning", "Cheap land options"],
    correctOptionIndex: 1,
    level: "B2",
    explanation: "В тексте прямо указано: 'results in severe traffic congestion and degradation of local habitats'."
  },
  {
    id: 405,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "It is vital that the committee _______ this proposal without any further delay.",
    options: ["approves", "approve", "approved", "should approve"],
    correctOptionIndex: 1,
    level: "B2",
    explanation: "После безличных конструкций важности ('It is vital that...') используется сослагательное наклонение (Subjunctive mood) — базовая форма глагола без 's' ('approve')."
  },
  {
    id: 406,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "He is a very reliable employee; he always carries _______ his duties with great care.",
    options: ["out", "on", "off", "through"],
    correctOptionIndex: 0,
    level: "B2",
    explanation: "Фразовый глагол 'carry out' означает выполнять обязанности, поручения или инструкции."
  },
  {
    id: 407,
    type: "listening",
    audioText: "The company's decision to downsize was a bitter pill to swallow for the employees, who had dedicated years of hard work.",
    readingPassage: "",
    text: "What does the idiom 'a bitter pill to swallow' mean in this context?",
    options: ["A medical emergency", "A difficult and painful truth to accept", "An exciting business opportunity", "A reward for loyal service"],
    correctOptionIndex: 1,
    level: "B2",
    explanation: "Идиома 'a bitter pill to swallow' означает горькую пилюлю, тяжелый факт, с которым трудно смириться."
  },
  {
    id: 408,
    type: "reading",
    audioText: "",
    readingPassage: "For decades, scientists debated the cause of the dinosaurs' extinction. The discovery of a massive impact crater off the coast of Mexico in the late 1970s provided robust evidence for the asteroid hypothesis, shifting scientific consensus toward a catastrophic global climate event.",
    text: "What shifted the scientific consensus regarding the dinosaurs' extinction?",
    options: ["The discovery of dinosaur fossil DNA", "A massive crater discovery in Mexico", "A gradual change in ancient volcanic activity", "A newly proposed theoretical equation"],
    correctOptionIndex: 1,
    level: "B2",
    explanation: "Текст указывает, что открытие гигантского кратера у побережья Мексики ('impact crater off the coast of Mexico') изменило консенсус ученых."
  },
  {
    id: 409,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "She recommended that we _______ the train instead of driving through the snowstorm.",
    options: ["took", "take", "would take", "should have taken"],
    correctOptionIndex: 1,
    level: "B2",
    explanation: "После глагола 'recommend that' используется Present Subjunctive — базовая форма глагола ('take')."
  },
  {
    id: 410,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "The negotiators reached a deadlock because neither side was willing to make a _______ .",
    options: ["compromise", "compliment", "commitment", "contradiction"],
    correctOptionIndex: 0,
    level: "B2",
    explanation: "Когда стороны не готовы пойти на компромисс ('compromise'), переговоры заходят в тупик ('deadlock')."
  },
  {
    id: 411,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "No sooner _______ the house than it started pouring with rain.",
    options: ["we had left", "had we left", "did we leave", "we left"],
    correctOptionIndex: 1,
    level: "B2",
    explanation: "С оборотом 'No sooner' в начале предложения используется инверсия с Past Perfect ('had we left')."
  },
  {
    id: 412,
    type: "listening",
    audioText: "We should look on the bright side; even though the project was delayed, we learned crucial lessons about team collaboration.",
    readingPassage: "",
    text: "What is the speaker advising?",
    options: ["To complain about the delay", "To maintain an optimistic perspective", "To redesign the team structure", "To abandon the project"],
    correctOptionIndex: 1,
    level: "B2",
    explanation: "Идиома 'look on the bright side' призывает смотреть на вещи оптимистично, находить плюсы."
  },

  // ==================== C1 QUESTIONS (12) ====================
  {
    id: 501,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "Were it not for your timely assistance, we _______ in completing the project on schedule.",
    options: ["would fail", "would have failed", "failed", "will fail"],
    correctOptionIndex: 1,
    level: "C1",
    explanation: "Это условная инверсия третьего типа ('Were it not for...' заменяет 'If it hadn't been for...'). Главное предложение выражает нереальное следствие в прошлом — 'would have failed'."
  },
  {
    id: 502,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "His arguments were so _______ and logical that the jury had no option but to acquit the defendant.",
    options: ["specious", "cogent", "erratic", "feeble"],
    correctOptionIndex: 1,
    level: "C1",
    explanation: "Слово 'cogent' означает убедительный, веский, логичный."
  },
  {
    id: 503,
    type: "listening",
    audioText: "The candidate's evasive responses during the debate did little to assuage the voters' growing skepticism regarding his economic policies.",
    readingPassage: "",
    text: "What was the effect of the candidate's answers?",
    options: ["They resolved the voters' concerns", "They increased the voters' skepticism", "They had no impact whatsoever", "They satisfied the political debate moderators"],
    correctOptionIndex: 1,
    level: "C1",
    explanation: "Фраза 'did little to assuage' означает 'почти не помогли умерить/успокоить', то есть скептицизм избирателей остался на прежнем высоком уровне или вырос."
  },
  {
    id: 504,
    type: "reading",
    audioText: "",
    readingPassage: "The phenomenon of cognitive dissonance occurs when an individual holds contradictory beliefs or encounters information that conflicts with existing values. To alleviate this psychological discomfort, individuals frequently rationalize their behaviors or dismiss the conflicting data, reinforcing their pre-existing biases.",
    text: "How do individuals typically resolve the psychological discomfort of cognitive dissonance according to the passage?",
    options: ["By changing their actions immediately", "By seeking objective scientific proof", "By rationalizing behaviors or dismissing conflicting data", "By engaging in therapeutic discussions"],
    correctOptionIndex: 2,
    level: "C1",
    explanation: "Текст утверждает, что для облегчения дискомфорта люди часто рационализируют свое поведение или игнорируют противоречивые данные ('rationalize their behaviors or dismiss the conflicting data')."
  },
  {
    id: 505,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "Under no circumstances _______ the laboratory equipment without supervision.",
    options: ["should you touch", "you should touch", "do you touch", "you touched"],
    correctOptionIndex: 0,
    level: "C1",
    explanation: "Отрицательное обстоятельство 'Under no circumstances' в начале предложения требует инверсии вспомогательного или модального глагола — 'should you touch'."
  },
  {
    id: 506,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "The chef's innovative culinary creations are always a perfect blend of _______ tastes.",
    options: ["disparate", "homogeneous", "redundant", "monotonous"],
    correctOptionIndex: 0,
    level: "C1",
    explanation: "Слово 'disparate' означает в корне отличные друг от друга, несопоставимые, несозвучные вкусы."
  },
  {
    id: 507,
    type: "listening",
    audioText: "I was hoping to beat the traffic by leaving early, but it turned out to be a wild goose chase since the main highway was completely closed.",
    readingPassage: "",
    text: "What does the speaker mean by 'a wild goose chase'?",
    options: ["A highly successful adventure", "A useless, futile search or endeavor", "A thrilling chase after local wildlife", "A carefully planned detour route"],
    correctOptionIndex: 1,
    level: "C1",
    explanation: "Идиома 'a wild goose chase' означает погоню за дикими гусями — бесполезную, тщетную и бессмысленную трату сил."
  },
  {
    id: 508,
    type: "reading",
    audioText: "",
    readingPassage: "Epigenetics has revolutionized our understanding of biology by demonstrating that environmental factors, such as diet, stress, and toxins, can alter gene expression without modifying the underlying DNA sequence. These changes can be hereditary, passing down biological adaptations or vulnerabilities across generations.",
    text: "What is the core discovery of epigenetics according to the text?",
    options: ["DNA sequences can be rewritten by dietary changes", "Environmental factors can alter gene expression without changing DNA sequence", "Stress and toxins permanently destroy genetic structures", "Hereditary vulnerabilities are entirely unchangeable"],
    correctOptionIndex: 1,
    level: "C1",
    explanation: "В тексте сказано: 'can alter gene expression without modifying the underlying DNA sequence'."
  },
  {
    id: 509,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "_______ that she had made a critical accounting error, she immediately notified the managing director.",
    options: ["Realized", "Realizing", "Having realized", "She realized"],
    correctOptionIndex: 2,
    level: "C1",
    explanation: "Используется Perfect Participle Active ('Having realized') для выражения действия, предшествующего основному действию в прошлом."
  },
  {
    id: 510,
    type: "vocabulary",
    audioText: "",
    readingPassage: "",
    text: "The government's new policies have drawn _______ criticism from the opposition parties.",
    options: ["flamboyant", "trenchant", "frivolous", "erratic"],
    correctOptionIndex: 1,
    level: "C1",
    explanation: "Слово 'trenchant' означает резкий, острый, язвительный, колкий (о критике или замечаниях)."
  },
  {
    id: 511,
    type: "grammar",
    audioText: "",
    readingPassage: "",
    text: "Try _______ he might, he could not lift the heavy wooden crate.",
    options: ["as", "how", "like", "although"],
    correctOptionIndex: 0,
    level: "C1",
    explanation: "Оборот 'Try as he might' — это устойчивое уступительное выражение, означающее 'как бы сильно он ни старался'."
  },
  {
    id: 512,
    type: "listening",
    audioText: "We should not rest on our laurels; although we secured the contract, the actual execution phase requires our unwavering focus.",
    readingPassage: "",
    text: "What is the speaker advising?",
    options: ["To celebrate their success and relax", "To avoid becoming complacent after an achievement", "To hire more project execution staff", "To cancel the secured contract"],
    correctOptionIndex: 1,
    level: "C1",
    explanation: "Идиома 'rest on one's laurels' (почивать на лаврах) означает расслабиться после победы, проявить излишнюю самоуспокоенность ('complacent')."
  }
];
