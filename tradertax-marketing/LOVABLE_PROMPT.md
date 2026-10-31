# Lovable prompts: TraderTaxHQ marketing system

Paste these into the SAME Lovable project as www.tradertaxhq.com, one at a time, in order. Wait for each to finish and check it works before sending the next. Lovable does better with phases than with one giant prompt.

Before you start: have your Supabase / Lovable Cloud connected, and a Resend account (resend.com, free) with tradertaxhq.com verified. Keep your Anthropic API key handy for Prompt 3.

---

## PROMPT 1: Lead funnel, quiz and scoring

```
Add a lead-generation system to this site. Use Lovable Cloud / Supabase for data and edge functions. Keep the site's existing look: dark navy background #0b111e, green primary #21c45d, blue secondary #3c83f6, Inter font. Do not change existing pages except where I say.

## Database (with RLS: the public can only INSERT through the edge function; only admins can read)
Create an `app_role` enum ('admin','user') and a `user_roles` table plus a `has_role(uid, role)` security-definer function. Make my account an admin.

Table `leads`: id uuid pk, email text unique (lowercased), first_name text, phone text, status text default 'new' (allowed: new, contacted, intake_started, booked, client, lost, unsubscribed), source text, utm jsonb, ref text (affiliate code), answers jsonb, score int, tier text (hot|warm|nurture), segment text (prop|futures|forex|options|crypto), tts_likely bool, recommended_plan text (starter|essential|professional|enterprise), upsells text[], reasons text[], consent_at timestamptz, created_at, updated_at.

## Page /tax-check (public landing + quiz, for ads, social and affiliates)
- Eyebrow pill: "Built for funded & prop firm traders"
- H1: "Got paid by a prop firm? Here's how it's actually taxed."
- Sub: "Topstep, Apex, TradeDay, FundingTicks, FTMO: payouts are usually contractor income with self-employment tax, not 60/40 futures gains. Take the 60-second tax check and see what applies to you."
- Pills: Prop Payouts, 1099-NEC, Section 1256, Wash Sales, TTS, §475, Entities, Evenings & Weekends
- 4 cards: "1099-NEC, 1099-K, or nothing" (reconcile every form to the payouts you actually received, avoid double counting, report foreign firms even when no form arrives); "Evals & resets" (may be current business expenses or startup costs depending on timing; not every fee is automatically deductible); "Self-employment tax" (prop firms withhold nothing; quarterly estimates keep April from turning into a penalty); "Your own futures account" (Section 1256 contracts you trade with your own capital get 60/40 treatment; your payouts usually don't)
- Quiz form "Prop Firm Tax Check":
  1. How do you trade? multi-select chips: Prop firm / funded account, Futures (own account), Forex, Stocks / options, Crypto
  2. Only shown if "Prop firm" is checked: how many prop firms paid you this year (None yet=0, 1, 2-3=2, 4+=4); total payouts this year ($0=0, under $10k=5000, $10k-$50k=25000, $50k-$100k=75000, $100k+=150000); any payouts from a firm that sends no US tax form, e.g. FTMO (yes/no); made quarterly estimated payments (yes/no)
  3. Personal broker accounts (None=0, 1, 2, 3, 4-5=5, 6+=6); trades per year in those accounts (None/under 100=0, 100-500=300, 500-750=650, 750-5,000=2000, 5,000+=8000); how often do you trade (a few days a month=20, about half of market days=50, most market days=80, virtually every market day=95); last year's personal trading result (about break-even/na=0, loss over $10k=-25000, small loss=-3000, profit under $100k=30000, profit $100k+=150000)
  4. LLC/S-Corp (yes/no); IRS notice about trading income (yes/no); has a tax preparer who understands trader taxes (yes/no)
  5. First name, email (required), hidden honeypot field, required consent checkbox: "Send me the checklist, subscriber-only discounts, specials, tax deadline reminders, and educational emails. Unsubscribe anytime."
  Button: "Get my results + checklist"
- Capture utm_source/utm_medium/utm_campaign/utm_content and `?ref=` (affiliate code) from the URL and send them with the lead.
- On submit call edge function `submit-lead`. Hide the form and show a results card: tier hot = "There is likely real work to do on your return." / warm = "A few things are worth checking." / nurture = "Your checklist is on its way."; then "Likely fit: <Plan name> (<price>)" with one line of what it includes; buttons "Start Basic Intake" (links to /get-started with utm_source=tax-check&utm_medium=quiz) and "Open the checklist" (/checklist); small text "No tax documents needed yet. Email-only guidance available."
- Footer disclaimer on this page: "This content is for educational purposes only and is not tax, legal or investment advice. Tax outcomes depend on your specific facts and circumstances. TraderTaxHQ is run by a tax advisor (not a CPA or EA)."

## Page /checklist (the lead magnet, printable, with a Print / Save PDF button)
Title: "The 2026 Prop Firm Trader Tax Checklist & Expense Deduction Guide". Sections with tick-box lists:
1. Start with the payout arrangement (a funded futures payout is not automatically your own Section 1256 gain; for a typical sole-proprietor independent-contractor arrangement, net payouts generally go on Schedule C with self-employment tax on Schedule SE; employment, entity and other arrangements may differ; the 1099 label alone is not decisive)
2. Forms to expect (table): 1099-NEC (most US prop firms), 1099-MISC, 1099-K (check for double counting with a 1099-NEC), nothing from many foreign firms (still reportable), 1099-B from your own brokers (1256 activity to Form 6781, securities to Form 8949/Schedule D), 1099-DA for crypto
3. Expenses to track: eval/challenge/reset/activation fees, market data, platform and routing subscriptions, charting, VPS, computers/monitors, internet/phone business share, education for an existing trading business, home office only if regular and exclusive use, tax prep and bookkeeping. Note: evaluation and reset fees may be current expenses or startup costs; not every fee is automatically deductible
4. Records to keep
5. 2026 estimated tax dates: April 15, June 15, September 15, 2026 and January 15, 2027; safe harbor 90% of this year's or 100% of last year's tax (110% if prior-year AGI over $150,000); annualized income method (Form 2210 Schedule AI) for lumpy payouts
6. If you also trade your own account: Section 1256 60/40 and Form 6781; wash sales across all accounts including IRAs; Trader Tax Status and the Section 475(f) election (generally due April 15 for existing filers); forex Section 988 default and election timing
End with a CTA card: "Plans start at $297/yr with unlimited prop firm accounts. The Basic Intake takes 3-5 minutes and needs no tax documents." with buttons Start Basic Intake and See pricing. Same disclaimer as above.

## Existing homepage form
Hook the existing "Email Me & Download" checklist form on the homepage to the same `submit-lead` function with source 'main-site-checklist' (no quiz answers). Its consent text already exists; keep it.

## Edge function `submit-lead` (validate everything server-side)
- Validate email format, require consent, drop silently if the honeypot is filled, rate limit ~10 per hour per IP. Lowercase the email. If the email already exists, update answers/score but do not create a second lead (if they were 'unsubscribed' and consent again, set status back to 'new').
- Compute the score with a pure function in a shared file, `score-lead.ts`, with unit tests:
  Segment priority: prop, futures, forex, options, crypto (first one the person selected; default prop).
  Points (cap total at 100): prop trader +20; prop payouts >=$50k +20, >=$10k +12, >0 +5; 2+ prop firms +8; foreign firm +6; prop trader with payouts and no estimated payments +10; trades/yr >=720 +12, >=250 +6; trades on >=75% of days +8; 3+ broker accounts +6; net result <= -$10k +10; net result >= $100k with no entity +8; has entity +8; IRS notice +15; no trader-focused preparer +6.
  Tier: hot >= 60, warm >= 35, else nurture.
  tts_likely = trades/yr >= 720 AND days traded >= 75% (a sales-priority signal only, never a determination).
  Recommended plan: has entity -> enterprise; else more than 3 broker accounts OR more than 750 trades OR tts_likely -> professional; else exactly 3 broker accounts OR more than 500 trades -> essential; else starter.
  Upsells: 'bookkeeping' if entity or prop payouts >= $50k; 'irs-notice' if IRS notice.
  Store the list of reasons ("+20 prop firm / funded account trader").
- Plans (use these exact names/prices): Starter $297/yr (unlimited prop firm accounts, up to 2 broker accounts, 500 trades, 1 state); Essential $497/yr (up to 3 broker accounts, 750 trades, Schedule D & Form 8949); Professional $997/yr (unlimited trades, up to 5 brokers, Trader Tax Status analysis, MTM election guidance, mid-season planning call); Enterprise from $2,497/yr (entity return plus owner 1040, entity structure optimization, year-round planning).
- Return {tier, segment, plan, ttsLikely}.
```

