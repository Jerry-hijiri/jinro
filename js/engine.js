// オーナーの端末で動く進行役（ゲームの正本）。参加者にはこの端末から状態を配る。
import { ROLE_ORDER, recommend, validate, full, MAX_PLAYERS } from './roles.js';
import { deriveKey, seal, unseal } from './net.js';

export const T = { intro: 10000, morning: 7500, morningDeath: 10500, voteResult: 7000, exec: 9000, nightMin: 4200 };

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const uid = () => Math.random().toString(36).slice(2, 10);

export class Engine {
  constructor(room, net, ident, saved) {
    this.room = room;
    this.net = net;
    this.ident = ident;
    this.aes = new Map();
    this.cache = new Map();
    this.localPid = 'host_' + room.toLowerCase();
    this.localCb = null;
    this.onPublic = null;
    this.s = saved || this.fresh();
    this.timer = null;
  }

  fresh() {
    return {
      phase: 'lobby', day: 0, anim: null, players: [], pubs: {}, nonce: {},
      cfg: recommend(4), cfgAuto: true,
      settings: { discuss: 240, guardTwice: false, deadSee: true, showVotes: true },
      roles: {}, acts: {}, votes: {}, candidates: null, runoffDone: false, lastGuard: null,
      seerLog: {}, mediumLog: [], medPending: null, history: [], winner: null,
      endsAt: null, next: null, ready: [], skip: [], voteResult: null, nightStart: 0,
    };
  }

  async init() {
    for (const [pid, pub] of Object.entries(this.s.pubs)) {
      try { this.aes.set(pid, await deriveKey(this.ident.priv, pub)); } catch {}
    }
    this.net.sub(`${this.room}/in`, (m) => this.onIn(m));
    if (this.s.endsAt && this.s.next) this.arm(Math.max(500, this.s.endsAt - Date.now()), this.s.next);
    this.commit();
  }

  /* ---------- 受信 ---------- */
  async onIn(m) {
    if (!m || typeof m.pid !== 'string' || m.pid.length > 40) return;
    const pid = m.pid;
    if (m.hello) {
      const known = this.s.pubs[pid];
      if (known && known !== m.hello) return;
      if (!known) {
        try { this.aes.set(pid, await deriveKey(this.ident.priv, m.hello)); } catch { return; }
        this.s.pubs[pid] = m.hello;
        this.save();
      }
      this.cache.delete(pid);
      this.sendPriv(pid);
      return;
    }
    if (m.box) {
      const key = this.aes.get(pid);
      if (!key) return;
      let msg;
      try { msg = await unseal(key, m.box); } catch { return; }
      if (typeof msg.n !== 'number' || msg.n <= (this.s.nonce[pid] || 0)) return;
      this.s.nonce[pid] = msg.n;
      this.handle(pid, msg);
    }
  }

  P(pid) { return this.s.players.find((p) => p.id === pid); }
  alive() { return this.s.players.filter((p) => p.alive); }

  uniqueName(name, pid) {
    let n = name, i = 2;
    while (this.s.players.some((p) => p.id !== pid && p.name === n)) n = `${name}${i++}`;
    return n;
  }

