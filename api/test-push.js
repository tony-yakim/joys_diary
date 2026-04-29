import { kv } from '@vercel/kv';
import { sendWebPush } from './_webpush.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sub = await kv.get('primary');
  if (!sub) return res.status(404).json({ error: 'No subscription saved' });

  const r = await sendWebPush(sub, {
    title: '🐾 Test from Joy\'s Diary',
    body:  'Push notifications are working!',
    tag:   'test',
  });

  res.status(200).json({ status: r.status });
}
