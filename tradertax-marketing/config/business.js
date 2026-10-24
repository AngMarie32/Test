// TraderTaxHQ business profile (www.tradertaxhq.com). Every marketing asset the
// system produces is driven from this file: brand, offers and prices, audience
// segments, links, compliance rules and the publishing schedule.

const SITE = process.env.MAIN_SITE_URL || 'https://www.tradertaxhq.com';

export default {
  brand: {
    name: 'TraderTaxHQ',
    tagline: 'Trader Taxes Made Simple.',
    positioning: 'Expert tax preparation and guidance for prop firm traders, futures traders, options traders, and active traders.',
    mainSite: SITE,
    // Where this marketing app is hosted (campaign landing page, unsubscribe links, dashboard).
    website: process.env.PUBLIC_URL || 'http://localhost:3000',
    // Primary call to action: the 4-step Basic Intake on the main site.
    intakeUrl: process.env.INTAKE_URL || `${SITE}/get-started`,
    pricingUrl: `${SITE}/pricing`,
    servicesUrl: `${SITE}/services`,
    propFirmUrl: `${SITE}/prop-firm-taxes`,
    affiliateUrl: `${SITE}/affiliate`,
    fromName: 'TraderTaxHQ',
    fromEmail: process.env.FROM_EMAIL || 'info@tradertaxhq.com',
    ownerEmail: process.env.OWNER_EMAIL || 'info@tradertaxhq.com',
    // CAN-SPAM requires a valid physical postal address (a PO box or registered
    // private mailbox is fine) in every marketing email. Set it in .env.
    mailingAddress: process.env.MAILING_ADDRESS || 'TraderTaxHQ, [SET MAILING_ADDRESS IN .env]',
    timezone: process.env.TIMEZONE || 'America/New_York',
    credentials: 'TraderTaxHQ is run by a tax advisor (not a CPA or EA).',
    voice: [
      'We speak trader: direct, plain English, zero fluff. Prop payouts, ES and NQ, evals, resets, 60/40, wash sales.',
      'Start from the payout arrangement or the instrument, then the rule, then a concrete illustrative dollar example.',
      'Integrity first: compliant, documented, defensible. Never aggressive positions, never promised outcomes.',
      'Reassuring and low-pressure: a quick intake, no documents needed up front, email-only guidance available.',
      'Available evenings and weekends - we are here when you trade.',
    ],
  },

  offers: {
    leadMagnet: {
      name: 'The 2026 Prop Firm Trader Tax Checklist & Expense Deduction Guide',
      description: 'Forms to expect, expenses to track, records to keep, and 2026 estimated tax dates.',
      path: '/checklist',
      perk: 'Subscribers get subscriber-only discounts and early access to specials.',
    },
    primaryCta: {
      name: 'Start Basic Intake',
      description: 'A 3-5 minute intake. No tax documents needed yet. We review it and recommend the right next step - often by email, with a consultation only if needed.',
    },
    // Pricing tiers from www.tradertaxhq.com/pricing.
    services: [
      { id: 'starter', name: 'Starter tax prep (prop firm + light personal trading)', price: '$297/yr',
        fit: 'Unlimited prop firm accounts, up to 2 broker accounts and 500 broker trades, 1 state.' },
      { id: 'essential', name: 'Essential tax prep (prop + 2-3 brokers)', price: '$497/yr',
        fit: 'Unlimited prop firm accounts, up to 3 broker accounts and 750 trades, Schedule D & Form 8949.' },
      { id: 'professional', name: 'Professional tax prep (multi-broker active traders)', price: '$997/yr',
        fit: 'Unlimited trades, up to 5 brokers, Trader Tax Status analysis, MTM election guidance, mid-season planning call.' },
      { id: 'enterprise', name: 'Enterprise (trading entities)', price: 'from $2,497/yr',
        fit: 'Entity return (S-Corp, partnership or C-Corp) plus owner 1040, entity structure optimization, year-round planning.' },
      { id: 'bookkeeping', name: 'Trader bookkeeping', price: 'from $149/mo',
        fit: 'Monthly reconciliation and P&L for prop firm sole proprietors and trading entities.' },
      { id: 'irs-notice', name: 'IRS inquiry support', price: 'quote',
        fit: 'Notice review and response guidance, with referrals to representation if needed.' },
    ],
    affiliate: 'Affiliates earn 10-20% recurring commission with a 90-day cookie window.',
  },

  // Audience segments, in priority order. Prop firm traders are the core market.
  segments: {
    prop: {
      label: 'Prop Firm & Funded Account Traders',
      firms: ['Topstep', 'Apex Trader Funding', 'TradeDay', 'FundingTicks', 'FTMO', 'Take Profit Trader', 'MyFundedFutures'],
      pains: [
        'Payouts arrive on 1099-NEC, 1099-MISC or 1099-K - or no form at all from foreign firms',
        'Self-employment tax surprise in April',
        'Evaluation and reset fees not tracked or deducted incorrectly',
        'Same payout double-counted when a payment processor also issues a 1099-K',
        'No quarterly estimates because prop firms withhold nothing',
      ],
      hook: 'A funded futures account payout is usually not a Section 1256 trading gain - it is contractor income with self-employment tax.',
    },
    futures: {
      label: 'Futures Traders (own capital)',
      pains: ['Not using Section 1256 60/40 treatment correctly', 'Form 6781 confusion', 'Never heard of the 1256 loss carryback'],
      hook: 'Futures traded in your own account get 60% long-term treatment no matter how long you held - even a scalp.',
    },
    forex: {
      label: 'Forex Traders',
      pains: ['Section 988 ordinary treatment by default', 'Did not know an opt-out election must be made before trading', 'Offshore broker statements'],
      hook: 'Spot forex is generally ordinary income or loss under Section 988 - and the election to change that has to be made before the trade.',
    },
    options: {
      label: 'Stock & Options Traders',
      pains: ['Wash sales across accounts', '$3,000 capital loss limit', 'Trader Tax Status and the Section 475 deadline'],
      hook: 'The $3,000 loss cap and the wash sale rule do not have to be permanent if you qualify for Trader Tax Status and elect in time.',
    },
    crypto: {
      label: 'Crypto Traders',
      pains: ['Missing cost basis across exchanges and wallets', 'Form 1099-DA mismatches', 'DeFi and staking classification'],
      hook: 'Exchanges now report digital asset sales to the IRS - mismatched cost basis is what triggers the letters.',
    },
  },

  compliance: {
    bannedPhrases: [
      'guarantee', 'guaranteed', 'risk-free', 'risk free', 'irs approved', 'irs-approved',
      'pay no tax', 'pay zero tax', 'never pay taxes', 'tax-free trading', 'audit-proof',
      'loophole', 'eliminate all taxes', '100% deductible no matter',
      // TraderTaxHQ is run by a tax advisor, not a CPA or EA - never imply otherwise.
      'our cpa', 'our cpas', 'cpa firm', 'certified public accountant', 'enrolled agent',
      'we represent you', 'represent you before the irs', 'irs representation',
    ],
    disclaimer:
      'This content is for educational purposes only and is not tax, legal or investment advice. ' +
      'Tax outcomes depend on your specific facts and circumstances. TraderTaxHQ is run by a tax advisor (not a CPA or EA).',
    requireApproval: process.env.REQUIRE_APPROVAL !== 'false',
  },

  schedule: {
    contentGeneration: { weekday: 1, hour: 6 },          // Monday 06:00 - build the week's content pack
    newsletter: { weekday: 4, hour: 19 },                // Thursday 19:00 - after the futures session close
    weeklyReport: { weekday: 1, hour: 8 },               // Monday 08:00 - KPI report to owner
    socialSlots: [                                       // Posts spread across the week, outside RTH where it matters
      { weekday: 1, hour: 17, channel: 'x' },
      { weekday: 2, hour: 7, channel: 'linkedin' },
      { weekday: 2, hour: 17, channel: 'x' },
      { weekday: 3, hour: 19, channel: 'facebook' },
      { weekday: 4, hour: 17, channel: 'x' },
      { weekday: 5, hour: 12, channel: 'instagram' },
      { weekday: 6, hour: 10, channel: 'linkedin' },
    ],
    deadlineReminderDays: [14, 3],
  },

  channels: {
    x: { label: 'X / Twitter', maxChars: 280 },
    linkedin: { label: 'LinkedIn', maxChars: 3000 },
    facebook: { label: 'Facebook (incl. trading groups)', maxChars: 2000 },
    instagram: { label: 'Instagram', maxChars: 2200 },
  },
};