---

## PROMPT 2: Email nurture and unsubscribe

```
Add email automation using Resend (secret RESEND_API_KEY; FROM = "TraderTaxHQ <info@tradertaxhq.com>"; also a secret MAILING_ADDRESS shown in every marketing email footer for CAN-SPAM).

## Table `emails`
id, lead_id (nullable fk), kind (nurture|newsletter|deadline|owner), key text, to_email, subject, preheader, body (markdown), send_at timestamptz, status (queued|sent|cancelled|failed), attempts int, error text, sent_at, created_at.

## Nurture sequence (queued when a NEW lead is created, send_at relative to signup)
Placeholders in bodies: {{first_name}} (fallback "there"), {{intake_url}} (https://www.tradertaxhq.com/get-started), {{pricing_url}}, {{checklist_url}} (/checklist). Append utm_source=tthq-marketing&utm_medium=email&utm_campaign=<kind> to every tradertaxhq.com link.
1. Day 0 "welcome": subject "Your 2026 Prop Firm Trader Tax Checklist": link to the checklist, mention subscriber-only discounts and early access to specials, link to Basic Intake (3-5 minutes, no documents).
2. +1 hour, HOT leads only, "hot-personal": subject "Quick note on your answers": name the likely plan from their quiz with its price and what it includes; if upsell irs-notice, add a short paragraph that IRS notices have response deadlines and we can review it and guide their response; CTA to Basic Intake; "Prefer email-only guidance? Just reply."
3. Day 2, segment email by lead.segment (write each 150-250 words, plain English, one illustrative example, link to Basic Intake):
   - prop: "Your prop payout is not a trading gain" (start with the payout arrangement, not the instrument; typical independent-contractor payouts are Schedule C income with Schedule SE; 1099-NEC/MISC/K, foreign firms may send no form but income is still reportable; watch for double counting with a payment-processor 1099-K; eval and reset fees may be current expenses or startup costs; prop firms withhold nothing so quarterly estimates usually matter)
   - futures: "The 60/40 math most futures traders never run" (Section 1256 in your OWN account: 60% long-term/40% short-term; illustrative: $100,000 gain for a top-bracket trader blends to about 26.8% vs 37% short-term; year-end mark-to-market; 3-year loss carryback on Form 6781; prop firm payouts usually do not get 60/40)
   - forex: "Forex taxes: the election you have to make first" (Section 988 ordinary treatment by default; opt-out election must be made before the trade)
   - options: "The $3,000 loss cap may not have to apply to you" (Trader Tax Status plus a timely Section 475(f) election; wash sale and $3,000 limit; generally due April 15 for existing filers; Professional plan includes TTS analysis)
   - crypto: "1099-DA changed crypto taxes - here is what to check"
4. Day 5 "estimates": "Nobody is withholding tax from your trading": April 15, June 15, September 15, January 15; 90% / 100% / 110% safe harbor; annualized income method; extension extends time to file, not time to pay.
5. Day 9 "mistakes": "5 trader tax mistakes we fix every season" with a link to pricing (plans from $297/yr).
6. Day 14 "last-call": "Should I keep sending these?" (evenings and weekends availability, what they will still get, unsubscribe anytime).
Every email is plain-English, never promises a result, and never calls the firm CPAs or an enrolled-agent practice.

## Email design
HTML template: dark navy header with "TraderTaxHQ" wordmark ("Tax" in green), white body, green "Start Basic Intake" button below the body, and a small gray footer with: "This content is for educational purposes only and is not tax, legal or investment advice. Tax outcomes depend on your specific facts and circumstances. TraderTaxHQ is run by a tax advisor (not a CPA or EA).", the MAILING_ADDRESS, and an Unsubscribe link. Add List-Unsubscribe and List-Unsubscribe-Post (one-click) headers.

## Unsubscribe
Edge function `unsubscribe` verifying an HMAC token (secret APP_SECRET) of the lead id; GET shows a "You are unsubscribed" page, POST handles one-click. Sets status 'unsubscribed' and cancels all queued emails.

## Edge function `process-email-queue`
Send queued emails whose send_at has passed (batch of 50). Cancel nurture emails when the lead's status is intake_started, booked, client or unsubscribed; cancel every kind when unsubscribed. On failure retry up to 3 times with 15-minute backoff, then mark failed.

## Owner alerts
When a HOT lead is created, queue an owner email to info@tradertaxhq.com: name, email, phone, segment, score, TTS likely, likely plan and price, upsells, and the list of score reasons.

## Conversion webhooks
Edge functions `webhook-intake` and `webhook-booking`: POST with ?secret=WEBHOOK_SECRET and {email}. Set the lead to intake_started / booked (this stops nurture emails). Also set intake_started automatically when someone submits the existing /get-started intake form with that email.
```

