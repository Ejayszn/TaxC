// server.js — simple express webhook example (optional)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const nodemailer = require('nodemailer');
const fs = require('fs');
const app = express();
app.use(bodyParser.json());

// Example endpoint to verify a reference (if using inline flow)
app.post('/verify-and-deliver', async (req, res) => {
  try {
    const { reference, email } = req.body;
    if(!reference || !email) return res.status(400).json({message:'bad request'});

    const secret = process.env.PAYSTACK_SECRET; // set in .env
    const verifyUrl = `https://api.paystack.co/transaction/verify/${reference}`;
    const r = await axios.get(verifyUrl, { headers: { Authorization: `Bearer ${secret}` } });
    if(r.data && r.data.data && r.data.data.status === 'success'){
      // Payment is successful — create or attach a PDF report.
      // For MVP: send a simple email body. For production: generate PDF via puppeteer and attach.
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      const mail = {
        from: `"TaxC" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your TaxC Detailed Report",
        text: "Thanks for your payment. We will email your report soon.",
        html: "<p>Thanks — your payment is confirmed. We'll send the detailed report shortly.</p>"
      };

      await transporter.sendMail(mail);
      return res.json({message:'Payment verified, email sent'});
    } else {
      return res.status(400).json({message:'Payment not successful'});
    }
  } catch(err){
    console.error(err.response ? err.response.data : err.message);
    return res.status(500).json({message:'server error'});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Server running on', PORT));