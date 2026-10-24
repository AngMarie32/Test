// Tiny JSON-file datastore. Writes are atomic (temp file + rename) so a crash
// mid-save never corrupts data. Plenty for a single-practice marketing system;
// swap for Postgres if you outgrow tens of thousands of leads.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './env.js';

const COLLECTIONS = ['leads', 'emails', 'posts', 'contentPacks', 'events', 'jobs'];

export class Store {
  constructor(file = process.env.DB_FILE || path.join(ROOT, 'data', 'db.json')) {
    this.file = file;
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
    if (file !== ':memory:' && fs.existsSync(file)) {
      Object.assign(this.data, JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  }

  save() {
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
