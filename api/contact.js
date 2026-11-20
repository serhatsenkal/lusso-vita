// Vercel serverless function: POST /api/contact
// Receives the site's lead forms (İletişim, Daire Tipleri, Villalar),
// validates and sanitizes them server-side, then delivers each lead:
//   1. by email to bilgi@lussovita.com.tr via Google Workspace SMTP, and
//   2. (optional) to a Telegram chat, as a second channel.
// The visitor sees success when at least one channel delivered the lead.
//
// Environment variables (set in Vercel Project Settings, not here):
//   GMAIL_USER           bilgi@lussovita.com.tr
//   GMAIL_APP_PASSWORD   Google Workspace App Password for that mailbox
//   CONTACT_TO_EMAIL     optional override for the recipient (defaults to GMAIL_USER)
//   TELEGRAM_BOT_TOKEN   optional: bot token for the Telegram copy of each lead
//   TELEGRAM_CHAT_ID     optional: chat id that receives the Telegram copy

const nodemailer = require('nodemailer');

const ALLOWED_ORIGINS = [
  'https://lussovita.com.tr',
  'https://www.lussovita.com.tr',
  'https://lusso-vita.vercel.app',
];

const MIN_SUBMIT_MS = 3000; // form must be open at least 3s before submit
const MAX_SUBMIT_AGE_MS = 60 * 60 * 1000; // reject stale/replayed loadedAt

const UNITS = { '1+1': '1+1 Daire', '2+1': '2+1 Daire', villa: 'Villa', belirsiz: 'Henüz karar vermedi' };
const FORMS = { iletisim: 'İletişim sayfası', 'daire-tipleri': 'Daire Tipleri sayfası', villalar: 'Villalar sayfası' };

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

// Turkish numbers in any common spelling (0532..., 532..., +90 532..., 0312...)
// become +90XXXXXXXXXX; other international numbers must start with "+".
function normalizePhone(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10 && /^[2-5]/.test(digits)) return '+90' + digits;
  if (digits.length === 11 && /^0[2-5]/.test(digits)) return '+9' + digits;
  if (digits.length === 12 && /^90[2-5]/.test(digits)) return '+' + digits;
  if (s.charAt(0) === '+' && digits.length >= 10 && digits.length <= 15 && digits.indexOf('90') !== 0) return '+' + digits;
  return '';
}

async function sendTelegram(token, chatId, text) {
  const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error('telegram ' + r.status + ' ' + (data.description || ''));
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
  const phone = normalizePhone(body.phone);
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  const unitKey = Object.prototype.hasOwnProperty.call(UNITS, body.interestedUnit) ? body.interestedUnit : '';
  const formKey = Object.prototype.hasOwnProperty.call(FORMS, body.formName) ? body.formName : 'iletisim';
  const kvkkConsent = body.kvkkConsent === true;
  const marketingConsent = body.marketingConsent === true;
  const company = String(body.company || '').trim(); // honeypot
  const loadedAt = Number(body.loadedAt || 0);

  // Honeypot: bots that fill every field get a fake success, no lead sent.
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
  if (!phone) {
    return res.status(400).json({ ok: false, error: 'invalid_phone' });
  }
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ ok: false, error: 'invalid_message' });
  }
  if (!kvkkConsent) {
    return res.status(400).json({ ok: false, error: 'kvkk_consent_required' });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const toEmail = process.env.CONTACT_TO_EMAIL || gmailUser;
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  const mailConfigured = !!(gmailUser && gmailPass);
  const telegramConfigured = !!(tgToken && tgChat);

  if (!mailConfigured && !telegramConfigured) {
    console.error('contact.js: no delivery channel configured (GMAIL_* / TELEGRAM_*)');
    return res.status(500).json({ ok: false, error: 'mail_not_configured' });
  }

  const unitLabel = unitKey ? UNITS[unitKey] : 'Belirtilmedi';
  const formLabel = FORMS[formKey];
  const rows = [
    ['Ad Soyad', name],
    ['Telefon', phone],
    ['E-posta', email || '—'],
    ['İlgilenilen ünite', unitLabel],
    ['Form', formLabel],
    ['Ticari elektronik ileti izni', marketingConsent ? 'Evet' : 'Hayır'],
  ];

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1c17;">
      <h2 style="color:#041627;">Lusso Vita — Yeni Web Sitesi Talebi</h2>
      ${rows.map(([k, v]) => `<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`).join('\n      ')}
      ${message ? `<p><strong>Mesaj:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
      <hr>
      <p style="color:#74777d;font-size:12px;">Bu e-posta lussovita.com.tr formu üzerinden otomatik olarak gönderilmiştir.</p>
    </div>`;

  const text =
    `Lusso Vita - Yeni Web Sitesi Talebi\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    (message ? `\n\nMesaj:\n${message}` : '') + '\n';

  const deliveries = [];

  if (mailConfigured) {
    deliveries.push((async () => {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: gmailUser, pass: gmailPass },
      });
      await transporter.sendMail({
        from: `"Lusso Vita Web Sitesi" <${gmailUser}>`,
        to: toEmail,
        replyTo: email ? `"${name}" <${email}>` : undefined,
        subject: `Yeni Web Talebi — ${name} (${unitLabel})`,
        text,
        html,
      });
    })().catch((err) => {
      console.error('contact.js: sendMail failed', err && err.message);
      throw err;
    }));
  }

  if (telegramConfigured) {
    deliveries.push(sendTelegram(tgToken, tgChat, '🌐 ' + text).catch((err) => {
      console.error('contact.js: telegram failed', err && err.message);
      throw err;
    }));
  }

  const results = await Promise.allSettled(deliveries);
  if (results.some((r) => r.status === 'fulfilled')) {
    return res.status(200).json({ ok: true });
  }
  return res.status(502).json({ ok: false, error: 'mail_send_failed' });
};
