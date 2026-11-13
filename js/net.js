// 通信：公開MQTTブローカー（WebSocket）を中継に使う。役職などの秘密はECDH＋AES-GCMで暗号化。
// テスト用に BroadcastChannel（同じブラウザのタブ間）モードもある（?t=bc）。

export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const PREFIX = 'moonlit-jinro/v1/';

const rand = (n, chars = 'abcdefghijkmnopqrstuvwxyz23456789') => {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (x) => chars[x % chars.length]).join('');
};
export const newRoomCode = () => rand(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
export const newId = () => rand(12);

function statusHub() {
  const fns = new Set();
  let cur = 'connecting';
  return {
    set(s) { cur = s; fns.forEach((f) => f(s)); },
    get: () => cur,
    on(f) { fns.add(f); f(cur); },
  };
}

function mqttTransport(idx, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    if (!window.mqtt) return reject(new Error('mqtt lib missing'));
    const st = statusHub();
    const subs = new Map();
    let settled = false;
    const c = window.mqtt.connect(BROKERS[idx], {
      clientId: 'mj_' + rand(12), keepalive: 30, reconnectPeriod: 2000, connectTimeout: 8000, clean: true,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; try { c.end(true); } catch {}
      reject(new Error('timeout'));
    }, timeoutMs);
    const dec = new TextDecoder();
    c.on('connect', () => {
      st.set('online');
      if (!settled) { settled = true; clearTimeout(timer); resolve(api); }
    });
    c.on('reconnect', () => st.set('connecting'));
    c.on('offline', () => st.set('offline'));
    c.on('close', () => st.set('offline'));
    c.on('error', () => {});
    c.on('message', (topic, buf) => {
      const cb = subs.get(topic);
      if (!cb || !buf || !buf.length) return;
      let o; try { o = JSON.parse(dec.decode(buf)); } catch { return; }
      cb(o);
    });
    const api = {
      kind: 'mqtt', index: idx, status: st,
      sub(topic, cb) { subs.set(PREFIX + topic, cb); c.subscribe(PREFIX + topic, { qos: 1 }); },
      pub(topic, obj, retain = false) {
        c.publish(PREFIX + topic, obj == null ? '' : JSON.stringify(obj), { qos: 1, retain });
      },
      close() { try { c.end(true); } catch {} },
    };
  });
}

function bcTransport() {
  const st = statusHub();
  const ch = new BroadcastChannel('moonlit-jinro');
  const subs = new Map();
  ch.onmessage = (e) => {
    const { topic, obj } = e.data || {};
    const cb = subs.get(topic);
    if (cb && obj != null) cb(obj);
  };
  setTimeout(() => st.set('online'), 50);
  return {
    kind: 'bc', index: -1, status: st,
    sub(topic, cb) {
      subs.set(topic, cb);
      const r = localStorage.getItem('mjbc:' + topic);
      if (r) setTimeout(() => cb(JSON.parse(r)), 0);
    },
    pub(topic, obj, retain = false) {
      if (retain) {
        if (obj == null) localStorage.removeItem('mjbc:' + topic);
        else localStorage.setItem('mjbc:' + topic, JSON.stringify(obj));
      }
      ch.postMessage({ topic, obj });
    },
    close() { ch.close(); },
  };
}

// broker: 数字なら固定、null ならつながる所を順に試す
export async function connect(mode, broker = null) {
  if (mode === 'bc') return bcTransport();
  if (broker != null && BROKERS[broker]) {
    try { return await mqttTransport(broker, 12000); } catch {}
  }
  for (let i = 0; i < BROKERS.length; i++) {
    if (i === broker) continue;
    try { return await mqttTransport(i); } catch {}
  }
  throw new Error('no broker');
}

/* ---------- 暗号 ---------- */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const EC = { name: 'ECDH', namedCurve: 'P-256' };

export async function makeIdentity() {
  const k = await crypto.subtle.generateKey(EC, true, ['deriveKey']);
  const pub = b64(await crypto.subtle.exportKey('raw', k.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
  return { pub, jwk, priv: k.privateKey };
}
export async function loadIdentity(saved) {
  const priv = await crypto.subtle.importKey('jwk', saved.jwk, EC, true, ['deriveKey']);
  return { pub: saved.pub, jwk: saved.jwk, priv };
}
export async function deriveKey(priv, otherPubB64) {
  const pub = await crypto.subtle.importKey('raw', unb64(otherPubB64), EC, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function unseal(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}
