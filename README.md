# 🐾 Joy's Diary

A daily-care PWA for Joy the dog — schedule, reminders, and a little gratitude when the day's done.

<p align="center"><img src="icons/joy.jpg" alt="Joy" width="160" /></p>

---

## What it is

An installable home-screen app (iOS / Android / desktop) that shows Joy's daily care schedule — feeding, walks, and other reminders — lets her caretaker tap each task done as the day goes by, sends push notifications at the right times, and shows a thank-you screen once everything's checked off. It also keeps a small "About Joy" handbook with feeding details, walk notes, commands she knows, and emergency contacts.

## Features

- **Today timeline** — feeding, walks, and care reminders sorted by time and grouped into Morning / Afternoon / Evening.
- **Tap-to-toggle** done state, kept per-day in the browser's `localStorage`.
- **Daily progress bar** with a live `X of N done` counter.
- **Thank-you celebration screen** when every task is complete, shown once a day.
- **About Joy** tab — basics, personality, feeding, walks, behaviour when alone, and the commands she knows.
- **Emergency contacts** — owners' numbers and a tap-to-open map link to the vet.
- **PWA onboarding** — guided "Add to Home Screen", "Enable Notifications", and recovery flow if notifications were blocked.
- **Web Push notifications** at scheduled times via VAPID + aes128gcm.
- **Offline-ready** through a cache-first service worker.

## Tech stack

- **Frontend:** vanilla HTML / CSS / JS, PWA manifest + service worker, hosted on Vercel.
- **Push:** a Cloudflare Worker with a 1-minute cron and a KV-stored subscription. A parallel Vercel API path (`api/`) is included as an alternative.
- **Storage:** per-day done state in `localStorage`; push subscription in Cloudflare KV (or Vercel KV).

## Architecture

Static frontend on Vercel. A Cloudflare Worker runs once a minute, checks the current Madrid time, and sends a push if any scheduled item matches. Subscriptions live in Cloudflare KV (`JOY_SUBS`).

## Project structure

```
joys_diary/
├── index.html        # Single-page shell (today + about tabs, overlays)
├── app.js            # Schedule, render, toggle, onboarding, thank-you
├── styles.css        # UI styling
├── sw.js             # Service worker (cache + push handler)
├── manifest.json     # PWA manifest
├── icons/            # Joy avatar, food/walk gallery, PWA icons
├── api/              # Vercel serverless functions
│   ├── subscribe.js
│   ├── push.js
│   ├── test-push.js
│   └── _webpush.js
├── worker/           # Cloudflare Worker (active push sender)
│   ├── src/index.js
│   ├── wrangler.toml
│   └── package.json
└── vercel.json
```

## Using the app (for caretakers)

1. **Install it.** Open the deployed site in Safari (iOS) or Chrome (Android), tap **Share → Add to Home Screen**, then launch it from the home screen. The app's onboarding screen walks through this.
2. **Allow notifications** when prompted — this is what powers the time-of-day reminders. On iOS notifications only work after the PWA has been added to the home screen.
3. **Use the Today tab** to see what Joy needs and when. Tap a card to mark it done; the progress bar fills as you go. When all tasks are checked, you'll get a thank-you screen.
4. **Open the About Joy tab** for feeding details, walks, commands, and emergency contacts (Anton, Anastasiia, vet clinic).

## Running locally (for developers)

1. Clone the repo.
2. Serve the root with any static server, e.g. `npx serve .` or `python3 -m http.server 8080`. Push won't work over plain `http://` — use a Vercel preview or an HTTPS tunnel for end-to-end testing.
3. Update `VAPID_PUBLIC_KEY` and `API_URL` in `app.js` to point at your own keys and deployment.

## Deployment

Three things to wire up:

1. **Generate VAPID keys** with `npx web-push generate-vapid-keys`. You'll need the public key, private key, and a `mailto:` subject.
2. **Deploy the Cloudflare Worker** (`worker/`): create a KV namespace named `JOY_SUBS`, paste its id into `worker/wrangler.toml`, set the VAPID values as worker secrets, then `npx wrangler deploy`. The cron in `wrangler.toml` runs the scheduled handler every minute.
3. **Deploy the frontend on Vercel:** set the VAPID env vars (and `CRON_SECRET` if you also want the Vercel push path), then update `VAPID_PUBLIC_KEY` and `API_URL` in `app.js` to match.

Vendor docs cover the nuances; this project is intentionally small.

## Environment variables

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — push auth, set on both backends.
- `CRON_SECRET` — bearer token for the Vercel `api/push` and `api/test-push` endpoints.

## Customising the schedule

Schedule entries live in `app.js` (what the app displays) and in `worker/src/index.js` (what gets pushed). To change a time or add an item, update both.

## Privacy

- Daily done-state is stored only in the browser (`localStorage` key `joys_diary_done_<date>`); nothing leaves the device.
- Push subscriptions are stored in your own KV namespace.
- `index.html` contains real personal phone numbers and a vet location — keep that in mind if you fork or make the repo public.
