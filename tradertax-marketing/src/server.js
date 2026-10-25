// HTTP server: campaign funnel (tax-check quiz landing page, checklist,
// unsubscribe), lead + subscribe APIs the main site can post to, conversion
// webhooks, admin dashboard API and the built-in scheduler.
//
// Articles are published on www.tradertaxhq.com/resources, not here, so this
// app serves no public blog (avoids duplicate content) and is noindex.
import './env.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import business from '../config/business.js';
import { topics } from '../config/tax-calendar.js';
import { ROOT } from './env.js';
import { Store } from './db.js';
import { verifyUnsubscribe } from './email/sender.js';
import { checkCompliance } from './compliance.js';
import {
  captureLead, setLeadStatus, approveContent, rejectContent, runWeeklyContent, weeklyStats, tick, LEAD_STATUSES,
} from './engine.js';

const PUBLIC = path.join(ROOT, 'public');

// One tick at a time, whether it comes from the built-in scheduler or the cron URL.
let ticking = false;
export async function runTick(store, now = new Date()) {
  if (ticking) return false;
  ticking = true;
  try { await tick(store, now); return true; } finally { ticking = false; }
}
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const allowedOrigins = () => (process.env.ALLOWED_ORIGINS || `${business.brand.mainSite},https://tradertaxhq.com`)
  .split(',').map((s) => s.trim()).filter(Boolean);

function send(res, status, body, type = 'application/json', extra = {}) {
  const payload = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', ...extra,
  });
  res.end(payload);
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

async function readJson(req, limit = 100_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ab.length === bb.length && ab.length > 0 && crypto.timingSafeEqual(ab, bb);
}

function isAdmin(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return Boolean(process.env.ADMIN_TOKEN) && safeEqual(token, process.env.ADMIN_TOKEN);
}

// Basic per-IP limiter for the public lead endpoints.
const hits = new Map();
function rateLimited(ip, max = 10, windowMs = 3600000) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

