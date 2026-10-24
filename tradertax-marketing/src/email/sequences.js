// Nurture sequences. Every new lead gets the core sequence with a
// segment-specific email slotted in; hot leads also get a same-day personal
// note. A sequence stops automatically when the lead starts intake, books,
// becomes a client or unsubscribes.
//
// Placeholders filled at send time: {{first_name}} {{intake_url}}
// {{pricing_url}} {{checklist_url}} {{prop_url}}
import business from '../../config/business.js';

const plan = (id) => business.offers.services.find((s) => s.id === id);

const segmentEmails = {
  prop: {
    subject: 'Your prop payout is not a trading gain',
    body: `Hi {{first_name}},

This is the rule that catches most funded traders:

**Start with the payout arrangement, not the instrument.** You may trade ES and NQ all day, but a payout from a prop firm is usually not your own Section 1256 futures gain. For a typical independent-contractor arrangement it is business income on Schedule C, with self-employment tax on Schedule SE.

What that usually means in practice:

- Payouts are often reported on a 1099-NEC, sometimes a 1099-MISC or 1099-K, and foreign firms may send no US form at all. The income is still reportable.
- Watch for double counting when a payment processor also issues a 1099-K for the same payout.
- Evaluation and reset fees may be current business expenses or startup costs depending on timing. Not every fee is automatically deductible.
- Prop firms withhold nothing, so quarterly estimates usually matter.

We handle unlimited prop firm accounts on every plan. Start with a quick intake (3-5 minutes, no documents needed yet): {{intake_url}}`,
  },
  futures: {
    subject: 'The 60/40 math most futures traders never run',
    body: `Hi {{first_name}},

Regulated futures traded in **your own account** are Section 1256 contracts: 60% long-term and 40% short-term no matter how long you held them, even a 30-second scalp.

**Illustrative example:** for a trader in the top bracket, a $100,000 net futures gain blends to a top federal rate of about 26.8%, versus 37% if the same gain came from short-term stock trades. Your bracket, the 3.8% net investment income tax and state tax all change the real number.

Two more things futures traders often miss:

- Open positions are marked to market at year-end, so unrealized P&L on Dec 31 counts this year.
- A net 1256 loss can be carried back up to three years against prior 1256 gains, using an election on Form 6781.

One important exception: payouts from a **prop firm** funded account usually do not get 60/40 treatment. Those are generally contractor income.

Want us to look at your setup? {{intake_url}}`,
  },
  forex: {
    subject: 'Forex taxes: the election you have to make first',
    body: `Hi {{first_name}},

Spot forex gains and losses are generally **ordinary** under Section 988, not capital. That cuts both ways: losses are not capped at $3,000, but gains do not get capital gain rates.

For certain contracts, traders can make an internal election to opt out of Section 988. The catch is that the election generally has to be made and documented **before** the trade. You cannot pick the better treatment at tax time.

Add offshore broker statements in a different currency, and forex returns get messy fast.

We handle forex and multi-broker reporting. Start here: {{intake_url}}`,
  },
  options: {
    subject: 'The $3,000 loss cap may not have to apply to you',
    body: `Hi {{first_name}},

Most stock and options traders assume two rules are permanent:

1. You can only deduct $3,000 of net capital losses per year.
2. Wash sales can disallow real losses, across every account you own, including IRAs.

Traders who qualify for Trader Tax Status and make a timely Section 475(f) mark-to-market election treat those trading gains and losses as ordinary. That removes both the $3,000 cap and the wash sale rule for those securities.

The catch: for existing filers the election is generally due with the prior-year return or extension by April 15, and you have to actually qualify. TTS is a facts-and-circumstances test.

Our Professional plan includes TTS analysis and MTM election guidance: {{pricing_url}}

Not sure where you fit? Start with the intake: {{intake_url}}`,
  },
  crypto: {
    subject: '1099-DA changed crypto taxes - here is what to check',
    body: `Hi {{first_name}},

Brokers and exchanges now report digital asset sales on Form 1099-DA. If the cost basis on that form does not match your return, expect a mismatch notice.

The usual problems:

- Coins moved between wallets and exchanges lose their basis history
- Staking and reward income is taxed when you receive it, then the basis has to carry through to the sale
- Records are missing from exchanges that no longer exist

Complex crypto and DeFi reporting is available on our Enterprise plan or as a custom quote. Start here: {{intake_url}}`,
  },
};

