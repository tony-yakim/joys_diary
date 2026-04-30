// Web Push encryption: RFC 8291 (aes128gcm) + RFC 8292 (VAPID / ES256)
// Uses globalThis.crypto.subtle — works in Node 18+ and Vercel edge runtimes.

export async function sendWebPush(subscription, payload) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  const endpoint   = subscription.endpoint;
  const audience   = new URL(endpoint).origin;
  const clientP256 = b64uDecode(subscription.keys.p256dh);
  const clientAuth = b64uDecode(subscription.keys.auth);
  const plaintext  = new TextEncoder().encode(JSON.stringify(payload));

  const jwt  = await buildVapidJwt(audience, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT);
  const body = await encryptAes128Gcm(plaintext, clientP256, clientAuth);

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type':     'application/octet-stream',
      'Content-Length':   String(body.byteLength),
      'TTL':              '60',
      'Urgency':          'high',
      'Authorization':    `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    },
    body,
  });
}

// ─── VAPID JWT (ES256) ────────────────────────────────────────────────────────

async function buildVapidJwt(audience, privB64u, pubB64u, subject) {
  const header = b64uEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const input = `${header}.${claims}`;
  const key   = await importVapidPrivate(privB64u, pubB64u);
  const sig   = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input),
  ));
  return `${input}.${b64uEncode(sig)}`;
}

async function importVapidPrivate(privB64u, pubB64u) {
  const pub = b64uDecode(pubB64u);
  return crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', ext: true,
    d: privB64u,
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// ─── Payload encryption (aes128gcm, RFC 8291) ─────────────────────────────────

async function encryptAes128Gcm(plaintext, clientP256Raw, clientAuth) {
  const serverKeys  = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPub   = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const clientPub   = await crypto.subtle.importKey('raw', clientP256Raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPub }, serverKeys.privateKey, 256));

  const PRK_key = await hkdf(clientAuth, sharedSecret,
    concat(new TextEncoder().encode('WebPush: info\0'), clientP256Raw, serverPub), 32);

  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const cek   = await hkdf(salt, PRK_key, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, PRK_key, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct     = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, concat(plaintext, new Uint8Array([0x02]))));

  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = 65;
  header.set(serverPub, 21);
  return concat(header, ct);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.byteLength, 0));
  let offset = 0;
  for (const a of arrs) { out.set(a, offset); offset += a.byteLength; }
  return out;
}

export function b64uEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  const pad = '='.repeat((4 - str.length % 4) % 4);
  const bin = atob((str + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
