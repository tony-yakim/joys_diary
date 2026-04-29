// ─── Config ──────────────────────────────────────────────────────────────────
// Paste these after deploying the Cloudflare Worker.

const VAPID_PUBLIC_KEY = 'BGT2JpPfd8prxgKpFS44m1Jd_HkPk0177eaOs1ekuUsjDcOPT2d-pNyPb1ey0m_TSKvXKBKENDZ46CRmLlm1lGI';
const API_URL          = 'https://joys-diary.vercel.app';

// ─── Dog profile ─────────────────────────────────────────────────────────────

const DOG = {
  name: 'Joy',
  breed: 'Golden Retriever',
  age: '2 years',
};

// ─── Schedule ─────────────────────────────────────────────────────────────────

const SCHEDULE = {
  feeding: [
    { id: 'f1', label: 'Breakfast',              time: '09:00', emoji: '🍖', meta: '30g dry food + wet food (after morning walk)' },
    { id: 'f2', label: 'Lunch',                  time: '14:00', emoji: '🍖', meta: '30g dry food + 2 pumps salmon oil' },
    { id: 'f3', label: 'Dinner',                 time: '20:00', emoji: '🍖', meta: '30g dry food + salmon oil (before last walk)' },
    { id: 'f4', label: 'Refill water bowl',      time: '09:30', emoji: '💧', meta: 'Rinse & refill with fresh water (2× daily)' },
    { id: 'f5', label: 'Afternoon water refill', time: '15:00', emoji: '💧', meta: 'Second refill of the day' },
  ],
  walks: [
    { id: 'w1', label: 'Morning walk',   time: '08:30', emoji: '🦮', meta: '10–15 min hygiene walk' },
    { id: 'w2', label: 'Afternoon walk', time: '16:30', emoji: '🦮', meta: '30+ min · bring treats (up to 10 pcs)' },
    { id: 'w3', label: 'Evening walk',   time: '21:00', emoji: '🦮', meta: '10–15 min hygiene walk before bedtime' },
  ],
  reminders: [
    { id: 'r1', label: 'After morning walk: paws + harness',   time: '09:00', emoji: '🐾', meta: 'Wipe paws · remove harness' },
    { id: 'r2', label: 'After afternoon walk: paws + harness', time: '17:30', emoji: '🐾', meta: 'Wipe paws · remove harness' },
    { id: 'r3', label: 'After evening walk: paws + harness',   time: '21:45', emoji: '🐾', meta: 'Wipe paws · remove harness' },
    { id: 'r4', label: 'Wash Joy\'s bowl',                     time: '20:45', emoji: '🫧', meta: 'After dinner — brush + boiling water (no detergent)' },
    { id: 'r5', label: 'Chewing stick',                        time: '17:00', emoji: '🦴', meta: 'Once every 1–2 days' },
  ],
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

function todayKey() {
  return 'joys_diary_done_' + new Date().toISOString().slice(0, 10);
}

function getDoneIds() {
  try { return JSON.parse(localStorage.getItem(todayKey()) || '[]'); }
  catch { return []; }
}

function setDoneIds(ids) {
  localStorage.setItem(todayKey(), JSON.stringify(ids));
}

function toggleDone(id) {
  const ids = getDoneIds();
  const idx = ids.indexOf(id);
  if (idx === -1) ids.push(id);
  else ids.splice(idx, 1);
  setDoneIds(ids);
  return idx === -1;
}

// ─── Web Push subscription ────────────────────────────────────────────────────

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribeToPush() {
  if (!VAPID_PUBLIC_KEY || !API_URL) {
    console.warn('VAPID_PUBLIC_KEY / API_URL not configured yet — push will not work.');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const res = await fetch(API_URL + '/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    if (!res.ok) throw new Error('Worker rejected subscription: ' + res.status);
    console.log('Subscribed to push notifications.');
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
}

// ─── Notification permission UI ───────────────────────────────────────────────

function initNotifBanner() {
  const banner = document.getElementById('notif-banner');
  const btn    = document.getElementById('enable-notif-btn');

  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    banner.querySelector('span').textContent =
      'ℹ️ Push notifications need iOS 16.4+. Add to Home Screen, then reopen.';
    btn.style.display = 'none';
    return;
  }

  if (Notification.permission === 'granted') {
    banner.classList.add('hidden');
    subscribeToPush();
    return;
  }

  if (Notification.permission === 'denied') {
    banner.querySelector('span').textContent =
      '⚠️ Notifications blocked. Go to Settings → Notifications → Joy\'s Diary to enable.';
    btn.style.display = 'none';
    return;
  }

  btn.addEventListener('click', () => {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        banner.classList.add('hidden');
        subscribeToPush();
      } else {
        banner.querySelector('span').textContent =
          '⚠️ Notifications blocked. Enable them in device Settings.';
        btn.style.display = 'none';
      }
    });
  });
}

// ─── Render cards ─────────────────────────────────────────────────────────────

function buildCard(item, doneIds) {
  const done = doneIds.includes(item.id);
  const card = document.createElement('div');
  card.className = 'card' + (done ? ' done' : '');
  card.id = 'card-' + item.id;
  card.innerHTML = `
    <div class="card-emoji">${item.emoji}</div>
    <div class="card-body">
      <div class="card-label">${item.label}</div>
      <div class="card-meta">${item.time}${item.meta ? ' · ' + item.meta : ''}</div>
    </div>
    <div class="card-actions">
      <button class="check-btn${done ? ' checked' : ''}" data-id="${item.id}" aria-label="Mark done">✓</button>
    </div>
  `;

  card.querySelector('.check-btn').addEventListener('click', () => {
    const nowDone = toggleDone(item.id);
    card.classList.toggle('done', nowDone);
    card.querySelector('.check-btn').classList.toggle('checked', nowDone);
    updateProgress();
  });

  return card;
}

function renderSection(tabName) {
  const items   = SCHEDULE[tabName];
  const doneIds = getDoneIds();
  const list    = document.getElementById('list-' + tabName);
  list.innerHTML = '';
  items.forEach(item => list.appendChild(buildCard(item, doneIds)));
  updateProgress();
}

function updateProgress() {
  const doneIds = getDoneIds();
  ['feeding', 'walks', 'reminders'].forEach(tab => {
    const items = SCHEDULE[tab];
    const count = items.filter(i => doneIds.includes(i.id)).length;
    const pct   = items.length ? Math.round((count / items.length) * 100) : 0;
    document.getElementById(tab + '-progress').style.width = pct + '%';
    document.getElementById(tab + '-progress-label').textContent =
      `${count} of ${items.length} done`;
  });
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('section-' + tab).classList.add('active');
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  renderSection('feeding');
  renderSection('walks');
  renderSection('reminders');
  initTabs();
  initNotifBanner();
});