function page(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/styles.css"></head><body>
<header class="top"><a href="${escapeHtml(business.brand.mainSite)}" class="logo">Trader<span>Tax</span>HQ</a>
<nav><a class="btn small" href="${escapeHtml(business.brand.intakeUrl)}">Start Basic Intake</a></nav></header>
<main class="wrap">${bodyHtml}</main><footer class="foot"><p>${escapeHtml(business.compliance.disclaimer)}</p></footer></body></html>`;
}

const html = (file) => fs.readFileSync(path.join(PUBLIC, file), 'utf8');
const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

export function createServer(store = new Store()) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    try {
      if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
        cors(req, res);
        res.writeHead(204);
        return res.end();
      }

      // ---------------- campaign funnel
      if (route === 'GET /') return send(res, 200, html('index.html'), 'text/html');
      if (route === 'GET /admin') return send(res, 200, html('admin.html'), 'text/html');
      if (route === 'GET /checklist') return send(res, 200, html('checklist.html'), 'text/html');
      if (route === 'GET /playbook') return send(res, 301, '', 'text/plain', { Location: '/checklist' });
      if (route === 'GET /styles.css') return send(res, 200, html('styles.css'), 'text/css');
      if (route === 'GET /robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /\n', 'text/plain');
      if (route === 'GET /healthz') return send(res, 200, { ok: true });

      // Quiz submissions (this app's landing page) and the main site's forms.
      if (route === 'POST /api/leads' || route === 'POST /api/subscribe') {
        cors(req, res);
        if (rateLimited(clientIp(req))) return send(res, 429, { error: 'Too many requests' });
        const body = await readJson(req);
        if (body.website) return send(res, 200, { ok: true }); // honeypot: bots fill hidden fields
        const input = route.endsWith('subscribe')
          ? { email: body.email, firstName: body.firstName, consent: body.consent, source: body.source || 'main-site-checklist', utm: body.utm, ref: body.ref }
          : body;
        const { lead, isNew } = captureLead(store, input);
        return send(res, isNew ? 201 : 200, {
          ok: true, tier: lead.tier, segment: lead.segment, plan: lead.recommendedService,
          intakeUrl: business.brand.intakeUrl, checklistUrl: business.offers.leadMagnet.path,
        });
      }

      if (route === 'GET /unsubscribe') {
        const id = url.searchParams.get('id');
        if (!verifyUnsubscribe(id, url.searchParams.get('t')) || !store.get('leads', id)) {
          return send(res, 400, page('Unsubscribe', `<h1>Link not valid</h1><p>Email <a href="mailto:${escapeHtml(business.brand.fromEmail)}">${escapeHtml(business.brand.fromEmail)}</a> and we will remove you.</p>`), 'text/html');
        }
        setLeadStatus(store, id, 'unsubscribed');
        return send(res, 200, page('Unsubscribed', '<h1>You are unsubscribed</h1><p>You will not receive any more marketing emails from TraderTaxHQ.</p>'), 'text/html');
      }
      if (route === 'POST /unsubscribe') { // RFC 8058 one-click
        const id = url.searchParams.get('id');
        if (verifyUnsubscribe(id, url.searchParams.get('t')) && store.get('leads', id)) setLeadStatus(store, id, 'unsubscribed');
        return send(res, 200, { ok: true });
      }

      // ---------------- conversion webhooks (Zapier / Make / Calendly / your intake form)
      // POST /api/webhooks/intake?secret=...   {email}  -> intake_started (stops nurture)
      // POST /api/webhooks/booking?secret=...  {email}  -> booked
      const hook = url.pathname.match(/^\/api\/webhooks\/(intake|booking)$/);
      if (req.method === 'POST' && hook) {
        if (!safeEqual(url.searchParams.get('secret'), process.env.WEBHOOK_SECRET)) return send(res, 401, { error: 'Unauthorized' });
        const body = await readJson(req);
        const email = String(body.email || body.payload?.email || body.payload?.invitee?.email || '').trim().toLowerCase();
        let lead = store.find('leads', (l) => l.email === email);
        if (!lead && hook[1] === 'intake' && email && body.consent) {
          lead = captureLead(store, { email, firstName: body.firstName, consent: true, source: 'main-site-intake' }).lead;
        }
        if (!lead) return send(res, 202, { ok: true, matched: false });
        setLeadStatus(store, lead.id, hook[1] === 'intake' ? 'intake_started' : 'booked');
        return send(res, 200, { ok: true, matched: true });
      }

      // ---------------- external cron (free hosts that sleep): GET or POST /api/cron/tick?secret=...
      // Point cron-job.org (or any scheduler) at this every 10 minutes. It wakes the app
      // and runs everything that is due: emails, posts, newsletter, weekly content, reports.
      if (url.pathname === '/api/cron/tick' && (req.method === 'GET' || req.method === 'POST')) {
        if (!safeEqual(url.searchParams.get('secret'), process.env.CRON_SECRET)) return send(res, 401, { error: 'Unauthorized' });
        const ran = await runTick(store);
        await store.flush();
        return send(res, 200, { ok: true, ran, at: new Date().toISOString() });
      }

      // ---------------- admin API
      if (url.pathname.startsWith('/api/admin/')) {
        if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });

        if (route === 'GET /api/admin/summary') return send(res, 200, weeklyStats(store, new Date(), Number(url.searchParams.get('days')) || 7));
        if (route === 'GET /api/admin/leads') {
          const leads = [...store.all('leads')].sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));
          return send(res, 200, leads);
        }
        if (route === 'GET /api/admin/leads.csv') {
          const cols = ['createdAt', 'email', 'firstName', 'status', 'tier', 'score', 'segment', 'recommendedService', 'source', 'ref'];
          const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          const csv = [cols.join(','), ...store.all('leads').map((l) => cols.map((c) => q(l[c])).join(','))].join('\n');
          return send(res, 200, csv, 'text/csv', { 'Content-Disposition': 'attachment; filename="tradertaxhq-leads.csv"' });
        }
        const statusMatch = url.pathname.match(/^\/api\/admin\/leads\/([^/]+)\/status$/);
        if (req.method === 'POST' && statusMatch) {
          const { status } = await readJson(req);
          if (!LEAD_STATUSES.includes(status)) return send(res, 400, { error: 'Invalid status' });
          const lead = setLeadStatus(store, statusMatch[1], status);
          return lead ? send(res, 200, lead) : send(res, 404, { error: 'Lead not found' });
        }
        if (route === 'GET /api/admin/content') {
          const packs = [...store.all('contentPacks')].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 12);
          const posts = [...store.all('posts')].sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
          return send(res, 200, { packs, posts });
        }
        const articleMatch = url.pathname.match(/^\/api\/admin\/packs\/([^/]+)\/article\.md$/);
        if (req.method === 'GET' && articleMatch) {
          const pack = store.get('contentPacks', articleMatch[1]);
          if (!pack) return send(res, 404, { error: 'Pack not found' });
          const front = ['---', `title: ${JSON.stringify(pack.blog.title)}`, `slug: ${pack.blog.slug}`,
            `description: ${JSON.stringify(pack.blog.metaDescription)}`, `quickAnswer: ${JSON.stringify(pack.blog.quickAnswer || '')}`,
            `keywords: ${JSON.stringify(pack.blog.keywords)}`, '---', ''].join('\n');
          return send(res, 200, front + pack.blog.markdown, 'text/markdown',
            { 'Content-Disposition': `attachment; filename="${pack.blog.slug}.md"` });
        }
        if (route === 'GET /api/admin/emails') {
          return send(res, 200, [...store.all('emails')].sort((a, b) => new Date(b.sendAt) - new Date(a.sendAt)).slice(0, 200)
            .map(({ body, ...rest }) => rest));
        }
        if (route === 'GET /api/admin/topics') return send(res, 200, topics.map(({ id, title }) => ({ id, title })));
        if (route === 'POST /api/admin/approve' || route === 'POST /api/admin/reject') {
          const { kind, id } = await readJson(req);
          const fn = route.endsWith('approve') ? approveContent : rejectContent;
          const result = fn(store, kind, id);
          return result ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Item not found or not pending' });
        }
        if (route === 'POST /api/admin/generate') {
          const { topicId, extraContext } = await readJson(req);
          const pack = await runWeeklyContent(store, new Date(), { topicId: topicId || undefined, extraContext });
          return send(res, 201, { ok: true, packId: pack.id, source: pack.source, error: pack.error });
        }
        if (route === 'POST /api/admin/posts/edit') {
          const { id, text } = await readJson(req);
          const post = store.get('posts', id);
          if (!post || !['pending_approval', 'scheduled'].includes(post.status)) return send(res, 404, { error: 'Post not editable' });
          return send(res, 200, store.update('posts', id, { text: String(text), compliance: checkCompliance(text), status: 'pending_approval' }));
        }
        return send(res, 404, { error: 'Not found' });
      }

      return send(res, 404, page('Not found', '<h1>Page not found</h1>'), 'text/html');
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      return send(res, status, { error: status >= 500 ? 'Server error' : err.message });
    }
  });
}

export function startScheduler(store, intervalMs = 60_000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await runTick(store); } catch (err) { console.error('[scheduler]', err); } finally { running = false; }
  };
  run();
  return setInterval(run, intervalMs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.ADMIN_TOKEN) console.warn('[warn] ADMIN_TOKEN is not set - the admin dashboard is locked.');
  if (!process.env.APP_SECRET) console.warn('[warn] APP_SECRET is not set - using an insecure default for unsubscribe links.');
  if (!process.env.MAILING_ADDRESS) console.warn('[warn] MAILING_ADDRESS is not set - CAN-SPAM requires a postal address in marketing emails.');
  if (!process.env.CRON_SECRET && process.env.SCHEDULER === 'off') console.warn('[warn] SCHEDULER=off but CRON_SECRET is not set - nothing will run the weekly jobs.');
  const store = await Store.open();
  const port = Number(process.env.PORT) || 3000;
  const server = createServer(store).listen(port, () => console.log(`${business.brand.name} marketing system on http://localhost:${port} (${process.env.DATABASE_URL ? 'postgres' : 'file'} storage)`));
  if (process.env.SCHEDULER !== 'off') startScheduler(store);
  // Hosts stop idle apps with SIGTERM: finish saving first so no lead is lost.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, async () => { server.close(); await store.flush(); process.exit(0); });
  }
}