export function buildSequence(lead) {
  const fit = plan(lead.recommendedService) || plan('starter');
  const steps = [
    {
      key: 'welcome', delayDays: 0,
      subject: 'Your 2026 Prop Firm Trader Tax Checklist',
      preheader: 'Forms to expect, expenses to track, records to keep, and estimated tax dates.',
      body: `Hi {{first_name}},

Here is your copy of **${business.offers.leadMagnet.name}**: {{checklist_url}}

Inside: the forms to expect from prop firms and brokers, the expenses to track, the records to keep, and the 2026 estimated tax dates.

You are also on the subscriber list, which means **subscriber-only discounts and early access to specials** before tax season.

Over the next two weeks I will send a few short emails about how your kind of trading is taxed. When you are ready, the Basic Intake takes 3-5 minutes and needs no documents: {{intake_url}}

- TraderTaxHQ`,
    },
  ];

  if (lead.tier === 'hot') {
    steps.push({
      key: 'hot-personal', delayDays: 0, delayHours: 1,
      subject: 'Quick note on your answers',
      body: `Hi {{first_name}},

I looked at your answers. Based on what you shared, our **${fit.name.split(' (')[0]}** plan (${fit.price}) looks like the likely fit: ${fit.fit}
${lead.upsells?.includes('irs-notice') ? '\nYou mentioned an IRS notice. Do not wait on that one. Notices have response deadlines, and we can review it with you and guide your response.\n' : ''}
Every situation is different, so the next step is the Basic Intake. It takes 3-5 minutes and needs no documents. We review it and recommend the right next step, often by email: {{intake_url}}

Prefer email-only guidance? Just reply to this email.

- TraderTaxHQ`,
    });
  }

  const seg = segmentEmails[lead.segment] || segmentEmails.prop;
  steps.push({ key: `segment-${lead.segment}`, delayDays: 2, ...seg });

  steps.push(
    {
      key: 'estimates', delayDays: 5,
      subject: 'Nobody is withholding tax from your trading',
      body: `Hi {{first_name}},

Prop firms withhold nothing, and neither does your futures or brokerage account. If you expect to owe $1,000 or more, the IRS expects quarterly estimated payments:

- **April 15, June 15, September 15, and January 15** (dates shift when they fall on a weekend or holiday)
- To avoid the penalty, generally pay at least 90% of this year's tax or 100% of last year's tax (110% if last year's AGI was over $150,000)
- If your payouts came late in the year, the annualized income method can lower your earlier installments

A filing extension extends the time to file, not the time to pay.

Want a quarterly number you can actually plan around? {{intake_url}}`,
    },
    {
      key: 'mistakes', delayDays: 9,
      subject: '5 trader tax mistakes we fix every season',
      body: `Hi {{first_name}},

1. Reporting prop firm payouts as 60/40 futures gains instead of contractor income
2. Double counting a payout reported on both a 1099-NEC and a payment processor's 1099-K
3. Skipping income from a foreign prop firm because no form arrived
4. Deducting every eval and reset fee automatically, or none of them
5. Filing straight from a broker 1099-B without reconciling wash sales across accounts

Every return we prepare comes with audit-ready documentation for the positions taken. See plans from $297/yr: {{pricing_url}}`,
    },
    {
      key: 'last-call', delayDays: 14,
      subject: 'Should I keep sending these?',
      body: `Hi {{first_name}},

I have sent a few trader tax emails and do not want to clutter your inbox.

If you want us to handle this season, the Basic Intake is here: {{intake_url}}. We are available evenings and weekends.

Otherwise you will keep getting the weekly trader tax email, deadline reminders, and subscriber-only discounts. You can unsubscribe anytime below.

- TraderTaxHQ`,
    },
  );

  return steps;
}
