process.env.EMAIL_PROVIDER = 'noop';
process.env.REQUIRE_APPROVAL = 'true';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SOCIAL_WEBHOOK_URL;

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { Store } = await import('../src/db.js');
const engine = await import('../src/engine.js');
const { scoreLead } = await import('../src/scoring.js');
const { checkCompliance } = await import('../src/compliance.js');
const { pickTopic, upcomingDeadlines, deadlineDate } = await import('../src/content/topics.js');
const { zonedParts, slotInWeek } = await import('../src/time.js');
const { verifyUnsubscribe, unsubscribeToken } = await import('../src/email/sender.js');
const { deadlines } = await import('../config/tax-calendar.js');

const TZ = 'America/New_York';
const hotAnswers = { instruments: ['equities', 'options'], tradesPerYear: 2000, daysTradedPct: 95, avgHoldDays: 0, hoursPerWeek: 45, accountSize: 250000, netResult: -50000, hasCpa: 'no' };

test('scoring: very active losing day trader is hot, TTS-likely, routed to MTM', () => {
  const r = scoreLead(hotAnswers);
  assert.equal(r.tier, 'hot');
  assert.equal(r.ttsLikely, true);
  assert.equal(r.segment, 'options');
  assert.equal(r.recommendedService, 'mtm-election');
});

test('scoring: casual investor lands in nurture; prop trader routed to quarterly planning', () => {
  assert.equal(scoreLead({ instruments: ['equities'], tradesPerYear: 50, daysTradedPct: 20, avgHoldDays: 90, hasCpa: 'yes' }).tier, 'nurture');
  const prop = scoreLead({ instruments: ['prop', 'futures'], tradesPerYear: 700, hasCpa: 'no' });
  assert.equal(prop.segment, 'prop');
  assert.equal(prop.recommendedService, 'quarterly-planning');
});

test('compliance: flags promises, passes qualified examples', () => {
  assert.equal(checkCompliance('We guarantee you will pay less.').ok, false);
  assert.equal(checkCompliance('This election will save you $12,000.').ok, false);
  assert.equal(checkCompliance('For example, this could save $12,000 depending on your bracket.').ok, true);
  assert.equal(checkCompliance('Plain educational text.', { requireDisclaimer: true }).ok, false);
});

test('lead capture queues the sequence, notifies owner on hot leads, dedupes, and stops on booking', async () => {
  const store = new Store(':memory:');
  const now = new Date('2026-10-26T14:00:00Z');
  assert.throws(() => engine.captureLead(store, { email: 'bad', consent: true }), /valid email/);
  assert.throws(() => engine.captureLead(store, { email: 'a@b.co' }), /Consent/);

  const { lead, isNew } = engine.captureLead(store, { email: 'Trader@Example.com', firstName: 'Sam', consent: true, answers: hotAnswers }, now);
  assert.equal(isNew, true);
  assert.equal(lead.email, 'trader@example.com');
  const nurture = store.filter('emails', (e) => e.leadId === lead.id);
  assert.ok(nurture.some((e) => e.key === 'hot-personal'));
  assert.ok(nurture.some((e) => e.key === 'segment-options'));
  assert.equal(store.filter('emails', (e) => e.kind === 'owner').length, 1);

  const again = engine.captureLead(store, { email: 'trader@example.com', consent: true, answers: hotAnswers }, now);
  assert.equal(again.isNew, false);
  assert.equal(store.filter('emails', (e) => e.leadId === lead.id).length, nurture.length);

  // Only day-0 emails are due now.
  const sent = await engine.processEmailQueue(store, now);
  assert.equal(sent, 2); // welcome + owner notification (hot-personal is +1h)
  engine.setLeadStatus(store, lead.id, 'booked');
  assert.equal(store.filter('emails', (e) => e.leadId === lead.id && e.status === 'queued').length, 0);
});

