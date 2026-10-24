// Lead qualification. Turns the quiz into a 0-100 score, a tier
// (hot / warm / nurture), a primary segment, the TraderTaxHQ pricing plan that
// fits, and any upsells.
//
// Plan fit follows www.tradertaxhq.com/pricing:
//   Starter      - unlimited prop firms, up to 2 brokers / 500 broker trades
//   Essential    - up to 3 brokers / 750 trades
//   Professional - up to 5 brokers, unlimited trades, TTS analysis + MTM guidance
//   Enterprise   - trading entities
// Trader Tax Status signals mirror what courts have weighed. There is no
// bright-line test, so this is a sales-prioritization signal, never a determination.

export const SEGMENT_PRIORITY = ['prop', 'futures', 'forex', 'options', 'crypto'];

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const yes = (v) => v === true || v === 'yes';

export function scoreLead(answers = {}) {
  const instruments = [].concat(answers.instruments || []).filter((i) => SEGMENT_PRIORITY.includes(i));
  const isProp = instruments.includes('prop');
  const propFirms = num(answers.propFirms);
  const propPayouts = num(answers.propPayouts);
  const foreignFirm = yes(answers.foreignFirm);
  const madeEstimates = yes(answers.madeEstimates);
  const brokerAccounts = num(answers.brokerAccounts);
  const tradesPerYear = num(answers.tradesPerYear);
  const daysTradedPct = num(answers.daysTradedPct);
  const avgHoldDays = answers.avgHoldDays === undefined || answers.avgHoldDays === '' ? null : num(answers.avgHoldDays);
  const netResult = num(answers.netResult); // last year's net personal trading P&L, negative = loss
  const hasPreparer = yes(answers.hasPreparer);
  const hasEntity = yes(answers.hasEntity);
  const irsNotice = yes(answers.irsNotice);

  let score = 0;
  const reasons = [];
  const add = (pts, why) => { score += pts; reasons.push(`+${pts} ${why}`); };

  // Prop firm signals (core market)
  if (isProp) add(20, 'prop firm / funded account trader');
  if (propPayouts >= 50000) add(20, 'prop payouts $50k+');
  else if (propPayouts >= 10000) add(12, 'prop payouts $10k+');
  else if (propPayouts > 0) add(5, 'receiving prop payouts');
  if (propFirms >= 2) add(8, 'multiple prop firms to aggregate');
  if (foreignFirm) add(6, 'foreign firm with no US tax form');
  if (isProp && propPayouts > 0 && !madeEstimates) add(10, 'no estimated payments on untaxed payouts');

  // Personal-account activity (TTS-style signals)
  if (tradesPerYear >= 720) add(12, 'very high trade volume (720+/yr)');
  else if (tradesPerYear >= 250) add(6, 'high trade volume (250+/yr)');
  if (daysTradedPct >= 75) add(8, 'trades on 75%+ of market days');
  if (brokerAccounts >= 3) add(6, `${brokerAccounts} broker accounts`);
  if (netResult <= -10000) add(10, 'large trading loss - loss-limit / MTM planning value');
  if (netResult >= 100000 && !hasEntity) add(8, 'large trading profit with no entity');

  // Situation
  if (hasEntity) add(8, 'trades through an entity');
  if (irsNotice) add(15, 'has an IRS notice - urgent');
  if (!hasPreparer) add(6, 'no trader-focused tax preparer today');

  score = Math.min(100, score);
  const tier = score >= 60 ? 'hot' : score >= 35 ? 'warm' : 'nurture';
  const ttsLikely = tradesPerYear >= 720 && daysTradedPct >= 75 && (avgHoldDays === null || avgHoldDays <= 31);

  const segment = answers.primaryInstrument && SEGMENT_PRIORITY.includes(answers.primaryInstrument)
    ? answers.primaryInstrument
    : SEGMENT_PRIORITY.find((s) => instruments.includes(s)) || 'prop';

  let recommendedService = 'starter';
  if (hasEntity) recommendedService = 'enterprise';
  else if (brokerAccounts > 3 || tradesPerYear > 750 || ttsLikely) recommendedService = 'professional';
  else if (brokerAccounts === 3 || tradesPerYear > 500) recommendedService = 'essential';

  const upsells = [];
  if (hasEntity || propPayouts >= 50000) upsells.push('bookkeeping');
  if (irsNotice) upsells.push('irs-notice');

  return { score, tier, segment, ttsLikely, recommendedService, upsells, reasons };
}
