// ─── Config ──────────────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY = 'BGT2JpPfd8prxgKpFS44m1Jd_HkPk0177eaOs1ekuUsjDcOPT2d-pNyPb1ey0m_TSKvXKBKENDZ46CRmLlm1lGI';
const API_URL          = 'https://joys-diary.vercel.app';

// ─── Dog profile ─────────────────────────────────────────────────────────────

const DOG = {
  name: 'Joy',
  age:  '3 years',
};

// ─── Schedule ─────────────────────────────────────────────────────────────────

const SCHEDULE = {
  feeding: [
    { id: 'f6', label: 'Weigh daily dry food',   time: '08:45', emoji: '⚖️', meta: 'Weigh 90g of dry food into the cup — covers all 3 meals (after morning walk, before breakfast)' },
    { id: 'f1', label: 'Breakfast',              time: '09:00', emoji: '🍖', meta: '30g dry food + wet food (after morning walk)' },
    { id: 'f2', label: 'Lunch',                  time: '14:00', emoji: '🍖', meta: '30g dry food + 2 pumps salmon oil' },
    { id: 'f3', label: 'Dinner',                 time: '20:00', emoji: '🍖', meta: '30g dry food + salmon oil (before last walk)' },
    { id: 'f4', label: 'Refill water bowl',      time: '09:30', emoji: '💧', meta: 'Rinse & refill with fresh water (2× daily)' },
    { id: 'f5', label: 'Afternoon water refill', time: '15:00', emoji: '💧', meta: 'Second refill of the day' },
  ],
  walks: [
    { id: 'w1', label: 'Morning walk',   time: '08:30', emoji: '🦮', meta: '10–15 min hygiene walk',                       subtitle: 'After: wipe paws · remove harness' },
    { id: 'w2', label: 'Afternoon walk', time: '16:30', emoji: '🦮', meta: '30+ min · bring treats (up to 10 pcs)',        subtitle: 'After: wipe paws · remove harness' },
    { id: 'w3', label: 'Evening walk',   time: '21:00', emoji: '🦮', meta: '10–15 min hygiene walk before bedtime',        subtitle: 'After: wipe paws · remove harness' },
  ],
  reminders: [
    { id: 'r4', label: "Wash Joy's bowl", time: '20:45', emoji: '🫧', meta: 'After dinner — brush + boiling water (no detergent)' },
    { id: 'r5', label: 'Chewing stick',   time: '17:00', emoji: '🦴', meta: 'Once every 1–2 days' },
  ],
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

// Local YYYY-MM-DD so the day rolls over at the user's midnight, not UTC's.
function localDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return 'joys_diary_done_' + localDateKey();
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
    if (!res.ok) throw new Error('API rejected subscription: ' + res.status);
    console.log('Subscribed to push notifications.');
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
}

// ─── Onboarding overlay ───────────────────────────────────────────────────────

function isInstalledPwa() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

function detectOnboardingState() {
  if (!isInstalledPwa()) return 'install';
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (Notification.permission === 'granted') return null;
  if (Notification.permission === 'denied')  return 'blocked';
  return 'enable';
}

function initOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  const enableBtn = document.getElementById('onboarding-enable-btn');
  const skipBtn   = document.getElementById('onboarding-skip-btn');

  function hide() {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }
  function show(state) {
    overlay.dataset.state = state;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  // If notifications already granted, just (re)subscribe and don't show overlay
  if (isInstalledPwa() && 'Notification' in window && Notification.permission === 'granted') {
    subscribeToPush();
    return;
  }

  const state = detectOnboardingState();
  if (!state) return;
  show(state);

  enableBtn.addEventListener('click', async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        await subscribeToPush();
        hide();
      } else {
        // user denied — switch overlay to blocked state
        show('blocked');
      }
    } catch (err) {
      console.error('Permission request failed:', err);
    }
  });

  skipBtn.addEventListener('click', hide);
}

// ─── Render cards ─────────────────────────────────────────────────────────────

