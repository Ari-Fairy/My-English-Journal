import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
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

// Endpoint to automatically classify part of speech and topic for a word
app.post("/api/classify", async (req, res) => {
  try {
    const { en, ru, existingPos, existingTopics } = req.body;
    if (!en || !ru) {
      res.status(400).json({ error: "Missing en or ru word fields" });
      return;
    }

    const ai = getAIClient();

    const systemInstruction = `You classify English vocabulary entries. 
You must analyze the given English word and its Russian translation, and decide:
1. Which Part of Speech (POS) it belongs to.
2. Which Topic it fits.

Available Parts of Speech keys:
${existingPos || "verb, noun, adjective, adverb, participle, phrase"}

Available Topic keys:
${existingTopics || "home, hobby, weather, study, work, food, time, family, travel, general, diary"}

If the word fits an existing key, return its key exactly.
Only if it strictly does not fit any existing keys, you can invent a new lowercase key for POS (e.g. "preposition") or Topic (e.g. "nature"). If you invent a new Topic, provide an appropriate emoji and a Russian label.

Return ONLY a valid JSON object in this exact shape:
{
  "pos": "the_pos_key",
  "topic": "the_topic_key",
  "newTopic": { "key": "new_topic_key", "label": "emoji Russian_Label" } // (OPTIONAL, only if invented)
  "newPos": { "key": "new_pos_key", "label": "Russian_Label" } // (OPTIONAL, only if invented)
}
Return absolutely nothing else, no markdown formatting, no comments, just raw JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: systemInstruction },
        { text: `Word: "${en}" -> Translation: "${ru}"` }
      ],
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
    console.error("Classification API error:", error);
    res.status(500).json({ error: error?.message || "Internal server error during classification" });
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
