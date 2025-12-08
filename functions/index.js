const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// === YOUR PAYSTACK TEST SECRET KEY ===
const PAYSTACK_SECRET_KEY = "sk_test_641762d96b73f923c15dde3fac89678e491afc78";

// Define all allowed origins for security
const ALLOWED_ORIGINS = [
    'http://127.0.0.1:5500', 
    'https://ejayszn.github.io', 
    'https://taxc.com.ng'
];

exports.verifyPayment = functions.https.onRequest(async (req, res) => {
    
    // 1. Dynamic CORS Header Setup
    const origin = req.headers.origin;
    
    // Only set the Access-Control-Allow-Origin header if the request origin is in our allowed list
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
    } else {
        // If the origin is not allowed, we don't send the header, and the browser will block the request.
        console.warn(`Unauthorized request blocked from origin: ${origin}`); 
    }

    // Set other necessary CORS headers for preflight and actual request
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600'); 

    // 2. Handle Preflight OPTIONS Request
    if (req.method === 'OPTIONS') {
        // If the origin was allowed, we return 204 to let the browser proceed.
        return res.status(204).send('');
    }

    // 3. Enforce POST 
    if (req.method !== 'POST') {
        return res.status(405).send({ success: false, message: 'Method Not Allowed' });
    }

    // 4. Continue with POST Logic (Your existing verification code)
    const reference = req.body.reference;
    
    if (!reference || reference.trim() === "") {
        return res.status(400).send({ success: false, message: "No reference provided" });
    }

    try {
        const response = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            }
        );

        if (!response.data.status || !response.data.data) {
            return res.status(404).send({ success: false, message: "Transaction not found or invalid reference." });
        }

        const transaction = response.data.data;

        if (transaction.status !== "success") {
            return res.status(402).send({ success: false, message: "Payment was not successful. Status: " + transaction.status });
        }

        if (transaction.amount !== 90000) {
            return res.status(403).send({ success: false, message: `Invalid amount: ₦${transaction.amount / 100} (expected ₦900)` });
        }

        if (transaction.currency !== "NGN") {
            return res.status(403).send({ success: false, message: "Currency must be NGN" });
        }

        // --- SUCCESS ---
        return res.status(200).send({ success: true });

    } catch (error) {
        // Handle all network or internal errors
        if (error.response) {
            console.error("Paystack API error:", error.response.status, error.response.data);
        } else {
            console.error("Network or unknown error:", error.message);
        }
        return res.status(500).send({ success: false, message: "Internal server error during verification." });
    }
});

// === ADD THIS TO YOUR EXISTING index.js (BELOW verifyPayment) ===

exports.generateEbookDownload = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  if (req.method !== 'POST') {
    return res.status(405).send({ success: false, message: 'POST only' });
  }

  const { reference, file } = req.body;
  if (!reference || !file) {
    return res.status(400).send({ success: false, message: 'Missing ref or file' });
  }

  try {
    // 1. Verify Payment (reuse your working logic)
    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );

    const tx = paystackRes.data.data;
    if (tx.status !== 'success' || tx.amount < 10000) { // min ₦100
      return res.status(402).send({ success: false, message: 'Invalid payment' });
    }

    // 2. Generate Signed URL (secure, expires in 1 hour)
    const bucket = admin.storage().bucket();
    const [url] = await bucket.file(`ebooks/paid/${file}`).getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000 // 1 hour
    });

    return res.status(200).send({ success: true, downloadUrl: url });

  } catch (error) {
    console.error('Ebook error:', error.message);
    return res.status(500).send({ success: false, message: 'Server error' });
  }
});