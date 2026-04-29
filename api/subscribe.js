import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

  const subs = (await kv.get('subs')) || [];
  const deduped = subs.filter(s => s.endpoint !== sub.endpoint);
  deduped.push(sub);
  await kv.set('subs', deduped);

  res.status(200).json({ ok: true, total: deduped.length });
}
