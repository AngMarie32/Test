// Social publishing via webhook. Point SOCIAL_WEBHOOK_URL (or a per-channel
// SOCIAL_WEBHOOK_URL_X / _LINKEDIN / _FACEBOOK / _INSTAGRAM) at a Zapier, Make,
// n8n or Buffer workflow that posts to the network. Without a URL the post is
// logged as a dry run so you can test the whole pipeline safely.
export async function publishPost(post) {
  const url = process.env[`SOCIAL_WEBHOOK_URL_${post.channel.toUpperCase()}`] || process.env.SOCIAL_WEBHOOK_URL;
  if (!url) {
    console.log(`[social:dry-run] ${post.channel}: ${post.text.slice(0, 80).replace(/\n/g, ' ')}...`);
    return { mode: 'dry-run' };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.SOCIAL_WEBHOOK_SECRET ? { 'X-Webhook-Secret': process.env.SOCIAL_WEBHOOK_SECRET } : {}) },
    body: JSON.stringify({ channel: post.channel, text: post.text, link: post.link || null, postId: post.id, scheduledFor: post.scheduledFor }),
  });
  if (!res.ok) throw new Error(`Social webhook ${res.status}: ${await res.text()}`);
  return { mode: 'webhook', status: res.status };
}
