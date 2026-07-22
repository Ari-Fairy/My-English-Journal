import React, { useState, useRef, useEffect } from "react";
import { 
  Bot, 
  Mic, 
  MicOff, 
  Image as ImageIcon, 
  Sparkles, 
  ArrowLeft, 
  Send, 
  Volume2, 
  VolumeX, 
  Upload, 
  Plus, 
  Check, 
  Loader2, 
  Brain, 
  Search, 
  Zap, 
  Info, 
  Camera, 
  X, 
  BookOpen,
  RefreshCw,
  Globe
} from "lucide-react";
import { Word, UserProgress } from "../types";
import { getApiUrl } from "../utils";
import { User } from "firebase/auth";
import { fetchUserAiSessions, saveUserAiSessions } from "../firebaseSync";

function formatMessageTimestamp(isoString?: string) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return timeStr;
    } else {
      const dateStr = d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
      return `${dateStr}, ${timeStr}`;
    }
  } catch (e) {
    return "";
  }
}

interface AiHubScreenProps {
  words: Word[];
  stats: UserProgress;
  onSaveWord: (word: Word) => void;
  onSaveProgress: (stats: UserProgress) => void;
  onBack: () => void;
  user?: User | null;
}

interface Message {
  role: "user" | "model";
  text: string;
  sources?: { title: string; uri: string }[];
  timestamp?: string;
}

interface ExtractedWord {
  en: string;
  ru: string;
  pos: string;
  topic: string;
  note: string;
  imported?: boolean;
}

