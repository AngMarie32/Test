# TraderTaxHQ: automated marketing system

The automated marketing system for [www.tradertaxhq.com](https://www.tradertaxhq.com): tax preparation and guidance for prop firm, funded account, futures, forex, options and crypto traders. It captures leads, qualifies them against TraderTaxHQ's pricing plans and nurtures them toward **Start Basic Intake**. Each week it writes content that links back to the site's `/resources` guides, schedules social posts, sends deadline reminders and reports the numbers. Nothing goes out until you approve it.

```
 Main site (Lovable)                          This app (e.g. go.tradertaxhq.com)
 ─────────────────────                        ─────────────────────────────────────────────
 Checklist email form ──POST /api/subscribe──►  Lead store + scoring (0-100, hot/warm/nurture)
 Basic Intake (/get-started) ──Zapier──► POST /api/webhooks/intake  → stops nurture
                                              Campaign page "/" Prop Firm Tax Check quiz (for ads,
                                                 affiliates, social; ?ref=CODE tracks affiliates)
                                              /checklist  2026 Prop Firm Trader Tax Checklist
                                                    │
                                                    ▼
                                              Nurture emails (welcome → segment → estimates →
                                                 mistakes → last call), hot lead → personal note +
                                                 owner alert with likely plan and upsells
                                                    │
 /resources/<new article> ◄── copy / download ──  Weekly content pack (Claude or templates):
                                                 article · newsletter · 7 social posts · video script
                                                 compliance scan + approval in /admin
                                                    │
                                              Social webhook (Zapier/Make/Buffer), Thursday 7pm
                                              newsletter, deadline reminders (14 + 3 days),
                                              Monday KPI report to info@tradertaxhq.com
```

## What's tailored to TraderTaxHQ

- **Segments, in priority order:** prop firm traders first (Topstep, Apex, TradeDay, FundingTicks, FTMO), then own-account futures, forex, stocks/options and crypto.
- **Plan fit** comes from the pricing page: Starter $297, Essential $497, Professional $997, Enterprise from $2,497. Bookkeeping and IRS-notice support are flagged as upsells.
- **Every CTA** goes to Start Basic Intake (`/get-started`) with UTM tags, so the site's analytics shows which emails and posts drive intakes.
- **Content** follows the site's own positioning: start with the payout arrangement, not the instrument. Evaluation fees may be current expenses or startup costs. Payouts from foreign firms are still reportable.
- **Compliance:** every email and article states "run by a tax advisor (not a CPA or EA)". The scanner blocks "CPA firm", "enrolled agent", "represent you before the IRS", "guarantee" and unqualified savings claims.
- **Timing:** posts and the newsletter go out after the futures session, and on weekends, to match "evenings & weekends".

## Quick start

```bash
cd tradertax-marketing
npm install
cp .env.example .env      # set ADMIN_TOKEN, APP_SECRET, MAILING_ADDRESS, PUBLIC_URL, WEBHOOK_SECRET
npm start                 # http://localhost:3000 (quiz) · /checklist · /admin
npm test
```

With no other keys set, nothing leaves the system. Emails are written to `data/outbox/`, social posts are logged as dry runs, and content comes from built-in templates.

## Connecting it to www.tradertaxhq.com

1. **Host this app** on a subdomain such as `go.tradertaxhq.com` (Railway, Render, Fly.io or a VPS with a persistent disk for `data/`). Set `PUBLIC_URL` to that subdomain.
2. **Checklist form → email list.** In the site's checklist form, add a POST when "Email Me & Download" is clicked:
   ```js
   fetch('https://go.tradertaxhq.com/api/subscribe', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ email, firstName, consent: true, source: 'main-site-checklist' }),
   });
   ```
   `www.tradertaxhq.com` is allowed by CORS by default (`ALLOWED_ORIGINS`).
3. **Basic Intake → stop the nurture.** Use Zapier/Make (or the intake's own submit handler) to POST `{ "email": "..." }` to `/api/webhooks/intake?secret=WEBHOOK_SECRET`. Booked consultations can POST to `/api/webhooks/booking?secret=...`.
4. **Articles.** Approve an article in `/admin`, then use **Copy Markdown** or **Download .md** (with title, slug, description and quick-answer front matter) and publish it under `/resources`. This app serves no public blog, and it is `noindex`, so it never competes with the main site in search.
5. **Affiliates.** Give partners `https://go.tradertaxhq.com/?ref=THEIRCODE`. Leads carry the code, and the weekly report counts referrals per affiliate.

## Turning on each piece

| Feature | Setting | Notes |
|---|---|---|
| AI-written content | `ANTHROPIC_API_KEY` | Claude (`claude-opus-5-5`) with structured JSON output. Server-side refusal fallbacks are on (`CLAUDE_FALLBACKS=true`). If a call fails, the template pack is used and the error shows in the dashboard. |
| Real email | `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`, or `postmark` + `POSTMARK_TOKEN` | Verify the tradertaxhq.com sending domain (SPF/DKIM/DMARC). Each email includes one-click unsubscribe and `MAILING_ADDRESS`, which CAN-SPAM requires (a PO box is fine). |
| Social posting | `SOCIAL_WEBHOOK_URL` or per-channel `SOCIAL_WEBHOOK_URL_X` / `_LINKEDIN` / `_FACEBOOK` / `_INSTAGRAM` | Receives `{channel, text, link, postId, scheduledFor}`. |
| Approval gate | `REQUIRE_APPROVAL=true` (default) | Content that fails the compliance scan always waits for approval, whatever this is set to. |

## Customizing

- **`config/business.js`**: brand, voice, plans and prices, segments, banned phrases, disclaimer, schedule.
- **`config/tax-calendar.js`**: deadlines and the topic bank. Each topic links to the matching `/resources` guide.
- **`src/email/sequences.js`**: nurture email copy for each segment.
- **`src/scoring.js`**: quiz weights and plan-fit rules.

## Running jobs

The built-in scheduler ticks every minute. Each job runs only once per week or deadline, so restarts are safe. To use external cron instead, set `SCHEDULER=off` and run `npm run cli -- tick`. Other commands:

```bash
npm run cli -- generate prop-payouts   # build a pack now (list ids: npm run cli -- topics)
npm run cli -- deadlines 120           # upcoming deadlines
npm run cli -- stats 30                # KPIs for the last 30 days
npm run cli -- report                  # send the KPI report now
```

## Notes

- Tax figures in the checklist and emails reflect current federal rules. Re-check them each season and review AI-written drafts before approving.
- The quiz score is a sales-priority signal, not a Trader Tax Status determination.
- Weekend deadlines roll forward automatically. Holidays and IRS disaster extensions are not modeled.
