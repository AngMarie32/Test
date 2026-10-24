process.env.EMAIL_PROVIDER = 'noop';
process.env.ADMIN_TOKEN = 'test-admin-token';
delete process.env.ANTHROPIC_API_KEY;

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { Store } = await import('../src/db.js');
const { createServer } = await import('../src/server.js');
const { unsubscribeToken } = await import('../src/email/sender.js');

test('HTTP funnel and admin API', async () => {
  const store = new Store(':memory:');
  const server = createServer(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = { Authorization: 'Bearer test-admin-token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/playbook`)).status, 200);

    const res = await fetch(`${base}/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'day@trader.io', firstName: 'Dee', consent: true, answers: { instruments: ['futures'], tradesPerYear: 2000, daysTradedPct: 95, avgHoldDays: 0, accountSize: 250000 } }) });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).tier, 'hot');

    assert.equal((await fetch(`${base}/api/admin/leads`)).status, 401);
    const leads = await (await fetch(`${base}/api/admin/leads`, { headers: admin })).json();
    assert.equal(leads.length, 1);

    const gen = await fetch(`${base}/api/admin/generate`, { method: 'POST', headers: admin, body: JSON.stringify({ topicId: 'futures-6040' }) });
    assert.equal(gen.status, 201);
    const { packId } = await gen.json();
    await fetch(`${base}/api/admin/approve`, { method: 'POST', headers: admin, body: JSON.stringify({ kind: 'blog', id: packId }) });
    const slug = store.get('contentPacks', packId).blog.slug;
    const article = await fetch(`${base}/blog/${slug}`);
    assert.equal(article.status, 200);
    assert.match(await article.text(), /application\/ld\+json/);
    assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), new RegExp(slug));

    const hook = await fetch(`${base}/api/webhooks/booking?secret=nope`, { method: 'POST', body: '{}' });
    assert.equal(hook.status, 401);

    const id = leads[0].id;
    assert.equal((await fetch(`${base}/unsubscribe?id=${id}&t=bad`)).status, 400);
    assert.equal((await fetch(`${base}/unsubscribe?id=${id}&t=${unsubscribeToken(id)}`)).status, 200);
    assert.equal(store.get('leads', id).status, 'unsubscribed');
  } finally {
    server.close();
  }
});
