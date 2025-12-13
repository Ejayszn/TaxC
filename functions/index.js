const functions = require("firebase-functions/v2/https");        // v2
const { setGlobalOptions } = require("firebase-functions/v2");   // this locks the correct service account
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

// PERMANENT FIX — never resets again
setGlobalOptions({
  serviceAccount: "taxc-ebooks@appspot.gserviceaccount.com"
});

const PAYSTACK_SECRET_KEY = "sk_test_641762d96b73f923c15dde3fac89678e491afc78";

const ALLOWED_ORIGINS = [
  'http://127.0.0.1:5500',
  'https://ejayszn.github.io',
  'https://taxc.com.ng'
];

// ==================== verifyPayment ====================
exports.verifyPayment = functions.onRequest(async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.set('Access-Control-Allow-Origin', origin);

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).send({ success: false });

  const reference = req.body.reference?.trim();
  if (!reference) return res.status(400).send({ success: false, message: "No reference" });

  try {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      timeout: 10000
    });

    const tx = response.data.data;
    if (tx.status !== "success") return res.status(402).send({ success: false });
    if (tx.amount !== 90000) return res.status(403).send({ success: false, message: "Wrong amount" });
    if (tx.currency !== "NGN") return res.status(403).send({ success: false, message: "Must be NGN" });

    return res.status(200).send({ success: true });
  } catch (error) {
    console.error("Paystack error:", error.message);
    return res.status(500).send({ success: false });
  }
});

// ==================== generateEbookDownload ====================
exports.generateEbookDownload = functions.onRequest(async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.set('Access-Control-Allow-Origin', origin);

  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).send({ success: false });

  try {
    const { reference, file } = req.body;
    if (!reference || !file) return res.status(400).send({ success: false });

    const paystackRes = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    });

    const tx = paystackRes.data.data;
    if (tx.status !== 'success' || tx.amount < 10000) {
      return res.status(402).send({ success: false });
    }

    // CLEAN SIGNED URL — no more clientEmail hack needed
    const [url] = await admin.storage()
      .bucket()
      .file(`ebooks/paid/${file}`)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000  // 1 hour
      });

    return res.status(200).send({ success: true, downloadUrl: url });

  } catch (error) {
    console.error('Ebook error:', error);
    return res.status(500).send({ success: false, message: error.message });
  }
});

// New function: getEbookDownloadUrl
// Only allows authenticated users to get a signed URL for ebooks they own
exports.getEbookDownloadUrl = functions.onRequest(async (req, res) => {
  const origin = req.headers.origin;
  // Allow your origins
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', ''); // or deny
  }

  // Critical: Allow these headers
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).send({ success: false });
  }

  try {
    const { file } = req.body;

    // Get the Firebase Auth token from headers (sent by client)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Check if this user owns this ebook (from Firestore library)
    const userDoc = await admin.firestore()
      .collection('userLibraries')
      .doc(uid)
      .get();

    if (!userDoc.exists) {
      return res.status(403).send({ success: false, message: 'No library' });
    }

    const ownedEbooks = userDoc.data().ebooks || [];
    const ownsBook = ownedEbooks.some(e => e.file === file);

    if (!ownsBook) {
      return res.status(403).send({ success: false, message: 'Not purchased' });
    }

    // Generate fresh signed URL
    const [url] = await admin.storage()
      .bucket()
      .file(`ebooks/paid/${file}`)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });

    return res.status(200).send({ success: true, downloadUrl: url });

  } catch (error) {
    console.error('getEbookDownloadUrl error:', error);
    return res.status(500).send({ success: false, message: 'Server error' });
  }
});