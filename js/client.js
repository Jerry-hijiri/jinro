// 参加者側：公開状態と自分宛ての秘密（暗号化）を受け取り、操作をオーナーへ送る
import { makeIdentity, loadIdentity, deriveKey, seal, unseal, newId } from './net.js';

let counter = 0;
const nonce = () => Date.now() * 1000 + (counter++ % 1000);

export class Client {
  constructor(room, net, engine = null) {
    this.room = room;
    this.net = net;
    this.engine = engine;
    this.pub = null;
    this.priv = null;
    this.deadline = null;
    this.recvAt = 0;
    this.listeners = new Set();
    this.gotPriv = false;
    this.aes = null;
  }
  on(f) { this.listeners.add(f); }
  emit() { this.listeners.forEach((f) => f()); }

  setPub(pub, local = false) {
    this.pub = pub;
    this.recvAt = Date.now();
    this.deadline = pub.endsIn != null ? Date.now() + pub.endsIn : null;
    this.animAge = (pub.anim ? (pub.sentAt - pub.anim.at) : 0);
    this.emit();
  }

  async start() {
    if (this.engine) {
      const e = this.engine;
      this.pid = e.localPid;
      e.localCb = (priv) => { this.priv = priv; this.gotPriv = true; this.emit(); };
      e.onPublic = (pub) => this.setPub(pub, true);
      return;
    }
    const store = this.net.kind === 'bc' ? sessionStorage : localStorage;
    const key = 'mj-id-' + this.room;
    let saved = null;
    try { saved = JSON.parse(store.getItem(key) || 'null'); } catch {}
    let ident;
    if (saved?.pid && saved?.jwk) {
      try { ident = await loadIdentity(saved); this.pid = saved.pid; } catch { saved = null; }
    }
    if (!ident) {
      ident = await makeIdentity();
      this.pid = newId();
      try { store.setItem(key, JSON.stringify({ pid: this.pid, pub: ident.pub, jwk: ident.jwk })); } catch {}
    }
    this.ident = ident;
    let keyReady;
    this.aesReady = new Promise((r) => { keyReady = r; });
    this.net.sub(`${this.room}/state`, async (st) => {
      if (!st || st.v !== 1) return;
      if (!this.aes || this.hostPub !== st.hostPub) {
        this.hostPub = st.hostPub;
        try { this.aes = await deriveKey(ident.priv, st.hostPub); keyReady(); } catch { return; }
        this.hello();
      }
      this.setPub(st);
    });
    this.net.sub(`${this.room}/p/${this.pid}`, async (box) => {
      await this.aesReady;
      try { this.priv = await unseal(this.aes, box); this.gotPriv = true; } catch { return; }
      this.emit();
    });
    this.helloTimer = setInterval(() => { if (!this.gotPriv && this.aes) this.hello(); }, 3000);
  }

  hello() { this.net.pub(`${this.room}/in`, { pid: this.pid, hello: this.ident.pub }); }

  async send(msg) {
    msg.n = nonce();
    if (this.engine) { this.engine.handle(this.pid, msg); return; }
    await this.aesReady;
    const box = await seal(this.aes, msg);
    this.net.pub(`${this.room}/in`, { pid: this.pid, box });
  }
}
