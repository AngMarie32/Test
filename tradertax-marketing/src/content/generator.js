// Builds one week's multi-channel content pack from a single topic:
// SEO article (to publish on www.tradertaxhq.com/resources), newsletter,
// social posts for each slot and a short-form video script. Claude writes it
// when an API key is configured; otherwise a template pack is produced so the
// pipeline never stalls.
import business from '../../config/business.js';
import { aiEnabled, generateJson, MODEL } from '../ai.js';
import { checkCompliance, withDisclaimer } from '../compliance.js';
import { tagUrl } from '../email/sender.js';

const CHANNELS = Object.keys(business.channels);

export const PACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['blog', 'newsletter', 'social', 'videoScript'],
  properties: {
    blog: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'slug', 'metaDescription', 'quickAnswer', 'keywords', 'markdown'],
      properties: {
        title: { type: 'string' },
        slug: { type: 'string' },
        metaDescription: { type: 'string' },
        quickAnswer: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        markdown: { type: 'string' },
      },
    },
    newsletter: {
      type: 'object',
      additionalProperties: false,
      required: ['subject', 'preheader', 'body'],
      properties: {
        subject: { type: 'string' },
        preheader: { type: 'string' },
        body: { type: 'string' },
      },
    },
    social: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['channel', 'text'],
        properties: {
          channel: { type: 'string', enum: CHANNELS },
          text: { type: 'string' },
        },
      },
    },
    videoScript: {
      type: 'object',
      additionalProperties: false,
      required: ['hook', 'script', 'cta'],
      properties: {
        hook: { type: 'string' },
        script: { type: 'string' },
        cta: { type: 'string' },
      },
    },
  },
};

function slotCounts() {
  const counts = {};
  for (const s of business.schedule.socialSlots) counts[s.channel] = (counts[s.channel] || 0) + 1;
  return counts;
}

function systemPrompt() {
  const b = business.brand;
  return [
    `You are the content lead for ${b.name} (${b.mainSite}). Tagline: "${b.tagline}" ${b.positioning}`,
    'Prop firm and funded account traders (Topstep, Apex Trader Funding, TradeDay, FundingTicks, FTMO and similar) are the primary market. Futures, forex, stock/options and crypto traders are secondary.',
    `Credentials: ${b.credentials} Never describe the firm or its people as CPAs, Enrolled Agents, or as representing clients before the IRS. IRS notice help is "notice review and response guidance, with referrals to representation if needed".`,
    `Voice:\n- ${b.voice.join('\n- ')}`,
    `Plans:\n${business.offers.services.map((s) => `- ${s.name}: ${s.price}. ${s.fit}`).join('\n')}`,
    `Primary call to action: "${business.offers.primaryCta.name}" - ${business.offers.primaryCta.description}`,
    `Lead magnet: ${business.offers.leadMagnet.name} (${business.offers.leadMagnet.description}) ${business.offers.leadMagnet.perk}`,
    'Hard compliance rules:',
    `- Never use these words or claims: ${business.compliance.bannedPhrases.join(', ')}.`,
    '- Never promise a specific outcome or savings. Dollar figures are illustrative examples ("for example", "could", "may").',
    '- Prop firm payouts: start with the payout arrangement, not the instrument. Typical independent-contractor payouts are generally Schedule C income with self-employment tax; employment, entity and other arrangements may differ; the 1099 label alone is not decisive. Evaluation and reset fees may be current expenses or startup costs; not every fee is automatically deductible.',
    '- State US federal rules accurately with their conditions. Do not invent forms, deadlines, thresholds or court cases. If unsure, say "generally" and point to the intake.',
    '- No individualized advice; send readers to the Basic Intake for their situation.',
  ].join('\n\n');
}

function userPrompt(topic, segmentKeys, extraContext) {
  const segs = segmentKeys.map((k) => business.segments[k]).filter(Boolean);
  const counts = slotCounts();
  return [
    `Create this week's content pack on the topic: "${topic.title}".`,
    `Angle: ${topic.angle}`,
    `Existing in-depth guide on our site to link to: {{guide_url}}`,
    segs.length ? `Audience segments:\n${segs.map((s) => `- ${s.label}: pains = ${s.pains.join('; ')}`).join('\n')}` : '',
    extraContext ? `Extra context for this week: ${extraContext}` : '',
    'Deliverables:',
    '1. blog: 900-1300 word SEO article in Markdown for www.tradertaxhq.com/resources. Start with a 2-3 sentence quickAnswer (also returned separately) that directly answers the title, then H2/H3 sections, one worked illustrative numeric example, a 3-question FAQ, and a closing CTA to Start Basic Intake at {{intake_url}}. slug is lowercase-hyphenated. metaDescription max 155 characters. 5-8 keywords.',
    '2. newsletter: 250-400 words, one idea, written to {{first_name}}, one CTA to {{intake_url}}, optionally mention subscriber-only discounts. Subject under 55 characters. Markdown ok.',
    `3. social: exactly ${Object.entries(counts).map(([c, n]) => `${n} ${c}`).join(', ')} posts. Limits: ${Object.entries(business.channels).map(([k, c]) => `${k} <= ${c.maxChars} chars`).join(', ')}. Each post stands alone, opens with a hook a futures/prop trader would stop scrolling for, and ends by pointing to {{guide_url}} (instagram: "link in bio"). Max 3 hashtags.`,
    '4. videoScript: 45-60 second vertical video for Reels/Shorts/TikTok. hook = first 3 seconds, script = spoken lines with [on-screen text] cues, cta = "Start Basic Intake at tradertaxhq.com" or similar.',
  ].filter(Boolean).join('\n\n');
}

