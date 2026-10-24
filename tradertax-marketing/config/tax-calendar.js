// Recurring US federal deadlines that matter to traders, plus the topic bank
// the content engine rotates through. Deadlines that land on a weekend roll to
// the next business day automatically (see src/content/topics.js); federal
// holidays and IRS disaster extensions are not modeled, so confirm dates on
// irs.gov each season.
//
// `guide` points at the matching article on www.tradertaxhq.com/resources so
// every social post and email drives traffic back to the main site.

const R = (slug) => `${process.env.MAIN_SITE_URL || 'https://www.tradertaxhq.com'}/resources/${slug}`;

export const deadlines = [
  { id: 'q4-estimate', month: 1, day: 15, name: 'Q4 Estimated Tax Payment', segments: ['all'], guide: R('estimated-tax-payments'),
    action: 'Prop firms withhold nothing. Pay your fourth-quarter estimate so last year\'s payouts do not turn into an underpayment penalty.' },
  { id: 'forms-1099', month: 1, day: 31, name: '1099-NEC Forms Due From Prop Firms', segments: ['prop'], guide: R('prop-firm-payouts'),
    action: 'US prop firms generally must furnish 1099-NEC forms by now. Download every one and compare it to your payout history before you file.' },
  { id: 'entity-returns', month: 3, day: 15, name: 'S-Corp & Partnership Returns Due', segments: ['all'], guide: R('entity-structure'),
    action: 'Trading entities (S-Corps and partnerships) must file or extend today.' },
  { id: 'tax-day', month: 4, day: 15, name: 'Tax Day + Q1 Estimates + Section 475(f) Election Deadline', segments: ['all'], guide: R('mark-to-market-election'),
    action: 'Individual returns and Q1 estimates are due. It is also generally the last day for existing individual traders to elect Section 475 mark-to-market for this tax year. An extension extends the time to file, not the time to pay.' },
  { id: 'q2-estimate', month: 6, day: 15, name: 'Q2 Estimated Tax Payment', segments: ['all'], guide: R('estimated-tax-payments'),
    action: 'Second-quarter estimates are due. Base them on year-to-date payouts and trading P&L, not last year.' },
  { id: 'q3-estimate', month: 9, day: 15, name: 'Q3 Estimated Tax Payment + Extended Entity Returns', segments: ['all'], guide: R('estimated-tax-payments'),
    action: 'Third-quarter estimates are due, and extended S-Corp and partnership returns must be filed.' },
  { id: 'extension', month: 10, day: 15, name: 'Extended Individual Returns Due', segments: ['all'], guide: R('trading-losses-nol'),
    action: 'Extended individual returns are due today, and there is no second extension.' },
  { id: 'year-end', month: 12, day: 31, name: 'Year-End Trading Tax Cutoff', segments: ['options', 'crypto', 'prop'], guide: R('wash-sale-rules'),
    action: 'This is the last trading day to harvest losses, pay deductible business expenses (evals, data, platforms) and avoid year-end wash sales.' },
];

