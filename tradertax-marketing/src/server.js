// HTTP server: public funnel (landing quiz, playbook, blog, unsubscribe),
// booking webhook, admin dashboard API and the built-in scheduler.
import './env.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import business from '../config/business.js';
import { topics } from '../config/tax-calendar.js';
import { ROOT } from './env.js';
import { Store } from './db.js';
import { verifyUnsubscribe, markdownToHtml } from './email/sender.js';
import {
  captureLead, setLeadStatus, approveContent, rejectContent, runWeeklyContent, weeklyStats, tick,
} from './engine.js';

const PUBLIC = path.join(ROOT, 'public');
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function send(res, status, body, type = 'application/json') {
  const payload = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff' });
  res.end(payload);
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

// Basic per-IP limiter for the public lead endpoint.
const hits = new Map();
function rateLimited(ip, max = 10, windowMs = 3600000) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

function page(title, bodyHtml, description = business.brand.tagline) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
<link rel="stylesheet" href="/styles.css"></head><body><header class="top"><a href="/" class="logo">${escapeHtml(business.brand.name)}</a>
<nav><a href="/blog">Blog</a><a href="/playbook">Free Playbook</a><a class="btn small" href="${escapeHtml(business.brand.bookingUrl)}">Book a call</a></nav></header>
<main class="wrap">${bodyHtml}</main><footer class="foot"><p>${escapeHtml(business.compliance.disclaimer)}</p><p>${escapeHtml(business.brand.mailingAddress)}</p></footer></body></html>`;
}

const publishedPosts = (store) => store
  .filter('contentPacks', (p) => p.blog.status === 'published')
  .sort((a, b) => new Date(b.blog.publishedAt) - new Date(a.blog.publishedAt));

export function createServer(store = new Store()) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    try {
      // ---------------- public funnel
      if (route === 'GET /' || route === 'GET /admin') {
        const file = url.pathname === '/' ? 'index.html' : 'admin.html';
        return send(res, 200, fs.readFileSync(path.join(PUBLIC, file), 'utf8'), 'text/html');
      }
      if (route === 'GET /styles.css') return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8'), 'text/css');
      if (route === 'GET /playbook') return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'playbook.html'), 'utf8'), 'text/html');
      if (route === 'GET /healthz') return send(res, 200, { ok: true });
      if (route === 'GET /api/config') {
        return send(res, 200, {
          brand: { name: business.brand.name, tagline: business.brand.tagline, bookingUrl: business.brand.bookingUrl },
          leadMagnet: business.offers.leadMagnet, segments: Object.fromEntries(Object.entries(business.segments).map(([k, v]) => [k, v.label])),
          disclaimer: business.compliance.disclaimer,
        });
      }

      if (route === 'POST /api/leads') {
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
        if (rateLimited(ip)) return send(res, 429, { error: 'Too many requests' });
        const body = await readJson(req);
        if (body.website) return send(res, 200, { ok: true }); // honeypot: bots fill hidden fields
        const { lead, isNew } = captureLead(store, body);
        return send(res, isNew ? 201 : 200, {
          ok: true, tier: lead.tier, segment: lead.segment, ttsLikely: lead.ttsLikely,
          bookingUrl: business.brand.bookingUrl, playbookUrl: business.offers.leadMagnet.path,
        });
      }

      if (route === 'GET /unsubscribe') {
        const id = url.searchParams.get('id');
        if (!verifyUnsubscribe(id, url.searchParams.get('t')) || !store.get('leads', id)) {
          return send(res, 400, page('Unsubscribe', '<h1>Link not valid</h1><p>Reply to any email and we will remove you manually.</p>'), 'text/html');
        }
        setLeadStatus(store, id, 'unsubscribed');
        return send(res, 200, page('Unsubscribed', '<h1>You are unsubscribed</h1><p>You will not receive any more marketing emails from us.</p>'), 'text/html');
      }
      if (route === 'POST /unsubscribe') { // RFC 8058 one-click
        const id = url.searchParams.get('id');
        if (verifyUnsubscribe(id, url.searchParams.get('t')) && store.get('leads', id)) setLeadStatus(store, id, 'unsubscribed');
        return send(res, 200, { ok: true });
      }

      if (route === 'GET /blog') {
        const items = publishedPosts(store).map((p) => `<article class="card"><h2><a href="/blog/${escapeHtml(p.blog.slug)}">${escapeHtml(p.blog.title)}</a></h2><p>${escapeHtml(p.blog.metaDescription)}</p></article>`).join('');
        return send(res, 200, page(`Blog | ${business.brand.name}`, `<h1>Trader Tax Insights</h1>${items || '<p>First articles coming soon.</p>'}`), 'text/html');
      }
      if (req.method === 'GET' && url.pathname.startsWith('/blog/')) {
        const slug = decodeURIComponent(url.pathname.slice(6));
        const pack = publishedPosts(store).find((p) => p.blog.slug === slug);
        if (!pack) return send(res, 404, page('Not found', '<h1>Article not found</h1>'), 'text/html');
        const schema = { '@context': 'https://schema.org', '@type': 'Article', headline: pack.blog.title, description: pack.blog.metaDescription,
          datePublished: pack.blog.publishedAt, author: { '@type': 'Organization', name: business.brand.name }, keywords: pack.blog.keywords.join(', ') };
        const cta = `<aside class="cta"><h3>Get ${escapeHtml(business.offers.leadMagnet.name)}</h3><p>${escapeHtml(business.offers.leadMagnet.description)}</p><a class="btn" href="/#quiz">Take the 60-second quiz</a></aside>`;
        const html = `<article class="post">${markdownToHtml(pack.blog.markdown.replace(/^# .*\n+/, `# ${pack.blog.title}\n\n`))}</article>${cta}
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
        return send(res, 200, page(`${pack.blog.title} | ${business.brand.name}`, html, pack.blog.metaDescription), 'text/html');
      }
      if (route === 'GET /sitemap.xml') {
        const base = business.brand.website;
        const urls = ['/', '/playbook', '/blog', ...publishedPosts(store).map((p) => `/blog/${p.blog.slug}`)];
        return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${escapeHtml(base + u)}</loc></url>`).join('')}</urlset>`, 'application/xml');
      }
      if (route === 'GET /robots.txt') return send(res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${business.brand.website}/sitemap.xml\n`, 'text/plain');

      // ---------------- booking webhook (Calendly / Cal.com / Zapier)
      if (route === 'POST /api/webhooks/booking') {
        if (!safeEqual(url.searchParams.get('secret'), process.env.BOOKING_WEBHOOK_SECRET)) return send(res, 401, { error: 'Unauthorized' });
        const body = await readJson(req);
        const email = String(body.email || body.payload?.email || body.payload?.invitee?.email || '').toLowerCase();
        const lead = store.find('leads', (l) => l.email === email);
        if (!lead) return send(res, 202, { ok: true, matched: false });
        setLeadStatus(store, lead.id, 'booked');
        return send(res, 200, { ok: true, matched: true });
      }

      // ---------------- admin API
      if (url.pathname.startsWith('/api/admin/')) {
        if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });

        if (route === 'GET /api/admin/summary') return send(res, 200, weeklyStats(store, new Date(), Number(url.searchParams.get('days')) || 7));
        if (route === 'GET /api/admin/leads') {
          const leads = [...store.all('leads')].sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));
          return send(res, 200, leads);
        }
        const statusMatch = url.pathname.match(/^\/api\/admin\/leads\/([^/]+)\/status$/);
        if (req.method === 'POST' && statusMatch) {
          const { status } = await readJson(req);
          if (!['new', 'contacted', 'booked', 'client', 'unsubscribed', 'lost'].includes(status)) return send(res, 400, { error: 'Invalid status' });
          const lead = setLeadStatus(store, statusMatch[1], status);
          return lead ? send(res, 200, lead) : send(res, 404, { error: 'Lead not found' });
        }
        if (route === 'GET /api/admin/content') {
          const packs = [...store.all('contentPacks')].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 12);
          const posts = [...store.all('posts')].sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
          return send(res, 200, { packs, posts });
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
          const { checkCompliance } = await import('./compliance.js');
          return send(res, 200, store.update('posts', id, { text, compliance: checkCompliance(text), status: 'pending_approval' }));
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
    try { await tick(store, new Date()); } catch (err) { console.error('[scheduler]', err); } finally { running = false; }
  };
  run();
  return setInterval(run, intervalMs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.ADMIN_TOKEN) console.warn('[warn] ADMIN_TOKEN is not set - the admin dashboard is locked.');
  if (!process.env.APP_SECRET) console.warn('[warn] APP_SECRET is not set - using an insecure default for unsubscribe links.');
  const store = new Store();
  const port = Number(process.env.PORT) || 3000;
  createServer(store).listen(port, () => console.log(`${business.brand.name} marketing system on http://localhost:${port}`));
  if (process.env.SCHEDULER !== 'off') startScheduler(store);
}
