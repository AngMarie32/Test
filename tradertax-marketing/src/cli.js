// Command-line control for cron jobs, testing and one-off runs.
//   node src/cli.js tick                     run every due job once (use from cron / GitHub Actions)
//   node src/cli.js generate [topicId]       build a content pack now
//   node src/cli.js report                   queue the weekly KPI report to the owner
//   node src/cli.js stats [days]             print KPIs
//   node src/cli.js topics                   list topic ids
//   node src/cli.js deadlines [days]         show upcoming tax deadlines
//   node src/cli.js approve-all              approve everything waiting (use with care)
import './env.js';
import business from '../config/business.js';
import { topics } from '../config/tax-calendar.js';
import { Store } from './db.js';
import { tick, runWeeklyContent, sendWeeklyReport, weeklyStats, approveContent, processEmailQueue } from './engine.js';
import { upcomingDeadlines } from './content/topics.js';

const [cmd, arg] = process.argv.slice(2);
const store = await Store.open();
const now = new Date();

switch (cmd) {
  case 'tick':
    await tick(store, now);
    console.log('tick complete');
    break;
  case 'generate': {
    const pack = await runWeeklyContent(store, now, { topicId: arg });
    console.log(`Created pack ${pack.id}: "${pack.topicTitle}" via ${pack.source}${pack.error ? ` (Claude error: ${pack.error})` : ''}`);
    break;
  }
  case 'report':
    console.log(sendWeeklyReport(store, now));
    await processEmailQueue(store, now);
    break;
  case 'stats':
    console.log(JSON.stringify(weeklyStats(store, now, Number(arg) || 7), null, 2));
    break;
  case 'topics':
    for (const t of topics) console.log(`${t.id.padEnd(20)} ${t.title}`);
    break;
  case 'deadlines':
    for (const d of upcomingDeadlines(now, Number(arg) || 120, business.brand.timezone)) {
      console.log(`${d.date.toISOString().slice(0, 10)}  (${String(d.daysAway).padStart(3)}d)  ${d.name}`);
    }
    break;
  case 'approve-all': {
    let n = 0;
    for (const p of store.filter('posts', (x) => x.status === 'pending_approval')) n += approveContent(store, 'post', p.id) ? 1 : 0;
    for (const p of store.all('contentPacks')) {
      n += approveContent(store, 'blog', p.id) ? 1 : 0;
      n += approveContent(store, 'newsletter', p.id) ? 1 : 0;
    }
    console.log(`Approved ${n} item(s)`);
    break;
  }
  default:
    console.log('Usage: node src/cli.js <tick|generate [topicId]|report|stats [days]|topics|deadlines [days]|approve-all>');
    process.exitCode = 1;
}
await store.flush();
process.exit(process.exitCode ?? 0);
