import { kv } from '@vercel/kv';
import { sendWebPush } from './_webpush.js';

const TZ = 'Europe/Madrid';

const SCHEDULE = [
  { id: 'f1', label: 'Breakfast',                            time: '09:00', emoji: '🍖', meta: '30g dry food + wet food (after morning walk)' },
  { id: 'f2', label: 'Lunch',                                time: '14:00', emoji: '🍖', meta: '30g dry food + 2 pumps salmon oil' },
  { id: 'f3', label: 'Dinner',                               time: '20:00', emoji: '🍖', meta: '30g dry food + salmon oil (before last walk)' },
  { id: 'f4', label: 'Refill water bowl',                    time: '09:30', emoji: '💧', meta: 'Rinse & refill with fresh water (2× daily)' },
  { id: 'f5', label: 'Afternoon water refill',               time: '15:00', emoji: '💧', meta: 'Second refill of the day' },
  { id: 'w1', label: 'Morning walk',                         time: '08:30', emoji: '🦮', meta: '10–15 min hygiene walk' },
  { id: 'w2', label: 'Afternoon walk',                       time: '16:30', emoji: '🦮', meta: '30+ min · bring treats (up to 10 pcs)' },
  { id: 'w3', label: 'Evening walk',                         time: '21:00', emoji: '🦮', meta: '10–15 min hygiene walk before bedtime' },
  { id: 'r1', label: 'After morning walk: paws + harness',   time: '09:00', emoji: '🐾', meta: 'Wipe paws · remove harness' },
  { id: 'r2', label: 'After afternoon walk: paws + harness', time: '17:30', emoji: '🐾', meta: 'Wipe paws · remove harness' },
  { id: 'r3', label: 'After evening walk: paws + harness',   time: '21:45', emoji: '🐾', meta: 'Wipe paws · remove harness' },
  { id: 'r4', label: "Wash Joy's bowl",                      time: '20:45', emoji: '🫧', meta: 'After dinner — brush + boiling water (no detergent)' },
  { id: 'r5', label: 'Chewing stick',                        time: '17:00', emoji: '🦴', meta: 'Once every 1–2 days' },
];

export default async function handler(req, res) {
  // Protect endpoint with a secret so only your cron service can trigger it.
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sub = await kv.get('primary');
  if (!sub) return res.status(200).json({ skipped: 'no subscription' });

  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const nowHHMM = fmt.format(new Date());
  const due = SCHEDULE.filter(i => i.time === nowHHMM);

  const results = [];
  for (const item of due) {
    try {
      const r = await sendWebPush(sub, {
        title: `${item.emoji} ${item.label}`,
        body:  item.meta,
        tag:   item.id,
      });
      results.push({ id: item.id, status: r.status });
    } catch (err) {
      results.push({ id: item.id, error: err.message });
    }
  }

  res.status(200).json({ time: nowHHMM, sent: results.length, results });
}
