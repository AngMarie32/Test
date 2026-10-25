process.env.EMAIL_PROVIDER = 'noop';
delete process.env.DATABASE_URL;

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { Store } = await import('../src/db.js');
const engine = await import('../src/engine.js');

// Stand-in for Postgres: keeps the saved JSON string, like the real adapter does.
const fakeAdapter = () => ({ saved: null, writes: 0,
  async load() { return this.saved ? JSON.parse(this.saved) : null; },
  async save(json) { await new Promise((r) => setTimeout(r, 5)); this.saved = json; this.writes++; } });

test('postgres-style adapter: state survives a restart and writes are coalesced', async () => {
  const adapter = fakeAdapter();
  const a = await Store.open({ adapter });
  engine.captureLead(a, { email: 'keep@me.co', firstName: 'Kay', consent: true, answers: { instruments: ['prop'] } });
  await a.flush();
  assert.ok(adapter.writes >= 1 && adapter.writes <= 3, `expected few writes, got ${adapter.writes}`);

  // "Restart": a brand-new Store loads everything back.
  const b = await Store.open({ adapter });
  assert.equal(b.all('leads').length, 1);
  assert.equal(b.all('leads')[0].email, 'keep@me.co');
  assert.ok(b.all('emails').length >= 5);
});

test('adapter errors do not crash the app and the next write retries with full state', async () => {
  const adapter = fakeAdapter();
  let fail = true;
  const real = adapter.save.bind(adapter);
  adapter.save = async (j) => { if (fail) throw new Error('db down'); return real(j); };
  const s = await Store.open({ adapter });
  const quiet = console.error; console.error = () => {};
  s.insert('leads', { email: 'a@b.co' });
  await s.flush();
  fail = false;
  s.insert('leads', { email: 'c@d.co' });
  await s.flush();
  console.error = quiet;
  assert.equal(JSON.parse(adapter.saved).leads.length, 2);
});
