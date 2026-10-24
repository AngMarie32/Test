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
const STOP_STATUSES = new Set(['booked', 'client', 'unsubscribed']);
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
    store.update('leads', existing.id, { answers, ...result, lastSeenAt: now.toISOString() });
    store.log('lead.resubmitted', { leadId: existing.id });
    return { lead: existing, isNew: false };
  }

  const lead = store.insert('leads', {
    email,
    firstName: String(input.firstName || '').trim().slice(0, 60),
    phone: String(input.phone || '').trim().slice(0, 30),
    status: 'new',
    source: input.source || 'website-quiz',
    utm: input.utm || {},
    answers,
    ...result,
    consentAt: now.toISOString(),
  });
  store.log('lead.captured', { leadId: lead.id, tier: lead.tier, segment: lead.segment, score: lead.score });

  for (const step of buildSequence(lead)) {
    const sendAt = new Date(now.getTime() + step.delayDays * DAY + (step.delayHours || 0) * HOUR);
    store.insert('emails', {
      kind: 'nurture', leadId: lead.id, to: email, key: step.key,
      subject: step.subject, body: step.body, sendAt: sendAt.toISOString(), status: 'queued',
    });
  }

  if (lead.tier === 'hot') notifyOwner(store, `🔥 Hot lead: ${lead.firstName || email} (score ${lead.score})`, hotLeadSummary(lead), now);
  return { lead, isNew: true };
}

function hotLeadSummary(lead) {
  const svc = business.offers.services.find((s) => s.id === lead.recommendedService);
  return [
    `**${lead.firstName || '(no name)'}** - ${lead.email}${lead.phone ? ` - ${lead.phone}` : ''}`,
    `Segment: ${business.segments[lead.segment]?.label} | Score: ${lead.score} | TTS likely: ${lead.ttsLikely ? 'yes' : 'no'}`,
    `Recommended offer: ${svc?.name} (${svc?.price})`,
    `Why:\n${lead.reasons.map((r) => `- ${r}`).join('\n')}`,
    'They have been sent your booking link. Consider a personal follow-up within the hour.',
  ].join('\n\n');
}

export function setLeadStatus(store, leadId, status) {
  const lead = store.update('leads', leadId, { status });
  if (!lead) return null;
  if (STOP_STATUSES.has(status)) {
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
    if (email.leadId && (!lead || STOP_STATUSES.has(lead.status))) {
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
  if (!topic) throw new Error(`Unknown topic: ${topicId}`);

  const pack = await generatePack(topic, { extraContext });
  const approval = business.compliance.requireApproval;
  const week = weekKey(now, TZ);
  const nl = business.schedule.newsletter;
  const newsletterAt = slotInWeek(now, nl.weekday, nl.hour, TZ);

  const record = store.insert('contentPacks', {
    week, topicId: topic.id, topicTitle: topic.title, source: pack.source, model: pack.model, error: pack.error,
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
      link: `${business.brand.website}/blog/${pack.blog.slug}`,
      scheduledFor: at.toISOString(),
      status: approval || !post.compliance.ok ? 'pending_approval' : 'scheduled',
    });
  }
  store.log('content.generated', { packId: record.id, topicId: topic.id, source: pack.source });
  notifyOwner(store, `New content pack ready: ${topic.title}`,
    `This week's pack was generated (${pack.source}).\n\n${approval ? 'Review and approve it in the dashboard: ' : 'Dashboard: '}${business.brand.website}/admin`, now);
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
  let queued = 0;
  for (const pack of store.filter('contentPacks', (p) => p.newsletter.status === 'scheduled' && new Date(p.newsletter.scheduledFor) <= now)) {
    for (const lead of subscribers(store)) {
      store.insert('emails', {
        kind: 'newsletter', leadId: lead.id, to: lead.email, key: `newsletter-${pack.id}`,
        subject: pack.newsletter.subject, preheader: pack.newsletter.preheader, body: pack.newsletter.body,
        sendAt: now.toISOString(), status: 'queued',
      });
      queued++;
    }
    store.update('contentPacks', pack.id, { newsletter: { ...pack.newsletter, status: 'sent', sentAt: now.toISOString(), recipients: queued } });
  }
  return queued;
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
          subject: dl.daysAway <= 3 ? `${dl.name} is ${when}` : `${dl.daysAway} days until ${dl.name}`,
          preheader: dl.action,
          body: `Hi {{first_name}},\n\n**${dl.name}: ${when}.**\n\n${dl.action}\n\nIf you want us to run your numbers before the deadline, grab a slot: {{booking_url}}\n\n${business.compliance.disclaimer}`,
          sendAt: now.toISOString(), status: 'queued',
        });
        queued++;
      }
    });
  }
  return queued;
}

// ---------------------------------------------------------------- reporting

export function weeklyStats(store, now = new Date(), days = 7) {
  const since = now.getTime() - days * DAY;
  const inWindow = (r, field = 'createdAt') => r[field] && new Date(r[field]).getTime() >= since;
  const leads = store.filter('leads', (l) => inWindow(l));
  const emailsSent = store.filter('emails', (e) => e.status === 'sent' && inWindow(e, 'sentAt'));
  const bySegment = {};
  for (const l of leads) bySegment[l.segment] = (bySegment[l.segment] || 0) + 1;
  const bySource = {};
  for (const l of leads) {
    const src = l.utm?.source || l.source || 'direct';
    bySource[src] = (bySource[src] || 0) + 1;
  }
  const all = store.all('leads');
  return {
    windowDays: days,
    newLeads: leads.length,
    hotLeads: leads.filter((l) => l.tier === 'hot').length,
    warmLeads: leads.filter((l) => l.tier === 'warm').length,
    bySegment, bySource,
    emailsSent: emailsSent.length,
    postsPublished: store.filter('posts', (p) => p.status === 'published' && inWindow(p, 'publishedAt')).length,
    pendingApproval: store.filter('posts', (p) => p.status === 'pending_approval').length
      + store.filter('contentPacks', (p) => p.newsletter.status === 'pending_approval').length
      + store.filter('contentPacks', (p) => p.blog.status === 'pending_approval').length,
    totals: {
      leads: all.length,
      subscribed: all.filter((l) => l.status !== 'unsubscribed').length,
      booked: all.filter((l) => l.status === 'booked').length,
      clients: all.filter((l) => l.status === 'client').length,
      bookingRate: all.length ? +(100 * all.filter((l) => ['booked', 'client'].includes(l.status)).length / all.length).toFixed(1) : 0,
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
    `**Leads by source**\n\n${lines(s.bySource)}`,
    `**All time**\n\n- Leads: ${s.totals.leads} (subscribed ${s.totals.subscribed})\n- Booked calls: ${s.totals.booked}\n- Clients: ${s.totals.clients}\n- Lead → booked rate: ${s.totals.bookingRate}%`,
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