  handle(pid, msg) {
    const s = this.s;
    const p = this.P(pid);
    switch (msg.t) {
      case 'join': {
        const name = String(msg.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
        if (!name) return;
        if (p) { p.name = this.uniqueName(name, pid); break; }
        if (s.phase !== 'lobby') { this.cache.delete(pid); this.sendPriv(pid); return; }
        if (s.players.length >= MAX_PLAYERS) return;
        s.players.push({ id: pid, name: this.uniqueName(name, pid), alive: true, host: pid === this.localPid, death: null });
        if (s.cfgAuto) s.cfg = recommend(s.players.length);
        break;
      }
      case 'leave':
        if (s.phase === 'lobby' && p) this.removePlayer(pid);
        break;
      case 'ready':
        if (s.phase !== 'role' || !p || s.ready.includes(pid)) return;
        s.ready.push(pid);
        if (s.players.every((x) => s.ready.includes(x.id))) { this.startNight(1); return; }
        break;
      case 'act': {
        if (s.phase !== 'night' || !p || !p.alive || pid in s.acts) return;
        if (Date.now() - s.nightStart < 1500) return;
        const a = this.actFor(p);
        if (!a.targets.includes(msg.target)) return;
        s.acts[pid] = msg.target;
        if (this.alive().every((x) => x.id in s.acts)) { this.resolveNight(); return; }
        break;
      }
      case 'vote': {
        if (s.phase !== 'vote' || !p || !p.alive || pid in s.votes) return;
        if (!this.voteTargets(pid).includes(msg.target)) return;
        s.votes[pid] = msg.target;
        if (this.alive().every((x) => x.id in s.votes)) { this.tally(); return; }
        break;
      }
      case 'skip': {
        if (s.phase !== 'day' || !p || !p.alive) return;
        const i = s.skip.indexOf(pid);
        if (i >= 0) s.skip.splice(i, 1); else s.skip.push(pid);
        if (s.skip.length > this.alive().length / 2) { this.startVote(); return; }
        break;
      }
      default: return;
    }
    this.commit();
  }

  removePlayer(pid) {
    const s = this.s;
    s.players = s.players.filter((x) => x.id !== pid);
    if (s.cfgAuto) s.cfg = recommend(Math.max(4, s.players.length));
    this.cache.delete(pid);
  }

  /* ---------- オーナー操作 ---------- */
  hostJoin(name) { this.handle(this.localPid, { t: 'join', name }); }
  hostLeave() { if (this.s.phase === 'lobby') { this.removePlayer(this.localPid); this.commit(); } }
  kick(pid) {
    if (this.s.phase !== 'lobby') return;
    this.removePlayer(pid);
    this.sendPrivRaw(pid, { joined: false, kicked: true, phase: 'lobby' });
    this.commit();
  }
  setCfg(role, delta) {
    const s = this.s;
    if (s.phase !== 'lobby') return;
    const c = full(s.cfg);
    c[role] = Math.max(0, Math.min(20, c[role] + delta));
    s.cfg = c; s.cfgAuto = false;
    this.commit();
  }
  applyRec() {
    this.s.cfg = recommend(Math.max(4, this.s.players.length));
    this.s.cfgAuto = true;
    this.commit();
  }
  setSetting(k, v) { if (k in this.s.settings) { this.s.settings[k] = v; this.commit(); } }

  start() {
    const s = this.s;
    if (s.phase !== 'lobby') return false;
    if (validate(s.cfg, s.players.length).length) return false;
    const deck = [];
    for (const r of ROLE_ORDER) for (let i = 0; i < (s.cfg[r] | 0); i++) deck.push(r);
    shuffle(deck);
    s.roles = {};
    shuffle([...s.players]).forEach((p, i) => { s.roles[p.id] = deck[i]; });
    s.players.forEach((p) => { p.alive = true; p.death = null; });
    Object.assign(s, {
      day: 0, acts: {}, votes: {}, candidates: null, runoffDone: false, lastGuard: null,
      seerLog: {}, mediumLog: [], medPending: null, history: [], winner: null,
      ready: [], skip: [], voteResult: null, phase: 'intro',
    });
    this.anim('intro');
    this.arm(T.intro, 'toRole');
    this.commit();
    return true;
  }

  backToLobby() {
    const s = this.s;
    this.clearTimer();
    s.players.forEach((p) => { p.alive = true; p.death = null; });
    Object.assign(s, {
      phase: 'lobby', day: 0, roles: {}, acts: {}, votes: {}, candidates: null, runoffDone: false,
      lastGuard: null, seerLog: {}, mediumLog: [], medPending: null, winner: null, ready: [], skip: [],
      voteResult: null, endsAt: null, next: null, anim: null, history: [],
    });
    this.commit();
  }

  addTime(sec) {
    if (this.s.phase !== 'day' || !this.s.endsAt) return;
    this.arm(this.s.endsAt - Date.now() + sec * 1000, 'startVote');
    this.commit();
  }

  forceNext() {
    const s = this.s;
    switch (s.phase) {
      case 'role': this.startNight(1); return;
      case 'night': this.resolveNight(); return;
      case 'day': this.startVote(); return;
      case 'vote': this.tally(); return;
      default:
        if (s.next) { const n = s.next; this.clearTimer(); this.run(n); }
    }
  }

  /* ---------- 進行 ---------- */
  anim(kind, data = {}) { this.s.anim = { id: uid(), kind, at: Date.now(), ...data }; }

  clearTimer() { clearTimeout(this.timer); this.timer = null; this.s.endsAt = null; this.s.next = null; }
  arm(ms, next) {
    clearTimeout(this.timer);
    this.s.endsAt = Date.now() + ms;
    this.s.next = next;
    this.timer = setTimeout(() => { this.s.endsAt = null; this.s.next = null; this.run(next); }, ms);
  }
  run(name) {
    const f = {
      toRole: () => { this.s.phase = 'role'; this.s.ready = []; this.commit(); },
      afterMorning: () => this.afterMorning(),
      startVote: () => this.startVote(),
      afterVoteResult: () => this.afterVoteResult(),
      afterExec: () => this.afterExec(),
    }[name];
    if (f) f();
  }

  actFor(p) {
    const s = this.s;
    const role = s.roles[p.id];
    const others = this.alive().filter((x) => x.id !== p.id).map((x) => x.id);
    if (role === 'werewolf') return { kind: s.day === 1 ? 'wolfFirst' : 'kill', targets: others.filter((id) => s.roles[id] !== 'werewolf') };
    if (role === 'seer') return { kind: 'divine', targets: others };
    if (role === 'knight' && s.day > 1) return { kind: 'guard', targets: others.filter((id) => s.settings.guardTwice || id !== s.lastGuard) };
    return { kind: 'suspect', targets: others };
  }

  startNight(n) {
    const s = this.s;
    this.clearTimer();
    s.day = n;
    s.phase = 'night';
    s.acts = {};
    s.votes = {};
    s.candidates = null;
    s.runoffDone = false;
    s.voteResult = null;
    s.skip = [];
    s.nightStart = Date.now();
    if (s.medPending) { s.mediumLog.push(s.medPending); s.medPending = null; }
    this.anim('night', { day: n });
    this.commit();
  }

  resolveNight() {
    const s = this.s;
    if (s.phase !== 'night') return;
    const n = s.day;
    const r = s.roles;
    const al = this.alive();
    const deaths = [];
    // 占い
    for (const p of al) {
      if (r[p.id] !== 'seer') continue;
      const tg = s.acts[p.id];
      if (!tg) continue;
      (s.seerLog[p.id] ||= []).push({ day: n, target: tg, res: r[tg] === 'werewolf' ? 'wolf' : 'human' });
      if (r[tg] === 'fox' && !deaths.includes(tg)) deaths.push(tg);
    }
    // 護衛
    let guard = null;
    if (n > 1) {
      for (const p of al) if (r[p.id] === 'knight' && s.acts[p.id]) guard = s.acts[p.id];
      s.lastGuard = guard;
    }
    // 襲撃（初日はなし）
    if (n > 1) {
      const wolves = al.filter((p) => r[p.id] === 'werewolf');
      const tallies = {};
      for (const w of wolves) { const tg = s.acts[w.id]; if (tg) tallies[tg] = (tallies[tg] || 0) + 1; }
      let target = null;
      const keys = Object.keys(tallies);
      if (keys.length) {
        const max = Math.max(...Object.values(tallies));
        target = pick(keys.filter((k) => tallies[k] === max));
      } else if (wolves.length) {
        const cands = al.filter((p) => r[p.id] !== 'werewolf').map((p) => p.id);
        target = cands.length ? pick(cands) : null;
      }
      if (target && target !== guard && r[target] !== 'fox' && !deaths.includes(target)) deaths.unshift(target);
    }
    for (const id of deaths) { const p = this.P(id); p.alive = false; p.death = { day: n, how: 'night' }; }
    shuffle(deaths);
    s.history.push({ day: n, kind: 'night', deaths: [...deaths] });
    s.phase = 'morning';
    s.acts = {};
    this.anim('morning', { day: n, deaths });
    this.arm(deaths.length ? T.morningDeath : T.morning, 'afterMorning');
    this.commit();
  }

  afterMorning() {
    if (this.checkWin()) return;
    const s = this.s;
    s.phase = 'day';
    s.skip = [];
    this.arm(s.settings.discuss * 1000, 'startVote');
    this.commit();
  }

  voteTargets(pid) {
    const s = this.s;
    const base = s.candidates || this.alive().map((p) => p.id);
    const t = base.filter((id) => id !== pid && this.P(id)?.alive);
    return t.length ? t : base;
  }

  startVote() {
    const s = this.s;
    if (s.phase !== 'day' && s.phase !== 'voteResult') return;
    this.clearTimer();
    s.phase = 'vote';
    s.votes = {};
    s.voteResult = null;
    this.commit();
  }

  tally() {
    const s = this.s;
    if (s.phase !== 'vote') return;
    const counts = {};
    for (const v of Object.values(s.votes)) counts[v] = (counts[v] || 0) + 1;
    const keys = Object.keys(counts);
    let top = [];
    if (keys.length) {
      const max = Math.max(...Object.values(counts));
      top = keys.filter((k) => counts[k] === max);
    }
    s.voteResult = { votes: Object.entries(s.votes), counts, top, runoff: !!s.candidates, lot: false, victim: null };
    s.phase = 'voteResult';
    this.arm(T.voteResult, 'afterVoteResult');
    this.commit();
  }

  afterVoteResult() {
    const s = this.s;
    const vr = s.voteResult;
    if (!vr || !vr.top.length) {
      s.history.push({ day: s.day, kind: 'exec', victim: null });
      this.startNight(s.day + 1);
      return;
    }
    if (vr.top.length > 1 && !s.runoffDone) {
      s.runoffDone = true;
      s.candidates = vr.top;
      s.phase = 'day';
      this.startVote();
      return;
    }
    const victim = vr.top.length > 1 ? pick(vr.top) : vr.top[0];
    vr.lot = vr.top.length > 1;
    vr.victim = victim;
    const p = this.P(victim);
    p.alive = false;
    p.death = { day: s.day, how: 'exec' };
    s.medPending = { day: s.day, target: victim, res: s.roles[victim] === 'werewolf' ? 'wolf' : 'human' };
    s.history.push({ day: s.day, kind: 'exec', victim, lot: vr.lot });
    s.phase = 'execution';
    this.anim('exec', { victim, lot: vr.lot });
    this.arm(T.exec, 'afterExec');
    this.commit();
  }

  afterExec() {
    if (this.checkWin()) return;
    this.startNight(this.s.day + 1);
  }

  checkWin() {
    const s = this.s;
    const al = this.alive();
    const w = al.filter((p) => s.roles[p.id] === 'werewolf').length;
    const others = al.length - w;
    let win = null;
    if (w === 0) win = 'village';
    else if (w >= others) win = 'wolf';
    if (win && al.some((p) => s.roles[p.id] === 'fox')) win = 'fox';
    if (!win) return false;
    this.clearTimer();
    s.winner = win;
    s.phase = 'end';
    this.anim('end', { winner: win });
    this.commit();
    return true;
  }

  /* ---------- 配信 ---------- */
  pubState() {
    const s = this.s;
    const ph = s.phase;
    const done = (p) => ph === 'role' ? s.ready.includes(p.id) : ph === 'night' ? p.id in s.acts : ph === 'vote' ? p.id in s.votes : false;
    let vr = null;
    if ((ph === 'voteResult' || ph === 'execution') && s.voteResult) {
      vr = { ...s.voteResult, votes: s.settings.showVotes ? s.voteResult.votes : null };
    }
    return {
      v: 1, room: this.room, hostPub: this.ident.pub, phase: ph, day: s.day, anim: s.anim,
      sentAt: Date.now(), endsIn: s.endsAt ? Math.max(0, s.endsAt - Date.now()) : null,
      players: s.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive, host: !!p.host, death: p.death, done: done(p) })),
      cfg: s.cfg, cfgAuto: s.cfgAuto, settings: s.settings, candidates: s.candidates, voteResult: vr,
      skip: s.skip.length, winner: s.winner, reveal: ph === 'end' ? s.roles : null, history: s.history,
    };
  }

  privState(pid) {
    const s = this.s;
    const p = this.P(pid);
    if (!p) return { joined: false, phase: s.phase };
    const role = s.roles[pid] || null;
    const o = { joined: true, name: p.name, role };
    if (!role || s.phase === 'lobby') { o.role = null; return o; }
    const ids = (r) => s.players.filter((x) => s.roles[x.id] === r).map((x) => x.id);
    if (role === 'werewolf') {
      o.wolves = ids('werewolf');
      if (s.phase === 'night') o.packPicks = Object.fromEntries(o.wolves.map((w) => [w, s.acts[w] ?? null]));
    }
    if (role === 'mason') o.masons = ids('mason');
    if (role === 'seer') o.seerLog = s.seerLog[pid] || [];
    if (role === 'medium') o.mediumLog = s.mediumLog;
    if (s.phase === 'role') o.ready = s.ready.includes(pid);
    if (s.phase === 'night' && p.alive) { o.act = this.actFor(p); o.acted = pid in s.acts; o.actTarget = s.acts[pid] ?? null; }
    if (s.phase === 'vote' && p.alive) { o.voteTargets = this.voteTargets(pid); o.voted = s.votes[pid] ?? null; }
    if (s.phase === 'day') o.skipped = s.skip.includes(pid);
    if (!p.alive && s.settings.deadSee) o.allRoles = s.roles;
    return o;
  }

  sendPriv(pid) { this.sendPrivRaw(pid, this.privState(pid)); }
  async sendPrivRaw(pid, obj) {
    const str = JSON.stringify(obj);
    if (this.cache.get(pid) === str) return;
    this.cache.set(pid, str);
    if (pid === this.localPid) { this.localCb?.(obj); return; }
    const key = this.aes.get(pid);
    if (!key) return;
    const box = await seal(key, obj);
    this.net.pub(`${this.room}/p/${pid}`, box, true);
  }

  commit() {
    this.save();
    const pub = this.pubState();
    this.net.pub(`${this.room}/state`, pub, true);
    this.onPublic?.(pub);
    for (const p of this.s.players) this.sendPriv(p.id);
    if (!this.P(this.localPid)) this.sendPrivRaw(this.localPid, { joined: false, phase: this.s.phase });
  }

  save() {
    try { localStorage.setItem('mj-host-' + this.room, JSON.stringify({ s: this.s, ident: { pub: this.ident.pub, jwk: this.ident.jwk }, mode: this.net.kind, broker: this.net.index })); } catch {}
  }

  // 正しく配れているかの確認用（GMが「役職を表示」したとき）
  rolesFor() { return this.s.roles; }
}
