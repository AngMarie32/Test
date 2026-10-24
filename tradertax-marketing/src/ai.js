// Claude client for the content engine. Uses structured outputs so every
// response is schema-valid JSON, and opts into server-side refusal fallbacks.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'medium';
const USE_FALLBACKS = process.env.CLAUDE_FALLBACKS !== 'false';

let client;
export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient() {
  client ??= new Anthropic();
  return client;
}

// Returns the parsed JSON object matching `schema`.
export async function generateJson({ system, prompt, schema, maxTokens = 16000 }) {
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  };

  const response = USE_FALLBACKS
    ? await getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await getClient().messages.create(params);

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declined the request (${response.stop_details?.category ?? 'no category'})`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude output hit max_tokens before finishing the content pack');
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { data: JSON.parse(text), model: response.model, usage: response.usage };
}
