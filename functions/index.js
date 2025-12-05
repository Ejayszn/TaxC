import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Recommended: increase memory & timeout for Gemini
setGlobalOptions({
  maxInstances: 10,
  timeoutSeconds: 60,
  memory: "256MiB",
});

// Secure CORS
const corsHandler = cors({
  origin: true,
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

// Secure Gemini key from Firebase environment
const GEMINI_KEY = process.env.GEMINI_KEY;

if (!GEMINI_KEY) {
  console.error("GEMINI_KEY not set! Run: firebase functions:config:set gemini.key=\"YOUR_NEW_KEY\"");
}

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

export const chatWithAda = onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).send("Only POST allowed");
    }

    try {
      const { userMessage } = req.body;

      if (!userMessage || typeof userMessage !== "string") {
        return res.status(400).json({ message: "No message provided" });
      }

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const result = await model.generateContent(
        `You are Ada, a friendly Nigerian tax assistant for TaxC. 
         Answer in short, clear Nigerian pidgin or simple English. 
         Question: ${userMessage}`
      );

      const reply = result.response.text();

      res.status(200).json({ message: reply });
    } catch (error) {
      console.error("Ada error:", error.message);
      res.status(500).json({ message: "Ada no hear well right now, try again!" });
    }
  });
});