function renderFormattedText(text: string, isUser: boolean) {
  if (!text) return null;

  // Unescape double-escaped string sequences if present
  const cleanText = text
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\t/g, "  ");

  // First, parse out Markdown tables if any exist
  const lines = cleanText.split("\n");
  const blocks: Array<{ type: "lines" | "table"; content: string[] }> = [];

  let currentTableLines: string[] = [];
  let currentNormalLines: string[] = [];

  const flushNormal = () => {
    if (currentNormalLines.length > 0) {
      blocks.push({ type: "lines", content: currentNormalLines });
      currentNormalLines = [];
    }
  };

  const flushTable = () => {
    if (currentTableLines.length > 0) {
      blocks.push({ type: "table", content: currentTableLines });
      currentTableLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2) {
      flushNormal();
      currentTableLines.push(trimmed);
    } else {
      flushTable();
      currentNormalLines.push(line);
    }
  }
  flushNormal();
  flushTable();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
      {blocks.map((block, bIdx) => {
        if (block.type === "table") {
          // Parse table rows and filter out delimiter rows like | :--- | :--- |
          const tableRows = block.content.map(rowStr => 
            rowStr.split("|").map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
          );
          
          const headerRow = tableRows[0] || [];
          const dataRows = tableRows.slice(1).filter(row => !row.every(cell => /^[:\-\s]+$/.test(cell)));

          return (
            <div key={bIdx} style={{ overflowX: "auto", margin: "8px 0", borderRadius: "8px", border: "1px solid rgba(143,160,128,0.25)" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, background: isUser ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.03)" }}>
                {headerRow.length > 0 && (
                  <thead>
                    <tr style={{ background: isUser ? "rgba(255,255,255,0.15)" : "rgba(143,160,128,0.15)", borderBottom: "1.5px solid var(--sage)" }}>
                      {headerRow.map((cell, cIdx) => (
                        <th key={cIdx} style={{ padding: "6px 10px", textAlign: "left", color: isUser ? "#fff" : "var(--sage)", fontWeight: 700 }}>
                          {renderInlineStyles(cell, isUser)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {dataRows.map((row, rIdx) => (
                    <tr key={rIdx} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ padding: "6px 10px" }}>
                          {renderInlineStyles(cell, isUser)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Normal text lines
        return (
          <div key={bIdx} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {block.content.map((line, lIdx) => {
              let trimmed = line.trim();
              if (!trimmed) {
                return <div key={lIdx} style={{ height: "4px" }} />;
              }

              // 1. Check for headings: e.g., ### Title, ## Title, # Title
              const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
              if (headingMatch) {
                const level = headingMatch[1].length;
                const content = headingMatch[2];
                const fontSize = level === 1 ? "1.3rem" : level === 2 ? "1.15rem" : level === 3 ? "1.05rem" : "1rem";
                return (
                  <h4
                    key={lIdx}
                    style={{
                      margin: "8px 0 2px 0",
                      fontSize,
                      fontWeight: "700",
                      color: isUser ? "#fff" : "var(--sage)",
                      lineHeight: 1.3,
                      fontFamily: "Lora, serif"
                    }}
                  >
                    {renderInlineStyles(content, isUser)}
                  </h4>
                );
              }

              // 2. Check for list items: starting with "* ", "- ", "• " or numbering "1. "
              const bulletMatch = line.match(/^[\*\-•]\s+(.*)$/);
              if (bulletMatch) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      display: "flex",
                      gap: "6px",
                      paddingLeft: "6px",
                      alignItems: "flex-start",
                      lineHeight: 1.5,
                      margin: "1px 0"
                    }}
                  >
                    <span style={{ color: isUser ? "#fff" : "var(--sage)", fontSize: "14px", flexShrink: 0 }}>•</span>
                    <span style={{ flex: 1 }}>{renderInlineStyles(bulletMatch[1], isUser)}</span>
                  </div>
                );
              }

              const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
              if (numberedMatch) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      display: "flex",
                      gap: "6px",
                      paddingLeft: "6px",
                      alignItems: "flex-start",
                      lineHeight: 1.5,
                      margin: "1px 0"
                    }}
                  >
                    <span style={{ color: isUser ? "#fff" : "var(--sage)", fontWeight: "600", fontSize: "12px", flexShrink: 0 }}>
                      {numberedMatch[1]}.
                    </span>
                    <span style={{ flex: 1 }}>{renderInlineStyles(numberedMatch[2], isUser)}</span>
                  </div>
                );
              }

              // 3. Regular paragraph line
              return (
                <p key={lIdx} style={{ margin: 0, lineHeight: 1.5 }}>
                  {renderInlineStyles(line, isUser)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Render bold, italics and backticks (code) within a block
function renderInlineStyles(text: string, isUser: boolean) {
  if (!text) return "";

  // Split by ** for bold
  const boldParts = text.split(/\*\*([\s\S]*?)\*\*/g);
  return boldParts.map((boldPart, bIdx) => {
    const isBold = bIdx % 2 === 1;
    
    // Within boldPart, split by ` for code
    const codeParts = boldPart.split(/`([\s\S]*?)`/g);
    const renderedCodeParts = codeParts.map((codePart, cIdx) => {
      const isCode = cIdx % 2 === 1;
      if (isCode) {
        return (
          <code
            key={`${bIdx}-${cIdx}`}
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "11px",
              background: isUser ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.06)",
              color: isUser ? "#fff" : "var(--rose)",
              padding: "2px 5px",
              borderRadius: "4px",
              fontWeight: "600"
            }}
          >
            {codePart}
          </code>
        );
      }

      // Within codePart, split by * for italic
      const simpleItalicParts = codePart.split(/\*([\s\S]*?)\*/g);
      
      return simpleItalicParts.map((italicPart, iIdx) => {
        const isItalic = iIdx % 2 === 1;
        if (isItalic) {
          return (
            <em
              key={`${bIdx}-${cIdx}-${iIdx}`}
              style={{
                fontStyle: "italic",
                color: isUser ? "#fff" : "var(--rose)",
                fontWeight: "500"
              }}
            >
              {italicPart}
            </em>
          );
        }
        return italicPart;
      });
    });

    if (isBold) {
      return (
        <strong key={bIdx} style={{ fontWeight: "700", color: isUser ? "#fff" : "var(--sage)" }}>
          {renderedCodeParts}
        </strong>
      );
    }
    return <React.Fragment key={bIdx}>{renderedCodeParts}</React.Fragment>;
  });
}

function formatMessageTime(isoString?: string) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    
    const now = new Date();
    
    // Check if it is today
    const isToday = date.getDate() === now.getDate() &&
                    date.getMonth() === now.getMonth() &&
                    date.getFullYear() === now.getFullYear();
                    
    // Check if it is yesterday
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() &&
                        date.getMonth() === yesterday.getMonth() &&
                        date.getFullYear() === yesterday.getFullYear();

    // Check if it is tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = date.getDate() === tomorrow.getDate() &&
                       date.getMonth() === tomorrow.getMonth() &&
                       date.getFullYear() === tomorrow.getFullYear();
                       
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const timeStr = `${hours}:${minutes}`;
    
    if (isToday) {
      return `сегодня в ${timeStr}`;
    } else if (isYesterday) {
      return `вчера в ${timeStr}`;
    } else if (isTomorrow) {
      return `завтра в ${timeStr}`;
    } else {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      return `${day}.${month} в ${timeStr}`;
    }
  } catch (e) {
    return "";
  }
}

export default function AiHubScreen({ words, stats, onSaveWord, onSaveProgress, onBack, user }: AiHubScreenProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "voice" | "scanner">("chat");
  const [tutor, setTutor] = useState<"sophia" | "oliver" | "alex">("sophia");
  
  // 1. CHAT TAB STATE
  const [chatMode, setChatMode] = useState<"general" | "thinking" | "low-latency" | "grounding">("general");
  
  // MULTI-CHAT PERSISTENT STATE
  interface ChatSession {
    id: string;
    tutor: "sophia" | "oliver" | "alex";
    title: string;
    created: string;
    messages: Message[];
    mode?: "general" | "thinking" | "low-latency" | "grounding";
  }

  interface VoiceSession {
    id: string;
    tutor: "sophia" | "oliver" | "alex";
    title: string;
    created: string;
    voiceMessages: Message[];
  }

  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem("ai_hub_chat_sessions_v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(s => ({
            ...s,
            mode: s.mode || "general"
          }));
        }
      } catch (e) {
        console.error("Failed to parse saved sessions", e);
      }
    }
    
    // Default sessions
    return [
      {
        id: "default-sophia",
        tutor: "sophia",
        title: "Диалог 1",
        created: new Date().toISOString(),
        messages: [
          {
            role: "model",
            text: "Hello! I am Sophia, your warm and friendly AI English tutor. I'm here to help you practice conversational English, correct mistakes, and explain words. Feel free to chat in English or Russian! 😊"
          }
        ],
        mode: "general"
      },
      {
        id: "default-oliver",
        tutor: "oliver",
        title: "Диалог 1",
        created: new Date().toISOString(),
        messages: [
          {
            role: "model",
            text: "Greetings. I am Oliver, your analytical grammar specialist. I will closely review your sentences for preposition, tense, or spelling discrepancies. Let's begin: please write or speak an English sentence."
          }
        ],
        mode: "general"
      },
      {
        id: "default-alex",
        tutor: "alex",
        title: "Диалог 1",
        created: new Date().toISOString(),
        messages: [
          {
            role: "model",
            text: "Yo! I'm Alex, a casual native speaker from NYC. Forget boring textbooks, let's chat about whatever you want. If you make a mistake, I'll show you how we actually say it in the real world. What's up? 🚀"
          }
        ],
        mode: "general"
      }
    ];
  });

  const [voiceSessions, setVoiceSessions] = useState<VoiceSession[]>(() => {
    const saved = localStorage.getItem("ai_hub_voice_sessions_v3");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Failed to parse saved voice sessions", e);
      }
    }
    
    // Default voice sessions
    return [
      {
        id: "voice-default-sophia",
        tutor: "sophia",
        title: "Голосовой диалог 1",
        created: new Date().toISOString(),
        voiceMessages: [
          {
            role: "model",
            text: "Welcome to the Voice Club! I'm ready to listen. Click the microphone button below to start recording your voice, practice speaking English naturally, and hear me reply!"
          }
        ]
      },
      {
        id: "voice-default-oliver",
        tutor: "oliver",
        title: "Голосовой диалог 1",
        created: new Date().toISOString(),
        voiceMessages: [
          {
            role: "model",
            text: "Welcome to the Voice Club. Speak clearly. I will highlight any grammatical mistakes you make in your speech."
          }
        ]
      },
      {
        id: "voice-default-alex",
        tutor: "alex",
        title: "Голосовой диалог 1",
        created: new Date().toISOString(),
        voiceMessages: [
          {
            role: "model",
            text: "Yo, welcome to the voice corner! Hit the mic, say whatever's on your mind, and let's roll."
          }
        ]
      }
    ];
  });

  const [activeChatSessionId, setActiveChatSessionId] = useState<string>(() => {
    const savedId = localStorage.getItem("ai_hub_active_chat_session_id_v2");
    return savedId || "default-sophia";
  });

  const [activeVoiceSessionId, setActiveVoiceSessionId] = useState<string>(() => {
    const savedId = localStorage.getItem("ai_hub_active_voice_session_id_v3");
    return savedId || "voice-default-sophia";
  });

  useEffect(() => {
    localStorage.setItem("ai_hub_chat_sessions_v2", JSON.stringify(chatSessions));
  }, [chatSessions]);

  useEffect(() => {
    localStorage.setItem("ai_hub_voice_sessions_v3", JSON.stringify(voiceSessions));
  }, [voiceSessions]);

  // Firestore session account synchronization for logged-in users
  useEffect(() => {
    if (!user || !user.uid) return;
    let isMounted = true;
    fetchUserAiSessions(user.uid).then(data => {
      if (isMounted && data) {
        if (Array.isArray(data.chatSessions) && data.chatSessions.length > 0) {
          setChatSessions(prevLocal => {
            const mergedMap = new Map<string, ChatSession>();
            prevLocal.forEach(s => mergedMap.set(s.id, s));
            data.chatSessions.forEach((remoteSession: ChatSession) => {
              const local = mergedMap.get(remoteSession.id);
              if (!local || (remoteSession.messages?.length || 0) >= (local.messages?.length || 0)) {
                mergedMap.set(remoteSession.id, remoteSession);
              }
            });
            return Array.from(mergedMap.values());
          });
        }
        if (Array.isArray(data.voiceSessions) && data.voiceSessions.length > 0) {
          setVoiceSessions(prevLocal => {
            const mergedMap = new Map<string, VoiceSession>();
            prevLocal.forEach(s => mergedMap.set(s.id, s));
            data.voiceSessions.forEach((remoteSession: VoiceSession) => {
              const local = mergedMap.get(remoteSession.id);
              if (!local || (remoteSession.voiceMessages?.length || 0) >= (local.voiceMessages?.length || 0)) {
                mergedMap.set(remoteSession.id, remoteSession);
              }
            });
            return Array.from(mergedMap.values());
          });
        }
      }
    }).catch(err => {
      console.warn("Could not fetch user AI sessions from Firestore:", err);
    });
    return () => { isMounted = false; };
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !user.uid) return;
    const saveTimer = setTimeout(() => {
      saveUserAiSessions(user.uid, chatSessions, voiceSessions).catch(err => {
        console.warn("Could not save user AI sessions to Firestore:", err);
      });
    }, 1200);
    return () => clearTimeout(saveTimer);
  }, [chatSessions, voiceSessions, user?.uid]);

  useEffect(() => {
    localStorage.setItem("ai_hub_active_chat_session_id_v2", activeChatSessionId);
  }, [activeChatSessionId]);

  useEffect(() => {
    localStorage.setItem("ai_hub_active_voice_session_id_v3", activeVoiceSessionId);
  }, [activeVoiceSessionId]);

  const getCurrentTutorLevel = (roleName: "sophia" | "oliver" | "alex") => {
    return stats.tutorLevels?.[roleName] || stats.level || "A1";
  };

  const handleUpdateTutorLevel = (roleName: "sophia" | "oliver" | "alex", newLevel: string) => {
    const currentLevels = stats.tutorLevels || {
      sophia: stats.level || "A1",
      oliver: stats.level || "A1",
      alex: stats.level || "A1"
    };
    if (currentLevels[roleName] !== newLevel) {
      const updatedTutorLevels = {
        ...currentLevels,
        [roleName]: newLevel
      };
      const updatedStats = {
        ...stats,
        tutorLevels: updatedTutorLevels,
        level: newLevel
      };
      onSaveProgress(updatedStats);
      const tutorTitle = roleName === "sophia" ? "Sophia" : roleName === "oliver" ? "Oliver" : "Alex";
      setToastMessage(`Уровень у преподавателя ${tutorTitle} адаптирован: ${newLevel}! 📊`);
    }
  };

  // Find active sessions or default
  const activeChatSession = chatSessions.find(s => s.id === activeChatSessionId) || chatSessions.find(s => s.tutor === tutor) || chatSessions[0];
  const activeVoiceSession = voiceSessions.find(s => s.id === activeVoiceSessionId) || voiceSessions.find(s => s.tutor === tutor) || voiceSessions[0];

  // Sync mode state when activeChatSession changes
  useEffect(() => {
    if (activeChatSession && activeChatSession.mode) {
      setChatMode(activeChatSession.mode);
    }
  }, [activeChatSessionId, activeChatSession]);

  const handleChatModeChange = (mode: "general" | "thinking" | "low-latency" | "grounding") => {
    setChatMode(mode);
    setChatSessions(prev => prev.map(s => {
      if (s.id === activeChatSessionId) {
        return { ...s, mode };
      }
      return s;
    }));
  };

  // Align active sessions with tutor when tutor changes
  useEffect(() => {
    // 1. Align chat session
    if (activeChatSession && activeChatSession.tutor !== tutor) {
      const tutorSession = chatSessions.find(s => s.tutor === tutor);
      if (tutorSession) {
        setActiveChatSessionId(tutorSession.id);
      } else {
        const newId = `session-${tutor}-${Date.now()}`;
        const defaultGreetings = {
          sophia: "Hello! I am Sophia, your warm and friendly AI English tutor. I'm here to help you practice conversational English, correct mistakes, and explain words. Feel free to chat in English or Russian! 😊",
          oliver: "Greetings. I am Oliver, your analytical grammar specialist. Let's begin: please write or speak an English sentence.",
          alex: "Yo! I'm Alex, a casual native speaker from NYC. What's up? 🚀"
        };
        const newSession: ChatSession = {
          id: newId,
          tutor,
          title: "Диалог 1",
          created: new Date().toISOString(),
          messages: [{ role: "model", text: defaultGreetings[tutor] }],
          mode: chatMode
        };
        setChatSessions(prev => [...prev, newSession]);
        setActiveChatSessionId(newId);
      }
    }

    // 2. Align voice session
    if (activeVoiceSession && activeVoiceSession.tutor !== tutor) {
      const tutorSession = voiceSessions.find(s => s.tutor === tutor);
      if (tutorSession) {
        setActiveVoiceSessionId(tutorSession.id);
      } else {
        const newId = `voice-session-${tutor}-${Date.now()}`;
        const defaultVoiceGreetings = {
          sophia: "Welcome to the Voice Club! I'm ready to listen. Click the microphone button below to start recording your voice, practice speaking English naturally, and hear me reply!",
          oliver: "Welcome to the Voice Club. Speak clearly. I will highlight any grammatical mistakes you make in your speech.",
          alex: "Yo, welcome to the voice corner! Hit the mic, say whatever's on your mind, and let's roll."
        };
        const newSession: VoiceSession = {
          id: newId,
          tutor,
          title: "Голосовой диалог 1",
          created: new Date().toISOString(),
          voiceMessages: [{ role: "model", text: defaultVoiceGreetings[tutor] }]
        };
        setVoiceSessions(prev => [...prev, newSession]);
        setActiveVoiceSessionId(newId);
      }
    }
  }, [tutor]);

  const chatMessages = activeChatSession ? activeChatSession.messages : [];
  const voiceMessages = activeVoiceSession ? activeVoiceSession.voiceMessages : [];

  const setChatMessagesForSession = (sessionId: string, updater: Message[] | ((prev: Message[]) => Message[])) => {
    setChatSessions(prev => {
      return prev.map(s => {
        if (s.id === sessionId) {
          const updatedMessages = typeof updater === "function" ? updater(s.messages) : updater;
          return { ...s, messages: updatedMessages };
        }
        return s;
      });
    });
  };

  const setVoiceMessagesForSession = (sessionId: string, updater: Message[] | ((prev: Message[]) => Message[])) => {
    setVoiceSessions(prev => {
      return prev.map(s => {
        if (s.id === sessionId) {
          const updatedVoice = typeof updater === "function" ? updater(s.voiceMessages) : updater;
          return { ...s, voiceMessages: updatedVoice };
        }
        return s;
      });
    });
  };

  const setChatMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    if (activeChatSessionId) {
      setChatMessagesForSession(activeChatSessionId, updater);
    }
  };

  const setVoiceMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    if (activeVoiceSessionId) {
      setVoiceMessagesForSession(activeVoiceSessionId, updater);
    }
  };

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [loadingVoiceSessionId, setLoadingVoiceSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const voiceEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const targetHeight = Math.max(72, textareaRef.current.scrollHeight);
      textareaRef.current.style.height = `${targetHeight}px`;
    }
  }, [chatInput]);

  // Vocabulary Import Modal from Chat Context
  const [vocabModalOpen, setVocabModalOpen] = useState(false);
  const [miningLoading, setMiningLoading] = useState(false);
  const [minedWords, setMinedWords] = useState<ExtractedWord[]>([]);

  // Toggles, toasts, word confirmation and speech modes
  const [chatVoiceEnabled, setChatVoiceEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("ai_hub_chat_voice_enabled");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [voiceVoiceEnabled, setVoiceVoiceEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("ai_hub_voice_voice_enabled");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const chatVoiceEnabledRef = useRef(chatVoiceEnabled);
  const voiceVoiceEnabledRef = useRef(voiceVoiceEnabled);

  useEffect(() => {
    chatVoiceEnabledRef.current = chatVoiceEnabled;
  }, [chatVoiceEnabled]);

  useEffect(() => {
    voiceVoiceEnabledRef.current = voiceVoiceEnabled;
  }, [voiceVoiceEnabled]);

  useEffect(() => {
    localStorage.setItem("ai_hub_chat_voice_enabled", JSON.stringify(chatVoiceEnabled));
  }, [chatVoiceEnabled]);

  useEffect(() => {
    localStorage.setItem("ai_hub_voice_voice_enabled", JSON.stringify(voiceVoiceEnabled));
  }, [voiceVoiceEnabled]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [wordConfirmModal, setWordConfirmModal] = useState<{
    en: string;
    ru: string;
    pos: string;
    topic: string;
    note: string;
    source?: "chat-recommend" | "chat-mine" | "scanner";
    index?: number;
  } | null>(null);

  const [pendingWordToAdd, setPendingWordToAdd] = useState<{
    en: string;
    ru: string;
    pos: string;
    topic: string;
    note: string;
    source?: "chat-recommend" | "chat-mine" | "scanner";
    index?: number;
  } | null>(null);
  const [revealTranslation, setRevealTranslation] = useState<boolean>(false);

  useEffect(() => {
    setRevealTranslation(false);
  }, [pendingWordToAdd]);

  const [showDictionaryButton, setShowDictionaryButton] = useState(false);
  const [isSpeechPlaying, setIsSpeechPlaying] = useState(false);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");

  // Voice Settings & Topic Generation
  const [speechPace, setSpeechPace] = useState<"slow" | "normal" | "fast">("normal");
  const [verbosity, setVerbosity] = useState<"short" | "medium" | "long">("medium");
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);
  const [voiceTopic, setVoiceTopic] = useState<{ title: string; text: string; translation?: string; sourceUrl?: string; audio?: string } | null>({
    title: "Smart Glasses (Умные очки)",
    text: "These are smart glasses that display information right before your eyes.",
    translation: "Это умные очки, которые показывают информацию прямо перед глазами.",
    sourceUrl: "https://google.com"
  });
  const [showTopicTranslation, setShowTopicTranslation] = useState(false);

  // CEFR Assessment Level Test State
  const [levelTest, setLevelTest] = useState<{
    type: "fast" | "full";
    step: number;
    questions: any[];
    answers: number[];
    timer: number;
    running: boolean;
    writingPrompts?: any[];
    writingAnswers?: string[];
    speakingPrompts?: any[];
    speakingAnswers?: string[];
    // Adaptive tracking:
    pool?: any[];
    currentTargetLevel?: string;
    consecutiveCorrect?: number;
    consecutiveWrong?: number;
  } | null>(null);
  const [testGradeReport, setTestGradeReport] = useState<{
    level: string;
    strengths: string[];
    weaknesses: string[];
    detailedFeedback: string;
    reportData: any[];
    skillsBreakdown?: {
      listening: { level: string; proximity: string; comment: string };
      reading: { level: string; proximity: string; comment: string };
      grammarVocabulary: { level: string; proximity: string; comment: string };
      writing: { level: string; proximity: string; comment: string };
      speaking: { level: string; proximity: string; comment: string };
    };
  } | null>(null);
  const [testGradingLoading, setTestGradingLoading] = useState(false);
  const [testGenerationLoading, setTestGenerationLoading] = useState(false);

  // --- CEFR Speaking Test Voice Recording State ---
  const [isTestRecording, setIsTestRecording] = useState(false);
  const [testRecordTime, setTestRecordTime] = useState(0);
  const testMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const testChunksRef = useRef<Blob[]>([]);
  const testTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startTestRecording = async (speakingIdx: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testChunksRef.current = [];
      
      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          mimeType = "audio/ogg";
        } else if (MediaRecorder.isTypeSupported("audio/wav")) {
          mimeType = "audio/wav";
        } else {
          mimeType = "";
        }
      } else {
        mimeType = "";
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      testMediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          testChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(testChunksRef.current, { type: mimeType || "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          if (levelTest) {
            const nextSpeaking = [...(levelTest.speakingAnswers || [])];
            nextSpeaking[speakingIdx] = base64Audio;
            setLevelTest({ ...levelTest, speakingAnswers: nextSpeaking });
          }
        };
      };

      recorder.start();
      setIsTestRecording(true);
      setTestRecordTime(0);

      if (testTimerRef.current) clearInterval(testTimerRef.current);
      testTimerRef.current = setInterval(() => {
        setTestRecordTime(p => p + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setToastMessage("⚠️ Не удалось получить доступ к микрофону. Проверьте разрешения.");
    }
  };

  const stopTestRecording = () => {
    if (testMediaRecorderRef.current && isTestRecording) {
      testMediaRecorderRef.current.stop();
      setIsTestRecording(false);
      if (testTimerRef.current) {
        clearInterval(testTimerRef.current);
        testTimerRef.current = null;
      }
    }
  };

  // Custom Confirmation Dialog State (replacing native confirm() blocked by editor preview iframes)
  const [customConfirm, setCustomConfirm] = useState<{
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  } | null>(null);

  const triggerConfirm = (
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText = "Да, запустить",
    cancelText = "Отмена"
  ) => {
    setCustomConfirm({ message, onConfirm, onCancel, confirmText, cancelText });
  };

  const handleRenameSession = (id: string) => {
    if (!editingSessionTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    if (activeTab === "chat") {
      setChatSessions(prev =>
        prev.map(s => s.id === id ? { ...s, title: editingSessionTitle.trim() } : s)
      );
    } else {
      setVoiceSessions(prev =>
        prev.map(s => s.id === id ? { ...s, title: editingSessionTitle.trim() } : s)
      );
    }
    setEditingSessionId(null);
    setToastMessage("Название чата изменено ✏️");
  };

  useEffect(() => {
    const appEl = document.querySelector(".app") as HTMLElement;
    if (appEl) {
      const originalMaxWidth = appEl.style.maxWidth;
      appEl.style.maxWidth = "850px";
      return () => {
        appEl.style.maxWidth = originalMaxWidth;
      };
    }
  }, []);

  const [useNativeSpeechRec, setUseNativeSpeechRec] = useState<boolean>(() => {
    const saved = localStorage.getItem("voice_use_native_rec_v2");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [useNativeSpeechSynth, setUseNativeSpeechSynth] = useState<boolean>(() => {
    const saved = localStorage.getItem("voice_use_native_synth_v2");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechRecLang, setSpeechRecLang] = useState<"en-US" | "ru-RU">("en-US");

  useEffect(() => {
    localStorage.setItem("voice_use_native_rec_v2", JSON.stringify(useNativeSpeechRec));
  }, [useNativeSpeechRec]);

  useEffect(() => {
    localStorage.setItem("voice_use_native_synth_v2", JSON.stringify(useNativeSpeechSynth));
  }, [useNativeSpeechSynth]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const updateVoices = () => {
        setBrowserVoices(window.speechSynthesis.getVoices());
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // Auto-clear toast helper
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopAllSpeech = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = "";
      } catch (err) {
        console.warn("Error pausing currentAudioRef:", err);
      }
    }
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current.src = "";
      } catch (err) {
        console.warn("Error pausing audioPlayerRef:", err);
      }
    }
    setIsSpeechPlaying(false);
  };

  useEffect(() => {
    stopAllSpeech();
    return () => {
      stopAllSpeech();
    };
  }, [activeChatSessionId, activeVoiceSessionId, tutor]);

  // 3. SCANNER TAB STATE
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{ description: string; words: ExtractedWord[] } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Helper to force scroll container to the absolute bottom
  const scrollToBottomContainer = (containerId: string, endRef?: React.RefObject<HTMLDivElement | null>) => {
    const doScroll = () => {
      const el = document.getElementById(containerId);
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
      endRef?.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };
    doScroll();
    const t1 = setTimeout(doScroll, 60);
    const t2 = setTimeout(doScroll, 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  };

  // Auto-scroll chat to bottom on new messages, session switch, or tab switch
  useEffect(() => {
    if (activeTab === "chat") {
      scrollToBottomContainer("ai_chat_scroll_container", chatEndRef);
    }
  }, [chatMessages, chatLoading, activeChatSessionId, activeTab]);

  // Auto-scroll voice to bottom on new messages, session switch, or tab switch
  useEffect(() => {
    if (activeTab === "voice") {
      scrollToBottomContainer("ai_voice_scroll_container", voiceEndRef);
    }
  }, [voiceMessages, voiceLoading, activeVoiceSessionId, activeTab]);

  // Studio AI speech synthesis with browser fallback
  const speakText = async (text: string, onEnd?: () => void) => {
    if (!text || !text.trim()) {
      if (onEnd) onEnd();
      return;
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch (e) {}
      currentAudioRef.current = null;
    }

    setIsSpeechPlaying(true);

    try {
      const response = await fetch(getApiUrl("/api/ai-tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, role: tutor })
      });
      const data = await response.json();
      if (data.audio) {
        const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
        currentAudioRef.current = audio;
        audio.onended = () => {
          setIsSpeechPlaying(false);
          if (onEnd) onEnd();
        };
        audio.onerror = () => {
          fallbackBrowserSpeak(text, onEnd);
        };
        await audio.play();
        return;
      }
    } catch (e) {
      console.warn("[Studio TTS] API call failed, using fallback synthesizer:", e);
    }

    fallbackBrowserSpeak(text, onEnd);
  };

  const fallbackBrowserSpeak = (text: string, onEnd?: () => void) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      
      const cleanText = text
        .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/_([^_]+)_/g, "$1");
      
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "en-US";
      
      const voices = browserVoices.length > 0 ? browserVoices : window.speechSynthesis.getVoices();
      let voice = null;
      
      if (tutor === "sophia") {
        voice = voices.find(v => {
          const name = v.name.toLowerCase();
          const isEn = v.lang.startsWith("en") || v.lang.replace("_", "-").startsWith("en");
          return isEn && (name.includes("google us english") || name.includes("samantha") || name.includes("zira") || name.includes("aria") || name.includes("female"));
        });
      } else if (tutor === "oliver") {
        utterance.lang = "en-GB";
        voice = voices.find(v => {
          const name = v.name.toLowerCase();
          const lang = v.lang.toLowerCase();
          return (lang.includes("gb") || lang.includes("uk")) && (name.includes("male") || name.includes("daniel") || name.includes("george") || name.includes("oliver"));
        }) || voices.find(v => {
          const name = v.name.toLowerCase();
          return name.includes("daniel") || name.includes("george") || name.includes("oliver") || name.includes("uk english");
        });
      } else {
        utterance.lang = "en-US";
        voice = voices.find(v => {
          const name = v.name.toLowerCase();
          const lang = v.lang.toLowerCase();
          return lang.includes("us") && (name.includes("alex") || name.includes("fred") || name.includes("guy") || name.includes("us english male"));
        }) || voices.find(v => {
          const name = v.name.toLowerCase();
          return name.includes("alex") || name.includes("fred") || name.includes("guy");
        });
      }
      
      if (!voice) {
        voice = voices.find(v => v.lang.startsWith("en"));
      }
      if (voice) utterance.voice = voice;
      
      if (tutor === "alex") {
        utterance.pitch = 1.25; // Upbeat, youthful tone
        utterance.rate = speechPace === "slow" ? 0.75 : speechPace === "fast" ? 1.30 : 1.08;
      } else if (tutor === "oliver") {
        utterance.pitch = 0.60; // Deep stern, demanding tone
        utterance.rate = speechPace === "slow" ? 0.65 : speechPace === "fast" ? 1.15 : 0.85;
      } else {
        utterance.pitch = 1.02;
        utterance.rate = speechPace === "slow" ? 0.70 : speechPace === "fast" ? 1.25 : 0.95;
      }

      utterance.onstart = () => setIsSpeechPlaying(true);
      utterance.onend = () => {
        setIsSpeechPlaying(false);
        if (onEnd) onEnd();
      };
      utterance.onerror = () => {
        setIsSpeechPlaying(false);
        if (onEnd) onEnd();
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setIsSpeechPlaying(false);
      if (onEnd) onEnd();
    }
  };

  // Adjust welcome message when tutor changes (preserved in histories)
  const handleTutorChange = (selectedTutor: "sophia" | "oliver" | "alex") => {
    setTutor(selectedTutor);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  // --- 1. CHAT LOGIC ---
  const handleSendChatMessage = async (textOverride?: string | React.MouseEvent | React.KeyboardEvent) => {
    const isStringOverride = typeof textOverride === "string";
    const userMsgText = isStringOverride ? textOverride : chatInput;
    if (!userMsgText.trim() || chatLoading) return;
    
    const targetSessionId = activeChatSessionId;
    const targetMessages = chatMessages;
    if (!targetSessionId) return;

    if (!isStringOverride) {
      setChatInput("");
    }
    setChatMessagesForSession(targetSessionId, prev => [...prev, { role: "user", text: userMsgText, timestamp: new Date().toISOString() }]);
    setChatLoading(true);
    setLoadingSessionId(targetSessionId);

    try {
      const history = targetMessages.concat({ role: "user", text: userMsgText });
      
      const response = await fetch(getApiUrl("/api/ai-chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp || new Date().toISOString() })),
          role: tutor,
          mode: chatMode,
          userLevel: getCurrentTutorLevel(tutor),
          skipServerTts: useNativeSpeechSynth,
          clientLocalTime: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error("Ошибка связи с сервером ИИ.");
      const data = await response.json();

      setChatMessagesForSession(targetSessionId, prev => [...prev, { 
        role: "model", 
        text: data.replyText,
        sources: data.sources,
        timestamp: new Date().toISOString()
      }]);

      if (data.evaluatedLevel) {
        handleUpdateTutorLevel(tutor, data.evaluatedLevel);
      }

      if (data.wordToAdd) {
        setPendingWordToAdd({
          en: data.wordToAdd.en,
          ru: data.wordToAdd.ru,
          pos: data.wordToAdd.pos || "noun",
          topic: data.wordToAdd.topic || "general",
          note: `Из диалога с ${tutor === "sophia" ? "Sophia" : tutor === "oliver" ? "Oliver" : "Alex"}`
        });
        setShowDictionaryButton(false);
      } else {
        setPendingWordToAdd(null);
        setShowDictionaryButton(false);
      }

      if (chatVoiceEnabled) {
        if (!useNativeSpeechSynth && data.replyAudio) {
          stopAllSpeech();
          setIsSpeechPlaying(true);
          const onPlaybackEnd = () => {
            setIsSpeechPlaying(false);
            setShowDictionaryButton(true);
          };
          const audio = new Audio(data.replyAudio);
          currentAudioRef.current = audio;
          audio.playbackRate = speechPace === "slow" ? 0.75 : speechPace === "fast" ? 1.25 : 1.0;
          audio.onended = onPlaybackEnd;
          audio.onerror = onPlaybackEnd;
          audio.play().catch(e => {
            console.warn("Auto-play in chat blocked:", e);
            onPlaybackEnd();
          });
        } else if (typeof window !== "undefined" && window.speechSynthesis) {
          speakText(data.replyText, () => {
            setShowDictionaryButton(true);
          });
        } else {
          setShowDictionaryButton(true);
        }
      } else {
        setShowDictionaryButton(true);
      }
    } catch (err: any) {
      setChatMessagesForSession(targetSessionId, prev => [...prev, { 
        role: "model", 
        text: `⚠️ Не удалось получить ответ: ${err.message || "Ошибка соединения."}`,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setChatLoading(false);
      setLoadingSessionId(null);
    }
  };

  // Extract / Mine Vocabulary from Chat Context
  const handleMineVocabulary = async () => {
    if (chatMessages.length < 2) return;
    setVocabModalOpen(true);
    setMiningLoading(true);
    setMinedWords([]);

    try {
      const response = await fetch(getApiUrl("/api/ai-extract-vocabulary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatMessages })
      });

      if (!response.ok) throw new Error("Не удалось обработать диалог");
      const data = await response.json();
      setMinedWords(data.words || []);
    } catch (err) {
      console.error(err);
    } finally {
      setMiningLoading(false);
    }
  };

  // Save Mined Word to Core Dictionary (Now opens the interactive confirmation/edit modal)
  const handleSaveMinedWord = (word: ExtractedWord, index: number, source: "chat-mine" | "scanner") => {
    setWordConfirmModal({
      en: word.en,
      ru: word.ru,
      pos: word.pos || "noun",
      topic: word.topic || "general",
      note: word.note || (source === "scanner" ? "Распознано с фотографии" : "Импортировано из ИИ-тьютора"),
      source,
      index
    });
  };

  // --- 2. VOICE LOGIC (HTTP MULTIMODAL DIALOGUE) ---
  const recognitionRef = useRef<any>(null);
  const isExplicitlyStoppedRef = useRef<boolean>(false);
  const accumulatedTranscriptRef = useRef<string>("");

  const startVoiceRecording = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    isExplicitlyStoppedRef.current = false;
    accumulatedTranscriptRef.current = "";
    setVoiceInputText("Слушаю вас...");

    // Always start MediaRecorder for reliable audio capture across mobile and desktop
    await startFallbackMediaRecorder();

    // Optionally start native SpeechRecognition in parallel if enabled for instant UI feedback
    if (useNativeSpeechRec && SpeechRecognition) {
      try {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch (e) {}
        }
        
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = speechRecLang;
        
        rec.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscriptTemp = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscriptTemp += event.results[i][0].transcript + " ";
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          if (finalTranscriptTemp) {
            accumulatedTranscriptRef.current += finalTranscriptTemp;
          }
          setVoiceInputText(accumulatedTranscriptRef.current + interimTranscript);
        };
        
        rec.onerror = (e: any) => {
          console.error("Speech recognition error:", e);
        };
        
        recognitionRef.current = rec;
        rec.start();
      } catch (err) {
        console.warn("SpeechRecognition initiation failed:", err);
      }
    }
  };

  const startFallbackMediaRecorder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          mimeType = "audio/ogg";
        } else if (MediaRecorder.isTypeSupported("audio/wav")) {
          mimeType = "audio/wav";
        } else {
          mimeType = "";
        }
      } else {
        mimeType = "";
      }
      
      const recorder = mimeType 
        ? new MediaRecorder(stream, { mimeType }) 
        : new MediaRecorder(stream);
        
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
        await handleProcessSpokenAudio(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (err) {
      alert("Не удалось активировать микрофон. Пожалуйста, разрешите доступ к микрофону!");
    }
  };

  const stopVoiceRecording = () => {
    isExplicitlyStoppedRef.current = true;
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        if (typeof mediaRecorderRef.current.requestData === "function") {
          mediaRecorderRef.current.requestData();
        }
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
  };

  const handleProcessSpokenAudio = async (blob: Blob) => {
    setVoiceLoading(true);
    const recognizedText = accumulatedTranscriptRef.current.trim();
    accumulatedTranscriptRef.current = "";
    setVoiceInputText("");

    if (blob.size < 100 && recognizedText) {
      await executeVoiceDialogueRequest({ text: recognizedText });
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64Audio = reader.result as string;
      await executeVoiceDialogueRequest({ 
        audio: base64Audio, 
        text: recognizedText || undefined 
      });
    };
  };

  const handleSendTextVoiceAlternative = async () => {
    if (!voiceInputText.trim() || voiceLoading) return;
    const txt = voiceInputText;
    setVoiceInputText("");
    await executeVoiceDialogueRequest({ text: txt });
  };

  const executeVoiceDialogueRequest = async (payload: { audio?: string; text?: string }) => {
    const targetSessionId = activeVoiceSessionId;
    const targetVoiceMessages = voiceMessages;
    if (!targetSessionId) return;

    setVoiceLoading(true);
    setLoadingVoiceSessionId(targetSessionId);
    try {
      if (payload.text) {
        setVoiceMessagesForSession(targetSessionId, prev => [...prev, { role: "user", text: payload.text!, timestamp: new Date().toISOString() }]);
      } else {
        setVoiceMessagesForSession(targetSessionId, prev => [...prev, { role: "user", text: "🎙️ [Голосовое сообщение]", timestamp: new Date().toISOString() }]);
      }

      const response = await fetch(getApiUrl("/api/ai-voice-chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: payload.audio,
          text: payload.text,
          messages: targetVoiceMessages.filter(m => !m.text.includes("🎙️")).map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp || new Date().toISOString() })),
          role: tutor,
          userLevel: getCurrentTutorLevel(tutor),
          speechPace,
          verbosity,
          skipServerTts: useNativeSpeechSynth, // Skip server TTS if native synthesis is active
          clientLocalTime: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error("Failed to process voice reply");
      const data = await response.json();

      if (data.userTranscription) {
        setVoiceMessagesForSession(targetSessionId, prev => {
          const copy = [...prev];
          if (copy[copy.length - 1] && copy[copy.length - 1].text.includes("🎙️")) {
            copy[copy.length - 1] = { role: "user", text: data.userTranscription, timestamp: copy[copy.length - 1].timestamp || new Date().toISOString() };
          }
          return copy;
        });
      }

      setVoiceMessagesForSession(targetSessionId, prev => [...prev, { role: "model", text: data.replyText, timestamp: new Date().toISOString() }]);

      if (data.evaluatedLevel) {
        handleUpdateTutorLevel(tutor, data.evaluatedLevel);
      }

      if (data.wordToAdd) {
        setPendingWordToAdd({
          en: data.wordToAdd.en,
          ru: data.wordToAdd.ru,
          pos: data.wordToAdd.pos || "noun",
          topic: data.wordToAdd.topic || "general",
          note: `Из диалога с ${tutor === "sophia" ? "Sophia" : tutor === "oliver" ? "Oliver" : "Alex"}`
        });
        setShowDictionaryButton(false);
      } else {
        setPendingWordToAdd(null);
        setShowDictionaryButton(false);
      }

      if (voiceVoiceEnabledRef.current) {
        if (!useNativeSpeechSynth && data.replyAudio) {
          setIsSpeechPlaying(true);
          const onPlaybackEnd = () => {
            setIsSpeechPlaying(false);
            setShowDictionaryButton(true);
          };
          if (audioPlayerRef.current) {
            audioPlayerRef.current.src = data.replyAudio;
            audioPlayerRef.current.playbackRate = speechPace === "slow" ? 0.75 : speechPace === "fast" ? 1.25 : 1.0;
            audioPlayerRef.current.onended = onPlaybackEnd;
            audioPlayerRef.current.onerror = onPlaybackEnd;
            audioPlayerRef.current.play().catch(e => {
              console.warn("Auto-play blocked:", e);
              onPlaybackEnd();
            });
          } else {
            const audio = new Audio(data.replyAudio);
            currentAudioRef.current = audio;
            audio.playbackRate = speechPace === "slow" ? 0.75 : speechPace === "fast" ? 1.25 : 1.0;
            audio.onended = onPlaybackEnd;
            audio.onerror = onPlaybackEnd;
            audio.play().catch(e => {
              console.warn("Auto-play blocked:", e);
              onPlaybackEnd();
            });
          }
        } else if (typeof window !== "undefined" && window.speechSynthesis) {
          speakText(data.replyText, () => {
            setShowDictionaryButton(true);
          });
        } else {
          setShowDictionaryButton(true);
        }
      } else {
        setShowDictionaryButton(true);
      }
    } catch (err: any) {
      console.error(err);
      setVoiceMessagesForSession(targetSessionId, prev => [...prev, { role: "model", text: "⚠️ Извините, не удалось разобрать звук." }]);
    } finally {
      setVoiceLoading(false);
      setLoadingVoiceSessionId(null);
    }
  };

  // --- 3. SCANNER LOGIC ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const processSelectedFile = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setScanResult(null);
    };
    reader.readAsDataURL(file);
  };

  // Camera usage logic
  const startCamera = async () => {
    setCameraActive(true);
    setScanResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert("Не удалось запустить камеру. Используйте стандартный выбор файла.");
      setCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg");
        setSelectedImage(dataUrl);
        
        // Convert to file object
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
            setImageFile(file);
          });
      }
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleScanImage = async () => {
    if (!selectedImage || scannerLoading) return;
    setScannerLoading(true);

    try {
      const response = await fetch(getApiUrl("/api/ai-analyze-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: selectedImage })
      });

      if (!response.ok) throw new Error("Не удалось просканировать изображение");
      const data = await response.json();
      setScanResult(data);
    } catch (err: any) {
      alert(`Ошибка сканирования: ${err.message || "Неизвестная ошибка"}`);
    } finally {
      setScannerLoading(false);
    }
  };

  // CEFR Assessment Level Test Functions
  const startCEFRLevelTest = async (type: "fast" | "full") => {
    setTestGenerationLoading(true);
    setTestGradeReport(null);
    try {
      const response = await fetch(getApiUrl("/api/generate-level-test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, currentLevel: stats.level || "A1" })
      });
      if (!response.ok) throw new Error("Failed to generate test");
      const data = await response.json();
      
      const wPrompts = data.writingPrompts || [];
      const sPrompts = data.speakingPrompts || [];
      
      const pool = data.questions || [];
      const startLevel = stats.level && ["A1", "A2", "B1", "B2", "C1"].includes(stats.level) ? stats.level : "A2";
      
      // Find index of first question matching the start level
      let firstIdx = pool.findIndex((q: any) => q.level === startLevel);
      if (firstIdx === -1) {
        // Fallbacks
        const levelsOrder = ["A1", "A2", "B1", "B2", "C1"];
        for (const l of levelsOrder) {
          firstIdx = pool.findIndex((q: any) => q.level === l);
          if (firstIdx !== -1) break;
        }
      }
      if (firstIdx === -1) firstIdx = 0;
      
      const firstQuestion = pool[firstIdx];
      const initialQuestions = firstQuestion ? [firstQuestion] : [];
      const actualStartLevel = firstQuestion ? firstQuestion.level : "A2";

      setLevelTest({
        type,
        step: 0,
        questions: initialQuestions,
        answers: [],
        writingPrompts: wPrompts,
        writingAnswers: wPrompts.map(() => ""),
        speakingPrompts: sPrompts,
        speakingAnswers: sPrompts.map(() => ""),
        timer: type === "fast" ? 30 * 60 : 60 * 60, // 30 mins fast test, 60 mins full test
        running: true,
        pool: pool,
        currentTargetLevel: actualStartLevel,
        consecutiveCorrect: 0,
        consecutiveWrong: 0
      });
    } catch (err) {
      console.error(err);
      setToastMessage("⚠️ Не удалось загрузить тест. Попробуйте еще раз.");
    } finally {
      setTestGenerationLoading(false);
    }
  };

  const submitLevelTestAnswers = async (currentTest: any) => {
    setTestGradingLoading(true);
    try {
      const response = await fetch(getApiUrl("/api/grade-level-test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: currentTest.type,
          questions: currentTest.questions,
          answers: currentTest.answers,
          writingPrompts: currentTest.writingPrompts || [],
          writingAnswers: currentTest.writingAnswers || [],
          speakingPrompts: currentTest.speakingPrompts || [],
          speakingAnswers: currentTest.speakingAnswers || []
        })
      });
      if (!response.ok) throw new Error("Failed to grade test");
      const data = await response.json();
      setTestGradeReport(data);
      setLevelTest(null);
    } catch (err) {
      console.error(err);
      setToastMessage("⚠️ Ошибка при оценке теста. Пожалуйста, попробуйте еще раз.");
    } finally {
      setTestGradingLoading(false);
    }
  };

  useEffect(() => {
    if (!levelTest || !levelTest.running) return;
    const interval = setInterval(() => {
      setLevelTest(prev => {
        if (!prev) return null;
        if (prev.timer <= 1) {
          clearInterval(interval);
          submitLevelTestAnswers(prev);
          return { ...prev, timer: 0, running: false };
        }
        return { ...prev, timer: prev.timer - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [levelTest?.running]);

  return (
    <div className="fade-in px-4 pt-4 pb-20 md:px-6 md:pt-6 md:pb-32 max-w-2xl mx-auto" style={{ position: "relative" }}>
      {/* HTML5 Audio Player for TTS */}
      <audio ref={audioPlayerRef} style={{ display: "none" }} />

      {/* ⏳ LEVEL TEST GENERATION LOADER OVERLAY */}
      {testGenerationLoading && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "#fbfaf7",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center"
        }} className="fade-in">
          <div className="spinner" style={{ borderTopColor: "#8fa080", marginBottom: 24 }}></div>
          <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 22, color: "#8fa080", marginBottom: 12, fontWeight: "700" }}>
            Составляем уникальный тест...
          </h3>
          <p style={{ fontSize: 14.5, color: "#55544e", maxWidth: 380, lineHeight: 1.6 }}>
            Наш ИИ-преподаватель готовит для вас адаптивные вопросы по лексике и грамматике для точной оценки уровня CEFR. Это займет несколько секунд.
          </p>
        </div>
      )}

      {/* ⏳ LEVEL TEST GRADING LOADER OVERLAY */}
      {testGradingLoading && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "#fbfaf7",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center"
        }} className="fade-in">
          <div className="spinner" style={{ borderTopColor: "#df6c6c", marginBottom: 24 }}></div>
          <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 22, color: "#df6c6c", marginBottom: 12, fontWeight: "700" }}>
            Оцениваем ваши ответы...
          </h3>
          <p style={{ fontSize: 14.5, color: "#55544e", maxWidth: 380, lineHeight: 1.6 }}>
            ИИ проводит комплексный анализ ваших знаний, выявляет сильные стороны, пробелы и считает ваш итоговый уровень владения языком.
          </p>
        </div>
      )}

      {/* 📊 CEFR LEVEL ASSESSMENT TEST WIZARD */}
      {levelTest && (() => {
        const totalMC = levelTest.type === "fast" ? 30 : 50;
        const totalWriting = levelTest.writingPrompts?.length || 0;
        const totalSpeaking = levelTest.speakingPrompts?.length || 0;
        const totalSteps = totalMC + totalWriting + totalSpeaking;
        const step = levelTest.step;

        const isStepComplete = () => {
          if (step < totalMC) {
            return levelTest.answers[step] !== undefined;
          }
          if (step < totalMC + totalWriting) {
            const wIdx = step - totalMC;
            return (levelTest.writingAnswers?.[wIdx] || "").trim().length >= 10;
          }
          const sIdx = step - totalMC - totalWriting;
          return (levelTest.speakingAnswers?.[sIdx] || "").trim().length > 0;
        };

        return (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "#fbfaf7", // Elegant, warm high-contrast off-white
            zIndex: 9990,
            overflowY: "auto",
            padding: "24px 16px",
            color: "#1f1e1a", // Strict high contrast text
            fontFamily: "Inter, sans-serif"
          }} className="fade-in">
            <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 60 }}>
              
              {/* Header: Timer and Type */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1.5px solid #e5dfd3", paddingBottom: 14 }}>
                <div>
                  <span style={{ fontSize: 11, background: "#f0f4ed", color: "#8fa080", padding: "6px 12px", borderRadius: 99, fontWeight: 700, textTransform: "uppercase" }}>
                    {levelTest.type === "fast" ? "⚡ Быстрый тест (Слух + Чтение)" : "📊 Полный CEFR Тест"}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: levelTest.timer < 60 ? "#df6c6c" : "#1f1e1a", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>⏳ Осталось время:</span>
                  <span>{Math.floor(levelTest.timer / 60)}м {levelTest.timer % 60}с</span>
                </div>
              </div>

              {/* Section Progress Tracker */}
              <div style={{ marginBottom: 24, padding: "12px 16px", background: "#f4f0e6", borderRadius: "12px", border: "1px solid #e5dfd3" }}>
                <span style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: "#6b6861" }}>Текущий этап:</span>
                <div style={{ fontSize: 15, fontWeight: "800", color: "#1f1e1a", marginTop: 4 }}>
                  {step < totalMC ? (
                    `Раздел 1: Грамматика и Чтение (Вопрос ${step + 1} из ${totalMC})`
                  ) : step < totalMC + totalWriting ? (
                    `Раздел 2: Письменное задание (Эссе ${step - totalMC + 1} из ${totalWriting})`
                  ) : (
                    `Раздел 3: Устное говорение (Запись речи ${step - totalMC - totalWriting + 1} из ${totalSpeaking})`
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b6861", marginBottom: 6 }}>
                  <span>Задание {step + 1} из {totalSteps}</span>
                  <span>Общий прогресс: {Math.round(((step + 1) / totalSteps) * 100)}%</span>
                </div>
                <div style={{ width: "100%", height: 8, background: "#e5dfd3", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${((step + 1) / totalSteps) * 100}%`, height: "100%", background: "#8fa080", transition: "width 0.3s ease" }}></div>
                </div>
              </div>

              {/* Question Card */}
              <div style={{ background: "#ffffff", border: "1.5px solid #e5dfd3", borderRadius: "16px", padding: "28px", marginBottom: "24px", boxShadow: "0 6px 20px rgba(0,0,0,0.03)" }}>
                {step < totalMC ? (() => {
                  const q = levelTest.questions[step];
                  if (!q) return null;
                  return (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <span style={{ fontSize: 10, color: "#6b6861", fontWeight: 700, background: "#f4f0e6", padding: "3px 8px", borderRadius: 6, textTransform: "uppercase" }}>
                          CEFR сложность: {q.level}
                        </span>
                        {q.type === "listening" && (
                          <span style={{ fontSize: 11, color: "#8fa080", fontWeight: "700" }}>🔊 Аудирование</span>
                        )}
                        {q.type === "reading" && (
                          <span style={{ fontSize: 11, color: "#df7a5e", fontWeight: "700" }}>📖 Чтение</span>
                        )}
                      </div>

                      {/* Reading Passage container if reading type */}
                      {q.type === "reading" && q.readingPassage && (
                        <div style={{
                          background: "#fdfbf7",
                          border: "1px solid #e5dfd3",
                          borderLeft: "4px solid #df7a5e",
                          borderRadius: "10px",
                          padding: "16px",
                          marginBottom: "20px",
                          fontSize: "14px",
                          lineHeight: "1.6",
                          color: "#1f1e1a"
                        }}>
                          <strong>Текст для чтения:</strong>
                          <p style={{ marginTop: 6, marginBottom: 0 }}>{q.readingPassage}</p>
                        </div>
                      )}

                      {/* Listening audio text speaker button */}
                      {q.type === "listening" && q.audioText && (
                        <div style={{
                          background: "#f0f4ed",
                          border: "1px solid #8fa080",
                          borderRadius: "12px",
                          padding: "18px",
                          marginBottom: "20px",
                          textAlign: "center"
                        }}>
                          <p style={{ fontSize: "13px", color: "#6b6861", margin: "0 0 12px 0", fontWeight: 600 }}>
                            Прослушайте озвученную фразу ниже и ответьте на вопрос:
                          </p>
                          <button
                            onClick={() => speakText(q.audioText)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 10,
                              background: "#8fa080",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "12px",
                              padding: "12px 24px",
                              fontWeight: "bold",
                              fontSize: "14px",
                              cursor: "pointer",
                              boxShadow: "0 4px 10px rgba(143,160,128,0.25)",
                              transition: "all 0.2s"
                            }}
                            type="button"
                          >
                            <span>🔊 Воспроизвести аудиозапись</span>
                          </button>
                        </div>
                      )}

                      {/* Question Text */}
                      <h3 style={{ fontSize: "17px", fontWeight: "800", color: "#1f1e1a", marginBottom: "24px", lineHeight: "1.5" }}>
                        {q.text}
                      </h3>

                      {/* Multiple choice options */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {q.options.map((option: string, idx: number) => {
                          const isSelected = levelTest.answers[step] === idx;
                          return (
                            <button
                              key={idx}
                              style={{
                                textAlign: "left",
                                padding: "16px 20px",
                                borderRadius: "14px",
                                border: isSelected ? "2.5px solid #8fa080" : "1.5px solid #e5dfd3",
                                background: isSelected ? "#f0f4ed" : "#ffffff",
                                color: "#1f1e1a",
                                fontSize: "14px",
                                fontWeight: isSelected ? "600" : "500",
                                cursor: "pointer",
                                boxShadow: isSelected ? "0 4px 12px rgba(143,160,128,0.1)" : "none",
                                transition: "all 0.15s ease",
                                display: "flex",
                                alignItems: "center"
                              }}
                              onClick={() => {
                                const nextAnswers = [...levelTest.answers];
                                nextAnswers[step] = idx;
                                setLevelTest({ ...levelTest, answers: nextAnswers });
                              }}
                            >
                              <span style={{
                                marginRight: 12,
                                background: isSelected ? "#8fa080" : "#f4f0e6",
                                color: isSelected ? "#ffffff" : "#6b6861",
                                width: "26px",
                                height: "26px",
                                borderRadius: "50%",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "12px",
                                fontWeight: "bold"
                              }}>{String.fromCharCode(65 + idx)}</span>
                              <span>{option}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })() : step < totalMC + totalWriting ? (() => {
                  const wIdx = step - totalMC;
                  const q = levelTest.writingPrompts?.[wIdx];
                  if (!q) return null;
                  const essayText = levelTest.writingAnswers?.[wIdx] || "";
                  const wordCount = essayText.trim().split(/\s+/).filter(Boolean).length;
                  return (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 10, color: "#6b6861", fontWeight: 700, background: "#f4f0e6", padding: "3px 8px", borderRadius: 6, textTransform: "uppercase" }}>
                          Раздел: Письмо (Writing)
                        </span>
                        <span style={{ fontSize: 11, color: "#8fa080", fontWeight: "700" }}>Сложность: {q.level}</span>
                      </div>

                      <div style={{ background: "#f4f0e6", padding: "18px", borderRadius: "12px", marginBottom: 20, border: "1px solid #e5dfd3" }}>
                        <p style={{ fontWeight: "700", color: "#1f1e1a", fontSize: "15px", marginBottom: 8, lineHeight: 1.4 }}>{q.prompt}</p>
                        <p style={{ color: "#6b6861", fontSize: "13px", fontStyle: "italic", margin: 0 }}>{q.description}</p>
                      </div>

                      <textarea
                        style={{
                          width: "100%",
                          height: "200px",
                          background: "#ffffff",
                          border: "1.5px solid #e5dfd3",
                          borderRadius: "14px",
                          padding: "16px",
                          fontSize: "14px",
                          color: "#1f1e1a",
                          lineHeight: "1.6",
                          outline: "none",
                          fontFamily: "Inter, sans-serif",
                          resize: "none"
                        }}
                        placeholder="Type your essay response in English here..."
                        value={essayText}
                        onChange={(e) => {
                          const nextWriting = [...(levelTest.writingAnswers || [])];
                          nextWriting[wIdx] = e.target.value;
                          setLevelTest({ ...levelTest, writingAnswers: nextWriting });
                        }}
                      />
                      
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: "12px", color: "#6b6861" }}>
                        <span>Минимум для перехода: 10 символов</span>
                        <span style={{ fontWeight: "600", color: wordCount >= 10 ? "#8fa080" : "#6b6861" }}>
                          Количество слов: {wordCount} (Символов: {essayText.length})
                        </span>
                      </div>
                    </div>
                  );
                })() : (() => {
                  const sIdx = step - totalMC - totalWriting;
                  const q = levelTest.speakingPrompts?.[sIdx];
                  if (!q) return null;
                  const speakRecord = levelTest.speakingAnswers?.[sIdx] || "";
                  const isAudioRecord = speakRecord.startsWith("data:audio") || speakRecord.length > 500;
                  return (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 10, color: "#6b6861", fontWeight: 700, background: "#f4f0e6", padding: "3px 8px", borderRadius: 6, textTransform: "uppercase" }}>
                          Раздел: Говорение (Speaking)
                        </span>
                        <span style={{ fontSize: 11, color: "#8fa080", fontWeight: "700" }}>Сложность: {q.level}</span>
                      </div>

                      <div style={{ background: "#f4f0e6", padding: "18px", borderRadius: "12px", marginBottom: 20, border: "1px solid #e5dfd3" }}>
                        <p style={{ fontWeight: "700", color: "#1f1e1a", fontSize: "15px", marginBottom: 8, lineHeight: 1.4 }}>{q.prompt}</p>
                        <p style={{ color: "#6b6861", fontSize: "13px", fontStyle: "italic", margin: 0 }}>{q.description}</p>
                      </div>

                      {/* Live voice recorder widget */}
                      <div style={{
                        background: "#fbfaf7",
                        border: "1.5px solid #e5dfd3",
                        borderRadius: "16px",
                        padding: "24px",
                        textAlign: "center",
                        marginBottom: "24px"
                      }}>
                        {isTestRecording ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{
                              width: "55px",
                              height: "55px",
                              borderRadius: "50%",
                              background: "#df6c6c",
                              animation: "pulse 1.5s infinite",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#ffffff",
                              fontSize: "22px",
                              marginBottom: "12px"
                            }}>
                              🎙️
                            </div>
                            <span style={{ fontSize: "14px", fontWeight: "700", color: "#df6c6c", marginBottom: 4 }}>Запись звука активна...</span>
                            <span style={{ fontSize: "12px", color: "#6b6861", marginBottom: 16 }}>Длительность: {testRecordTime} сек.</span>
                            <button
                              onClick={stopTestRecording}
                              style={{
                                background: "#df6c6c",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "12px",
                                padding: "10px 24px",
                                fontSize: "13px",
                                fontWeight: "700",
                                cursor: "pointer",
                                boxShadow: "0 4px 12px rgba(223,108,108,0.25)"
                              }}
                            >
                              ⏹️ Завершить запись
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            {isAudioRecord ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                                <span style={{ fontSize: "14px", color: "#8fa080", fontWeight: "700", display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                                  ✓ Ответ успешно записан
                                </span>
                                <audio src={speakRecord} controls style={{ width: "100%", maxWidth: "340px", marginBottom: "16px" }} />
                                <button
                                  onClick={() => startTestRecording(sIdx)}
                                  style={{
                                    background: "#ffffff",
                                    color: "#6b6861",
                                    border: "1.5px solid #e5dfd3",
                                    borderRadius: "12px",
                                    padding: "10px 20px",
                                    fontSize: "13px",
                                    fontWeight: "700",
                                    cursor: "pointer"
                                  }}
                                >
                                  🔄 Перезаписать аудио
                                </button>
                              </div>
                            ) : (
                              <div>
                                <span style={{ fontSize: "14px", color: "#6b6861", marginBottom: 16, display: "block", lineHeight: "1.5" }}>
                                  Нажмите кнопку ниже и произнесите ваш устный ответ на английском языке (около 20-30 секунд)
                                </span>
                                <button
                                  onClick={() => startTestRecording(sIdx)}
                                  style={{
                                    background: "#8fa080",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "14px",
                                    padding: "14px 28px",
                                    fontSize: "14px",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                    boxShadow: "0 4px 12px rgba(143,160,128,0.25)"
                                  }}
                                >
                                  🎙️ Начать запись ответа
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Text Fallback */}
                      {!isTestRecording && (
                        <div>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: "#6b6861", marginBottom: 8, display: "block" }}>
                            Или напишите ваш ответ текстом (если не работает микрофон):
                          </span>
                          <textarea
                            style={{
                              width: "100%",
                              height: "100px",
                              background: "#ffffff",
                              border: "1.5px solid #e5dfd3",
                              borderRadius: "14px",
                              padding: "12px",
                              fontSize: "14px",
                              color: "#1f1e1a",
                              outline: "none",
                              resize: "none"
                            }}
                            placeholder="Type what you would speak aloud..."
                            value={isAudioRecord ? "" : speakRecord}
                            onChange={(e) => {
                              const nextSpeaking = [...(levelTest.speakingAnswers || [])];
                              nextSpeaking[sIdx] = e.target.value;
                              setLevelTest({ ...levelTest, speakingAnswers: nextSpeaking });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Footer controls: Back / Next with OPAQUE, HIGH CONTRAST styling */}
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  style={{
                    flex: 1,
                    padding: "14px",
                    fontSize: "14px",
                    fontWeight: "700",
                    borderRadius: "14px",
                    background: "#ffffff",
                    border: "2px solid #1f1e1a",
                    color: "#1f1e1a",
                    cursor: step === 0 ? "not-allowed" : "pointer",
                    opacity: step === 0 ? 0.3 : 1,
                    transition: "all 0.1s"
                  }}
                  disabled={step === 0}
                  onClick={() => setLevelTest({ ...levelTest, step: step - 1 })}
                >
                  ← Назад
                </button>
                
                <button
                  style={{
                    flex: 2,
                    padding: "14px",
                    fontSize: "14px",
                    fontWeight: "700",
                    borderRadius: "14px",
                    background: isStepComplete() ? "#8fa080" : "#e5dfd3",
                    color: "#ffffff",
                    border: "none",
                    cursor: isStepComplete() ? "pointer" : "not-allowed",
                    boxShadow: isStepComplete() ? "0 4px 12px rgba(143,160,128,0.2)" : "none",
                    transition: "all 0.1s"
                  }}
                  disabled={!isStepComplete()}
                  onClick={() => {
                    if (step < totalSteps - 1) {
                      // If we are in the multiple choice section
                      if (step < totalMC) {
                        const nextStep = step + 1;
                        // If the next question is already in our questions list, just go forward
                        if (levelTest.questions[nextStep] !== undefined) {
                          setLevelTest({ ...levelTest, step: nextStep });
                        } else {
                          // Adaptive selection of the next question based on answers
                          const q = levelTest.questions[step];
                          const isCorrect = levelTest.answers[step] === q.correctOptionIndex;
                          
                          let cc = levelTest.consecutiveCorrect ?? 0;
                          let cw = levelTest.consecutiveWrong ?? 0;
                          
                          if (isCorrect) {
                            cc += 1;
                            cw = 0;
                          } else {
                            cw += 1;
                            cc = 0;
                          }
                          
                          let nextLvl = levelTest.currentTargetLevel ?? "A2";
                          const levelsOrder = ["A1", "A2", "B1", "B2", "C1"];
                          let toastMsg = "";
                          
                          if (cw >= 3) {
                            // Downgrade level
                            const currentIdx = levelsOrder.indexOf(nextLvl);
                            if (currentIdx > 0) {
                              nextLvl = levelsOrder[currentIdx - 1];
                              cw = 0;
                              cc = 0;
                              toastMsg = `🔄 Адаптивный подбор: переходим на задания уровня ${nextLvl} для закрепления.`;
                            }
                          } else if (cc >= 3) {
                            // Upgrade level
                            const currentIdx = levelsOrder.indexOf(nextLvl);
                            if (currentIdx < levelsOrder.length - 1) {
                              nextLvl = levelsOrder[currentIdx + 1];
                              cw = 0;
                              cc = 0;
                              toastMsg = `🌟 Отлично справляетесь! Повышаем сложность заданий до ${nextLvl}.`;
                            }
                          }
                          
                          // If we still need to ask more multiple choice questions
                          if (nextStep < totalMC) {
                            const pool = levelTest.pool || [];
                            const unused = pool.filter((poolQ: any) => !levelTest.questions.some((ql: any) => ql.id === poolQ.id));
                            
                            let chosen = unused.find((poolQ: any) => poolQ.level === nextLvl);
                            if (!chosen) {
                              const currentLvlIdx = levelsOrder.indexOf(nextLvl);
                              for (let offset = 1; offset < levelsOrder.length; offset++) {
                                const checkLevels = [];
                                if (currentLvlIdx + offset < levelsOrder.length) checkLevels.push(levelsOrder[currentLvlIdx + offset]);
                                if (currentLvlIdx - offset >= 0) checkLevels.push(levelsOrder[currentLvlIdx - offset]);
                                for (const cl of checkLevels) {
                                  chosen = unused.find((poolQ: any) => poolQ.level === cl);
                                  if (chosen) break;
                                }
                                if (chosen) break;
                              }
                            }
                            if (!chosen && unused.length > 0) {
                              chosen = unused[0];
                            }
                            
                            if (chosen) {
                              setLevelTest({
                                ...levelTest,
                                questions: [...levelTest.questions, chosen],
                                step: nextStep,
                                currentTargetLevel: nextLvl,
                                consecutiveCorrect: cc,
                                consecutiveWrong: cw
                              });
                              if (toastMsg) {
                                setToastMessage(toastMsg);
                              }
                            } else {
                              // Fallback if no more questions: jump directly to next section or submit fast test
                              if (levelTest.type === "fast") {
                                submitLevelTestAnswers(levelTest);
                              } else {
                                setLevelTest({ ...levelTest, step: totalMC });
                              }
                            }
                          } else {
                            // Transition to writing/speaking (nextStep === totalMC)
                            setLevelTest({ ...levelTest, step: nextStep });
                          }
                        }
                      } else {
                        // Beyond MC section (Writing or Speaking)
                        setLevelTest({ ...levelTest, step: step + 1 });
                      }
                    } else {
                      triggerConfirm(
                        "Вы завершили все части теста. Отправить ответы на проверку искусственным интеллектом?",
                        () => submitLevelTestAnswers(levelTest),
                        undefined,
                        "Да, отправить"
                      );
                    }
                  }}
                >
                  {step < totalSteps - 1 ? "Дальше →" : "Завершить и оценить 📊"}
                </button>
              </div>

              {/* Abandon test link button */}
              <div style={{ textAlign: "center", marginTop: 32 }}>
                <button
                  style={{ background: "none", border: "none", color: "#df6c6c", fontSize: 13, fontWeight: "700", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => {
                    triggerConfirm(
                      "Вы действительно хотите выйти? Текущий прогресс тестирования будет безвозвратно утерян.",
                      () => setLevelTest(null),
                      undefined,
                      "Да, прервать"
                    );
                  }}
                >
                  Прервать тестирование
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 📊 CEFR LEVEL ASSESSMENT RESULTS DISPLAY */}
      {testGradeReport && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "#fbfaf7", // Beautiful warm cream layout
          zIndex: 9980,
          overflowY: "auto",
          padding: "32px 16px",
          color: "#1f1e1a",
          fontFamily: "Inter, sans-serif"
        }} className="fade-in">
          <div style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 80 }}>
            
            {/* Header circular glow badge */}
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "#ffffff",
                border: "4px solid #8fa080",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                boxShadow: "0 6px 20px rgba(143,160,128,0.2)"
              }}>
                <span style={{ fontSize: 11, color: "#6b6861", textTransform: "uppercase", fontWeight: 800, letterSpacing: 0.5 }}>УРОВЕНЬ</span>
                <span style={{ fontSize: 36, fontWeight: "900", color: "#8fa080", lineHeight: 1 }}>{testGradeReport.level}</span>
              </div>
              <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: "800", color: "#1f1e1a" }}>
                Результаты вашего CEFR теста
              </h2>
              <p style={{ fontSize: 14, color: "#6b6861", marginTop: 6 }}>
                Тест успешно оценен ИИ-асессором по шкале общеевропейской компетенции.
              </p>
            </div>

            {/* Detailed feedback text */}
            <div style={{ background: "#ffffff", border: "1.5px solid #e5dfd3", borderRadius: "16px", padding: "24px", marginBottom: "20px", boxShadow: "0 4px 12px rgba(0,0,0,0.01)" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: "#df7a5e" }}>
                📋 Заключение преподавателя:
              </h3>
              <p style={{ fontSize: 14.5, color: "#1f1e1a", lineHeight: "1.6", margin: 0, whiteSpace: "pre-wrap" }}>
                {testGradeReport.detailedFeedback}
              </p>
            </div>

            {/* 🎯 Sub-skill detailed analysis */}
            {testGradeReport.skillsBreakdown && (
              <div style={{ background: "#ffffff", border: "1.5px solid #e5dfd3", borderRadius: "16px", padding: "24px", marginBottom: "20px" }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, color: "#8fa080" }}>
                  📊 Анализ языковых навыков (CEFR):
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { key: "listening", name: "🎧 Аудирование (Listening)", data: testGradeReport.skillsBreakdown.listening },
                    { key: "reading", name: "📖 Чтение (Reading)", data: testGradeReport.skillsBreakdown.reading },
                    { key: "grammarVocabulary", name: "📝 Грамматика и Лексика (Grammar & Vocab)", data: testGradeReport.skillsBreakdown.grammarVocabulary },
                    { key: "writing", name: "✍️ Письменная речь (Writing)", data: testGradeReport.skillsBreakdown.writing },
                    { key: "speaking", name: "💬 Устная речь (Speaking)", data: testGradeReport.skillsBreakdown.speaking }
                  ].map((skill) => {
                    const data = skill.data;
                    if (!data || data.level === "N/A" || data.level === "N/A (Fast test)" || !data.level) return null;
                    
                    let proximityLabel = "Стабильный уровень";
                    let proximityColor = "#4e6a45";
                    let proximityBg = "#eff5ec";
                    
                    if (data.proximity === "almost") {
                      proximityLabel = "Почти доходит до следующего уровня";
                      proximityColor = "#b25e38";
                      proximityBg = "#fdf2ec";
                    } else if (data.proximity === "far") {
                      proximityLabel = "Еще далеко до следующего уровня";
                      proximityColor = "#615c54";
                      proximityBg = "#f1ece4";
                    }
                    
                    return (
                      <div key={skill.key} style={{
                        padding: "14px",
                        borderRadius: "12px",
                        background: "#fbfaf7",
                        border: "1px solid #e5dfd3",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <span style={{ fontWeight: "700", fontSize: 14, color: "#1f1e1a" }}>{skill.name}</span>
                          <span style={{
                            fontSize: 14,
                            fontWeight: "900",
                            color: "#ffffff",
                            background: "#8fa080",
                            padding: "2px 10px",
                            borderRadius: "20px"
                          }}>{data.level}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{
                            fontSize: 11.5,
                            fontWeight: "700",
                            color: proximityColor,
                            background: proximityBg,
                            padding: "3px 10px",
                            borderRadius: "6px"
                          }}>
                            {proximityLabel}
                          </span>
                        </div>
                        <p style={{ fontSize: 12.5, color: "#6b6861", margin: "2px 0 0 0", lineHeight: 1.4 }}>
                          {data.comment}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Strengths & Gaps */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 24 }}>
              {/* Strengths */}
              <div style={{ background: "#ffffff", padding: "20px", borderRadius: "16px", border: "1.5px solid #e5dfd3" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 13, fontWeight: "800", color: "#8fa080", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  💪 Ваши сильные стороны:
                </h4>
                <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {testGradeReport.strengths?.map((str, i) => (
                    <li key={i} style={{ fontSize: 13.5, color: "#1f1e1a", display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.4 }}>
                      <span style={{ color: "#8fa080", fontWeight: "bold" }}>✓</span>
                      <span>{str}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Weaknesses */}
              <div style={{ background: "#ffffff", padding: "20px", borderRadius: "16px", border: "1.5px solid #e5dfd3" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 13, fontWeight: "800", color: "#df6c6c", textTransform: "uppercase", letterSpacing: 0.8 }}>
                  🎯 Зоны для развития:
                </h4>
                <ul style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {testGradeReport.weaknesses?.map((weak, i) => (
                    <li key={i} style={{ fontSize: 13.5, color: "#1f1e1a", display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.4 }}>
                      <span style={{ color: "#df6c6c", fontWeight: "bold" }}>•</span>
                      <span>{weak}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Detailed Question review expansion list */}
            <h3 style={{ fontSize: 14, fontWeight: "800", color: "#1f1e1a", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14, paddingLeft: 4 }}>
              🔍 Подробный разбор вопросов:
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
              {testGradeReport.reportData?.map((rep: any, idx: number) => (
                <div key={idx} style={{
                  padding: 20,
                  borderRadius: "14px",
                  border: "1.5px solid #e5dfd3",
                  background: rep.isCorrect ? "#f0f4ed" : "#fdf4f2"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: "700", color: "#6b6861" }}>Вопрос {rep.questionId} ({rep.level})</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: rep.isCorrect ? "#8fa080" : "#df6c6c",
                      background: "#ffffff",
                      padding: "3px 10px",
                      borderRadius: 6,
                      border: `1px solid ${rep.isCorrect ? "#8fa080" : "#df6c6c"}`
                    }}>
                      {rep.isCorrect ? "ВЕРНО" : "НЕВЕРНО"}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: "700", color: "#1f1e1a", marginBottom: 12, lineHeight: 1.4 }}>{rep.text}</p>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#1f1e1a", marginBottom: 12 }}>
                    <div><span style={{ color: "#8fa080", fontWeight: "700" }}>✓ Верный ответ:</span> {rep.correctOption}</div>
                    {!rep.isCorrect && (
                      <div><span style={{ color: "#df6c6c", fontWeight: "700" }}>✗ Ваш выбор:</span> {rep.studentAnswer}</div>
                    )}
                  </div>
                  <div style={{ background: "#ffffff", padding: 12, borderRadius: 8, fontSize: 12.5, color: "#6b6861", borderLeft: "4px solid #e5dfd3", lineHeight: 1.5 }}>
                    <strong>Пояснение:</strong> {rep.explanation}
                  </div>
                </div>
              ))}
            </div>

            {/* Save profile score actions with solid, high-contrast, fully opaque styling */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                style={{
                  width: "100%",
                  padding: 16,
                  fontSize: 14,
                  fontWeight: "700",
                  background: "#8fa080",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "14px",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(143,160,128,0.25)"
                }}
                onClick={() => {
                  const updatedStats = { ...stats, level: testGradeReport.level };
                  onSaveProgress(updatedStats);
                  setTestGradeReport(null);
                  setToastMessage(`Уровень владения успешно обновлен до ${updatedStats.level}! 🎉`);
                }}
              >
                ✓ Подтвердить и сохранить уровень {testGradeReport.level} в профиль
              </button>
              <button
                style={{
                  width: "100%",
                  padding: 14,
                  fontSize: 13,
                  fontWeight: "700",
                  background: "#ffffff",
                  border: "2px solid #1f1e1a",
                  color: "#1f1e1a",
                  borderRadius: "14px",
                  cursor: "pointer"
                }}
                onClick={() => setTestGradeReport(null)}
              >
                Вернуться на панель без сохранения
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Header Panel */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <button 
          className="back-btn"
          onClick={() => {
            stopCamera();
            onBack();
          }}
        >
          ← Назад
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={16} className="text-sage" style={{ color: "var(--sage)" }} />
          <span style={{ fontFamily: "Lora, serif", fontWeight: 600, fontStyle: "italic", fontSize: 16, color: "var(--warm)" }}>
            Gemini AI Hub
          </span>
        </div>
      </div>

      {/* Tutor Selection Header */}
      <div className="card p-3 px-4 md:p-4 md:px-5 border border-[var(--border)]" style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Личный ИИ-преподаватель</div>
              <div style={{ fontFamily: "Lora, serif", fontSize: 16, fontStyle: "italic", fontWeight: 600, color: "var(--sage)" }}>
                {tutor === "sophia" ? "Sophia 🌸" : tutor === "oliver" ? "Oliver 🧠" : "Alex 🚀"}
              </div>
            </div>
            
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(["sophia", "oliver", "alex"] as const).map(roleName => (
                <button
                  key={roleName}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 600,
                    border: tutor === roleName ? "1.5px solid var(--sage)" : "1.5px solid transparent",
                    background: tutor === roleName ? "rgba(143,160,128,0.12)" : "rgba(255,255,255,0.03)",
                    color: tutor === roleName ? "var(--sage)" : "var(--muted)",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => handleTutorChange(roleName)}
                >
                  {roleName === "sophia" ? `Sophia (${getCurrentTutorLevel("sophia")})` : roleName === "oliver" ? `Oliver (${getCurrentTutorLevel("oliver")})` : `Alex (${getCurrentTutorLevel("alex")})`}
                </button>
              ))}
            </div>
          </div>
          
          <p className="hidden sm:block" style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
            {tutor === "sophia" ? "Warm conversation, gentle corrections & soft explanations" : 
             tutor === "oliver" ? "Strict deep grammatical parsing & alternative forms" : 
             "Casual street talk, New York slang, cool peer rephrasing"}
          </p>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, background: "rgba(143,160,128,0.18)", color: "var(--sage)", padding: "2px 8px", borderRadius: "99px", fontWeight: 600 }}>
              Уровень у {tutor === "sophia" ? "Sophia" : tutor === "oliver" ? "Oliver" : "Alex"}: {getCurrentTutorLevel(tutor)}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              (Индивидуальная оценка у каждого учителя 📊)
            </span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex rounded-[1.5rem] bg-[rgba(255,255,255,0.03)] border border-[var(--border)] p-1" style={{ marginBottom: "32px" }}>
        <button
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "1.2rem",
            fontSize: 13,
            fontWeight: 600,
            background: activeTab === "chat" ? "rgba(255,255,255,0.9)" : "transparent",
            color: activeTab === "chat" ? "#1a1a1a" : "var(--muted)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6
          }}
          onClick={() => {
            stopCamera();
            setActiveTab("chat");
          }}
        >
          💬 ИИ-Чат
        </button>
        <button
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "1.2rem",
            fontSize: 13,
            fontWeight: 600,
            background: activeTab === "voice" ? "rgba(255,255,255,0.9)" : "transparent",
            color: activeTab === "voice" ? "#1a1a1a" : "var(--muted)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6
          }}
          onClick={() => {
            stopCamera();
            setActiveTab("voice");
          }}
        >
          🎙️ Голос
        </button>
        <button
          style={{
            flex: 1,
            padding: "10px",
            borderRadius: "1.2rem",
            fontSize: 13,
            fontWeight: 600,
            background: activeTab === "scanner" ? "rgba(255,255,255,0.9)" : "transparent",
            color: activeTab === "scanner" ? "#1a1a1a" : "var(--muted)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6
          }}
          onClick={() => setActiveTab("scanner")}
        >
          📷 Сканер
        </button>
      </div>

      {/* --- TAB CONTENT 1: CHAT --- */}
      {activeTab === "chat" && (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", maxWidth: "100%" }}>
          {/* Chat Sessions Multi-Chat Switcher */}
          <div style={{ marginBottom: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "6px", width: "100%", maxWidth: "100%" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, paddingLeft: 4 }}>
              Мои диалоги:
            </div>
            <div 
              className="styled-scrollbar-x" 
              style={{ 
                display: "flex", 
                gap: 8, 
                overflowX: "auto", 
                paddingLeft: 4,
                paddingBottom: 10,
                alignItems: "center",
                width: "100%",
                maxWidth: "100%"
              }}
            >
              {chatSessions
                .filter(s => s.tutor === tutor)
                .map((s, index, arr) => (
                  <div 
                    key={s.id} 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 6, 
                      padding: "4px 10px", 
                      borderRadius: "999px", 
                      background: s.id === activeChatSessionId ? "rgba(143,160,128,0.22)" : "rgba(255,255,255,0.03)", 
                      border: s.id === activeChatSessionId ? "1px solid var(--sage)" : "1px solid var(--border)",
                      color: s.id === activeChatSessionId ? "var(--sage)" : "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      flexShrink: 0
                    }}
                    onClick={() => setActiveChatSessionId(s.id)}
                  >
                    {editingSessionId === s.id ? (
                      <input
                        type="text"
                        value={editingSessionTitle}
                        onChange={e => setEditingSessionTitle(e.target.value)}
                        onBlur={() => handleRenameSession(s.id)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleRenameSession(s.id);
                          if (e.key === "Escape") setEditingSessionId(null);
                        }}
                        autoFocus
                        style={{
                          background: "rgba(0,0,0,0.15)",
                          color: "var(--warm)",
                          border: "1px solid var(--sage)",
                          borderRadius: "4px",
                          padding: "1px 6px",
                          fontSize: "11px",
                          width: "80px"
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span 
                        style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingSessionId(s.id);
                          setEditingSessionTitle(s.title);
                        }}
                      >
                        {s.title}
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(s.id);
                            setEditingSessionTitle(s.title);
                          }}
                          style={{ cursor: "pointer", opacity: 0.6, fontSize: "10px" }}
                          title="Переименовать"
                        >
                          ✏️
                        </span>
                      </span>
                    )}
                    {arr.length > 1 && (
                      <button 
                        style={{ 
                          background: "none", 
                          border: "none", 
                          color: "var(--muted)", 
                          padding: "0 2px 0 6px", 
                          cursor: "pointer",
                          fontSize: 10,
                          fontWeight: "bold"
                        }}
                        title="Удалить чат"
                        onClick={(e) => {
                          e.stopPropagation();
                          stopAllSpeech();
                          const remaining = chatSessions.filter(item => item.id !== s.id);
                          setChatSessions(remaining);
                          if (s.id === activeChatSessionId) {
                            const nextActive = remaining.find(item => item.tutor === tutor);
                            if (nextActive) {
                              setActiveChatSessionId(nextActive.id);
                            }
                          }
                          setToastMessage("Чат успешно удален");
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))
              }
              <button
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: "rgba(143,160,128,0.12)",
                  border: "1px dashed var(--sage)",
                  color: "var(--sage)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}
                onClick={() => {
                  const matching = chatSessions.filter(s => s.tutor === tutor);
                  const newId = `session-${tutor}-${Date.now()}`;
                  const defaultGreetings = {
                    sophia: "Hello! I am Sophia, your warm and friendly AI English tutor. I'm here to help you practice conversational English, correct mistakes, and explain words. Feel free to chat in English or Russian! 😊",
                    oliver: "Greetings. I am Oliver, your analytical grammar specialist. Let's begin: please write or speak an English sentence.",
                    alex: "Yo! I'm Alex, a casual native speaker from NYC. What's up? 🚀"
                  };
                  const newSession: ChatSession = {
                    id: newId,
                    tutor: tutor,
                    title: `Диалог ${matching.length + 1}`,
                    created: new Date().toISOString(),
                    messages: [{ role: "model", text: defaultGreetings[tutor] }],
                    mode: chatMode
                  };
                  setChatSessions(prev => [...prev, newSession]);
                  setActiveChatSessionId(newId);
                  setToastMessage("Новый чат создан!");
                }}
              >
                <Plus size={12} /> Новый
              </button>
            </div>
          </div>

          {/* 🎯 Activities Panel */}
          <div className="card" style={{ padding: 16, marginBottom: 16, background: "rgba(143,160,128,0.03)", border: "1.5px solid rgba(143,160,128,0.15)" }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: 12, fontWeight: 700, color: "var(--sage)", textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
              <span>🎯</span> Чем займемся сегодня?
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: 8 }}>
              <button 
                className="btn btn-outline" 
                style={{ fontSize: 11.5, padding: "8px 4px", display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.01)" }}
                onClick={() => {
                  setChatInput("📝 Проведи для меня упражнение на грамматику английского языка на моем уровне. Напиши предложение с пропуском, чтобы я вставил правильную форму, а если я ошибусь — подробно объясни правило на русском!");
                }}
              >
                <span style={{ fontSize: 16 }}>📝</span>
                <span style={{ fontWeight: 600 }}>Грамматика</span>
              </button>
              <button 
                className="btn btn-outline" 
                style={{ fontSize: 11.5, padding: "8px 4px", display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.01)" }}
                onClick={() => {
                  setChatInput("🎙️ Давай проведем словарный диктант. Называй по одному слову на английском из моего словаря, чтобы я писал перевод, либо называй на русском, чтобы я переводил на английский!");
                }}
              >
                <span style={{ fontSize: 16 }}>🎙️</span>
                <span style={{ fontWeight: 600 }}>Диктант слов</span>
              </button>
              <button 
                className="btn btn-outline" 
                style={{ fontSize: 11.5, padding: "8px 4px", display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.01)" }}
                onClick={() => {
                  setChatInput("🗣️ Предложи мне интересную тему для обсуждения на английском языке на моем уровне и задай мне первый вопрос!");
                }}
              >
                <span style={{ fontSize: 16 }}>🗣️</span>
                <span style={{ fontWeight: 600 }}>Новая тема</span>
              </button>
              <button 
                className="btn btn-outline" 
                style={{ fontSize: 11.5, padding: "8px 4px", display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center", borderColor: "rgba(143,160,128,0.4)", color: "var(--sage)", background: "rgba(143,160,128,0.02)" }}
                onClick={() => {
                  triggerConfirm(
                    "Запустить быстрый 15-минутный тест на уровень владения (CEFR)?",
                    () => startCEFRLevelTest("fast"),
                    undefined,
                    "Да, начать"
                  );
                }}
              >
                <span style={{ fontSize: 16 }}>⚡</span>
                <span style={{ fontWeight: 600 }}>Тест (Быстрый)</span>
              </button>
              <button 
                className="btn btn-outline" 
                style={{ fontSize: 11.5, padding: "8px 4px", display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center", borderColor: "rgba(181,93,76,0.4)", color: "var(--warm)", background: "rgba(181,93,76,0.02)" }}
                onClick={() => {
                  triggerConfirm(
                    "Запустить полный 1-часовой тест на 100% подтверждение уровня владения?",
                    () => startCEFRLevelTest("full"),
                    undefined,
                    "Да, начать"
                  );
                }}
              >
                <span style={{ fontSize: 16 }}>📊</span>
                <span style={{ fontWeight: 600 }}>Тест (Полный)</span>
              </button>
            </div>
          </div>

          {/* Prominent Vocabulary Extraction Banner (Moved Up & Spaced Out) */}
          {chatMessages.length > 2 && (
            <div style={{ 
              marginBottom: "28px", 
              marginTop: "12px",
              padding: "16px 20px",
              background: "rgba(143,160,128,0.06)",
              border: "1.5px dashed rgba(143,160,128,0.25)",
              borderRadius: "18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "20px" }}>💎</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--sage)", marginBottom: 2 }}>
                    Извлечь новые слова из диалога
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.3 }}>
                    ИИ проанализирует текущую беседу и поможет сохранить интересные фразы в ваш словарь.
                  </div>
                </div>
              </div>
              <button
                style={{
                  padding: "8px 18px",
                  fontSize: "12px",
                  fontWeight: "700",
                  background: "var(--sage)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 12px rgba(143,160,128,0.2)",
                  transition: "all 0.2s ease"
                }}
                onClick={handleMineVocabulary}
              >
                📥 Извлечь и выучить новые слова
              </button>
            </div>
          )}

          {/* Chat Settings Toggles */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 10px",
                borderRadius: "999px",
                fontSize: 11,
                fontWeight: 500,
                background: chatMode === "general" ? "var(--sage)" : "rgba(255,255,255,0.03)",
                color: chatMode === "general" ? "#fff" : "var(--muted)",
                border: "1px solid var(--border)",
                cursor: "pointer"
              }}
              onClick={() => handleChatModeChange("general")}
            >
              ⚡ Flash (Стандартный)
            </button>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 10px",
                borderRadius: "999px",
                fontSize: 11,
                fontWeight: 500,
                background: chatMode === "thinking" ? "var(--rose)" : "rgba(255,255,255,0.03)",
                color: chatMode === "thinking" ? "#fff" : "var(--muted)",
                border: "1px solid var(--border)",
                cursor: "pointer"
              }}
              onClick={() => handleChatModeChange("thinking")}
            >
              <Brain size={12} /> Pro Thinking (Рассуждение)
            </button>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 10px",
                borderRadius: "999px",
                fontSize: 11,
                fontWeight: 500,
                background: chatMode === "low-latency" ? "rgba(143,160,128,0.3)" : "rgba(255,255,255,0.03)",
                color: chatMode === "low-latency" ? "var(--sage)" : "var(--muted)",
                border: "1px solid var(--border)",
                cursor: "pointer"
              }}
              onClick={() => handleChatModeChange("low-latency")}
            >
              <Zap size={12} /> Lite (Быстрый)
            </button>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 10px",
                borderRadius: "999px",
                fontSize: 11,
                fontWeight: 500,
                background: chatMode === "grounding" ? "rgba(214,128,96,0.3)" : "rgba(255,255,255,0.03)",
                color: chatMode === "grounding" ? "var(--rose)" : "var(--muted)",
                border: "1px solid var(--border)",
                cursor: "pointer"
              }}
              onClick={() => handleChatModeChange("grounding")}
            >
              <Globe size={12} /> Поиск Google
            </button>

            {/* Auto Voice toggle & Reset buttons */}
            <div className="md:ml-auto flex gap-1.5">
              <button
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 10px",
                  borderRadius: "999px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: chatVoiceEnabled ? "rgba(143,160,128,0.2)" : "rgba(255,255,255,0.03)",
                  color: chatVoiceEnabled ? "var(--sage)" : "var(--muted)",
                  border: "1px solid var(--border)",
                  cursor: "pointer"
                }}
                onClick={() => {
                  const newState = !chatVoiceEnabled;
                  setChatVoiceEnabled(newState);
                  if (!newState) {
                    stopAllSpeech();
                  }
                }}
              >
                {chatVoiceEnabled ? "🔊 Спикер: ВКЛ" : "🔇 Спикер: ВЫКЛ"}
              </button>
              <button
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 10px",
                  borderRadius: "999px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(214,128,96,0.1)",
                  color: "var(--rose)",
                  border: "1px solid var(--border)",
                  cursor: "pointer"
                }}
                onClick={() => {
                  stopAllSpeech();
                  const greetings = {
                    sophia: "Hello! I am Sophia, your warm and friendly AI English tutor. I'm here to help you practice conversational English, correct mistakes, and explain words. Feel free to chat in English or Russian! 😊",
                    oliver: "Greetings. I am Oliver, your analytical grammar specialist. I will closely review your sentences for preposition, tense, or spelling discrepancies. Let's begin: please write or speak an English sentence.",
                    alex: "Yo! I'm Alex, a casual native speaker from NYC. Forget boring textbooks, let's chat about whatever you want. If you make a mistake, I'll show you how we actually say it in the real world. What's up? 🚀"
                  };
                  setChatMessages([{ role: "model", text: greetings[tutor], timestamp: new Date().toISOString() }]);
                  setToastMessage("Диалог перезапущен");
                }}
              >
                🔄 Сбросить
              </button>
            </div>
          </div>

          {/* Messages Display */}
          <div 
            id="ai_chat_scroll_container"
            className="styled-scrollbar-y"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              marginTop: 12,
              marginBottom: 16,
              padding: "4px 8px 4px 4px",
              maxHeight: "500px",
              overflowY: "auto"
            }}
          >
            {chatMessages.map((msg, index) => (
              <div 
                key={index}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: msg.role === "user" ? "var(--sage)" : "var(--card)",
                  border: msg.role === "user" ? "none" : "1.5px solid var(--border)",
                  color: msg.role === "user" ? "#fff" : "var(--warm)",
                  borderRadius: "1.2rem",
                  padding: "12px 14px",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  whiteSpace: "pre-line",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.01)",
                  position: "relative"
                }}
              >
                {/* Delete message button */}
                <button
                  style={{
                    position: "absolute",
                    top: 2,
                    right: msg.role === "user" ? "auto" : -26,
                    left: msg.role === "user" ? -26 : "auto",
                    background: "transparent",
                    color: "rgba(255,255,255,0.25)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: 4,
                  }}
                  title="Удалить это сообщение"
                  onClick={() => {
                    stopAllSpeech();
                    setChatMessages(prev => {
                      const updated = prev.filter((_, i) => i !== index);
                      if (updated.length === 0) {
                        const greetings = {
                          sophia: "Hello! I am Sophia, your warm and friendly AI English tutor. 😊",
                          oliver: "Greetings. I am Oliver, your analytical grammar specialist.",
                          alex: "Yo! I'm Alex, a casual native speaker from NYC. What's up? 🚀"
                        };
                        return [{ role: "model", text: greetings[tutor], timestamp: new Date().toISOString() }];
                      }
                      return updated;
                    });
                    setToastMessage("Сообщение удалено");
                  }}
                >
                  ✕
                </button>

                {renderFormattedText(msg.text, msg.role === "user")}

                {/* Message Timestamp */}
                {(msg.timestamp || activeChatSession?.created) && (
                  <div 
                    style={{ 
                      fontSize: 10, 
                      textAlign: "right", 
                      marginTop: 4, 
                      color: msg.role === "user" ? "rgba(255, 255, 255, 0.55)" : "var(--muted)",
                      opacity: 0.8
                    }}
                  >
                    {formatMessageTimestamp(msg.timestamp || activeChatSession?.created)}
                  </div>
                )}

                {/* Sources / Grounding Tags */}
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", display: "flex", alignItems: "center", gap: 3, width: "100%" }}>
                      <Globe size={10} /> Источники Google Search:
                    </div>
                    {msg.sources.map((src, sIdx) => (
                      <a 
                        key={sIdx}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 10,
                          color: "#fff",
                          background: "rgba(214,128,96,0.3)",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          textDecoration: "none",
                          fontWeight: 500,
                          display: "inline-block"
                        }}
                      >
                        {src.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && loadingSessionId === activeChatSessionId && (
              <div style={{ alignSelf: "flex-start", padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: "1.2rem", display: "flex", alignItems: "center", gap: 6 }}>
                <Loader2 size={16} className="animate-spin" style={{ color: "var(--sage)" }} />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Печатает ответ...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Action Toolbar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px", marginBottom: "28px" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Всего сообщений: {chatMessages.length}
            </span>
          </div>

          {showDictionaryButton && pendingWordToAdd && !wordConfirmModal && (
            <div 
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(143, 160, 128, 0.12)",
                border: "1.5px solid var(--sage)",
                borderRadius: "1rem",
                padding: "8px 12px",
                marginBottom: 8,
                gap: 10
              }}
            >
              <div style={{ fontSize: 12.5, color: "var(--text-color)" }}>
                ИИ рекомендует слово: <strong style={{ color: "var(--sage)" }}>{pendingWordToAdd.en}</strong>{" "}
                <span 
                  onClick={() => setRevealTranslation(true)} 
                  style={{ 
                    cursor: revealTranslation ? "default" : "pointer", 
                    opacity: 0.9,
                    fontSize: 11.5,
                    textDecoration: revealTranslation ? "none" : "underline",
                    background: revealTranslation ? "none" : "rgba(255,255,255,0.06)",
                    padding: revealTranslation ? "0" : "2px 6px",
                    borderRadius: "4px",
                    marginLeft: 4,
                    color: revealTranslation ? "var(--text-color)" : "var(--sage)"
                  }}
                  title={revealTranslation ? undefined : "Нажмите, чтобы показать перевод"}
                >
                  {revealTranslation ? `(${pendingWordToAdd.ru})` : "(👁️ показать перевод)"}
                </span>
              </div>
              <button
                className="btn btn-primary"
                style={{
                  padding: "4px 12px",
                  fontSize: 11,
                  borderRadius: "999px",
                  fontWeight: 600,
                  whiteSpace: "nowrap"
                }}
                onClick={() => setWordConfirmModal(pendingWordToAdd)}
              >
                📖 Добавить
              </button>
            </div>
          )}

          {/* Chat Input */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: "16px" }}>
            <textarea
              ref={textareaRef}
              rows={2}
              placeholder="Введите сообщение в свободной форме..."
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: "1rem",
                border: "1.5px solid var(--border)",
                background: "rgba(255,255,255,0.02)",
                padding: "12px 16px",
                fontSize: 14,
                color: "var(--warm)",
                resize: "none",
                minHeight: "72px",
                maxHeight: "150px",
                overflowY: "auto",
                fontFamily: "inherit",
                lineHeight: "1.4"
              }}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChatMessage();
                }
              }}
              disabled={chatLoading}
            />
            <button
              style={{
                background: "var(--sage)",
                color: "#fff",
                border: "none",
                borderRadius: "50%",
                width: 56,
                height: 56,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(143,160,128,0.3)",
                flexShrink: 0
              }}
              onClick={handleSendChatMessage}
              disabled={chatLoading || !chatInput.trim()}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* --- TAB CONTENT 2: VOICE PRACTICE --- */}
      {activeTab === "voice" && (
        <div style={{ width: "100%", maxWidth: "100%", display: "flex", flexDirection: "column", alignItems: "center" }} className="px-1">
          {/* Active Chat Switcher in Voice Tab too! */}
          <div style={{ marginBottom: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "6px", width: "100%", maxWidth: "100%" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, paddingLeft: 4 }}>
              Мои диалоги:
            </div>
            <div 
              className="styled-scrollbar-x" 
              style={{ 
                display: "flex", 
                gap: 8, 
                overflowX: "auto", 
                paddingLeft: 4,
                paddingBottom: 10,
                alignItems: "center",
                width: "100%",
                maxWidth: "100%"
              }}
            >
              {voiceSessions
                .filter(s => s.tutor === tutor)
                .map((s, index, arr) => (
                  <div 
                    key={s.id} 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 6, 
                      padding: "4px 10px", 
                      borderRadius: "999px", 
                      background: s.id === activeVoiceSessionId ? "rgba(143,160,128,0.22)" : "rgba(255,255,255,0.03)", 
                      border: s.id === activeVoiceSessionId ? "1px solid var(--sage)" : "1px solid var(--border)",
                      color: s.id === activeVoiceSessionId ? "var(--sage)" : "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      flexShrink: 0
                    }}
                    onClick={() => setActiveVoiceSessionId(s.id)}
                  >
                    {editingSessionId === s.id ? (
                      <input
                        type="text"
                        value={editingSessionTitle}
                        onChange={e => setEditingSessionTitle(e.target.value)}
                        onBlur={() => handleRenameSession(s.id)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleRenameSession(s.id);
                          if (e.key === "Escape") setEditingSessionId(null);
                        }}
                        autoFocus
                        style={{
                          background: "rgba(0,0,0,0.15)",
                          color: "var(--warm)",
                          border: "1px solid var(--sage)",
                          borderRadius: "4px",
                          padding: "1px 6px",
                          fontSize: "11px",
                          width: "80px"
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span 
                        style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingSessionId(s.id);
                          setEditingSessionTitle(s.title);
                        }}
                      >
                        {s.title}
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(s.id);
                            setEditingSessionTitle(s.title);
                          }}
                          style={{ cursor: "pointer", opacity: 0.6, fontSize: "10px" }}
                          title="Переименовать"
                        >
                          ✏️
                        </span>
                      </span>
                    )}
                    {arr.length > 1 && (
                      <button 
                        style={{ 
                          background: "none", 
                          border: "none", 
                          color: "var(--muted)", 
                          padding: "0 2px 0 6px", 
                          cursor: "pointer",
                          fontSize: 10,
                          fontWeight: "bold"
                        }}
                        title="Удалить чат"
                        onClick={(e) => {
                          e.stopPropagation();
                          const remaining = voiceSessions.filter(item => item.id !== s.id);
                          setVoiceSessions(remaining);
                          if (s.id === activeVoiceSessionId) {
                            const nextActive = remaining.find(item => item.tutor === tutor);
                            if (nextActive) {
                              setActiveVoiceSessionId(nextActive.id);
                            }
                          }
                          setToastMessage("Чат успешно удален");
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))
              }
              <button
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: "rgba(143,160,128,0.12)",
                  border: "1px dashed var(--sage)",
                  color: "var(--sage)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}
                onClick={() => {
                  const matching = voiceSessions.filter(s => s.tutor === tutor);
                  const newId = `voice-session-${tutor}-${Date.now()}`;
                  const defaultVoiceGreetings = {
                    sophia: "Welcome to the Voice Club! I'm ready to listen. Click the microphone button below to start recording your voice, practice speaking English naturally, and hear me reply!",
                    oliver: "Welcome to the Voice Club. Speak clearly. I will highlight any grammatical mistakes you make in your speech.",
                    alex: "Yo, welcome to the voice corner! Hit the mic, say whatever's on your mind, and let's roll."
                  };
                  const newSession: VoiceSession = {
                    id: newId,
                    tutor: tutor,
                    title: `Голосовой диалог ${matching.length + 1}`,
                    created: new Date().toISOString(),
                    voiceMessages: [{ role: "model", text: defaultVoiceGreetings[tutor] }]
                  };
                  setVoiceSessions(prev => [...prev, newSession]);
                  setActiveVoiceSessionId(newId);
                  setToastMessage("Новый голосовой диалог создан!");
                }}
              >
                <Plus size={12} /> Новый
              </button>
            </div>
          </div>

          {/* Voice Tuning Dashboard Panel */}
          <div style={{
            width: "100%",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--border)",
            borderRadius: "1rem",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            boxSizing: "border-box"
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--sage)", display: "flex", alignItems: "center", gap: 5 }}>
              ⚡ Мгновенный голосовой режим (Оптимизация скорости)
            </div>
            
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
                <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>Распознавание голоса:</span>
                <select
                  className="select"
                  style={{
                    fontSize: 11,
                    padding: "6px 8px",
                    width: "100%"
                  }}
                  value={useNativeSpeechRec ? "native" : "gemini"}
                  onChange={e => setUseNativeSpeechRec(e.target.value === "native")}
                >
                  <option value="native">⚡ Мгновенный (Браузер)</option>
                  <option value="gemini">🎙️ Запись файла (ИИ Gemini)</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
                <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>Озвучивание ответов:</span>
                <select
                  className="select"
                  style={{
                    fontSize: 11,
                    padding: "6px 8px",
                    width: "100%"
                  }}
                  value={useNativeSpeechSynth ? "native" : "gemini"}
                  onChange={e => setUseNativeSpeechSynth(e.target.value === "native")}
                >
                  <option value="native">⚡ Мгновенный (Браузер)</option>
                  <option value="gemini">🤖 Студийный ИИ (Gemini TTS)</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 8, marginTop: 4 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
                <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>Темп речи ИИ-преподавателя:</span>
                <select
                  className="select"
                  style={{
                    fontSize: 11,
                    padding: "6px 8px",
                    width: "100%"
                  }}
                  value={speechPace}
                  onChange={e => setSpeechPace(e.target.value as any)}
                >
                  <option value="slow">🐌 Медленный (С заботой / Slow)</option>
                  <option value="normal">🗣️ Обычный (Средний / Normal)</option>
                  <option value="fast">🚀 Быстрый (Носитель / Fast)</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
                <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>Длина реплик ИИ (Verbosity):</span>
                <select
                  className="select"
                  style={{
                    fontSize: 11,
                    padding: "6px 8px",
                    width: "100%"
                  }}
                  value={verbosity}
                  onChange={e => setVerbosity(e.target.value as any)}
                >
                  <option value="short">💬 Короткие ответы (Компактный)</option>
                  <option value="medium">🗣️ Диалог (Средняя длина)</option>
                  <option value="long">📖 Mini-лекция (С разбором правил)</option>
                </select>
              </div>
            </div>

            {useNativeSpeechRec ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 8, marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Язык вашего ввода:</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        fontSize: 10,
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        background: speechRecLang === "en-US" ? "var(--sage)" : "rgba(255,255,255,0.04)",
                        color: speechRecLang === "en-US" ? "#fff" : "var(--muted)"
                      }}
                      onClick={() => setSpeechRecLang("en-US")}
                    >
                      English 🇺🇸
                    </button>
                    <button
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        fontSize: 10,
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        background: speechRecLang === "ru-RU" ? "var(--sage)" : "rgba(255,255,255,0.04)",
                        color: speechRecLang === "ru-RU" ? "#fff" : "var(--muted)"
                      }}
                      onClick={() => setSpeechRecLang("ru-RU")}
                    >
                      Русский 🇷🇺
                    </button>
                  </div>
                </div>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>⚠️ Браузерный режим работает непрерывно и останавливается только по нажатию кнопки "Остановить".</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "var(--sage)" }}>💡 <b>ИИ Gemini автоматически определяет язык</b> (Русский/Английский). Ничего переключать не нужно, запись идет непрерывно, пока вы не нажмете кнопку "Остановить".</span>
              </div>
            )}
          </div>

          {/* Grounded News Topic Generator Card */}
          <div className="card fade-in" style={{
            width: "100%",
            background: "rgba(143,160,128,0.03)",
            border: "1.5px solid rgba(143,160,128,0.15)",
            borderRadius: "1rem",
            padding: "16px",
            marginTop: "16px",
            marginBottom: "24px",
            boxSizing: "border-box"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--sage)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>🌐</span> Свежая тема из интернета
              </div>
              <button
                className="btn btn-outline"
                style={{ fontSize: 11, padding: "5px 12px", background: "rgba(143,160,128,0.1)", color: "var(--sage)", borderColor: "rgba(143,160,128,0.3)" }}
                disabled={isGeneratingTopic}
                onClick={async () => {
                  setIsGeneratingTopic(true);
                  try {
                    const response = await fetch(getApiUrl("/api/ai-voice-topic"), {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ role: tutor, userLevel: getCurrentTutorLevel(tutor) })
                    });
                    if (!response.ok) throw new Error("Failed to generate topic");
                    const data = await response.json();
                    setVoiceTopic({
                      title: data.topicTitle,
                      text: data.topicText,
                      translation: data.topicTranslation,
                      sourceUrl: data.sourceUrl,
                      audio: data.replyAudio
                    });
                    setShowTopicTranslation(false);
                    setToastMessage("Новая тема успешно найдена! 🌐");
                  } catch (e) {
                    console.error(e);
                    setToastMessage("⚠️ Не удалось получить тему.");
                  } finally {
                    setIsGeneratingTopic(false);
                  }
                }}
              >
                {isGeneratingTopic ? "⏳ Ищем новости..." : "🔄 Найти новую тему"}
              </button>
            </div>

            {voiceTopic ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }} className="fade-in">
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--warm)", textDecoration: "underline" }}>
                    {voiceTopic.title}
                  </span>
                  {voiceTopic.sourceUrl && (
                    <a href={voiceTopic.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--sage)", display: "flex", alignItems: "center", gap: 2 }}>
                      (Источник 🌐)
                    </a>
                  )}
                </div>
                
                <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, margin: 0, fontStyle: "italic", background: "rgba(0,0,0,0.15)", padding: 12, borderRadius: 8, borderLeft: "3px solid var(--sage)" }}>
                  "{voiceTopic.text}"
                </p>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 11.5, padding: "6px 12px", background: "var(--sage)", border: "none" }}
                    onClick={() => {
                      if (!voiceTopic) return;
                      
                      setVoiceMessagesForSession(activeVoiceSessionId, prev => [
                        ...prev, 
                        { role: "model", text: voiceTopic.text, timestamp: new Date().toISOString() }
                      ]);
                      
                      if (useNativeSpeechSynth || !voiceTopic.audio) {
                        speakText(voiceTopic.text, () => {
                          setIsSpeechPlaying(false);
                        });
                      } else if (voiceTopic.audio && voiceVoiceEnabled) {
                        setIsSpeechPlaying(true);
                        const onPlaybackEnd = () => {
                          setIsSpeechPlaying(false);
                        };
                        stopAllSpeech();
                        const audio = new Audio(voiceTopic.audio);
                        currentAudioRef.current = audio;
                        audio.playbackRate = speechPace === "slow" ? 0.75 : speechPace === "fast" ? 1.25 : 1.0;
                        audio.onended = onPlaybackEnd;
                        audio.onerror = () => {
                          onPlaybackEnd();
                          speakText(voiceTopic.text);
                        };
                        audio.play().catch(e => {
                          console.warn("Topic audio play blocked, falling back to local speech:", e);
                          onPlaybackEnd();
                          speakText(voiceTopic.text);
                        });
                      } else {
                        speakText(voiceTopic.text);
                      }
                      setToastMessage("Тема добавлена в диалог! Преподаватель озвучивает тему.");
                    }}
                  >
                    🗣️ Начать обсуждение
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 11.5, padding: "6px 12px" }}
                    onClick={() => setShowTopicTranslation(prev => !prev)}
                  >
                    {showTopicTranslation ? "Скрыть подсказку" : "Помочь с переводом 💬"}
                  </button>
                </div>

                {showTopicTranslation && (
                  <div style={{ fontSize: 13, color: "var(--warm)", background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 8, lineHeight: 1.4, borderLeft: "3px solid var(--sage)" }} className="fade-in">
                    {voiceTopic.translation ? (
                      <p style={{ margin: "0 0 8px 0", fontSize: 13.5, fontWeight: 500, color: "var(--warm)" }}>{voiceTopic.translation}</p>
                    ) : null}
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      <strong>Подсказка преподавателя:</strong> Тема посвящена последним новостям и тенденциям. Попробуйте высказать свое мнение на английском, используя простые предложения. Если не знаете слово, спросите меня на русском!
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
                Нажмите «Найти новую тему», и ИИ просканирует интернет на наличие свежих событий, чтобы начать живое, увлекательное обсуждение на вашем уровне (<b>{getCurrentTutorLevel(tutor)}</b>).
              </p>
            )}
          </div>

          {/* Active Voice Visualizer Ring */}
          <div style={{ position: "relative", width: 140, height: 140, display: "flex", alignItems: "center", justifyItems: "center" }}>
            {/* Pulsing Backdrops */}
            {isRecording && (
              <>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: "50%", background: "rgba(214,128,96,0.15)", animation: "ping 1.5s infinite" }} />
                <div style={{ position: "absolute", top: 15, left: 15, right: 15, bottom: 15, borderRadius: "50%", background: "rgba(143,160,128,0.2)", animation: "pulse 1.2s infinite" }} />
              </>
            )}
            
            <button
              style={{
                position: "relative",
                zIndex: 10,
                width: 110,
                height: 110,
                borderRadius: "50%",
                border: "none",
                background: isRecording ? "var(--rose)" : "var(--sage)",
                color: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
                margin: "auto",
                transition: "all 0.3s ease"
              }}
              onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              disabled={voiceLoading}
            >
              {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
              <span style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>
                {isRecording ? "Остановить" : "Говорить"}
              </span>
            </button>
          </div>

          {/* Recording Timer */}
          {isRecording && (
            <div style={{ fontSize: 13, color: "var(--rose)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, background: "var(--rose)", borderRadius: "50%" }} className="animate-pulse" />
              Запись: {recordingTime} сек (до 30 сек)
            </div>
          )}



          {/* Transcription Scroll Log */}
          <div style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 10,
            padding: "4px"
          }}>
            <div style={{ fontSize: 11, color: "var(--muted)", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🗣️ Журнал устного диалога</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  style={{
                    background: voiceVoiceEnabled ? "rgba(143,160,128,0.2)" : "rgba(255,255,255,0.05)",
                    color: voiceVoiceEnabled ? "var(--sage)" : "var(--muted)",
                    border: "none",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    fontSize: 9,
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                  onClick={() => {
                    const nextVal = !voiceVoiceEnabled;
                    setVoiceVoiceEnabled(nextVal);
                    if (!nextVal) {
                      stopAllSpeech();
                    }
                  }}
                >
                  {voiceVoiceEnabled ? "🔊 Авто: ВКЛ" : "🔇 Авто: ВЫКЛ"}
                </button>
                <button
                  style={{
                    background: "rgba(214,128,96,0.15)",
                    color: "var(--rose)",
                    border: "none",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    fontSize: 9,
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                  onClick={() => {
                    const voiceGreetings = {
                      sophia: "Welcome to the Voice Club! I'm ready to listen. Click the microphone button below to start recording your voice, practice speaking English naturally, and hear me reply!",
                      oliver: "Welcome to the Voice Club. Speak clearly. I will highlight any grammatical mistakes you make in your speech.",
                      alex: "Yo, welcome to the voice corner! Hit the mic, say whatever's on your mind, and let's roll."
                    };
                    setVoiceMessages([{ role: "model", text: voiceGreetings[tutor] }]);
                    setToastMessage("Диалог перезапущен");
                  }}
                >
                  🔄 Сбросить
                </button>
              </div>
            </div>
            
            <div 
              id="ai_voice_scroll_container"
              className="styled-scrollbar-y"
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                maxHeight: "350px",
                overflowY: "auto",
                paddingRight: "8px"
              }}
            >
              {voiceMessages.map((msg, index) => (
                <div 
                  key={index} 
                  style={{ 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                    gap: 4,
                    position: "relative"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: "90%", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>
                      {msg.role === "user" ? "Вы:" : "ИИ-Тьютор:"}
                    </span>
                    <button
                      style={{
                        background: "transparent",
                        color: "rgba(255,255,255,0.2)",
                        border: "none",
                        fontSize: 10,
                        cursor: "pointer",
                        padding: "0 4px"
                      }}
                      title="Удалить"
                      onClick={() => {
                        setVoiceMessages(prev => {
                          const updated = prev.filter((_, i) => i !== index);
                          if (updated.length === 0) {
                            return [{ role: "model", text: "Welcome to the Voice Club! Let's talk." }];
                          }
                          return updated;
                        });
                        setToastMessage("Сообщение удалено");
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{
                    background: msg.role === "user" ? "rgba(143,160,128,0.15)" : "rgba(255,255,255,0.04)",
                    padding: "10px 12px",
                    borderRadius: "1rem",
                    fontSize: 13,
                    maxWidth: "90%",
                    color: "var(--text-color)"
                  }}>
                    {renderFormattedText(msg.text, msg.role === "user")}
                    
                    {/* Message Timestamp */}
                    {(msg.timestamp || activeVoiceSession?.created) && (
                      <div 
                        style={{ 
                          fontSize: 9, 
                          textAlign: "right", 
                          marginTop: 4, 
                          color: "var(--muted)",
                          opacity: 0.8
                        }}
                      >
                        {formatMessageTimestamp(msg.timestamp || activeVoiceSession?.created)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {voiceLoading && loadingVoiceSessionId === activeVoiceSessionId && (
                <div style={{ alignSelf: "flex-start", padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: "1.2rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: "var(--sage)" }} />
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Обрабатываем вашу речь и готовим ответ... Пожалуйста, подождите 🎙️</span>
                </div>
              )}
              <div ref={voiceEndRef} />
            </div>
          </div>

          {showDictionaryButton && pendingWordToAdd && !wordConfirmModal && (
            <div 
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(143, 160, 128, 0.12)",
                border: "1.5px solid var(--sage)",
                borderRadius: "1rem",
                padding: "10px 14px",
                width: "100%",
                boxSizing: "border-box",
                gap: 12
              }}
            >
              <div style={{ fontSize: 13, color: "var(--text-color)" }}>
                Учитель рекомендует добавить слово: <strong style={{ color: "var(--sage)" }}>{pendingWordToAdd.en}</strong>{" "}
                <span 
                  onClick={() => setRevealTranslation(true)} 
                  style={{ 
                    cursor: revealTranslation ? "default" : "pointer", 
                    opacity: 0.9,
                    fontSize: 11.5,
                    textDecoration: revealTranslation ? "none" : "underline",
                    background: revealTranslation ? "none" : "rgba(255,255,255,0.06)",
                    padding: revealTranslation ? "0" : "2px 6px",
                    borderRadius: "4px",
                    marginLeft: 4,
                    color: revealTranslation ? "var(--text-color)" : "var(--sage)"
                  }}
                  title={revealTranslation ? undefined : "Нажмите, чтобы показать перевод"}
                >
                  {revealTranslation ? `(${pendingWordToAdd.ru})` : "(👁️ показать перевод)"}
                </span>
              </div>
              <button
                className="btn btn-primary"
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: "999px",
                  fontWeight: 600,
                  whiteSpace: "nowrap"
                }}
                onClick={() => setWordConfirmModal(pendingWordToAdd)}
              >
                📖 Добавить в словарь
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- TAB CONTENT 3: TEXT SCANNER --- */}
      {activeTab === "scanner" && (
        <div style={{ width: "100%", display: "flex", flexDirection: "column" }} className="px-1">
          
          {/* Scanner Choice panel */}
          {!selectedImage && !cameraActive && (
            <div style={{
              border: "2px dashed var(--border)",
              borderRadius: "1.5rem",
              padding: "54px 24px",
              textAlign: "center",
              background: "rgba(255,255,255,0.01)",
              marginTop: "32px",
              marginBottom: "32px"
            }}>
              <ImageIcon size={44} className="text-sage" style={{ color: "var(--sage)", margin: "0 auto 12px auto" }} />
              <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 16, fontWeight: 600, color: "var(--sage)" }}>Сканирование фото с Gemini</h3>
              <p style={{ fontSize: 12, color: "var(--muted)", maxWidth: 300, margin: "6px auto 18px auto", lineHeight: 1.4 }}>
                Сделайте снимок учебника, вывески, записки или скриншота, чтобы мгновенно распознать слова, получить переводы и добавить их в журнал!
              </p>
              
              <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
                <label className="btn btn-primary" style={{ padding: "10px 18px", fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <Upload size={16} /> Выбрать фото
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
                </label>
                
                <button className="btn btn-outline" style={{ padding: "10px 18px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }} onClick={startCamera}>
                  <Camera size={16} /> Снять камерой
                </button>
              </div>
            </div>
          )}

          {/* Active Camera View */}
          {cameraActive && (
            <div style={{ position: "relative", width: "100%", maxWidth: 500, margin: "0 auto", borderRadius: "1.5rem", overflow: "hidden", background: "#000" }}>
              <video ref={videoRef} autoPlay playsInline style={{ width: "100%", display: "block" }} />
              <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 14 }}>
                <button className="btn btn-primary" style={{ padding: "12px 24px", background: "var(--sage)", border: "none" }} onClick={capturePhoto}>
                  📸 Сделать снимок
                </button>
                <button className="btn" style={{ padding: "12px 18px", background: "var(--rose)", border: "none", color: "#fff" }} onClick={stopCamera}>
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Preview selected image */}
          {selectedImage && !cameraActive && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", md: "1fr 1.2fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ position: "relative", borderRadius: "1.5rem", overflow: "hidden", border: "1px solid var(--border)" }}>
                  <img src={selectedImage} alt="Scanner source" style={{ width: "100%", maxHeight: 300, objectFit: "contain", background: "#1a1a1a" }} />
                  <button 
                    style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    onClick={() => {
                      setSelectedImage(null);
                      setImageFile(null);
                      setScanResult(null);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <button 
                  className="btn btn-primary" 
                  style={{ width: "100%", padding: "12px", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  onClick={handleScanImage}
                  disabled={scannerLoading}
                >
                  {scannerLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Распознавание...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> ⚡ Извлечь слова с Gemini Pro
                    </>
                  )}
                </button>
              </div>

              {/* Scanned result display */}
              {scanResult && (
                <div className="card fade-in" style={{ padding: 18, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <h4 style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Содержание изображения:</h4>
                    <p style={{ fontSize: 13, color: "var(--text-color)", fontStyle: "italic", lineHeight: 1.4, margin: "4px 0 0 0" }}>
                      "{scanResult.description}"
                    </p>
                  </div>

                  <div className="divider" style={{ margin: "8px 0" }} />

                  <div>
                    <h4 style={{ fontSize: 13, color: "var(--sage)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <BookOpen size={16} /> Найденные выражения ({scanResult.words.length}):
                    </h4>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
                      {scanResult.words.map((w, idx) => (
                        <div 
                          key={idx} 
                          style={{ 
                            padding: "10px 12px", 
                            borderRadius: "1rem", 
                            background: "rgba(255,255,255,0.03)", 
                            border: "1px solid var(--border)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12
                          }}
                        >
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <strong style={{ fontSize: 14, color: "var(--sage)" }}>{w.en}</strong>
                              <span style={{ fontSize: 9, background: "rgba(255,255,255,0.05)", color: "var(--muted)", padding: "1px 6px", borderRadius: 4 }}>
                                {w.pos}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--warm)", marginTop: 2 }}>{w.ru}</div>
                            {w.note && <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0 0" }}>💡 {w.note}</p>}
                          </div>

                          <button
                            style={{
                              padding: "6px 12px",
                              borderRadius: "999px",
                              fontSize: 11,
                              fontWeight: 600,
                              background: w.imported ? "rgba(143,160,128,0.12)" : "rgba(255,255,255,0.03)",
                              color: w.imported ? "var(--sage)" : "var(--muted)",
                              border: w.imported ? "1.5px solid var(--sage)" : "1.5px solid var(--border)",
                              cursor: w.imported ? "default" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4
                            }}
                            onClick={() => !w.imported && handleSaveMinedWord(w, idx, "scanner")}
                            disabled={w.imported}
                          >
                            {w.imported ? <Check size={12} /> : <Plus size={12} />}
                            {w.imported ? "В словаре" : "Учить"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* --- VOCABULARY EXTRACTION DIALOG MODAL (FROM CHAT CONTEXT) --- */}
      {vocabModalOpen && (
        <div className="overlay" style={{ zIndex: 1000 }} onClick={() => setVocabModalOpen(false)}>
          <div className="card overlay-card" style={{ maxWidth: 550, width: "95%", maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 12 }}>
              <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 17, fontWeight: 600, color: "var(--sage)", margin: 0 }}>
                💎 Слова и выражения из диалога
              </h3>
              <button style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }} onClick={() => setVocabModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {miningLoading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", gap: 12 }}>
                <Loader2 className="animate-spin" size={32} style={{ color: "var(--sage)" }} />
                <p style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>
                  Искусственный интеллект анализирует переписку и добывает ценные слова...
                </p>
              </div>
            ) : minedWords.length === 0 ? (
              <p style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", padding: "30px 10px" }}>
                Не удалось выявить новые выражения. Попробуйте написать побольше сообщений в чате!
              </p>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }}>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                  Gemini обнаружила новые интересные выражения из вашего диалога. Выберите слова для добавления в личный список слов:
                </p>

                {minedWords.map((word, index) => (
                  <div 
                    key={index} 
                    style={{ 
                      padding: "10px 12px", 
                      borderRadius: "1rem", 
                      background: "rgba(255,255,255,0.03)", 
                      border: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--sage)" }}>{word.en}</span>
                        <span style={{ fontSize: 9, background: "rgba(255,255,255,0.05)", color: "var(--muted)", padding: "1px 5px", borderRadius: 4 }}>
                          {word.pos}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--warm)", marginTop: 2 }}>{word.ru}</div>
                      {word.note && <p style={{ fontSize: 10.5, color: "var(--muted)", margin: "4px 0 0 0" }}>💡 {word.note}</p>}
                    </div>

                    <button
                      style={{
                        padding: "6px 12px",
                        borderRadius: "999px",
                        fontSize: 11,
                        fontWeight: 600,
                        background: word.imported ? "rgba(143,160,128,0.12)" : "rgba(255,255,255,0.03)",
                        color: word.imported ? "var(--sage)" : "var(--muted)",
                        border: word.imported ? "1.5px solid var(--sage)" : "1.5px solid var(--border)",
                        cursor: word.imported ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4
                      }}
                      onClick={() => handleSaveMinedWord(word, index, "chat-mine")}
                      disabled={word.imported}
                    >
                      {word.imported ? <Check size={12} /> : <Plus size={12} />}
                      {word.imported ? "Добавлено" : "Учить"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- REVERSIBLE INTERACTIVE WORD ADD CONFIRMATION MODAL --- */}
      {wordConfirmModal && (
        <div className="overlay" style={{ zIndex: 1100 }} onClick={() => setWordConfirmModal(null)}>
          <div className="card overlay-card" style={{ maxWidth: 450, width: "95%", padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 16 }}>
              <h3 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 17, fontWeight: 600, color: "var(--sage)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                💡 Подтвердите добавление слова
              </h3>
              <button style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }} onClick={() => setWordConfirmModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Check if word already exists in user's dictionary */}
              {words.some(w => w.en.toLowerCase().trim() === wordConfirmModal.en.toLowerCase().trim()) && (
                <div style={{ background: "rgba(214,128,96,0.15)", border: "1px solid var(--rose)", borderRadius: "10px", padding: "10px 12px", fontSize: 12, color: "var(--warm)" }}>
                  ⚠️ Это выражение уже присутствует в вашем словаре! Вы можете отредактировать и перезаписать его.
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 500 }}>
                  СЛОВО ИЛИ ВЫРАЖЕНИЕ (ENGLISH)
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: 14 }}
                  value={wordConfirmModal.en}
                  onChange={e => setWordConfirmModal({ ...wordConfirmModal, en: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 500 }}>
                  ПЕРЕВОД (RUSSIAN)
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: 14 }}
                  value={wordConfirmModal.ru}
                  onChange={e => setWordConfirmModal({ ...wordConfirmModal, ru: e.target.value })}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 500 }}>
                    ЧАСТЬ РЕЧИ
                  </label>
                  <select
                    className="select"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: 13, cursor: "pointer" }}
                    value={wordConfirmModal.pos}
                    onChange={e => setWordConfirmModal({ ...wordConfirmModal, pos: e.target.value })}
                  >
                    <option value="noun">Существительное (noun)</option>
                    <option value="verb">Глагол (verb)</option>
                    <option value="adjective">Прилагательное (adjective)</option>
                    <option value="adverb">Наречие (adverb)</option>
                    <option value="phrase">Фраза (phrase)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 500 }}>
                    ТЕМАТИКА (TOPIC)
                  </label>
                  <select
                    className="select"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: 13, cursor: "pointer" }}
                    value={wordConfirmModal.topic}
                    onChange={e => setWordConfirmModal({ ...wordConfirmModal, topic: e.target.value })}
                  >
                    <option value="general">Общая (general)</option>
                    <option value="home">Дом (home)</option>
                    <option value="hobby">Хобби (hobby)</option>
                    <option value="weather">Погода (weather)</option>
                    <option value="study">Учеба (study)</option>
                    <option value="work">Работа (work)</option>
                    <option value="food">Еда (food)</option>
                    <option value="time">Время (time)</option>
                    <option value="family">Семья (family)</option>
                    <option value="travel">Путешествия (travel)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 500 }}>
                  ПРИМЕЧАНИЕ / КОНТЕКСТ
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: 13 }}
                  value={wordConfirmModal.note}
                  onChange={e => setWordConfirmModal({ ...wordConfirmModal, note: e.target.value })}
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, padding: "12px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  onClick={() => {
                    if (!wordConfirmModal.en.trim() || !wordConfirmModal.ru.trim()) {
                      alert("Пожалуйста, заполните слово и перевод!");
                      return;
                    }
                    const newWord: Word = {
                      id: `ai-mined-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                      userId: stats.userId || "guest",
                      en: wordConfirmModal.en.trim(),
                      ru: wordConfirmModal.ru.trim(),
                      partOfSpeech: wordConfirmModal.pos || "noun",
                      topic: wordConfirmModal.topic || "general",
                      note: wordConfirmModal.note.trim() || `Из диалога с ${tutor === "sophia" ? "Sophia" : tutor === "oliver" ? "Oliver" : "Alex"}`,
                      learned: false,
                      learnedDate: null,
                      lastReviewed: null,
                      correct: 0,
                      wrong: 0,
                      streak: 0,
                      created: new Date().toISOString()
                    };
                    onSaveWord(newWord);

                    // Route state updates depending on the import source
                    if (wordConfirmModal.source === "chat-mine" && wordConfirmModal.index !== undefined) {
                      setMinedWords(prev => {
                        const copy = [...prev];
                        if (copy[wordConfirmModal.index!]) {
                          copy[wordConfirmModal.index!] = { ...copy[wordConfirmModal.index!], imported: true };
                        }
                        return copy;
                      });
                    } else if (wordConfirmModal.source === "scanner" && wordConfirmModal.index !== undefined) {
                      setScanResult(prev => {
                        if (!prev) return null;
                        const copyWords = [...prev.words];
                        if (copyWords[wordConfirmModal.index!]) {
                          copyWords[wordConfirmModal.index!] = { ...copyWords[wordConfirmModal.index!], imported: true };
                        }
                        return { ...prev, words: copyWords };
                      });
                    } else {
                      setPendingWordToAdd(null);
                      setShowDictionaryButton(false);
                    }

                    setWordConfirmModal(null);
                    setToastMessage(`Слово "${wordConfirmModal.en}" добавлено в словарь!`);
                  }}
                >
                  <Check size={16} /> Сохранить в словарь
                </button>
                <button
                  className="btn btn-outline"
                  style={{ flex: 0.5, padding: "12px", fontSize: 13 }}
                  onClick={() => {
                    setWordConfirmModal(null);
                    if (wordConfirmModal.source === "chat-recommend") {
                      setPendingWordToAdd(null);
                      setShowDictionaryButton(false);
                    }
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CUSTOM BEAUTIFUL CONFIRMATION DIALOG MODAL --- */}
      {customConfirm && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(244, 240, 230, 0.65)",
          backdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 15000,
          padding: 16
        }} className="fade-in">
          <div style={{
            maxWidth: 400,
            width: "100%",
            padding: "28px",
            border: "1.5px solid #e5dfd3",
            background: "#ffffff",
            borderRadius: "24px",
            boxShadow: "0 12px 36px rgba(143,160,128,0.12)",
            textAlign: "center"
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>❓</div>
            <h3 style={{ fontFamily: "Lora, serif", fontSize: 19, fontStyle: "italic", fontWeight: 700, color: "#8fa080", margin: "0 0 14px 0" }}>
              Подтверждение действия
            </h3>
            <p style={{ fontSize: 14, color: "#4a4943", lineHeight: 1.55, margin: "0 0 24px 0" }}>
              {customConfirm.message}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                style={{
                  flex: 1,
                  padding: "12px 18px",
                  fontSize: 13,
                  fontWeight: "700",
                  background: "#8fa080",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "14px",
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(143,160,128,0.2)"
                }}
                onClick={() => {
                  const onConfirm = customConfirm.onConfirm;
                  setCustomConfirm(null);
                  onConfirm();
                }}
              >
                {customConfirm.confirmText || "Да"}
              </button>
              <button
                style={{
                  flex: 1,
                  padding: "12px 18px",
                  fontSize: 13,
                  fontWeight: "600",
                  background: "#ffffff",
                  border: "1.5px solid #e5dfd3",
                  color: "#4a4943",
                  borderRadius: "14px",
                  cursor: "pointer"
                }}
                onClick={() => {
                  const onCancel = customConfirm.onCancel;
                  setCustomConfirm(null);
                  if (onCancel) onCancel();
                }}
              >
                {customConfirm.cancelText || "Отмена"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- FLOATING TOAST NOTIFICATION --- */}
      {toastMessage && (
        <div style={{
          position: "fixed",
          top: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--sage)",
          color: "#fff",
          padding: "12px 24px",
          borderRadius: "12px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
          fontSize: 13,
          fontWeight: 600,
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          animation: "fadeInUp 0.3s ease"
        }}>
          <Check size={16} />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