---

## PROMPT 3: AI weekly content engine with approval

```
Add a weekly AI content engine and an admin approval flow.

## Tables
`content_packs`: id, week text, topic_id, topic_title, guide_url, source ('claude'|'template'), model, error, blog jsonb {title, slug, metaDescription, quickAnswer, keywords[], markdown, status (pending_approval|published|rejected), compliance}, newsletter jsonb {subject, preheader, body, scheduledFor, status (pending_approval|scheduled|sent|rejected), compliance}, video_script jsonb {hook, script, cta}, created_at.
`posts`: id, pack_id, channel (x|linkedin|facebook|instagram), text, link, scheduled_for, status (pending_approval|scheduled|published|rejected|failed), compliance jsonb, published_at, error.

## Topic bank (table or constant), each with id, title, angle, months it is in season (empty = evergreen), priority, segments, and a guide URL under https://www.tradertaxhq.com/resources/<slug>. Pick the in-season topic with the highest priority not used in the last 8 weeks. Seed with:
prop-payouts (How Prop Firm Payouts Are Taxed, evergreen, priority 9, guide prop-firm-payouts); eval-fees (Are Prop Firm Evaluation and Reset Fees Tax Deductible?, 8, prop-firm-evaluation-fees-tax-deductible); prop-1099-mismatch (reconciling 1099-NEC, 1099-K or nothing, Jan-Apr, 10, how-to-file-prop-firm-taxes); prop-se-tax (self-employment tax surprise, 8, prop-firm-payouts); prop-retirement (Solo 401(k)/SEP for self-employment income, Oct-Apr, 7, entity-structure); prop-scorp (LLC or S-Corp for funded traders, Oct-Jan, 7, entity-structure); estimates (quarterly estimates, 8, estimated-tax-payments); futures-6040 (60/40, 6, section-1256-contracts); loss-carryback (Jan-Apr, 6, section-1256-contracts); forex-988 (6, forex-trading-taxes); tts-qualify (5, trader-tax-status); mtm-475 (Section 475 deadline, Jan-Apr, 9, mark-to-market-election); wash-sale-yearend (Nov-Dec, 9, wash-sale-rules); prop-yearend (year-end checklist for funded traders, Nov-Dec, 10, how-to-file-prop-firm-taxes); crypto-1099da (Jan-Apr, 7, crypto-trading-taxes); home-office (4, home-office-deduction); irs-notice (May-Sep, 5, irs-audit-risk); records (Jun-Aug, 4, day-trading-taxes).

## Edge function `generate-weekly-content`
Calls the Anthropic Messages API with secret ANTHROPIC_API_KEY, model "claude-opus-5-5", max_tokens 16000, and structured JSON output via output_config.format = json_schema (do not use prefill or temperature). If the call fails, fall back to a simple template pack and save the error. System prompt must include: brand voice (we speak trader, plain English, numbers-first, integrity first, reassuring, evenings and weekends); the four plans with prices; "TraderTaxHQ is run by a tax advisor (not a CPA or EA); never call the firm CPAs, enrolled agents, or say we represent clients before the IRS (IRS notice help is review and response guidance with referrals to representation if needed)"; prop-payout rules ("start with the payout arrangement, not the instrument; typical independent-contractor payouts are generally Schedule C income with self-employment tax; employment, entity and other arrangements may differ; the 1099 label alone is not decisive; evaluation and reset fees may be current expenses or startup costs; not every fee is automatically deductible"); never promise outcomes or savings, dollar figures are illustrative examples; do not invent forms, deadlines or thresholds; CTA is "Start Basic Intake".
Deliverables per run: (1) an SEO article of 900-1300 words in Markdown for /resources: starts with a 2-3 sentence quickAnswer, H2/H3, one worked illustrative example, a 3-question FAQ, closing CTA to Start Basic Intake, slug, metaDescription max 155 chars, 5-8 keywords; (2) a newsletter 250-400 words with subject under 55 chars; (3) 7 social posts: 3 x, 2 linkedin, 1 facebook, 1 instagram (x <= 280 chars, instagram says "link in bio"), each opens with a hook, links to the guide URL, max 3 hashtags; (4) a 45-60 second vertical video script (hook, script with [on-screen text] cues, CTA).
Add UTM tags to every tradertaxhq.com link (utm_source=tthq-marketing, utm_medium=blog|email|social-<channel>, utm_campaign=<topic id>). Append the disclaimer sentence to the article and newsletter.
Slot the 7 posts into this week's schedule (America/New_York): x Mon 5pm, linkedin Tue 7am, x Tue 5pm, facebook Wed 7pm, x Thu 5pm, instagram Fri 12pm, linkedin Sat 10am; the newsletter goes Thursday 7pm.

## Compliance scanner (shared function with tests, applied to every article, newsletter and post)
Flag (do not auto-publish) any text containing: guarantee/guaranteed, risk-free, IRS approved, pay no tax, pay zero tax, never pay taxes, tax-free trading, audit-proof, loophole, eliminate all taxes, "our CPA", CPA firm, certified public accountant, enrolled agent, "we represent you", "represent you before the IRS", IRS representation; any sentence promising "save $X" without could/may/might/example/illustrative/depending; long-form content missing the disclaimer. Flagged items always wait for approval even if auto-approval is later turned on.

## Admin page /admin/marketing (only users with the admin role; Supabase auth login)
Tabs: Overview (7-day KPIs: new leads, hot leads, emails sent, posts published, awaiting approval, subscribed, intakes started, clients, lead-to-intake/client %), Approvals, Leads, Emails, Content.
- Approvals: each pending item shows the full text, a compliance badge (green "compliance ok" or amber with the issues), and Approve / Reject. Posts are editable inline (editing re-runs the scanner and keeps it pending). Articles also have "Copy Markdown" and "Download .md" (YAML front matter: title, slug, description, quickAnswer, keywords). Show the video script in an expandable section.
- Content tab: topic dropdown, optional "extra context" text box, and a "Generate content pack" button that calls generate-weekly-content now.
- Leads: sortable by score, with a tier badge (hot=red, warm=amber), TTS-likely badge, segment, likely plan and upsell tags, source/utm and affiliate ref, created date, and a status dropdown (new, contacted, intake_started, booked, client, lost, unsubscribed). Setting intake_started, booked, client or unsubscribed cancels queued nurture emails. "Export CSV" button.
- Emails: the latest 200 with kind, to, subject, send time, status.
```

