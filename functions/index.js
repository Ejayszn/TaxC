// functions/index.js
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

setGlobalOptions({
  maxInstances: 10,
  timeoutSeconds: 60,
  memory: "256MiB",
});

const corsHandler = cors({ origin: true });

// Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");

export const chatWithAda = onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).send("Only POST");

    try {
      const { userMessage } = req.body;
      if (!userMessage) return res.status(400).json({ message: "No message" });

      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(
        `You are Ada, a friendly Nigerian tax assistant for TaxC. Answer in short, clear Nigerian pidgin or simple English. Question: ${userMessage}`
      );
      const reply = result.response.text();
      res.json({ message: reply });
    } catch (error) {
      console.error("Ada error:", error);
      res.status(500).json({ message: "Ada no hear well, try again!" });
    }
  });
});

export const verifyPayment = onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).send("Only POST");

    const { reference, email, item } = req.body;
    if (!reference) return res.status(400).json({ status: false, message: "No reference" });

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET) {
      console.error("Missing PAYSTACK_SECRET_KEY");
      return res.status(500).json({ status: false, message: "Server error" });
    }

    try {
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${reference}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
      );
      const result = await verifyRes.json();

      if (
        result.status === true &&
        result.data.status === "success" &&
        result.data.amount === 90000 &&
        result.data.currency === "NGN"
      ) {
        res.json({ status: true });
      } else {
        res.status(400).json({ status: false, message: "Invalid payment" });
      }
    } catch (error) {
      console.error("Paystack error:", error);
      res.status(500).json({ status: false, message: "Verification failed" });
    }
  });
});