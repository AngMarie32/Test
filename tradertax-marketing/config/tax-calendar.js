// Recurring US federal deadlines that matter to traders, plus the evergreen
// topic bank the content engine rotates through. Deadlines that land on a
// weekend roll to the next business day automatically (see src/content/topics.js);
// federal holidays and IRS disaster extensions are not modeled, so confirm
// dates on irs.gov each season.

export const deadlines = [
  { id: 'q4-estimate', month: 1, day: 15, name: 'Q4 Estimated Tax Payment', segments: ['all'],
    action: 'Pay your fourth-quarter estimate so a strong trading year does not turn into an underpayment penalty.' },
  { id: 'entity-returns', month: 3, day: 15, name: 'S-Corp & Partnership Returns Due', segments: ['all'],
    action: 'Trading entities (S-Corps, partnerships) file or extend today.' },
  { id: 'tax-day', month: 4, day: 15, name: 'Tax Day + Section 475(f) MTM Election Deadline', segments: ['all'],
    action: 'Individual returns are due, Q1 estimates are due, and this is the last day for existing individual traders to elect Section 475 mark-to-market for this tax year.' },
  { id: 'q2-estimate', month: 6, day: 15, name: 'Q2 Estimated Tax Payment', segments: ['all'],
    action: 'Second-quarter estimates are due - calculate them on actual year-to-date trading P&L, not last year.' },
  { id: 'q3-estimate', month: 9, day: 15, name: 'Q3 Estimated Tax Payment + Extended Entity Returns', segments: ['all'],
    action: 'Third-quarter estimates are due and extended S-Corp/partnership returns must be filed.' },
  { id: 'extension', month: 10, day: 15, name: 'Extended Individual Returns Due', segments: ['all'],
    action: 'Extended individual returns are due - there is no second extension.' },
  { id: 'year-end', month: 12, day: 31, name: 'Year-End Trading Tax Cutoff', segments: ['equities', 'options', 'crypto'],
    action: 'Last trading day to harvest losses and to avoid wash sales that carry losses into next year.' },
];

// Topic bank. `months` restricts a topic to a season (empty = evergreen).
// `priority` breaks ties: higher wins when several topics are in season.
export const topics = [
  { id: 'tts-qualify', months: [], priority: 5, segments: ['equities', 'options', 'futures'],
    title: 'Do You Qualify for Trader Tax Status? The Volume, Frequency and Holding-Period Tests',
    angle: 'Walk through how courts have looked at trade count, days traded, holding period and time spent; give a self-check.' },
  { id: 'mtm-475', months: [1, 2, 3, 4], priority: 9, segments: ['equities', 'options'],
    title: 'Section 475 Mark-to-Market: The Election Deadline Most Traders Miss',
    angle: 'Explain the April 15 election deadline, how MTM removes the $3,000 loss cap and wash sales, and who should NOT elect it.' },
  { id: 'futures-6040', months: [], priority: 6, segments: ['futures'],
    title: 'The 60/40 Rule: How Futures Traders Get Long-Term Rates on Day Trades',
    angle: 'Show the blended max-rate math with a $100,000 futures profit example vs. the same gain on stocks.' },
  { id: 'spx-vs-spy', months: [], priority: 6, segments: ['options'],
    title: 'SPX vs. SPY Options: Same Trade, Very Different Tax Bill',
    angle: 'Section 1256 broad-based index options vs equity ETF options; wash sale and 60/40 implications.' },
  { id: 'prop-firm', months: [], priority: 7, segments: ['prop'],
    title: 'Prop Firm Payouts Are Not Trading Gains: What Funded Traders Owe',
    angle: 'Explain 1099-NEC/MISC treatment, self-employment tax, deductible evaluation fees and quarterly estimates.' },
  { id: 'wash-sale-yearend', months: [11, 12], priority: 10, segments: ['equities', 'options', 'crypto'],
    title: 'The December Wash Sale Trap That Pushes Your Losses Into Next Year',
    angle: 'Show how re-entering within 30 days across Dec 31 defers losses; include a year-end checklist.' },
  { id: 'loss-harvest', months: [10, 11, 12], priority: 8, segments: ['equities', 'options', 'crypto', 'futures'],
    title: 'Year-End Tax-Loss Harvesting for Active Traders',
    angle: 'Harvest without triggering wash sales; how 1256 contracts are marked at year-end anyway.' },
  { id: 'entity-planning', months: [10, 11, 12, 1], priority: 7, segments: ['equities', 'options', 'futures', 'prop'],
    title: 'Should Your Trading Run Through an S-Corp? Setting Up Before January 1',
    angle: 'When an entity helps (health insurance, retirement contributions, expenses) and when it is overkill.' },
  { id: '1099b-season', months: [2, 3], priority: 9, segments: ['equities', 'options', 'futures', 'crypto'],
    title: 'Your 1099-B Is Probably Wrong: How to Reconcile Before You File',
    angle: 'Common broker reporting errors: wash sales across accounts, missing basis, corrected 1099s.' },
  { id: 'estimates', months: [3, 4, 5, 6, 8, 9, 12, 1], priority: 7, segments: ['all'],
    title: 'Quarterly Estimates for Traders: Safe Harbor vs. Annualized Income',
    angle: 'How traders with lumpy P&L can use the annualized income method to avoid overpaying early in the year.' },
  { id: 'crypto-1099da', months: [1, 2, 3, 4], priority: 8, segments: ['crypto'],
    title: 'Form 1099-DA Is Here: What Crypto Traders Need to Fix Before Filing',
    angle: 'Broker reporting of digital asset sales, basis gaps across wallets, and how to avoid IRS mismatch notices.' },
  { id: 'expenses', months: [], priority: 4, segments: ['equities', 'options', 'futures'],
    title: 'What Traders Can (and Cannot) Deduct: Data, Platforms, Education and Home Office',
    angle: 'Investment expenses vs. TTS business expenses; Schedule C treatment; recordkeeping.' },
  { id: 'loss-carryback', months: [1, 2, 3, 4], priority: 6, segments: ['futures'],
    title: 'Futures Losses Can Go Back in Time: The Section 1256 Carryback Election',
    angle: 'Explain the 3-year carryback of net 1256 losses against prior 1256 gains, with an example.' },
  { id: 'records', months: [], priority: 3, segments: ['all'],
    title: 'The Trader Tax Recordkeeping System That Survives an Audit',
    angle: 'Trade logs, platform exports (NinjaTrader, TradingView, broker statements), time logs for TTS.' },
];
