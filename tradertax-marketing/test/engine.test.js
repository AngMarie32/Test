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
const { templatePack, finalizePack } = await import('../src/content/generator.js');
const { zonedParts, slotInWeek } = await import('../src/time.js');
const { verifyUnsubscribe, unsubscribeToken, renderEmail } = await import('../src/email/sender.js');
const { buildSequence } = await import('../src/email/sequences.js');
const { deadlines, topics } = await import('../config/tax-calendar.js');

const TZ = 'America/New_York';
const propHot = { instruments: ['prop', 'futures'], propFirms: 2, propPayouts: 75000, foreignFirm: 'yes', madeEstimates: 'no', brokerAccounts: 1, hasPreparer: 'no' };

test('scoring: big multi-firm prop trader with no estimates is hot, routed to Starter + bookkeeping', () => {
  const r = scoreLead(propHot);
  assert.equal(r.tier, 'hot');
  assert.equal(r.segment, 'prop');
  assert.equal(r.recommendedService, 'starter');
  assert.deepEqual(r.upsells, ['bookkeeping']);
});

test('scoring: plan fit follows the pricing page', () => {
  assert.equal(scoreLead({ instruments: ['prop'], brokerAccounts: 3 }).recommendedService, 'essential');
  assert.equal(scoreLead({ instruments: ['options'], brokerAccounts: 2, tradesPerYear: 2000, daysTradedPct: 95, avgHoldDays: 0 }).recommendedService, 'professional');
  assert.equal(scoreLead({ instruments: ['futures'], hasEntity: 'yes' }).recommendedService, 'enterprise');
  assert.equal(scoreLead({ instruments: ['options'], hasPreparer: 'yes' }).tier, 'nurture');
  assert.ok(scoreLead({ instruments: ['crypto'], irsNotice: 'yes' }).upsells.includes('irs-notice'));
});

test('compliance: flags promises and CPA/EA claims, passes qualified examples', () => {
  assert.equal(checkCompliance('We guarantee you will pay less.').ok, false);
  assert.equal(checkCompliance('Our CPA team will handle it.').ok, false);
  assert.equal(checkCompliance('We represent you before the IRS.').ok, false);
  assert.equal(checkCompliance('This election will save you $12,000.').ok, false);
  assert.equal(checkCompliance('For example, this could save $12,000 depending on your bracket.').ok, true);
  assert.equal(checkCompliance('Plain educational text.', { requireDisclaimer: true }).ok, false);
});

test('all built-in copy passes the compliance scan', () => {
  for (const segment of ['prop', 'futures', 'forex', 'options', 'crypto']) {
    for (const step of buildSequence({ segment, tier: 'hot', recommendedService: 'professional', upsells: ['irs-notice'] })) {
      const c = checkCompliance(`${step.subject}\n${step.body}`);
      assert.ok(c.ok, `${segment}/${step.key}: ${c.issues}`);
    }
  }
  for (const t of topics) {
    const p = finalizePack(templatePack(t, t.segments), t);
    for (const x of [p.blog, p.newsletter, ...p.social]) assert.ok(x.compliance.ok, `${t.id}: ${x.compliance.issues}`);
  }
});

test('content links point at the main site guide with UTM tags', () => {
  const topic = topics.find((t) => t.id === 'eval-fees');
  const p = finalizePack(templatePack(topic, topic.segments), topic);
  assert.equal(p.guideUrl, 'https://www.tradertaxhq.com/resources/prop-firm-evaluation-fees-tax-deductible');
  assert.match(p.social.find((s) => s.channel === 'x').text, /tradertaxhq\.com\/resources\/prop-firm-evaluation-fees-tax-deductible\?utm_source=tthq-marketing&utm_medium=social-x/);
  assert.match(p.blog.markdown, /get-started\?utm_source=tthq-marketing&utm_medium=blog/);
});

test('emails render the intake link, disclaimer and unsubscribe', () => {
  const lead = { id: 'L1', firstName: 'Jo' };
  const r = renderEmail({ subject: 'Hi {{first_name}}', body: 'Start: {{intake_url}}', kind: 'nurture' }, lead);
  assert.equal(r.subject, 'Hi Jo');
  assert.match(r.text, /get-started\?utm_source=tthq-marketing&utm_medium=email&utm_campaign=nurture/);
  assert.match(r.html, /not a CPA or EA/);
  assert.match(r.html, /Unsubscribe/);
});

