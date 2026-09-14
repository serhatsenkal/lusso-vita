// Vercel serverless function: POST /api/contact
// Receives the Hakkımızda contact form submission, validates and sanitizes
// it server-side, then relays it by email to bilgi@lussovita.com.tr via
// Google Workspace SMTP (the same domain already verified for SPF/DKIM/DMARC).
//
// Required environment variables (set in Vercel Project Settings, not here):
//   GMAIL_USER           bilgi@lussovita.com.tr
//   GMAIL_APP_PASSWORD   Google Workspace App Password for that mailbox
//   CONTACT_TO_EMAIL     optional override for the recipient (defaults to GMAIL_USER)

const nodemailer = require('nodemailer');

const ALLOWED_ORIGINS = [
  'https://lussovita.com.tr',
  'https://www.lussovita.com.tr',
  'https://lusso-vita.vercel.app',
];

const MIN_SUBMIT_MS = 3000; // form must be open at least 3s before submit
const MAX_SUBMIT_AGE_MS = 60 * 60 * 1000; // reject stale/replayed loadedAt

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 150;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Soft origin/referer check (informational defense, not the only line of defense).
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !ALLOWED_ORIGINS.some((o) => origin.indexOf(o) === 0)) {
    return res.status(403).json({ ok: false, error: 'forbidden_origin' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  const kvkkConsent = body.kvkkConsent === true;
  const marketingConsent = body.marketingConsent === true;
  const company = String(body.company || '').trim(); // honeypot
  const loadedAt = Number(body.loadedAt || 0);

  // Honeypot: bots that fill every field get a fake success, no mail sent.
  if (company.length > 0) {
    return res.status(200).json({ ok: true });
  }

  // Minimum time-on-page check (cheap bot heuristic, no extra service required).
  if (loadedAt) {
    const elapsed = Date.now() - loadedAt;
    if (elapsed < MIN_SUBMIT_MS || elapsed > MAX_SUBMIT_AGE_MS) {
      return res.status(200).json({ ok: true });
    }
  }

  // Server-side validation (never trust the client).
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ ok: false, error: 'invalid_name' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  if (message.length < 10 || message.length > 2000) {
    return res.status(400).json({ ok: false, error: 'invalid_message' });
  }
  if (!kvkkConsent) {
    return res.status(400).json({ ok: false, error: 'kvkk_consent_required' });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const toEmail = process.env.CONTACT_TO_EMAIL || gmailUser;

  if (!gmailUser || !gmailPass) {
    console.error('contact.js: missing GMAIL_USER / GMAIL_APP_PASSWORD env vars');
    return res.status(500).json({ ok: false, error: 'mail_not_configured' });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1c17;">
      <h2 style="color:#041627;">Lusso Vita — Yeni İletişim Formu Talebi</h2>
      <p><strong>Ad Soyad:</strong> ${safeName}</p>
      <p><strong>E-posta:</strong> ${safeEmail}</p>
      <p><strong>Ticari elektronik ileti izni:</strong> ${marketingConsent ? 'Evet' : 'Hayır'}</p>
      <p><strong>Mesaj:</strong><br>${safeMessage}</p>
      <hr>
      <p style="color:#74777d;font-size:12px;">Bu e-posta lussovita.com.tr iletişim formu üzerinden otomatik olarak gönderilmiştir.</p>
    </div>`;

  const text =
    `Lusso Vita - Yeni İletişim Formu Talebi\n\n` +
    `Ad Soyad: ${name}\n` +
    `E-posta: ${email}\n` +
    `Ticari elektronik ileti izni: ${marketingConsent ? 'Evet' : 'Hayır'}\n\n` +
    `Mesaj:\n${message}\n`;

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"Lusso Vita Web Sitesi" <${gmailUser}>`,
      to: toEmail,
      replyTo: `"${name}" <${email}>`,
      subject: `Yeni İletişim Formu Talebi — ${name}`,
      text,
      html,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact.js: sendMail failed', err && err.message);
    return res.status(502).json({ ok: false, error: 'mail_send_failed' });
  }
};
