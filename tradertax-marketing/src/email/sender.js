// Email delivery. Providers: Resend, Postmark, or "outbox" (default) which
// writes rendered emails to data/outbox/ so nothing leaves the building until
// you configure a provider. Every email carries an unsubscribe link and the
// physical mailing address (CAN-SPAM).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import business from '../../config/business.js';
import { ROOT } from '../env.js';

const SECRET = () => process.env.APP_SECRET || 'change-me-in-production';

export function unsubscribeToken(leadId) {
  return crypto.createHmac('sha256', SECRET()).update(`unsub:${leadId}`).digest('hex').slice(0, 32);
}

export function verifyUnsubscribe(leadId, token) {
  const expected = unsubscribeToken(leadId);
  return typeof token === 'string' && token.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Small Markdown subset: headings, bold, links, bullet/numbered lists, paragraphs.
export function markdownToHtml(md) {
  const inline = (t) => escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>');
  return String(md).trim().split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (/^#{1,3}\s/.test(block)) {
      const level = block.match(/^#+/)[0].length;
      return `<h${level}>${inline(block.replace(/^#+\s*/, ''))}</h${level}>`;
    }
    if (lines.every((l) => /^\s*[-*]\s/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\s*\d+\.\s/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s/, ''))}</li>`).join('')}</ol>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('\n');
}

export function personalize(text, lead) {
  return String(text)
    .replaceAll('{{first_name}}', lead.firstName || 'there')
    .replaceAll('{{booking_url}}', business.brand.bookingUrl)
    .replaceAll('{{site_url}}', business.brand.website);
}

export function renderEmail({ subject, body, preheader = '' }, lead) {
  const unsubUrl = `${business.brand.website}/unsubscribe?id=${lead.id}&t=${unsubscribeToken(lead.id)}`;
  const text = `${personalize(body, lead)}\n\n--\n${business.brand.mailingAddress}\nUnsubscribe: ${unsubUrl}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d2330">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px">
<tr><td style="padding:20px 28px;border-bottom:3px solid #0f9d58;font-weight:700;font-size:18px">${escapeHtml(business.brand.name)}</td></tr>
<tr><td style="padding:24px 28px;font-size:16px;line-height:1.55">${markdownToHtml(personalize(body, lead))}</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#6b7280;border-top:1px solid #eee">
${escapeHtml(business.brand.mailingAddress)}<br>
You are receiving this because you requested ${escapeHtml(business.offers.leadMagnet.name)}. <a href="${unsubUrl}" style="color:#6b7280">Unsubscribe</a>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: personalize(subject, lead), html, text, unsubUrl };
}

async function postJson(url, headers, payload) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

export async function deliver({ to, subject, html, text, unsubUrl }) {
  const provider = process.env.EMAIL_PROVIDER || 'outbox';
  const from = `${business.brand.fromName} <${business.brand.fromEmail}>`;
  const listHeaders = unsubUrl
    ? { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : {};

  if (provider === 'resend') {
    const r = await postJson('https://api.resend.com/emails',
      { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      { from, to: [to], subject, html, text, headers: listHeaders });
    return { provider, providerId: r.id };
  }
  if (provider === 'postmark') {
    const r = await postJson('https://api.postmarkapp.com/email',
      { 'X-Postmark-Server-Token': process.env.POSTMARK_TOKEN, Accept: 'application/json' },
      { From: from, To: to, Subject: subject, HtmlBody: html, TextBody: text, MessageStream: 'broadcast',
        Headers: Object.entries(listHeaders).map(([Name, Value]) => ({ Name, Value })) });
    return { provider, providerId: r.MessageID };
  }

  if (provider === 'noop') return { provider, providerId: null }; // tests

  const dir = path.join(ROOT, 'data', 'outbox');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${to.replace(/[^a-z0-9]/gi, '_')}.html`);
  fs.writeFileSync(file, `<!-- To: ${to} | Subject: ${subject} -->\n${html}`);
  return { provider: 'outbox', providerId: path.basename(file) };
}
