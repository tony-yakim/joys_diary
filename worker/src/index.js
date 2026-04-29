// Joy's Diary — Web Push backend.
// Cron tick every minute → checks current time in Europe/Madrid → sends a Web
// Push notification to the saved subscription if any schedule item matches.
//
// All crypto uses native crypto.subtle. No npm runtime deps.

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

// ─── HTTP / cron handlers ────────────────────────────────────────────────────

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (req.method === 'POST' && url.pathname === '/subscribe') {
      const sub = await req.json();
      await env.JOY_SUBS.put('primary', JSON.stringify(sub));
      return new Response('ok', { headers: corsHeaders() });
    }

    if (req.method === 'POST' && url.pathname === '/test') {
      // Manual test endpoint — sends a push immediately to the saved sub.
      const sub = JSON.parse((await env.JOY_SUBS.get('primary')) || 'null');
      if (!sub) return new Response('no subscription', { status: 404, headers: corsHeaders() });
      const r = await sendWebPush(sub, {
        title: '🐾 Test from Joy\'s Diary',
        body:  'Push notifications are working!',
        tag:   'test',
      }, env);
      return new Response('sent: ' + r.status, { headers: corsHeaders() });
    }

    return new Response('Joy push worker', { headers: corsHeaders() });
  },

  async scheduled(event, env, ctx) {
    const sub = JSON.parse((await env.JOY_SUBS.get('primary')) || 'null');
    if (!sub) {
      console.log('No subscription saved — skipping cron tick.');
      return;
    }

    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const nowHHMM = fmt.format(new Date());

    const due = SCHEDULE.filter(i => i.time === nowHHMM);
    if (due.length === 0) return;

    console.log(`[${nowHHMM} ${TZ}] sending ${due.length} push(es): ${due.map(i => i.id).join(',')}`);

    for (const item of due) {
      try {
        const r = await sendWebPush(sub, {
          title: `${item.emoji} ${item.label}`,
          body:  item.meta,
          tag:   item.id,
        }, env);
        console.log(`  ${item.id} → ${r.status}`);
      } catch (err) {
        console.error(`  ${item.id} failed:`, err.message);
      }
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// ─── Web Push (RFC 8030 + RFC 8291 aes128gcm + RFC 8292 VAPID) ───────────────

async function sendWebPush(subscription, payload, env) {
  const endpoint    = subscription.endpoint;
  const audience    = new URL(endpoint).origin;
  const clientP256  = b64uDecode(subscription.keys.p256dh); // 65 bytes
  const clientAuth  = b64uDecode(subscription.keys.auth);   // 16 bytes
  const plaintext   = new TextEncoder().encode(JSON.stringify(payload));

  // 1. VAPID JWT (auth, not encryption)
  const jwt = await buildVapidJwt(audience, env);

  // 2. Encrypt payload
  const body = await encryptAes128Gcm(plaintext, clientP256, clientAuth);

  // 3. POST to push service
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type':     'application/octet-stream',
      'Content-Length':   String(body.byteLength),
      'TTL':              '60',
      'Authorization':    `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body,
  });
}

// ─── VAPID: ES256 JWT (RFC 8292) ─────────────────────────────────────────────

async function buildVapidJwt(audience, env) {
  const header = b64uEncode(new TextEncoder().encode(JSON.stringify({
    typ: 'JWT', alg: 'ES256',
  })));
  const claims = b64uEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600, // 12 h
    sub: env.VAPID_SUBJECT,
  })));
  const signingInput = `${header}.${claims}`;

  const privateKey = await importVapidPrivateKey(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);
  const sigBytes   = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput),
  ));

  return `${signingInput}.${b64uEncode(sigBytes)}`;
}

async function importVapidPrivateKey(privB64u, pubB64u) {
  const pub = b64uDecode(pubB64u); // 65 bytes uncompressed (0x04 || x || y)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID public key must be 65-byte uncompressed P-256');
  }
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privB64u,
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
    ext: true,
  };
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  );
}

// ─── Payload encryption: aes128gcm (RFC 8291) ────────────────────────────────

async function encryptAes128Gcm(plaintext, clientP256Raw, clientAuth) {
  // Server ephemeral ECDH keypair
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey)); // 65 b

  // Import client public key
  const clientPubKey = await crypto.subtle.importKey(
    'raw', clientP256Raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, [],
  );

  // ECDH shared secret (32 b)
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPubKey },
    serverKeys.privateKey,
    256,
  ));

  // Step 1: PRK_key = HKDF(salt=auth, ikm=ECDH, info="WebPush: info\0" || ua_pub || as_pub, L=32)
  const keyInfo = concat(
    new TextEncoder().encode('WebPush: info\0'),
    clientP256Raw,
    serverPubRaw,
  );
  const PRK_key = await hkdf(clientAuth, sharedSecret, keyInfo, 32);

  // Step 2: random salt + derive CEK and NONCE
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek   = await hkdf(salt, PRK_key, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, PRK_key, new TextEncoder().encode('Content-Encoding: nonce\0'),     12);

  // Step 3: AES-GCM(cek, nonce, plaintext || 0x02)
  const padded = concat(plaintext, new Uint8Array([0x02]));
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct     = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded));

  // Step 4: assemble body
  // salt(16) || rs(4 BE) || idlen(1) || keyid(65) || ciphertext+tag
  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = 65;
  header.set(serverPubRaw, 21);

  return concat(header, ct);
}

// ─── Crypto helpers ──────────────────────────────────────────────────────────

async function hkdf(salt, ikm, info, lengthBytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    lengthBytes * 8,
  ));
}

function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrs) { out.set(a, offset); offset += a.byteLength; }
  return out;
}

function b64uEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str) {
  const pad = '='.repeat((4 - str.length % 4) % 4);
  const bin = atob((str + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