// `months` restricts a topic to a season (empty = evergreen). `priority` breaks
// ties: higher wins. Prop firm topics carry higher priority (the core market).
export const topics = [
  { id: 'prop-payouts', months: [], priority: 9, segments: ['prop'], guide: R('prop-firm-payouts'),
    title: 'How Prop Firm Payouts Are Taxed (It Is Not Your 60/40 Futures Rate)',
    angle: 'Start with the payout arrangement, not the instrument: independent-contractor payouts generally go on Schedule C with Schedule SE. Contrast with Section 1256 treatment in a personal futures account.' },
  { id: 'eval-fees', months: [], priority: 8, segments: ['prop'], guide: R('prop-firm-evaluation-fees-tax-deductible'),
    title: 'Are Prop Firm Evaluation and Reset Fees Tax Deductible?',
    angle: 'Ordinary and necessary business expenses vs. startup costs depending on when and why the fees were incurred. Not every fee is automatically deductible. What records to keep.' },
  { id: 'prop-1099-mismatch', months: [1, 2, 3, 4], priority: 10, segments: ['prop'], guide: R('how-to-file-prop-firm-taxes'),
    title: '1099-NEC, 1099-K or Nothing at All: Reconciling Prop Firm Tax Forms',
    angle: 'Reconcile forms to payouts actually received, avoid double-counting payment-processor 1099-Ks, and report income from foreign firms that send no US form.' },
  { id: 'prop-se-tax', months: [], priority: 8, segments: ['prop'], guide: R('prop-firm-payouts'),
    title: 'The Self-Employment Tax Surprise Funded Traders Get in April',
    angle: 'Explain the roughly 15.3% self-employment tax on net Schedule C payouts, why it surprises traders, and how quarterly estimates prevent penalties. Illustrative example on a $40,000 payout year.' },
  { id: 'prop-retirement', months: [10, 11, 12, 1, 2, 3, 4], priority: 7, segments: ['prop'], guide: R('entity-structure'),
    title: 'Prop Payouts Are Self-Employment Income - Which Means You Can Fund a Solo 401(k)',
    angle: 'Because net payouts are generally self-employment income, SEP-IRA or Solo 401(k) contributions may be available. Explain the deadlines and that plan setup timing matters. No promises of specific savings.' },
  { id: 'prop-scorp', months: [10, 11, 12, 1], priority: 7, segments: ['prop'], guide: R('entity-structure'),
    title: 'Should a Funded Trader Run Payouts Through an LLC or S-Corp?',
    angle: 'When an S-Corp election can make sense for consistent payout income (reasonable salary, payroll costs, added filings) and when it is overkill. Firm agreements may restrict who the contracting party can be.' },
  { id: 'estimates', months: [3, 4, 5, 6, 8, 9, 12, 1], priority: 8, segments: ['all'], guide: R('estimated-tax-payments'),
    title: 'Quarterly Estimated Taxes for Prop and Active Traders',
    angle: 'Due dates, the 90% / 100% / 110% safe harbor rules, and the annualized income method for traders whose payouts are lumpy.' },
  { id: 'futures-6040', months: [], priority: 6, segments: ['futures'], guide: R('section-1256-contracts'),
    title: 'The 60/40 Rule: How Futures Traders Get Long-Term Rates on Day Trades',
    angle: 'Show the blended top federal rate math (about 26.8% vs 37%) for futures traded in your own account, and explain why this does not apply to prop firm payouts.' },
  { id: 'loss-carryback', months: [1, 2, 3, 4], priority: 6, segments: ['futures'], guide: R('section-1256-contracts'),
    title: 'Futures Losses Can Go Back in Time: The Section 1256 Carryback Election',
    angle: 'Explain the 3-year carryback of net Section 1256 losses against prior 1256 gains on Form 6781, with an example.' },
  { id: 'forex-988', months: [], priority: 6, segments: ['forex'], guide: R('forex-trading-taxes'),
    title: 'Forex Taxes: Section 988 vs. Section 1256 and the Election You Have to Make First',
    angle: 'Spot forex is generally ordinary under Section 988. An internal opt-out election may be available for certain contracts and must be made before the trade. Recordkeeping for offshore brokers.' },
  { id: 'tts-qualify', months: [], priority: 5, segments: ['options', 'futures'], guide: R('trader-tax-status'),
    title: 'Do You Qualify for Trader Tax Status? Volume, Frequency and Holding Period',
    angle: 'Facts-and-circumstances test: how courts have weighed trade count, days traded, holding period and time spent. TTS is separate from the Section 475(f) election.' },
  { id: 'mtm-475', months: [1, 2, 3, 4], priority: 9, segments: ['options'], guide: R('mark-to-market-election'),
    title: 'Section 475 Mark-to-Market: The April 15 Election Deadline Most Traders Miss',
    angle: 'How MTM removes the $3,000 loss cap and wash sales for qualifying traders, the deadline for existing filers, and who should NOT elect it.' },
  { id: 'wash-sale-yearend', months: [11, 12], priority: 9, segments: ['options', 'crypto'], guide: R('wash-sale-rules'),
    title: 'The December Wash Sale Trap That Pushes Your Losses Into Next Year',
    angle: 'Re-entering within 30 days across Dec 31, across accounts including IRAs. Include a year-end checklist.' },
  { id: 'prop-yearend', months: [11, 12], priority: 10, segments: ['prop'], guide: R('how-to-file-prop-firm-taxes'),
    title: 'Year-End Checklist for Funded Traders: Do These Before December 31',
    angle: 'Download payout histories, gather eval and reset receipts, check Q4 estimate, consider retirement plan setup, and organize records per firm. Ends with the free checklist.' },
  { id: 'crypto-1099da', months: [1, 2, 3, 4], priority: 7, segments: ['crypto'], guide: R('crypto-trading-taxes'),
    title: 'Form 1099-DA Is Here: What Crypto Traders Need to Fix Before Filing',
    angle: 'Broker reporting of digital asset sales, basis gaps across wallets, and how to avoid IRS mismatch notices.' },
  { id: 'home-office', months: [], priority: 4, segments: ['prop', 'futures', 'options'], guide: R('home-office-deduction'),
    title: 'The Home Office Deduction for Traders: Who Actually Qualifies',
    angle: 'Schedule C prop traders vs. investors vs. TTS traders. Regular and exclusive use, simplified vs. actual method.' },
  { id: 'irs-notice', months: [5, 6, 7, 8, 9], priority: 5, segments: ['all'], guide: R('irs-audit-risk'),
    title: 'Got an IRS Letter About Your Trading? What to Do First',
    angle: 'Do not panic and do not ignore it. Read the notice type and deadline, compare to your return and forms, and get help. TraderTaxHQ offers notice review guidance and referrals to representation if needed.' },
  { id: 'records', months: [6, 7, 8], priority: 4, segments: ['all'], guide: R('day-trading-taxes'),
    title: 'The Trader Recordkeeping System That Makes Tax Season Easy',
    angle: 'Payout histories per firm, eval receipts, platform exports (NinjaTrader, Tradovate, Rithmic, TradingView), broker statements, and a simple monthly routine.' },
];
