// Lead qualification. Turns the website quiz into a 0-100 score, a tier
// (hot / warm / nurture), a primary segment and the offer we lead with.
//
// The Trader Tax Status (TTS) signals mirror what courts have weighed:
// substantial volume, near-daily activity, short holding periods and a lot of
// time spent. There is no bright-line test, so this is a sales-prioritization
// signal, never a determination.

const SEGMENT_PRIORITY = ['prop', 'futures', 'options', 'crypto', 'equities'];

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function scoreLead(answers = {}) {
  const instruments = [].concat(answers.instruments || []).filter((i) => SEGMENT_PRIORITY.includes(i));
  const tradesPerYear = num(answers.tradesPerYear);
  const daysTradedPct = num(answers.daysTradedPct);
  const avgHoldDays = answers.avgHoldDays === undefined || answers.avgHoldDays === '' ? null : num(answers.avgHoldDays);
  const hoursPerWeek = num(answers.hoursPerWeek);
  const accountSize = num(answers.accountSize);
  const netResult = num(answers.netResult); // last year's net trading P&L, negative = loss
  const hasCpa = answers.hasCpa === true || answers.hasCpa === 'yes';
  const hasEntity = answers.hasEntity === true || answers.hasEntity === 'yes';

  let score = 0;
  const reasons = [];
  const add = (pts, why) => { score += pts; reasons.push(`+${pts} ${why}`); };

  // TTS-style activity signals
  if (tradesPerYear >= 720) add(25, 'very high trade volume (720+/yr)');
  else if (tradesPerYear >= 250) add(12, 'high trade volume (250+/yr)');
  if (daysTradedPct >= 75) add(15, 'trades on 75%+ of market days');
  else if (daysTradedPct >= 50) add(6, 'trades on 50%+ of market days');
  if (avgHoldDays !== null && avgHoldDays <= 31 && tradesPerYear > 0) add(10, 'short average holding period');
  if (hoursPerWeek >= 20) add(8, 'treats trading like a job (20+ hrs/wk)');
  if (accountSize >= 100000) add(10, 'account $100k+');
  else if (accountSize >= 25000) add(5, 'account $25k+');

  // Pain / value signals
  if (netResult <= -10000) add(15, 'large trading loss - MTM / loss-cap planning value');
  if (netResult >= 100000 && !hasEntity) add(10, 'large profit with no entity');
  if (instruments.includes('prop')) add(12, 'prop firm payouts - self-employment tax exposure');
  if (instruments.includes('futures') && netResult !== 0) add(4, 'futures 60/40 planning');
  if (!hasCpa) add(5, 'no tax pro today');

  score = Math.min(100, score);
  const tier = score >= 60 ? 'hot' : score >= 35 ? 'warm' : 'nurture';
  const ttsLikely = tradesPerYear >= 720 && daysTradedPct >= 75 && (avgHoldDays === null || avgHoldDays <= 31);

  const primary = answers.primaryInstrument && SEGMENT_PRIORITY.includes(answers.primaryInstrument)
    ? answers.primaryInstrument
    : SEGMENT_PRIORITY.find((s) => instruments.includes(s)) || 'equities';

  let recommendedService = 'trader-return';
  if (primary === 'prop') recommendedService = 'quarterly-planning';
  else if (ttsLikely && netResult < 0) recommendedService = 'mtm-election';
  else if (ttsLikely && netResult >= 100000) recommendedService = 'entity-setup';
  else if (ttsLikely) recommendedService = 'tts-review';
  else if (['equities', 'options', 'crypto'].includes(primary) && tradesPerYear >= 250) recommendedService = 'wash-sale-cleanup';

  return { score, tier, segment: primary, ttsLikely, recommendedService, reasons };
}
