# TraderTax HQ: automated marketing system

A self-hosted marketing system for a tax practice that serves active traders. It captures leads, qualifies them, nurtures them by email, writes the content each week, schedules it across social channels, sends deadline campaigns and reports the numbers to you. Nothing goes out until you approve it.

```
 Traffic (SEO blog, social, ads with UTM tags)
        │
        ▼
 Landing page + 60-second Trader Tax Quiz ──► Lead scoring (0-100, hot / warm / nurture)
        │                                        │  segment: futures · options · equities · prop · crypto
        │                                        │  TTS-likely flag + recommended service
        ▼                                        ▼
 Playbook (lead magnet)              Nurture sequence (welcome → segment email → TTS check → mistakes → last call)
                                     Hot lead → personal note within 1 hour + instant alert to the owner
                                                 │
 Booking webhook (Calendly / Cal.com) ──────────►│ stops the sequence when they book
                                                 ▼
 Weekly content engine (Claude or templates) ──► Blog post + newsletter + 7 social posts + video script
        │  topic picked from the tax calendar         │ compliance scan + disclaimer
        ▼                                             ▼
 Admin dashboard: approve / edit / reject ──► Scheduled publishing (webhook to Zapier / Make / Buffer)
                                              Thursday newsletter to all subscribers
 Tax-deadline reminders (14 and 3 days before) ─► segment-targeted broadcast emails
 Monday KPI report ─► owner inbox
```

## Quick start

```bash
cd tradertax-marketing
npm install
cp .env.example .env      # set ADMIN_TOKEN, APP_SECRET, BOOKING_URL, OWNER_EMAIL, MAILING_ADDRESS
npm start                 # http://localhost:3000  ·  dashboard at /admin
npm test
```

With no other keys set, the system runs safely. Emails go to `data/outbox/` as HTML files, social posts are logged as dry runs, and content comes from built-in templates.

## Turning on each piece

| Feature | Setting | Notes |
|---|---|---|
| AI-written content | `ANTHROPIC_API_KEY` | Uses Claude (`claude-opus-5-5` by default) with structured JSON output. Server-side refusal fallbacks are on (`CLAUDE_FALLBACKS=true`). If a call fails, the template pack is used and the error appears in the dashboard. |
| Real email | `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`, or `postmark` + `POSTMARK_TOKEN` | Verify your sending domain (SPF/DKIM/DMARC) first. Every email includes one-click unsubscribe and your mailing address (CAN-SPAM). |
| Social posting | `SOCIAL_WEBHOOK_URL` (or `SOCIAL_WEBHOOK_URL_X`, `_LINKEDIN`, `_FACEBOOK`, `_INSTAGRAM`) | Receives `{channel, text, link, postId, scheduledFor}`. Point it at a Zapier/Make/n8n/Buffer flow that posts to the network. |
| Stop nurture on booking | `BOOKING_WEBHOOK_SECRET` | In Calendly/Cal.com, add a webhook to `https://your-site/api/webhooks/booking?secret=...`. It reads `email`, `payload.email` or `payload.invitee.email`. |
| Approval gate | `REQUIRE_APPROVAL=true` (default) | Blog, newsletter and every post wait in `/admin`. Content that fails the compliance scan always waits, whatever this is set to. |

## Customizing

- **`config/business.js`**: brand, voice, offers and prices, audience segments, banned phrases, disclaimer, posting schedule and channels.
- **`config/tax-calendar.js`**: deadlines and the topic bank. Topics have seasons and priorities, and a topic is not reused for 8 weeks.
- **`src/email/sequences.js`**: nurture email copy for each segment.
- **`src/scoring.js`**: quiz scoring weights and which offer goes to which lead.

## Running jobs

The server runs its own scheduler every minute (`SCHEDULER=on`). Jobs run only once each, so restarts and repeated ticks are safe:

- Monday 06:00: generate the week's content pack and place posts into the week's slots
- Monday 08:00: KPI report emailed to the owner
- Every minute: send due emails, publish approved posts, send the approved newsletter Thursday at 07:00, and queue deadline reminders

If you prefer external cron, set `SCHEDULER=off` and run `npm run cli -- tick` every few minutes. Other commands:

```bash
npm run cli -- generate [topicId]   # build a pack now (see: npm run cli -- topics)
npm run cli -- deadlines 120        # upcoming deadlines
npm run cli -- stats 30             # KPIs for the last 30 days
npm run cli -- report               # send the KPI report now
```

## Deploying

Run it as one always-on Node 20+ service (Railway, Render, Fly.io or a small VPS) with a persistent disk for `data/`. Put it behind HTTPS and set `PUBLIC_URL` to the public domain. Data lives in `data/db.json`, which is written atomically. That is enough for a single practice. Back it up, or move it to Postgres if you outgrow it.

## Compliance notes

- Built-in copy is educational and every long-form piece ends with the disclaimer. The scanner blocks promissory language ("guarantee", "pay no tax", unqualified "save $X" claims, and others).
- Tax figures in the playbook and emails (60/40 rates, SE tax, safe-harbor percentages, the 475(f) deadline) reflect current federal rules. Check them each tax season, and have a credentialed preparer review AI-written drafts before you approve them.
- The quiz score is a sales-priority signal, not a Trader Tax Status determination.
