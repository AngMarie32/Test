// Builds one week's multi-channel content pack from a single topic:
// SEO blog article, newsletter, social posts for each slot and a short-form
// video script. Claude writes it when an API key is configured; otherwise a
// solid template pack is produced so the pipeline never stalls.
import business from '../../config/business.js';
import { aiEnabled, generateJson, MODEL } from '../ai.js';
import { checkCompliance, withDisclaimer } from '../compliance.js';

const CHANNELS = Object.keys(business.channels);

export const PACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['blog', 'newsletter', 'social', 'videoScript'],
  properties: {
    blog: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'slug', 'metaDescription', 'keywords', 'markdown'],
      properties: {
        title: { type: 'string' },
        slug: { type: 'string' },
        metaDescription: { type: 'string' },
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
    `You are the content lead for ${b.name} (${b.tagline}), a US tax practice that serves active traders.`,
    `Voice:\n- ${b.voice.join('\n- ')}`,
    `Services we sell:\n${business.offers.services.map((s) => `- ${s.name} (${s.price})`).join('\n')}`,
    `Lead magnet: ${business.offers.leadMagnet.name} - ${business.offers.leadMagnet.description}`,
    `Primary call to action: ${business.offers.consult.name}.`,
    'Compliance rules (hard requirements):',
    `- Never use these words or claims: ${business.compliance.bannedPhrases.join(', ')}.`,
    '- Never promise a specific outcome or savings. Dollar figures must be framed as illustrative examples ("for example", "could").',
    '- State tax rules accurately for current US federal law; if a rule has conditions, name them. Do not invent IRS forms, deadlines or court cases.',
    '- Do not give individualized advice; point readers to a strategy call for their situation.',
  ].join('\n\n');
}

function userPrompt(topic, segmentKeys, extraContext) {
  const segs = segmentKeys.map((k) => business.segments[k]).filter(Boolean);
  const counts = slotCounts();
  return [
    `Create this week's content pack on the topic: "${topic.title}".`,
    `Angle: ${topic.angle}`,
    segs.length ? `Audience segments:\n${segs.map((s) => `- ${s.label}: pains = ${s.pains.join('; ')}`).join('\n')}` : '',
    extraContext ? `Extra context for this week: ${extraContext}` : '',
    'Deliverables:',
    '1. blog: 900-1300 word SEO article in Markdown with H2/H3 sections, one worked numeric example, a short FAQ (3 questions), and a closing CTA to download the lead magnet and book a strategy call. slug is lowercase-hyphenated. metaDescription max 155 characters. 5-8 keywords.',
    `2. newsletter: plain-text friendly email (Markdown ok), 250-400 words, one idea, one CTA to book a call at {{booking_url}}. Subject under 55 characters.`,
    `3. social: exactly ${Object.entries(counts).map(([c, n]) => `${n} ${c}`).join(', ')} posts. Respect limits: ${Object.entries(business.channels).map(([k, c]) => `${k} <= ${c.maxChars} chars`).join(', ')}. Each post stands alone, opens with a hook, and ends with a CTA to {{site_url}}. No hashtag spam (max 3).`,
    '4. videoScript: 45-60 second vertical video (Reels/Shorts/TikTok). hook = first 3 seconds, script = spoken lines with [on-screen text] cues, cta = closing line.',
  ].filter(Boolean).join('\n\n');
}

export function templatePack(topic, segmentKeys = []) {
  const seg = business.segments[segmentKeys[0]] || business.segments.equities;
  const brand = business.brand;
  const slug = topic.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  const counts = slotCounts();
  const social = [];
  const lines = {
    x: [
      `${seg.hook}\n\nWe broke it down: {{site_url}}`,
      `Trader tax question of the week: ${topic.title}\n\nShort answer: it depends on your facts - here is how to check yours: {{site_url}}`,
      `Most traders find out about this one in April. Get ahead of it now: ${topic.title.split(':')[0]} → {{site_url}}`,
    ],
    linkedin: [
      `${topic.title}\n\n${topic.angle}\n\nIf you trade actively, a 20-minute review of your volume, instruments and setup can show you where you stand. Details: {{site_url}}`,
      `Common pain we hear from ${seg.label.toLowerCase()}: ${seg.pains[0].toLowerCase()}.\n\n${seg.hook}\n\nFree playbook: {{site_url}}`,
    ],
    facebook: [`${seg.hook}\n\nThis week's guide: ${topic.title}\n{{site_url}}`],
    instagram: [`${topic.title}\n\n${seg.hook}\n\nLink in bio for the free Active Trader Tax Playbook.`],
  };
  for (const [channel, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) {
      const pool = lines[channel] || lines.x;
      social.push({ channel, text: pool[i % pool.length] });
    }
  }
  return {
    blog: {
      title: topic.title,
      slug,
      metaDescription: `${topic.angle}`.slice(0, 155),
      keywords: ['trader tax', 'trader tax status', seg.label.toLowerCase(), 'section 475', 'wash sale'],
      markdown: [
        `# ${topic.title}`,
        `## Why this matters for ${seg.label.toLowerCase()}`,
        `${seg.hook}`,
        `## The rule in plain English`,
        `${topic.angle}`,
        `## Common mistakes we see`,
        seg.pains.map((p) => `- ${p}`).join('\n'),
        `## What to do next`,
        `Download **${business.offers.leadMagnet.name}** and book a **${business.offers.consult.name}** at {{booking_url}}.`,
      ].join('\n\n'),
    },
    newsletter: {
      subject: topic.title.length > 55 ? `${topic.title.slice(0, 52)}...` : topic.title,
      preheader: seg.hook.slice(0, 90),
      body: `Hi {{first_name}},\n\n${seg.hook}\n\n${topic.angle}\n\nIf you want us to look at your specific numbers, grab a free strategy call: {{booking_url}}\n\n- The ${brand.name} team`,
    },
    social,
    videoScript: {
      hook: seg.hook.split(' - ')[0],
      script: `[on-screen: ${topic.title.split(':')[0]}]\n${topic.angle}\n[on-screen: Free playbook - link in bio]`,
      cta: 'Follow for one trader tax tip every week, and grab the free playbook.',
    },
  };
}

// Applies placeholders, disclaimers, length limits and the compliance scan.
export function finalizePack(pack) {
  const fill = (t) => String(t)
    .replaceAll('{{site_url}}', `${business.brand.website}${business.offers.leadMagnet.path}`)
    .replaceAll('{{booking_url}}', business.brand.bookingUrl);

  const blogMarkdown = withDisclaimer(fill(pack.blog.markdown));
  const newsletterBody = withDisclaimer(fill(pack.newsletter.body)); // {{first_name}} filled at send time
  const social = pack.social.map((p) => {
    const max = business.channels[p.channel]?.maxChars ?? 280;
    let text = fill(p.text);
    if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`;
    return { ...p, text, compliance: checkCompliance(text) };
  });

  return {
    ...pack,
    blog: { ...pack.blog, markdown: blogMarkdown, compliance: checkCompliance(blogMarkdown, { requireDisclaimer: true }) },
    newsletter: { ...pack.newsletter, body: newsletterBody, compliance: checkCompliance(`${pack.newsletter.subject}\n${newsletterBody}`, { requireDisclaimer: true }) },
    social,
    videoScript: { ...pack.videoScript, compliance: checkCompliance(`${pack.videoScript.hook}\n${pack.videoScript.script}\n${pack.videoScript.cta}`) },
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
  return { ...finalizePack(raw), source, model: model || (source === 'claude' ? MODEL : null), error };
}