---

## PROMPT 4: Social publishing, deadline reminders, weekly report, scheduling

```
Finish the automation.

## Edge function `publish-posts`
Publishes posts whose status is 'scheduled' and scheduled_for has passed by POSTing {channel, text, link, postId, scheduledFor} JSON to a webhook URL: secret SOCIAL_WEBHOOK_URL (or per-channel SOCIAL_WEBHOOK_URL_X / _LINKEDIN / _FACEBOOK / _INSTAGRAM if set), with header X-Webhook-Secret from SOCIAL_WEBHOOK_SECRET. If no URL is set, mark the post as published in a "dry-run" mode and log it. Failures set status 'failed' with the error.

## Newsletter
When a pack's newsletter is 'scheduled' and its scheduledFor time has passed, queue one email (kind 'newsletter') per subscribed lead (anyone not unsubscribed), then mark it 'sent'. Newsletters respect unsubscribes but are not stopped by intake_started/booked/client.

## Deadline reminders
A `tax_deadlines` constant (America/New_York, 9:00am, weekend deadlines roll to the next business day; year-end rolls back to the last trading day):
Jan 15 Q4 Estimated Tax Payment (all; "Prop firms withhold nothing. Pay your fourth-quarter estimate so last year's payouts do not turn into an underpayment penalty."); Jan 31 1099-NEC Forms Due From Prop Firms (prop; "Download every one and compare it to your payout history before you file."); Mar 15 S-Corp & Partnership Returns Due (all); Apr 15 Tax Day + Q1 Estimates + Section 475(f) Election Deadline (all; "An extension extends the time to file, not the time to pay."); Jun 15 Q2 Estimated Tax Payment (all); Sep 15 Q3 Estimated Tax Payment + Extended Entity Returns (all); Oct 15 Extended Individual Returns Due (all); Dec 31 Year-End Trading Tax Cutoff (prop, options, crypto; last day to harvest losses, pay deductible business expenses and avoid year-end wash sales).
14 days and 3 days before each deadline, queue a "deadline" email to subscribers in the matching segments with a link to the related guide and Start Basic Intake. Only send the tightest window you are currently inside, and never send the same deadline+year+window twice (idempotent).

## Weekly report
Every Monday 8am ET, email info@tradertaxhq.com: new leads (hot/warm), emails sent, posts published, items awaiting approval, leads by segment, leads by likely plan, leads by source (utm_source), affiliate referrals by ref code, and all-time totals (subscribed, intakes started, booked, clients, conversion %).

## Scheduling (pg_cron + pg_net, or Supabase scheduled functions)
- Every 10 minutes: call a single `tick` edge function that runs, in order: generate-weekly-content (only if it is Monday 6am ET or later and none has been generated this ISO week), the weekly report (Monday 8am+, once per week), deadline reminders, newsletter queueing, publish-posts, process-email-queue. Make every job idempotent using a `jobs` table (job, key) so reruns never double-send.
- Require REQUIRE_APPROVAL=true by default: nothing is published or sent until I approve it in /admin/marketing.

## Affiliates
Visiting any page with ?ref=CODE stores the code for 90 days (localStorage + cookie) and attaches it to a lead when they submit the quiz or the checklist form. In the weekly report and the Leads tab show referrals per ref code. Link the existing /affiliate page's commission info unchanged.

## Final checks
- All unsubscribed leads must never receive a marketing email.
- Every marketing email has the footer with the physical address, disclaimer, and a working unsubscribe link.
- Add unit tests for the scoring function, the compliance scanner and the deadline date rolling.
- The /tax-check and /checklist pages are noindex (meta robots) so they do not compete with the site's /resources content; keep the rest of the site unchanged.
```

---

## After Lovable builds it
1. Add secrets in Lovable Cloud / Supabase: RESEND_API_KEY, ANTHROPIC_API_KEY, MAILING_ADDRESS, APP_SECRET (any long random string), WEBHOOK_SECRET, and optionally SOCIAL_WEBHOOK_URL / SOCIAL_WEBHOOK_SECRET.
2. Take the quiz yourself, then check /admin/marketing shows you as a lead and a queued welcome email.
3. Generate one content pack from the Content tab and review it before approving anything.
4. Send a test to your own email before you let the queue run on real leads.
