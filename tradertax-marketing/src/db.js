// Tiny datastore for a single-practice marketing system. Two backends:
//   - JSON file (default): atomic writes (temp file + rename).
//   - Postgres (set DATABASE_URL, e.g. a free Neon database): the whole state is
//     kept as one JSON document, so it survives hosts with no persistent disk
//     (Render free, Fly, etc.). Use `await Store.open()` to pick the backend.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './env.js';

const COLLECTIONS = ['leads', 'emails', 'posts', 'contentPacks', 'events', 'jobs'];

export class PgAdapter {
  constructor(connectionString) { this.connectionString = connectionString; }

  async pool() {
    if (!this._pool) {
      const { default: pg } = await import('pg');
      this._pool = new pg.Pool({ connectionString: this.connectionString, max: 2 });
      await this._pool.query(`CREATE TABLE IF NOT EXISTS app_state (
        id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    }
    return this._pool;
  }

  async load() {
    const { rows } = await (await this.pool()).query("SELECT data FROM app_state WHERE id = 'main'");
    return rows[0]?.data || null;
  }

  async save(json) {
    await (await this.pool()).query(
      `INSERT INTO app_state (id, data) VALUES ('main', $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [json]);
  }
}

export class Store {
  constructor(file = process.env.DB_FILE || path.join(ROOT, 'data', 'db.json'), adapter = null) {
    this.file = adapter ? ':memory:' : file;
    this.adapter = adapter;
    this.dirty = false;
    this.flushing = null;
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
    if (this.file !== ':memory:' && fs.existsSync(this.file)) {
      Object.assign(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    }
  }

  // Async factory: uses Postgres when DATABASE_URL is set (or an adapter is passed), else the JSON file.
  static async open({ adapter } = {}) {
    const a = adapter || (process.env.DATABASE_URL ? new PgAdapter(process.env.DATABASE_URL) : null);
    if (!a) return new Store();
    const store = new Store(':memory:', a);
    const saved = await a.load();
    if (saved) Object.assign(store.data, saved);
    return store;
  }

  // Resolves once every pending write has reached the database.
  async flush() {
    while (this.flushing) await this.flushing;
  }

  async _drain() {
    try {
      while (this.dirty) {
        this.dirty = false;
        await this.adapter.save(JSON.stringify(this.data));
      }
    } catch (err) {
      console.error('[db] save failed, will retry on next write:', err.message);
    } finally {
      this.flushing = null;
    }
  }

  save() {
    if (this.adapter) {
      this.dirty = true;
      this.flushing ??= this._drain();
      return;
    }
    if (this.file === ':memory:') return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  all(collection) { return this.data[collection]; }
  find(collection, pred) { return this.data[collection].find(pred); }
  filter(collection, pred) { return this.data[collection].filter(pred); }
  get(collection, id) { return this.find(collection, (r) => r.id === id); }

  insert(collection, record) {
    const row = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...record };
    this.data[collection].push(row);
    this.save();
    return row;
  }

  update(collection, id, patch) {
    const row = this.get(collection, id);
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return row;
  }

  log(type, payload = {}) {
    return this.insert('events', { type, ...payload });
  }

  hasRun(job, key) {
    return Boolean(this.find('jobs', (j) => j.job === job && j.key === key));
  }

  // Run a named job at most once per key (e.g. week or deadline+offset). The
  // key is recorded only after fn succeeds, so a failed run retries next tick.
  async once(job, key, fn) {
    if (this.hasRun(job, key)) return false;
    await fn();
    this.insert('jobs', { job, key });
    return true;
  }
}