function buildCard(item, doneIds) {
  const done = doneIds.includes(item.id);
  const card = document.createElement('div');
  card.className = 'card' + (done ? ' done' : '');
  card.id = 'card-' + item.id;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Toggle ${item.label} done`);
  card.setAttribute('aria-pressed', done ? 'true' : 'false');
  card.innerHTML = `
    <div class="card-emoji">${item.emoji}</div>
    <div class="card-body">
      <div class="card-label">${item.label}</div>
      ${item.subtitle ? `<div class="card-subtitle">${item.subtitle}</div>` : ''}
      <div class="card-meta">${item.time}${item.meta ? ' · ' + item.meta : ''}</div>
    </div>
    <div class="card-actions">
      <div class="check-indicator${done ? ' checked' : ''}" aria-hidden="true">✓</div>
    </div>
  `;

  function toggle() {
    const nowDone = toggleDone(item.id);
    card.classList.toggle('done', nowDone);
    card.querySelector('.check-indicator').classList.toggle('checked', nowDone);
    card.setAttribute('aria-pressed', nowDone ? 'true' : 'false');
    updateProgress();
  }

  card.addEventListener('click', toggle);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  return card;
}

function buildDivider(label) {
  const el = document.createElement('div');
  el.className = 'timeline-divider';
  el.textContent = label;
  return el;
}

function timeOfDay(timeStr) {
  const h = parseInt(timeStr.slice(0, 2), 10);
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const DIVIDER_LABELS = {
  morning:   '☀️ Morning',
  afternoon: '🌤 Afternoon',
  evening:   '🌙 Evening',
};

let renderedDateKey = null;

function renderTimeline() {
  const container = document.getElementById('timeline');
  container.innerHTML = '';
  const items = [...SCHEDULE.feeding, ...SCHEDULE.walks, ...SCHEDULE.reminders]
    .sort((a, b) => a.time.localeCompare(b.time));
  const doneIds = getDoneIds();

  let lastBucket = null;
  for (const item of items) {
    const bucket = timeOfDay(item.time);
    if (bucket !== lastBucket) {
      container.appendChild(buildDivider(DIVIDER_LABELS[bucket]));
      lastBucket = bucket;
    }
    container.appendChild(buildCard(item, doneIds));
  }
  renderedDateKey = localDateKey();
  updateProgress();
}

// If the local date has changed since we last rendered, redraw so checks reset.
function checkDayRollover() {
  if (renderedDateKey && renderedDateKey !== localDateKey()) {
    renderTimeline();
  }
}

// Schedule a re-render shortly after the next local midnight, then loop.
function scheduleMidnightRollover() {
  const now = new Date();
  const next = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0,
  );
  setTimeout(() => {
    checkDayRollover();
    scheduleMidnightRollover();
  }, next.getTime() - now.getTime());
}

function updateProgress() {
  const items   = [...SCHEDULE.feeding, ...SCHEDULE.walks, ...SCHEDULE.reminders];
  const doneIds = getDoneIds();
  const count   = items.filter(i => doneIds.includes(i.id)).length;
  const pct     = items.length ? Math.round((count / items.length) * 100) : 0;
  document.getElementById('today-progress').style.width = pct + '%';
  document.getElementById('today-progress-label').textContent =
    `${count} of ${items.length} done`;

  if (count === items.length && items.length > 0) {
    maybeShowThanks(items.length);
  }
}

// ─── Thank you overlay ────────────────────────────────────────────────────────

function thanksKey() {
  return 'joys_diary_thanks_shown_' + localDateKey();
}

function wasThanksShownToday() {
  return localStorage.getItem(thanksKey()) === '1';
}

function markThanksShownToday() {
  localStorage.setItem(thanksKey(), '1');
}

function maybeShowThanks(totalTasks) {
  if (wasThanksShownToday()) return;
  const overlay = document.getElementById('thanks-overlay');
  if (!overlay || !overlay.classList.contains('hidden')) return;
  const body = document.getElementById('thanks-body');
  if (body) {
    body.textContent =
      `All ${totalTasks} tasks done today — Joy is happy, well-fed, and loved.`;
  }
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  markThanksShownToday();
}

function initThanks() {
  const overlay = document.getElementById('thanks-overlay');
  const closeBtn = document.getElementById('thanks-close-btn');
  if (!overlay || !closeBtn) return;

  function hide() {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  closeBtn.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
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
  initThanks();
  renderTimeline();
  initTabs();
  initOnboarding();
  scheduleMidnightRollover();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkDayRollover();
  });
});
