process.env.EMAIL_PROVIDER = 'noop';
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.WEBHOOK_SECRET = 'hook-secret';
process.env.CRON_SECRET = 'cron-secret';
delete process.env.ANTHROPIC_API_KEY;

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { Store } = await import('../src/db.js');
const { createServer } = await import('../src/server.js');
const { unsubscribeToken } = await import('../src/email/sender.js');

test('HTTP funnel, main-site subscribe, webhooks and admin API', async () => {
  const store = new Store(':memory:');
  const server = createServer(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = { Authorization: 'Bearer test-admin-token', 'Content-Type': 'application/json' };
  const json = { 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/checklist`)).status, 200);
    assert.equal((await fetch(`${base}/playbook`, { redirect: 'manual' })).status, 301);
    assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Disallow: \//);

    // Quiz lead
    const res = await fetch(`${base}/api/leads`, { method: 'POST', headers: json,
      body: JSON.stringify({ email: 'dee@trader.io', firstName: 'Dee', consent: true,
        answers: { instruments: ['prop'], propFirms: 4, propPayouts: 150000, madeEstimates: 'no' } }) });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.tier, 'hot');
    assert.equal(body.intakeUrl, 'https://www.tradertaxhq.com/get-started');

    // Main-site checklist form (CORS preflight + subscribe)
    const pre = await fetch(`${base}/api/subscribe`, { method: 'OPTIONS', headers: { Origin: 'https://www.tradertaxhq.com' } });
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://www.tradertaxhq.com');
    const sub = await fetch(`${base}/api/subscribe`, { method: 'POST', headers: { ...json, Origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'list@trader.io', consent: true }) });
    assert.equal(sub.status, 201);
    assert.equal(sub.headers.get('access-control-allow-origin'), null);
    assert.equal(store.find('leads', (l) => l.email === 'list@trader.io').source, 'main-site-checklist');

    // Admin auth + lead list + CSV
    assert.equal((await fetch(`${base}/api/admin/leads`)).status, 401);
    const leads = await (await fetch(`${base}/api/admin/leads`, { headers: admin })).json();
    assert.equal(leads.length, 2);
    assert.match(await (await fetch(`${base}/api/admin/leads.csv`, { headers: admin })).text(), /dee@trader\.io/);

    // Content + article export
    const gen = await fetch(`${base}/api/admin/generate`, { method: 'POST', headers: admin, body: JSON.stringify({ topicId: 'prop-payouts' }) });
    assert.equal(gen.status, 201);
    const { packId } = await gen.json();
    const md = await (await fetch(`${base}/api/admin/packs/${packId}/article.md`, { headers: admin })).text();
    assert.match(md, /^---\ntitle: "How Prop Firm Payouts Are Taxed/);
    assert.equal((await fetch(`${base}/api/admin/generate`, { method: 'POST', headers: admin, body: JSON.stringify({ topicId: 'nope' }) })).status, 400);

    // Intake webhook stops nurture
    assert.equal((await fetch(`${base}/api/webhooks/intake?secret=nope`, { method: 'POST', body: '{}' })).status, 401);
    const hook = await fetch(`${base}/api/webhooks/intake?secret=hook-secret`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'DEE@trader.io' }) });
    assert.equal(hook.status, 200);
    const dee = store.find('leads', (l) => l.email === 'dee@trader.io');
    assert.equal(dee.status, 'intake_started');

    // External cron: wrong secret rejected, right secret runs due jobs (welcome email already queued for list@trader.io)
    assert.equal((await fetch(`${base}/api/cron/tick?secret=nope`)).status, 401);
    const tickRes = await fetch(`${base}/api/cron/tick?secret=cron-secret`);
    assert.equal(tickRes.status, 200);
    assert.equal((await tickRes.json()).ran, true);
    assert.ok(store.filter('emails', (e) => e.status === 'sent').length >= 1);

    // Unsubscribe
    assert.equal((await fetch(`${base}/unsubscribe?id=${dee.id}&t=bad`)).status, 400);
    assert.equal((await fetch(`${base}/unsubscribe?id=${dee.id}&t=${unsubscribeToken(dee.id)}`)).status, 200);
    assert.equal(store.get('leads', dee.id).status, 'unsubscribed');
  } finally {
    server.close();
  }
});