test('lead capture queues the sequence, notifies owner on hot leads, dedupes, and stops on intake', async () => {
  const store = new Store(':memory:');
  const now = new Date('2026-10-26T14:00:00Z');
  assert.throws(() => engine.captureLead(store, { email: 'bad', consent: true }), /valid email/);
  assert.throws(() => engine.captureLead(store, { email: 'a@b.co' }), /Consent/);

  const { lead, isNew } = engine.captureLead(store, { email: 'Funded@Example.com', firstName: 'Sam', consent: true, answers: propHot, ref: 'discord-es' }, now);
  assert.equal(isNew, true);
  assert.equal(lead.email, 'funded@example.com');
  assert.equal(lead.ref, 'discord-es');
  const nurture = store.filter('emails', (e) => e.leadId === lead.id);
  assert.ok(nurture.some((e) => e.key === 'hot-personal'));
  assert.ok(nurture.some((e) => e.key === 'segment-prop'));
  assert.equal(store.filter('emails', (e) => e.kind === 'owner').length, 1);

  const again = engine.captureLead(store, { email: 'funded@example.com', consent: true, answers: propHot }, now);
  assert.equal(again.isNew, false);
  assert.equal(store.filter('emails', (e) => e.leadId === lead.id).length, nurture.length);

  const sent = await engine.processEmailQueue(store, now);
  assert.equal(sent, 2); // welcome + owner notification (hot-personal is +1h)

  engine.setLeadStatus(store, lead.id, 'intake_started');
  assert.equal(store.filter('emails', (e) => e.leadId === lead.id && e.kind === 'nurture' && e.status === 'queued').length, 0);
  assert.equal(engine.weeklyStats(store, now).byAffiliate['discord-es'], 1);
});

test('weekly content: template pack becomes approval-gated posts, article and newsletter', async () => {
  const store = new Store(':memory:');
  const monday = new Date('2026-10-26T10:30:00Z'); // 06:30 New York
  engine.captureLead(store, { email: 'x@y.co', consent: true, answers: { instruments: ['prop'] } }, monday);
  await engine.tick(store, monday);

  const packs = store.all('contentPacks');
  assert.equal(packs.length, 1);
  assert.equal(packs[0].source, 'template');
  assert.equal(packs[0].blog.status, 'pending_approval');
  assert.ok(packs[0].blog.markdown.includes('not tax, legal or investment advice'));
  const posts = store.all('posts');
  assert.equal(posts.length, 7);
  assert.ok(posts.every((p) => p.status === 'pending_approval' && p.link.startsWith('https://www.tradertaxhq.com/resources/')));

  await engine.tick(store, new Date(monday.getTime() + 3600000));
  assert.equal(store.all('contentPacks').length, 1);

  for (const p of posts) engine.approveContent(store, 'post', p.id);
  engine.approveContent(store, 'blog', packs[0].id);
  engine.approveContent(store, 'newsletter', packs[0].id);
  await engine.tick(store, new Date('2026-11-01T23:00:00Z')); // Sunday evening: whole week's slots passed
  assert.equal(store.filter('posts', (p) => p.status === 'published').length, 7);
  assert.equal(store.get('contentPacks', packs[0].id).newsletter.status, 'sent');
  assert.ok(store.filter('emails', (e) => e.kind === 'newsletter' && e.status === 'sent').length >= 1);
});

test('topic picker prefers in-season prop topics and respects cooldown', () => {
  const dec = new Date('2026-12-07T15:00:00Z');
  const t1 = pickTopic(dec, [], TZ);
  assert.equal(t1.id, 'prop-yearend');
  const t2 = pickTopic(dec, [{ topicId: 'prop-yearend', usedAt: dec.toISOString() }], TZ);
  assert.notEqual(t2.id, 'prop-yearend');
});

test('deadlines roll off weekends and reminders fire once per window', async () => {
  const q4 = deadlines.find((d) => d.id === 'q4-estimate');
  assert.equal(zonedParts(deadlineDate(q4, 2028, TZ), TZ).day, 17); // Sat Jan 15 2028 -> Mon 17
  const ye = deadlines.find((d) => d.id === 'year-end');
  assert.equal(zonedParts(deadlineDate(ye, 2028, TZ), TZ).day, 29); // Sun Dec 31 2028 -> Fri 29

  const store = new Store(':memory:');
  engine.captureLead(store, { email: 'p@q.co', consent: true, answers: { instruments: ['prop'] } }, new Date('2026-12-01T12:00:00Z'));
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