export function templatePack(topic, segmentKeys = []) {
  const seg = business.segments[segmentKeys[0]] || business.segments.prop;
  const slug = topic.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  const counts = slotCounts();
  const short = topic.title.split(/[:(]/)[0].trim();
  const lines = {
    x: [
      `${seg.hook}\n\nFull breakdown: {{guide_url}}`,
      `Trader tax question of the week: ${short}?\n\nShort answer: it depends on your facts. Here is how to check yours: {{guide_url}}`,
      `${seg.pains[0]}.\n\nIf that is you, read this before you file: {{guide_url}}`,
    ],
    linkedin: [
      `${topic.title}\n\n${topic.angle}\n\nWe work with prop firm, futures and active traders, evenings and weekends included. Guide: {{guide_url}}`,
      `What we hear most from ${seg.label.toLowerCase()}: "${seg.pains[1] || seg.pains[0]}."\n\n${seg.hook}\n\nMore: {{guide_url}}`,
    ],
    facebook: [`${seg.hook}\n\nThis week's guide: ${topic.title}\n{{guide_url}}\n\nQuestions? Start a quick intake, no documents needed: {{intake_url}}`],
    instagram: [`${short}\n\n${seg.hook}\n\nFree 2026 Prop Firm Trader Tax Checklist - link in bio.`],
  };
  const social = [];
  for (const [channel, n] of Object.entries(counts)) {
    const pool = lines[channel] || lines.x;
    for (let i = 0; i < n; i++) social.push({ channel, text: pool[i % pool.length] });
  }
  const quickAnswer = `${seg.hook} ${topic.angle.split('.')[0]}.`;
  return {
    blog: {
      title: topic.title,
      slug,
      metaDescription: topic.angle.slice(0, 155),
      quickAnswer,
      keywords: ['trader taxes', seg.label.toLowerCase(), 'prop firm taxes', '1099-NEC', 'section 1256'],
      markdown: [
        `# ${topic.title}`,
        `**Quick answer:** ${quickAnswer}`,
        `## Why this matters for ${seg.label.toLowerCase()}`,
        seg.hook,
        `## The rule in plain English`,
        topic.angle,
        `## Common mistakes we see`,
        seg.pains.map((p) => `- ${p}`).join('\n'),
        `## Next step`,
        `Start a Basic Intake (3-5 minutes, no documents needed yet): {{intake_url}}`,
      ].join('\n\n'),
    },
    newsletter: {
      subject: topic.title.length > 55 ? `${short.slice(0, 52)}` : topic.title,
      preheader: seg.hook.slice(0, 90),
      body: `Hi {{first_name}},\n\n${seg.hook}\n\n${topic.angle}\n\nThe full guide is here: {{guide_url}}\n\nWant us to look at your situation? Start a Basic Intake, no documents needed: {{intake_url}}\n\n- TraderTaxHQ`,
    },
    social,
    videoScript: {
      hook: seg.hook.split(' - ')[0],
      script: `[on-screen: ${short}]\n${seg.hook}\n${topic.angle}\n[on-screen: Free 2026 checklist - link in bio]`,
      cta: 'Start your Basic Intake at tradertaxhq.com.',
    },
  };
}

// Applies links (UTM-tagged per channel), disclaimers, length limits and the compliance scan.
export function finalizePack(pack, topic) {
  const guide = topic?.guide || business.brand.servicesUrl;
  const fill = (t, medium, campaign = topic?.id || 'content') => String(t)
    .replaceAll('{{guide_url}}', tagUrl(guide, { medium, campaign }))
    .replaceAll('{{intake_url}}', tagUrl(business.brand.intakeUrl, { medium, campaign }))
    .replaceAll('{{site_url}}', tagUrl(business.brand.mainSite, { medium, campaign }));

  const blogMarkdown = withDisclaimer(fill(pack.blog.markdown, 'blog'));
  const newsletterBody = withDisclaimer(fill(pack.newsletter.body, 'email')); // {{first_name}} filled at send time
  const social = pack.social.map((p) => {
    const max = business.channels[p.channel]?.maxChars ?? 280;
    let text = fill(p.text, `social-${p.channel}`);
    if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`;
    return { ...p, text, compliance: checkCompliance(text) };
  });

  const slug = String(pack.blog.slug || pack.blog.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return {
    ...pack,
    blog: { ...pack.blog, slug, markdown: blogMarkdown, compliance: checkCompliance(blogMarkdown, { requireDisclaimer: true }) },
    newsletter: { ...pack.newsletter, body: newsletterBody, compliance: checkCompliance(`${pack.newsletter.subject}\n${newsletterBody}`, { requireDisclaimer: true }) },
    social,
    videoScript: { ...pack.videoScript, compliance: checkCompliance(`${pack.videoScript.hook}\n${pack.videoScript.script}\n${pack.videoScript.cta}`) },
    guideUrl: guide,
  };
}

export async function generatePack(topic, { extraContext } = {}) {
  const segmentKeys = topic.segments.includes('all') ? Object.keys(business.segments) : topic.segments;
  let raw;
  let source = 'template';
  let model = null;
  let error = null;
  if (aiEnabled()) {
    try {
      const res = await generateJson({
        system: systemPrompt(),
        prompt: userPrompt(topic, segmentKeys, extraContext),
        schema: PACK_SCHEMA,
      });
      raw = res.data;
      source = 'claude';
      model = res.model;
    } catch (err) {
      error = err.message;
      console.error(`[content] Claude generation failed, using template pack: ${err.message}`);
    }
  }
  raw ??= templatePack(topic, segmentKeys);
  return { ...finalizePack(raw, topic), source, model: model || (source === 'claude' ? MODEL : null), error };
}
