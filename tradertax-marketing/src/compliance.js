// Guardrails for tax marketing content: blocks promissory / misleading claims
// and makes sure the educational disclaimer travels with long-form content.
import business from '../config/business.js';

export function checkCompliance(text, { requireDisclaimer = false } = {}) {
  const issues = [];
  const lower = String(text || '').toLowerCase();
  for (const phrase of business.compliance.bannedPhrases) {
    const re = new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
    if (re.test(lower)) issues.push(`Banned phrase: "${phrase}"`);
  }
  if (/\b(always|never)\s+(owe|pay)\b/.test(lower)) issues.push('Absolute claim about tax owed');
  for (const sentence of lower.split(/(?<=[.!?])\s+|\n+/)) {
    if (/\bsav(e|es|ed|ing)\s+(you\s+)?\$\d/.test(sentence)
        && !/\b(could|may|might|example|illustrat|hypothetical|depending)/.test(sentence)) {
      issues.push(`Unqualified savings promise: "${sentence.trim().slice(0, 80)}"`);
    }
  }
  if (requireDisclaimer && !lower.includes('not tax, legal or investment advice')) {
    issues.push('Missing disclaimer');
  }
  return { ok: issues.length === 0, issues };
}

export function withDisclaimer(text) {
  if (String(text).toLowerCase().includes('not tax, legal or investment advice')) return text;
  return `${text.trim()}\n\n${business.compliance.disclaimer}`;
}
