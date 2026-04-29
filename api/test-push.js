import { kv } from '@vercel/kv';
import { sendWebPush } from './_webpush.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const subs = (await kv.get('subs')) || [];
  if (subs.length === 0) return res.status(404).json({ error: 'No subscriptions saved' });

  const stillValid = [];
  const results = [];
  for (const sub of subs) {
    try {
      const r = await sendWebPush(sub, {
        title: '🐾 Test from Joy\'s Diary',
        body:  'Push notifications are working!',
        tag:   'test',
      });
      results.push({ status: r.status });
      if (r.status !== 404 && r.status !== 410) stillValid.push(sub);
    } catch (err) {
      results.push({ error: err.message });
      stillValid.push(sub);
    }
  }

  if (stillValid.length !== subs.length) {
    await kv.set('subs', stillValid);
  }

  res.status(200).json({ devices: subs.length, kept: stillValid.length, results });
}
