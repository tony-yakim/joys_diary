// ─── Dog profile ─────────────────────────────────────────────────────────────

const DOG = {
  name: 'Joy',
  breed: 'Golden Retriever',
  age: '2 years',
};

// ─── Schedule ─────────────────────────────────────────────────────────────────

const SCHEDULE = {
  feeding: [
    {
      id: 'f1',
      label: 'Breakfast',
      time: '09:00',
      emoji: '🍖',
      meta: '30g dry food + wet food (after morning walk)',
    },
    {
      id: 'f2',
      label: 'Lunch',
      time: '14:00',
      emoji: '🍖',
      meta: '30g dry food + 2 pumps salmon oil',
    },
    {
      id: 'f3',
      label: 'Dinner',
      time: '20:00',
      emoji: '🍖',
      meta: '30g dry food + salmon oil (before last walk)',
    },
    {
      id: 'f4',
      label: 'Refill water bowl',
      time: '09:30',
      emoji: '💧',
      meta: 'Rinse & refill with fresh water (2× daily)',
    },
    {
      id: 'f5',
      label: 'Afternoon water refill',
      time: '15:00',
      emoji: '💧',
      meta: 'Second refill of the day',
    },
  ],
  walks: [
    {
      id: 'w1',
      label: 'Morning walk',
      time: '08:30',
      emoji: '🦮',
      meta: '10–15 min hygiene walk',
    },
    {
      id: 'w2',
      label: 'Afternoon walk',
      time: '16:30',
      emoji: '🦮',
      meta: '30+ min · bring treats (up to 10 pcs)',
    },
    {
      id: 'w3',
      label: 'Evening walk',
      time: '21:00',
      emoji: '🦮',
      meta: '10–15 min hygiene walk before bedtime',
    },
  ],
  reminders: [
    {
      id: 'r1',
      label: 'After morning walk: paws + harness',
      time: '09:00',
      emoji: '🐾',
      meta: 'Wipe paws · remove harness',
    },
    {
      id: 'r2',
      label: 'After afternoon walk: paws + harness',
      time: '17:30',
      emoji: '🐾',
      meta: 'Wipe paws · remove harness',
    },
    {
      id: 'r3',
      label: 'After evening walk: paws + harness',
      time: '21:45',
      emoji: '🐾',
      meta: 'Wipe paws · remove harness',
    },
    {
      id: 'r4',
      label: 'Wash Joy\'s bowl',
      time: '20:45',
      emoji: '🫧',
      meta: 'After dinner — brush + pour boiling water (no detergent)',
    },
    {
      id: 'r5',
      label: 'Chewing stick',
      time: '17:00',
      emoji: '🦴',
      meta: 'Once every 1–2 days',
    },
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
  return idx === -1; // true = now done
}

// ─── Notification scheduling ──────────────────────────────────────────────────

const snoozedTimers = {};

function msUntil(timeStr, offsetMs = 0) {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  target.setTime(target.getTime() + offsetMs);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

function scheduleNotification(item, offsetMs = 0) {
  if (Notification.permission !== 'granted') return;
  const delay = msUntil(item.time, offsetMs);
  const handle = setTimeout(() => {
    if (!getDoneIds().includes(item.id)) {
      new Notification(`${item.emoji} ${item.label}`, {
        body: item.meta || '',
        icon: '/icons/icon-192.png',
        tag: item.id,
      });
    }
    scheduleNotification(item); // re-schedule daily
  }, delay);
  return handle;
}

function scheduleAll() {
  Object.values(SCHEDULE).flat().forEach(item => scheduleNotification(item));
}

function snooze(item) {
  clearTimeout(snoozedTimers[item.id]);
  snoozedTimers[item.id] = scheduleNotification(item, 15 * 60 * 1000);
}

// ─── Notification permission UI ───────────────────────────────────────────────

function initNotifBanner() {
  const banner = document.getElementById('notif-banner');
  const btn    = document.getElementById('enable-notif-btn');

  if (!('Notification' in window)) {
    banner.querySelector('span').textContent =
      'ℹ️ This browser does not support notifications. Add to Home Screen on iOS 16.4+ for reminders.';
    btn.style.display = 'none';
    return;
  }

  if (Notification.permission === 'granted') {
    banner.classList.add('hidden');
    scheduleAll();
    return;
  }

  if (Notification.permission === 'denied') {
    banner.querySelector('span').textContent =
      '⚠️ Notifications blocked. Go to Settings → Safari → Joy\'s Diary to enable.';
    btn.style.display = 'none';
    return;
  }

  btn.addEventListener('click', () => {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        banner.classList.add('hidden');
        scheduleAll();
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
      <button class="snooze-btn" data-id="${item.id}">+15 min</button>
    </div>
  `;

  card.querySelector('.check-btn').addEventListener('click', () => {
    const nowDone = toggleDone(item.id);
    card.classList.toggle('done', nowDone);
    card.querySelector('.check-btn').classList.toggle('checked', nowDone);
    updateProgress();
  });

  card.querySelector('.snooze-btn').addEventListener('click', () => {
    snooze(item);
    const btn = card.querySelector('.snooze-btn');
    btn.textContent = 'Snoozed!';
    setTimeout(() => { btn.textContent = '+15 min'; }, 2000);
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
