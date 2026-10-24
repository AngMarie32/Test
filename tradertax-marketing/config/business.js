// TraderTax HQ business profile. Every marketing asset the system produces is
// driven from this file, so edit it first: brand, offers, segments, links,
// compliance rules and the publishing schedule.

export default {
  brand: {
    name: 'TraderTax HQ',
    tagline: 'Tax strategy built for active traders.',
    website: process.env.PUBLIC_URL || 'http://localhost:3000',
    bookingUrl: process.env.BOOKING_URL || 'https://calendly.com/your-handle/trader-tax-strategy-call',
    fromName: 'TraderTax HQ',
    fromEmail: process.env.FROM_EMAIL || 'hello@tradertaxhq.com',
    ownerEmail: process.env.OWNER_EMAIL || 'owner@tradertaxhq.com',
    // CAN-SPAM requires a valid physical postal address in every marketing email.
    mailingAddress: process.env.MAILING_ADDRESS || 'TraderTax HQ, 123 Main St, Suite 100, Your City, ST 00000',
    timezone: process.env.TIMEZONE || 'America/New_York',
    voice: [
      'Direct, numbers-first, zero fluff - write like a trader talking to traders.',
      'Explain tax rules in plain English with a concrete dollar example.',
      'Confident but never promise outcomes; tax results depend on facts and circumstances.',
      'Use trader vocabulary naturally (futures, 60/40, MTM, wash sales, prop firm payouts, P&L).',
    ],
  },

  // What we sell. The AI content engine and nurture emails reference these.
  offers: {
    leadMagnet: {
      name: 'The Active Trader Tax Playbook',
      description: 'Trader Tax Status checklist, Section 475 MTM election walkthrough, 60/40 futures math and a year-end wash-sale audit.',
      path: '/playbook',
    },
    consult: {
      name: 'Free 20-Minute Trader Tax Strategy Call',
      description: 'We review your trading volume, instruments and entity setup and tell you what you are leaving on the table.',
    },
    services: [
      { id: 'tts-review', name: 'Trader Tax Status (TTS) Qualification Review', price: 'from $497' },
      { id: 'mtm-election', name: 'Section 475(f) Mark-to-Market Election & Filing', price: 'from $750' },
      { id: 'entity-setup', name: 'Trading Entity Setup (LLC / S-Corp) + Accountable Plan', price: 'from $1,500' },
      { id: 'trader-return', name: 'Active Trader Tax Return Preparation (Form 8949, 6781, Schedule C)', price: 'from $1,200' },
      { id: 'wash-sale-cleanup', name: 'Wash Sale & 1099-B Reconciliation', price: 'from $600' },
      { id: 'quarterly-planning', name: 'Quarterly Estimated Tax Planning', price: 'from $199/quarter' },
    ],
  },

  // Audience segments. Leads are routed into one of these by the quiz.
  segments: {
    futures: {
      label: 'Futures Traders',
      pains: ['Not sure how Section 1256 60/40 treatment works', 'Form 6781 confusion', 'Loss carryback options never used'],
      hook: 'Futures get 60% long-term treatment no matter how long you held - most traders never model what that is worth.',
    },
    options: {
      label: 'Options Traders',
      pains: ['Wash sales triggered across strikes and expirations', 'Index options (SPX) vs equity options treatment', 'Assignment cost basis errors'],
      hook: 'SPX and SPY options can be taxed completely differently - the difference can be thousands of dollars.',
    },
    equities: {
      label: 'Active Stock Day Traders',
      pains: ['Wash sales disallowing real losses', '$3,000 capital loss limit', 'No deduction for data, platforms or education'],
      hook: 'If you trade nearly every day, the $3,000 loss cap and wash sale rule may not have to apply to you.',
    },
    prop: {
      label: 'Funded / Prop Firm Traders',
      pains: ['Prop payouts reported on 1099-NEC/1099-MISC', 'Self-employment tax surprise', 'Evaluation fees not tracked'],
      hook: 'Prop firm payouts are usually not trading gains at all - they are business income with self-employment tax.',
    },
    crypto: {
      label: 'Crypto Traders',
      pains: ['Missing cost basis across exchanges', 'New broker 1099-DA reporting', 'Staking and DeFi income classification'],
      hook: 'Exchanges now report crypto sales to the IRS - mismatched cost basis is the number one audit trigger we see.',
    },
  },

  // Words and claims that must never appear in published content.
  compliance: {
    bannedPhrases: [
      'guarantee', 'guaranteed', 'risk-free', 'risk free', 'irs approved', 'irs-approved',
      'pay no tax', 'pay zero tax', 'never pay taxes', 'tax-free trading', 'audit-proof',
      'loophole', 'secret the irs', '100% deductible no matter', 'eliminate all taxes',
    ],
    disclaimer:
      'This content is for educational purposes only and is not tax, legal or investment advice. ' +
      'Tax outcomes depend on your specific facts and circumstances. Consult a qualified tax professional before acting.',
    // Every piece of content waits in the dashboard for a human "Approve" before going out.
    requireApproval: process.env.REQUIRE_APPROVAL !== 'false',
  },

  // When things go out (local time in brand.timezone).
  schedule: {
    contentGeneration: { weekday: 1, hour: 6 },          // Monday 06:00 - build the week's content pack
    newsletter: { weekday: 4, hour: 7 },                 // Thursday 07:00 - newsletter to all subscribers
    weeklyReport: { weekday: 1, hour: 8 },               // Monday 08:00 - KPI report to owner
    socialSlots: [                                       // Posts spread across the week
      { weekday: 2, hour: 8, channel: 'x' },
      { weekday: 2, hour: 12, channel: 'linkedin' },
      { weekday: 3, hour: 9, channel: 'facebook' },
      { weekday: 3, hour: 16, channel: 'x' },
      { weekday: 4, hour: 12, channel: 'linkedin' },
      { weekday: 5, hour: 9, channel: 'x' },
      { weekday: 5, hour: 13, channel: 'instagram' },
    ],
    deadlineReminderDays: [14, 3],                       // Broadcast reminders N days before each tax deadline
  },

  channels: {
    x: { label: 'X / Twitter', maxChars: 280 },
    linkedin: { label: 'LinkedIn', maxChars: 3000 },
    facebook: { label: 'Facebook', maxChars: 2000 },
    instagram: { label: 'Instagram', maxChars: 2200 },
  },
};