test('weekly content: template pack becomes approval-gated posts, blog and newsletter', async () => {
  const store = new Store(':memory:');
  const monday = new Date('2026-10-26T10:30:00Z'); // 06:30 New York
  engine.captureLead(store, { email: 'x@y.co', consent: true, answers: { instruments: ['futures'] } }, monday);
  await engine.tick(store, monday);

  const packs = store.all('contentPacks');
  assert.equal(packs.length, 1);
  assert.equal(packs[0].source, 'template');
  assert.equal(packs[0].blog.status, 'pending_approval');
  assert.ok(packs[0].blog.markdown.includes('not tax, legal or investment advice'));
  const posts = store.all('posts');
  assert.equal(posts.length, 7);
  assert.ok(posts.every((p) => p.status === 'pending_approval'));

  // Second tick the same week must not regenerate.
  await engine.tick(store, new Date(monday.getTime() + 3600000));
  assert.equal(store.all('contentPacks').length, 1);

  // Approve everything, jump to Friday evening: posts publish, newsletter goes out.
  for (const p of posts) engine.approveContent(store, 'post', p.id);
  engine.approveContent(store, 'blog', packs[0].id);
  engine.approveContent(store, 'newsletter', packs[0].id);
  await engine.tick(store, new Date('2026-10-30T23:00:00Z'));
  assert.equal(store.filter('posts', (p) => p.status === 'published').length, 7);
  assert.equal(store.get('contentPacks', packs[0].id).newsletter.status, 'sent');
  assert.ok(store.filter('emails', (e) => e.kind === 'newsletter' && e.status === 'sent').length >= 1);
});

test('topic picker prefers in-season topics and respects cooldown', () => {
  const dec = new Date('2026-12-07T15:00:00Z');
  const t1 = pickTopic(dec, [], TZ);
  assert.equal(t1.id, 'wash-sale-yearend');
  const t2 = pickTopic(dec, [{ topicId: 'wash-sale-yearend', usedAt: dec.toISOString() }], TZ);
  assert.notEqual(t2.id, 'wash-sale-yearend');
});

test('deadlines roll off weekends and reminders fire once per window', async () => {
  // Jan 15 2028 is a Saturday -> Monday Jan 17.
  const q4 = deadlines.find((d) => d.id === 'q4-estimate');
  assert.equal(zonedParts(deadlineDate(q4, 2028, TZ), TZ).day, 17);
  // Dec 31 2028 is a Sunday -> Friday Dec 29.
  const ye = deadlines.find((d) => d.id === 'year-end');
  assert.equal(zonedParts(deadlineDate(ye, 2028, TZ), TZ).day, 29);

  const store = new Store(':memory:');
  engine.captureLead(store, { email: 'p@q.co', consent: true, answers: { instruments: ['equities'] } }, new Date('2026-12-01T12:00:00Z'));
  const twoDaysOut = new Date('2026-12-29T15:00:00Z');
  assert.ok(upcomingDeadlines(twoDaysOut, 14, TZ).some((d) => d.id === 'year-end'));
  const n1 = await engine.runDeadlineCampaigns(store, twoDaysOut);
  const n2 = await engine.runDeadlineCampaigns(store, new Date(twoDaysOut.getTime() + 3600000));
  assert.equal(n1, 1);
  assert.equal(n2, 0);
});

test('time helpers place slots in the local week', () => {
  const wed = new Date('2026-10-28T16:00:00Z');
  const thu7 = slotInWeek(wed, 4, 7, TZ);
  const p = zonedParts(thu7, TZ);
  assert.deepEqual([p.weekday, p.hour, p.day], [4, 7, 29]);
});

test('unsubscribe tokens verify only for their lead', () => {
  const t = unsubscribeToken('lead-1');
  assert.equal(verifyUnsubscribe('lead-1', t), true);
  assert.equal(verifyUnsubscribe('lead-2', t), false);
  assert.equal(verifyUnsubscribe('lead-1', 'short'), false);
});
