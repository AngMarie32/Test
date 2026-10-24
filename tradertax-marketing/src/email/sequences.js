// Nurture sequences. Every new lead gets the core sequence with segment-specific
// emails slotted in; hot leads also get a same-day personal note. A sequence
// stops automatically when the lead books, becomes a client or unsubscribes.
import business from '../../config/business.js';

const svc = (id) => business.offers.services.find((s) => s.id === id)?.name || 'a strategy review';

const segmentEmails = {
  futures: {
    subject: 'The 60/40 math most futures traders never run',
    body: `Hi {{first_name}},

Futures and other Section 1256 contracts are taxed 60% long-term and 40% short-term no matter how long you held them - even a 30-second scalp.

**Illustrative example:** a $100,000 net futures gain for a trader in the top bracket blends to a top federal rate of roughly 26.8%, versus 37% if the same gain came from short-term stock trades. That gap could be worth about $10,000 on paper, before state tax and depending on your bracket.

Two more things futures traders often miss:

- Open positions are marked to market at year-end, so unrealized P&L on Dec 31 counts this year.
- A net 1256 loss can be carried back up to three years against prior 1256 gains - an election most traders never make.

Want us to check your Form 6781 setup? {{booking_url}}`,
  },
  options: {
    subject: 'SPX vs SPY: same trade, different tax bill',
    body: `Hi {{first_name}},

SPX options are broad-based index options, so they are generally Section 1256 contracts: 60/40 treatment and year-end mark-to-market. SPY options are options on an ETF, so gains are usually short-term and fully exposed to the wash sale rule.

Same market exposure. Potentially very different tax result.

Other options traps we fix every season:

- Wash sales triggered by "substantially identical" options across strikes and expirations
- Assignment and exercise adjustments missing from cost basis
- Brokers reporting 1256 and non-1256 activity in ways that do not tie out

If you trade options actively, let's look at your mix: {{booking_url}}`,
  },
  equities: {
    subject: 'The $3,000 loss cap may not have to apply to you',
    body: `Hi {{first_name}},

Most traders assume two rules are permanent:

1. You can only deduct $3,000 of net capital losses per year.
2. Wash sales can disallow real losses.

Traders who qualify for Trader Tax Status and make a timely Section 475(f) mark-to-market election convert trading gains and losses to ordinary - which removes both the $3,000 cap and the wash sale rule on those securities.

The catch: the election has a strict deadline (generally the original due date of the prior year's return - April 15 for most individuals), and you have to actually qualify.

Not sure if you do? That's exactly what our free call is for: {{booking_url}}`,
  },
  prop: {
    subject: 'Your prop firm payout is not a trading gain',
    body: `Hi {{first_name}},

When a prop firm pays you, you usually are not trading your own capital - you are being paid for a service. That is why most funded traders receive a 1099-NEC or 1099-MISC, not a 1099-B.

What that typically means:

- The income is self-employment income on Schedule C
- Self-employment tax (about 15.3% on the first tier of earnings) applies on top of income tax
- Evaluation fees, resets, data and platform costs are generally deductible business expenses
- You likely need quarterly estimated payments

Funded traders who plan for this keep more of every payout. Let's set yours up: {{booking_url}}`,
  },
  crypto: {
    subject: '1099-DA changed crypto taxes - here is what to check',
    body: `Hi {{first_name}},

Brokers and exchanges now report digital asset sales to the IRS on Form 1099-DA. If the cost basis on that form does not match your return, expect a mismatch notice.

The usual problems:

- Coins moved between wallets and exchanges lose their basis history
- Staking and reward income reported as ordinary income at receipt, then again at sale
- Missing records from exchanges that no longer exist

We reconcile this before you file, not after the IRS letter arrives: {{booking_url}}`,
  },
};

export function buildSequence(lead) {
  const playbookUrl = `${business.brand.website}${business.offers.leadMagnet.path}`;
  const steps = [
    {
      key: 'welcome', delayDays: 0,
      subject: `Your copy of ${business.offers.leadMagnet.name}`,
      body: `Hi {{first_name}},

Thanks for taking the trader tax quiz. Here is your playbook: ${playbookUrl}

Inside: the Trader Tax Status checklist, a Section 475 MTM walkthrough, the 60/40 futures math and a year-end wash-sale audit.

Over the next two weeks I will send a few short emails specific to how you trade. No fluff - just the rules that move the number on your return.

- The ${business.brand.name} team`,
    },
  ];

  if (lead.tier === 'hot') {
    steps.push({
      key: 'hot-personal', delayDays: 0, delayHours: 1,
      subject: 'Quick note on your quiz results',
      body: `Hi {{first_name}},

I looked at your quiz answers. Based on your activity level, there may be meaningful planning available - specifically around **${svc(lead.recommendedService)}**.

Every situation is different, so I would rather look at your actual numbers than guess. Grab any open slot here and we will walk through it in 20 minutes: {{booking_url}}

- ${business.brand.name}`,
    });
  }

  const seg = segmentEmails[lead.segment] || segmentEmails.equities;
  steps.push({ key: `segment-${lead.segment}`, delayDays: 2, ...seg });

  steps.push(
    {
      key: 'tts-check', delayDays: 5,
      subject: 'Do you trade like a business? A 60-second self-check',
      body: `Hi {{first_name}},

There is no bright-line test for Trader Tax Status, but courts have consistently looked at the same things:

- **Volume:** hundreds of trades a year (cases often discuss roughly 700+)
- **Frequency:** trading on most available market days
- **Holding period:** short - typically days or weeks, not months
- **Time:** you spend a large part of your working day on it
- **Intent:** you seek profit from short-term swings, not dividends or long-term appreciation

Hit most of those? TTS can unlock business expense deductions and, with a timely election, mark-to-market treatment.

Want a second opinion on your numbers? {{booking_url}}`,
    },
    {
      key: 'mistakes', delayDays: 9,
      subject: '5 trader tax mistakes we fix every season',
      body: `Hi {{first_name}},

1. Filing straight from the broker 1099-B without reconciling wash sales across accounts
2. Missing the Section 475(f) election deadline - then wishing you had it in a loss year
3. Paying estimates on last year's income when this year's P&L is completely different
4. Deducting trading expenses without qualifying for TTS (or not deducting them when you do)
5. Treating prop firm payouts like capital gains

Each of these is fixable - most of them before you file. {{booking_url}}`,
    },
    {
      key: 'last-call', delayDays: 14,
      subject: 'Should I keep sending these?',
      body: `Hi {{first_name}},

I have sent a few trader tax emails and do not want to clutter your inbox.

If you would like us to look at your situation, the calendar is here: {{booking_url}}

Otherwise you will get our weekly newsletter (one trader tax idea, every Thursday) and a heads-up before key deadlines. You can unsubscribe anytime below.

- The ${business.brand.name} team`,
    },
  );

  return steps;
}
