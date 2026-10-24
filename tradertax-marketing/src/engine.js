// The automation engine. Every function takes the store and "now" so the whole
// system can be driven by the scheduler, the CLI or tests with a fake clock.
import business from '../config/business.js';
import { scoreLead } from './scoring.js';
import { buildSequence } from './email/sequences.js';
import { renderEmail, deliver, markdownToHtml } from './email/sender.js';
import { publishPost } from './social/publisher.js';
import { pickTopic, upcomingDeadlines } from './content/topics.js';
import { generatePack } from './content/generator.js';
import { topics } from '../config/tax-calendar.js';
import { zonedParts, slotInWeek, weekKey, DAY } from './time.js';

const TZ = business.brand.timezone;
const HOUR = 3600000;
// Lead statuses. Reaching any of STOP_STATUSES ends the nurture sequence.
export const LEAD_STATUSES = ['new', 'contacted', 'intake_started', 'booked', 'client', 'lost', 'unsubscribed'];
const STOP_STATUSES = new Set(['intake_started', 'booked', 'client', 'unsubscribed']);
const CONVERTED = new Set(['intake_started', 'booked', 'client']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------- leads

export function captureLead(store, input, now = new Date()) {
  const email = String(input.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('A valid email is required'), { status: 400 });
  if (!input.consent) throw Object.assign(new Error('Consent to receive emails is required'), { status: 400 });

  const answers = input.answers || {};
  const result = scoreLead(answers);
  const existing = store.find('leads', (l) => l.email === email);
  if (existing) {
    // Re-submission: refresh answers/score but do not restart the sequence.
    // Fresh consent re-subscribes someone who had unsubscribed.
    const patch = { lastSeenAt: now.toISOString() };
    if (Object.keys(answers).length) Object.assign(patch, { answers, ...result });
    if (existing.status === 'unsubscribed') Object.assign(patch, { status: 'new', consentAt: now.toISOString() });
    store.update('leads', existing.id, patch);
    store.log('lead.resubmitted', { leadId: existing.id });
    return { lead: existing, isNew: false };
  }

  const lead = store.insert('leads', {
    email,
    firstName: String(input.firstName || '').trim().slice(0, 60),
    phone: String(input.phone || '').trim().slice(0, 30),
    status: 'new',
    source: input.source || 'tax-check-quiz',
    utm: input.utm || {},
    ref: String(input.ref || input.utm?.ref || '').slice(0, 60) || null, // affiliate code
    answers,
    ...result,
    consentAt: now.toISOString(),
  });
  store.log('lead.captured', { leadId: lead.id, tier: lead.tier, segment: lead.segment, score: lead.score });

  for (const step of buildSequence(lead)) {
    const sendAt = new Date(now.getTime() + step.delayDays * DAY + (step.delayHours || 0) * HOUR);
    store.insert('emails', {
      kind: 'nurture', leadId: lead.id, to: email, key: step.key,
      subject: step.subject, preheader: step.preheader || '', body: step.body, sendAt: sendAt.toISOString(), status: 'queued',
    });
  }

  if (lead.tier === 'hot') notifyOwner(store, `🔥 Hot lead: ${lead.firstName || email} (score ${lead.score})`, hotLeadSummary(lead), now);
  return { lead, isNew: true };
}

function hotLeadSummary(lead) {
  const plan = business.offers.services.find((s) => s.id === lead.recommendedService);
  const upsells = (lead.upsells || []).map((id) => business.offers.services.find((s) => s.id === id)?.name).filter(Boolean);
  return [
    `**${lead.firstName || '(no name)'}** - ${lead.email}${lead.phone ? ` - ${lead.phone}` : ''}`,
    `Segment: ${business.segments[lead.segment]?.label} | Score: ${lead.score} | TTS likely: ${lead.ttsLikely ? 'yes' : 'no'}${lead.ref ? ` | Affiliate: ${lead.ref}` : ''}`,
    `Likely plan: ${plan?.name} (${plan?.price})${upsells.length ? `\n\nUpsells: ${upsells.join(', ')}` : ''}`,
    `Why:\n${lead.reasons.map((r) => `- ${r}`).join('\n')}`,
    'They were sent the Basic Intake link and a personal note (1 hour after signup). Mark them "intake_started" in the dashboard when they submit the intake so the sequence stops.',
  ].join('\n\n');
}

export function setLeadStatus(store, leadId, status) {
  const lead = store.update('leads', leadId, { status });
  if (!lead) return null;
  if (STOP_STATUSES.has(status)) {
    for (const e of store.filter('emails', (x) => x.leadId === leadId && x.status === 'queued' && x.kind === 'nurture')) {
      store.update('emails', e.id, { status: 'cancelled', cancelReason: status });
    }
  }
  if (status === 'unsubscribed') {
    for (const e of store.filter('emails', (x) => x.leadId === leadId && x.status === 'queued')) {
      store.update('emails', e.id, { status: 'cancelled', cancelReason: status });
    }
  }
  store.log('lead.status', { leadId, status });
  return lead;
}

export function notifyOwner(store, subject, body, now = new Date()) {
  return store.insert('emails', {
    kind: 'owner', leadId: null, to: business.brand.ownerEmail, key: 'owner',
    subject, body, sendAt: now.toISOString(), status: 'queued',
  });
}

// ---------------------------------------------------------------- email queue

export async function processEmailQueue(store, now = new Date(), { limit = 50 } = {}) {
  const due = store.filter('emails', (e) => e.status === 'queued' && new Date(e.sendAt) <= now).slice(0, limit);
  let sent = 0;
  for (const email of due) {
    const lead = email.leadId ? store.get('leads', email.leadId) : { id: 'owner', firstName: 'team', email: email.to };
    // Nurture stops on conversion; newsletters and deadline reminders stop only on unsubscribe.
    const blocked = email.leadId && (!lead || lead.status === 'unsubscribed' || (email.kind === 'nurture' && STOP_STATUSES.has(lead.status)));
    if (blocked) {
      store.update('emails', email.id, { status: 'cancelled', cancelReason: lead ? lead.status : 'lead missing' });
      continue;
    }
    try {
      const rendered = renderEmail(email, lead);
      const result = await deliver({ to: email.to, ...rendered, unsubUrl: email.kind === 'owner' ? null : rendered.unsubUrl });
      store.update('emails', email.id, { status: 'sent', sentAt: now.toISOString(), ...result });
      sent++;
    } catch (err) {
      const attempts = (email.attempts || 0) + 1;
      store.update('emails', email.id, attempts >= 3
        ? { status: 'failed', attempts, error: err.message }
        : { attempts, error: err.message, sendAt: new Date(now.getTime() + attempts * 15 * 60000).toISOString() });
    }
  }
  return sent;
}

// ---------------------------------------------------------------- content

export async function runWeeklyContent(store, now = new Date(), { topicId, extraContext } = {}) {
  const used = store.all('contentPacks').map((p) => ({ topicId: p.topicId, usedAt: p.createdAt }));
  const topic = topicId ? topics.find((t) => t.id === topicId) : pickTopic(now, used, TZ);
  if (!topic) throw Object.assign(new Error(`Unknown topic: ${topicId}`), { status: 400 });

  const pack = await generatePack(topic, { extraContext });
  const approval = business.compliance.requireApproval;
  const week = weekKey(now, TZ);
  const nl = business.schedule.newsletter;
  let newsletterAt = slotInWeek(now, nl.weekday, nl.hour, TZ);
  if (newsletterAt < now) newsletterAt = new Date(newsletterAt.getTime() + 7 * DAY);

  const record = store.insert('contentPacks', {
    week, topicId: topic.id, topicTitle: topic.title, guideUrl: pack.guideUrl,
    source: pack.source, model: pack.model, error: pack.error,
    blog: { ...pack.blog, status: approval || !pack.blog.compliance.ok ? 'pending_approval' : 'published',
      publishedAt: approval || !pack.blog.compliance.ok ? null : now.toISOString() },
    videoScript: pack.videoScript,
    newsletter: { ...pack.newsletter, scheduledFor: newsletterAt.toISOString(),
      status: approval || !pack.newsletter.compliance.ok ? 'pending_approval' : 'scheduled' },
  });

  // Assign generated posts to this week's slots (or next week's if already past).
  const remaining = [...pack.social];
  for (const slot of business.schedule.socialSlots) {
    const idx = remaining.findIndex((p) => p.channel === slot.channel);
    if (idx === -1) continue;
    const [post] = remaining.splice(idx, 1);
    let at = slotInWeek(now, slot.weekday, slot.hour, TZ);
    if (at < now) at = new Date(at.getTime() + 7 * DAY);
    store.insert('posts', {
      packId: record.id, channel: post.channel, text: post.text, compliance: post.compliance,
      link: pack.guideUrl,
      scheduledFor: at.toISOString(),
      status: approval || !post.compliance.ok ? 'pending_approval' : 'scheduled',
    });
  }
  store.log('content.generated', { packId: record.id, topicId: topic.id, source: pack.source });
  notifyOwner(store, `New content pack ready: ${topic.title}`,
    `This week's pack was generated (${pack.source}).\n\nIt includes an article for www.tradertaxhq.com/resources (copy the Markdown from the dashboard), a newsletter, ${pack.social.length} social posts and a video script.\n\n${approval ? 'Review and approve it in the dashboard: ' : 'Dashboard: '}${business.brand.website}/admin`, now);
  return record;
}

export function approveContent(store, kind, id) {
  if (kind === 'post') {
    const post = store.get('posts', id);
    if (!post || post.status !== 'pending_approval') return null;
    return store.update('posts', id, { status: 'scheduled', approvedAt: new Date().toISOString() });
  }
  if (kind === 'blog') {
    const pack = store.get('contentPacks', id);
    if (!pack || pack.blog.status !== 'pending_approval') return null;
    return store.update('contentPacks', id, { blog: { ...pack.blog, status: 'published', publishedAt: new Date().toISOString() } });
  }
  if (kind === 'newsletter') {
    const pack = store.get('contentPacks', id);
    if (!pack || pack.newsletter.status !== 'pending_approval') return null;
    return store.update('contentPacks', id, { newsletter: { ...pack.newsletter, status: 'scheduled' } });
  }
  return null;
}

export function rejectContent(store, kind, id) {
  if (kind === 'post') return store.update('posts', id, { status: 'rejected' });
  if (!['blog', 'newsletter'].includes(kind)) return null;
  const pack = store.get('contentPacks', id);
  return pack && store.update('contentPacks', id, { [kind]: { ...pack[kind], status: 'rejected' } });
}

export async function processPosts(store, now = new Date()) {
  let published = 0;
  for (const post of store.filter('posts', (p) => p.status === 'scheduled' && new Date(p.scheduledFor) <= now)) {
    try {
      const result = await publishPost(post);
      store.update('posts', post.id, { status: 'published', publishedAt: now.toISOString(), result });
      published++;
    } catch (err) {
      store.update('posts', post.id, { status: 'failed', error: err.message });
    }
  }
  return published;
}

const subscribers = (store, segments = ['all']) => store.filter('leads', (l) =>
  l.status !== 'unsubscribed' && (segments.includes('all') || segments.includes(l.segment)));

export function processNewsletters(store, now = new Date()) {
  let total = 0;
  for (const pack of store.filter('contentPacks', (p) => p.newsletter.status === 'scheduled' && new Date(p.newsletter.scheduledFor) <= now)) {
    let recipients = 0;
    for (const lead of subscribers(store)) {
      store.insert('emails', {
        kind: 'newsletter', leadId: lead.id, to: lead.email, key: `newsletter-${pack.id}`,
        subject: pack.newsletter.subject, preheader: pack.newsletter.preheader, body: pack.newsletter.body,
        sendAt: now.toISOString(), status: 'queued',
      });
      recipients++;
    }
    store.update('contentPacks', pack.id, { newsletter: { ...pack.newsletter, status: 'sent', sentAt: now.toISOString(), recipients } });
    total += recipients;
  }
  return total;
}

// ---------------------------------------------------------------- deadlines

export async function runDeadlineCampaigns(store, now = new Date()) {
  const reminders = [...business.schedule.deadlineReminderDays].sort((a, b) => a - b);
  let queued = 0;
  for (const dl of upcomingDeadlines(now, Math.max(...reminders), TZ)) {
    // Fire only the tightest reminder window we are inside; mark wider ones done.
    const n = reminders.find((r) => dl.daysAway <= r);
    const key = `${dl.id}-${dl.year}-${n}`;
    await store.once('deadline-reminder', key, () => {
      for (const wider of reminders.filter((r) => r > n)) {
        if (!store.hasRun('deadline-reminder', `${dl.id}-${dl.year}-${wider}`)) store.insert('jobs', { job: 'deadline-reminder', key: `${dl.id}-${dl.year}-${wider}`, skipped: true });
      }
      const when = dl.date.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
      for (const lead of subscribers(store, dl.segments)) {
        store.insert('emails', {
          kind: 'deadline', leadId: lead.id, to: lead.email, key,
          subject: dl.daysAway <= 3 ? `${dl.name}: ${when}` : `${dl.daysAway} days until ${dl.name}`,
          preheader: dl.action,
          body: `Hi {{first_name}},\n\n**${dl.name}: ${when}.**\n\n${dl.action}\n\nMore on this: ${dl.guide}\n\nWant us to handle it? Start a Basic Intake (no documents needed yet): {{intake_url}}\n\nWe are available evenings and weekends.`,
          sendAt: now.toISOString(), status: 'queued',
        });
        queued++;
      }
    });
  }
  return queued;
}

// ---------------------------------------------------------------- reporting

const tally = (rows, keyFn) => {
  const out = {};
  for (const r of rows) {
    const k = keyFn(r);
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
};

export function weeklyStats(store, now = new Date(), days = 7) {
  const since = now.getTime() - days * DAY;
  const inWindow = (r, field = 'createdAt') => r[field] && new Date(r[field]).getTime() >= since;
  const leads = store.filter('leads', (l) => inWindow(l));
  const all = store.all('leads');
  const converted = all.filter((l) => CONVERTED.has(l.status) || l.status === 'client');
  return {
    windowDays: days,
    newLeads: leads.length,
    hotLeads: leads.filter((l) => l.tier === 'hot').length,
    warmLeads: leads.filter((l) => l.tier === 'warm').length,
    bySegment: tally(leads, (l) => l.segment),
    bySource: tally(leads, (l) => l.utm?.source || l.source || 'direct'),
    byAffiliate: tally(leads, (l) => l.ref),
    byPlan: tally(leads, (l) => l.recommendedService),
    emailsSent: store.filter('emails', (e) => e.status === 'sent' && inWindow(e, 'sentAt')).length,
    postsPublished: store.filter('posts', (p) => p.status === 'published' && inWindow(p, 'publishedAt')).length,
    pendingApproval: store.filter('posts', (p) => p.status === 'pending_approval').length
      + store.filter('contentPacks', (p) => p.newsletter.status === 'pending_approval').length
      + store.filter('contentPacks', (p) => p.blog.status === 'pending_approval').length,
    totals: {
      leads: all.length,
      subscribed: all.filter((l) => l.status !== 'unsubscribed').length,
      intakes: all.filter((l) => l.status === 'intake_started').length,
      booked: all.filter((l) => l.status === 'booked').length,
      clients: all.filter((l) => l.status === 'client').length,
      conversionRate: all.length ? +(100 * converted.length / all.length).toFixed(1) : 0,
    },
  };
}

export function sendWeeklyReport(store, now = new Date()) {
  const s = weeklyStats(store, now);
  const lines = (obj) => Object.entries(obj).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- none';
  const body = [
    `**Last 7 days**`,
    `- New leads: ${s.newLeads} (hot ${s.hotLeads}, warm ${s.warmLeads})\n- Emails sent: ${s.emailsSent}\n- Social posts published: ${s.postsPublished}\n- Items waiting for your approval: ${s.pendingApproval}`,
    `**Leads by segment**\n\n${lines(s.bySegment)}`,
    `**Likely plan**\n\n${lines(s.byPlan)}`,
    `**Leads by source**\n\n${lines(s.bySource)}`,
    `**Affiliate referrals**\n\n${lines(s.byAffiliate)}`,
    `**All time**\n\n- Leads: ${s.totals.leads} (subscribed ${s.totals.subscribed})\n- Intakes started: ${s.totals.intakes}\n- Consultations booked: ${s.totals.booked}\n- Clients: ${s.totals.clients}\n- Lead → intake/client rate: ${s.totals.conversionRate}%`,
    `Dashboard: ${business.brand.website}/admin`,
  ].join('\n\n');
  notifyOwner(store, `Weekly marketing report - ${weekKey(now, TZ)}`, body, now);
  return s;
}

// ---------------------------------------------------------------- scheduler tick

export async function tick(store, now = new Date()) {
  const local = zonedParts(now, TZ);
  const week = weekKey(now, TZ);
  const sch = business.schedule;
  const at = (s) => local.weekday === s.weekday && local.hour >= s.hour;

  if (at(sch.contentGeneration) || (local.weekday > sch.contentGeneration.weekday && !store.hasRun('weekly-content', week))) {
    await store.once('weekly-content', week, () => runWeeklyContent(store, now));
  }
  if (at(sch.weeklyReport)) await store.once('weekly-report', week, () => sendWeeklyReport(store, now));

  await runDeadlineCampaigns(store, now);
  processNewsletters(store, now);
  await processPosts(store, now);
  await processEmailQueue(store, now);
}

export { markdownToHtml };
