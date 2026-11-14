// オーナーの端末で動く進行役（ゲームの正本）。参加者にはこの端末から状態を配る。
import { ROLE_ORDER, ROLES, recommend, randomBalanced, validate, full, points, balance, MAX_PLAYERS } from './roles.js';
import { deriveKey, seal, unseal } from './net.js';

export const T = { shot: 7000, hunter: 30000, intro: 16500, morning: 7500, morningDeath: 17500, voteResult: 7000, exec: 15000, nightMin: 4200 };

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
    this.s.scores ||= {};
    this.s.ownerToken ||= uid() + uid();
    if (this.s.settings && !('gore' in this.s.settings)) this.s.settings.gore = true;
    this.s.round ||= 0;
    this.timer = null;
    this.botTimers = new Map();
  }

  fresh() {
    return {
      phase: 'lobby', day: 0, anim: null, players: [], pubs: {}, nonce: {},
      cfg: recommend(4), cfgAuto: true,
      settings: { discuss: 240, guardTwice: false, deadSee: true, showVotes: true, gore: true },
      roles: {}, acts: {}, votes: {}, candidates: null, runoffDone: false, lastGuard: null,
      seerLog: {}, mediumLog: [], medPending: null, history: [], winner: null,
      endsAt: null, next: null, ready: [], skip: [], voteResult: null, nightStart: 0,
      scores: {}, round: 0, lastResult: null, pts: null,
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
        const isOwner = typeof msg.owner === 'string' && msg.owner === s.ownerToken;
        if (p) { p.name = this.uniqueName(name, pid); if (isOwner) p.owner = true; break; }
        if (s.phase !== 'lobby') { this.cache.delete(pid); this.sendPriv(pid); return; }
        if (s.players.length >= MAX_PLAYERS) return;
        s.players.push({ id: pid, name: this.uniqueName(name, pid), alive: true, host: pid === this.localPid, owner: isOwner, death: null });
        if (s.cfgAuto) s.cfg = randomBalanced(Math.max(4, s.players.length), s.cfg);
        break;
      }
      case 'host': {
        if (!p?.owner) return;
        const f = { start: () => this.start(), toVote: () => this.startVote(), addMin: () => this.addTime(60), force: () => this.forceNext(), lobby: () => this.backToLobby(), rec: () => this.applyRec() }[msg.cmd];
        if (f) f();
        return;
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
        this.instantResult(p, a.kind, s.acts[pid]);
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
      case 'shoot': {
        if (s.phase !== 'hunter' || s.hunter?.pid !== pid) return;
        if (!this.P(msg.target)?.alive) return;
        this.shoot(msg.target);
        return;
      }
      case 'poop': {
        // 死んだ人のお遊び：全員の画面にうんこを流す（連打防止で4秒に1回）
        if (!p || p.alive || s.phase === 'lobby') return;
        this.poopAt ||= {};
        if (Date.now() - (this.poopAt[pid] || 0) < 4000) return;
        this.poopAt[pid] = Date.now();
        s.fun = { id: uid(), kind: 'poop', from: pid, at: Date.now() };
        break;
      }
      case 'bet': {
        // 死んだ人の賭け：勝つ陣営に自分の点数を賭ける（1試合1回・変更不可）
        if (!p || p.alive || s.phase === 'lobby' || s.phase === 'end') return;
        s.bets ||= {};
        if (s.bets[pid]) return;
        const info = this.betInfo(pid);
        const side = info.sides.find((x) => x.side === msg.side);
        const amount = Math.floor(Number(msg.amount));
        if (!side || !(amount >= 1 && amount <= info.max)) return;
        s.bets[pid] = { side: side.side, amount, mult: side.mult };
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
    if (s.cfgAuto) s.cfg = randomBalanced(Math.max(4, s.players.length), s.cfg);
    this.cache.delete(pid);
  }

  /* ---------- CPU ---------- */
  addBot() {
    const s = this.s;
    if (s.phase !== 'lobby' || s.players.length >= MAX_PLAYERS) return;
    const NAMES = ['ルナ', 'ガロ', 'ミラ', 'ソラ', 'ジン', 'ノア', 'レン', 'ユキ', 'カイ', 'リオ', 'ハル', 'サキ', 'トワ', 'エマ', 'ロイ', 'ニナ'];
    const used = new Set(s.players.map((p) => p.name));
    const base = NAMES.find((n) => !used.has('CPU ' + n)) || String(s.players.length + 1);
    s.players.push({ id: 'cpu_' + uid(), name: 'CPU ' + base, alive: true, host: false, bot: true, death: null });
    if (s.cfgAuto) s.cfg = randomBalanced(Math.max(4, s.players.length), s.cfg);
    this.commit();
  }

  botLater(key, ms, fn) {
    if (this.botTimers.has(key)) return;
    this.botTimers.set(key, setTimeout(() => { this.botTimers.delete(key); fn(); }, ms));
  }

  botTick() {
    const s = this.s;
    const bots = s.players.filter((p) => p.bot);
    if (!bots.length) return;
    const r = s.roles;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const k = (id) => `${s.phase}:${s.day}:${s.candidates ? 'r' : ''}:${id}`;
    for (const b of bots) {
      if (s.phase === 'role' && !s.ready.includes(b.id)) {
        this.botLater(k(b.id), rnd(1500, 3500), () => this.handle(b.id, { t: 'ready' }));
      }
      if (!b.alive) continue;
      if (s.phase === 'night' && !(b.id in s.acts)) {
        const wait = Math.max(0, s.nightStart + 4800 - Date.now()) + rnd(1200, 4500);
        this.botLater(k(b.id), wait, () => {
          if (this.s.phase !== 'night') return;
          const a = this.actFor(b);
          if (!a.targets.length) return;
          let tg = pick(a.targets);
          if (r[b.id] === 'werewolf') {
            const mate = Object.entries(this.s.acts).find(([w, x]) => w !== b.id && r[w] === 'werewolf' && x);
            if (mate && a.targets.includes(mate[1])) tg = mate[1];
          }
          if (r[b.id] === 'seer') {
            const seen = new Set((this.s.seerLog[b.id] || []).map((x) => x.target));
            const fresh = a.targets.filter((x) => !seen.has(x));
            if (fresh.length) tg = pick(fresh);
          }
          this.handle(b.id, { t: 'act', target: tg });
        });
      }
      if (s.phase === 'day' && !s.skip.includes(b.id)) {
        this.botLater(k(b.id), rnd(12000, 30000), () => { if (this.s.phase === 'day' && !this.s.skip.includes(b.id)) this.handle(b.id, { t: 'skip' }); });
      }
      if (s.phase === 'hunter' && s.hunter?.pid === b.id) {
        this.botLater(k(b.id), rnd(2500, 5000), () => { const al = this.alive(); if (this.s.phase === 'hunter' && al.length) this.shoot(pick(al).id); });
      }
      if (s.phase === 'vote' && !(b.id in s.votes)) {
        this.botLater(k(b.id), rnd(1500, 5000), () => {
          if (this.s.phase !== 'vote') return;
          const tgs = this.voteTargets(b.id);
          let opts = tgs;
          if (r[b.id] === 'werewolf') opts = tgs.filter((x) => r[x] !== 'werewolf');
          const black = (this.s.seerLog[b.id] || []).find((x) => x.res === 'wolf' && tgs.includes(x.target));
          if (black) opts = [black.target];
          this.handle(b.id, { t: 'vote', target: pick(opts.length ? opts : tgs) });
        });
      }
    }
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
    // 押すたびに、今の参加人数でつり合いの取れた構成をランダムに作る
    this.s.cfg = randomBalanced(Math.max(4, this.s.players.length), this.s.cfg);
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
      seerLog: {}, mediumLog: [], medPending: null, medNow: null, nightResult: {}, history: [], winner: null, lovers: null, bets: {}, fun: null, hunter: null, hunterUsed: [],
      ready: [], skip: [], voteResult: null, phase: 'intro',
    });
    s.pts = points(s.cfg);
    s.odds = balance(s.cfg);
    s.gameId = this.room + '-' + Date.now().toString(36); s.reported = false;
    s.bets = {};
    this.anim('intro', { cfg: s.cfg });
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
      voteResult: null, endsAt: null, next: null, anim: null, history: [], lovers: null,
    });
    this.commit();
  }

  ranks(ids, sc) {
    const sorted = [...ids].sort((a, b) => (sc[b] || 0) - (sc[a] || 0));
    const r = {};
    sorted.forEach((id, i) => { r[id] = i > 0 && (sc[id] || 0) === (sc[sorted[i - 1]] || 0) ? r[sorted[i - 1]] : i + 1; });
    return r;
  }

  applyScores(win) {
    const s = this.s;
    const pts = s.pts || points(s.cfg);
    const ids = s.players.map((p) => p.id);
    const before = Object.fromEntries(ids.map((id) => [id, s.scores[id] || 0]));
    const prevRank = this.ranks(ids, before);
    const deltas = {};
    for (const id of ids) {
      const team = s.lovers?.includes(id) ? 'lovers' : ROLES[s.roles[id]]?.team;
      if (!team || !pts?.[team]) { deltas[id] = 0; continue; }
      const won = team === win;
      const after = Math.max(0, before[id] + (won ? pts[team].win : -pts[team].lose));
      deltas[id] = after - before[id];
      s.scores[id] = after;
    }
    // 賭けの精算（当たり＝賭け点×倍率、外れ＝賭け点を失う。0点より下にはならない）
    const betRes = {};
    for (const [id, b] of Object.entries(s.bets || {})) {
      if (!ids.includes(id)) continue;
      const cur = s.scores[id] || 0;
      const d = b.side === win ? Math.round(b.amount * b.mult) : -b.amount;
      const after = Math.max(0, cur + d);
      betRes[id] = { ...b, won: b.side === win, delta: after - cur };
      deltas[id] = (deltas[id] || 0) + (after - cur);
      s.scores[id] = after;
    }
    s.round += 1;
    s.lastResult = { round: s.round, deltas, prevRank, rank: this.ranks(ids, s.scores), winner: win, bets: betRes };
  }

  resetScores() {
    if (this.s.phase !== 'lobby') return;
    this.s.scores = {};
    this.s.round = 0;
    this.s.lastResult = null;
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
      case 'hunter': this.shoot(null); return;
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
      hunterTimeout: () => this.shoot(null),
      afterShot: () => this.afterShot(),
    }[name];
    if (f) f();
  }

  actFor(p) {
    const s = this.s;
    const role = s.roles[p.id];
    const others = this.alive().filter((x) => x.id !== p.id).map((x) => x.id);
    if (role === 'werewolf') return { kind: s.day === 1 ? 'wolfFirst' : 'kill', targets: others.filter((id) => s.roles[id] !== 'werewolf') };
    if (role === 'cupid' && s.day === 1) return { kind: 'cupid', targets: others };
    if (role === 'seer') return { kind: 'divine', targets: others };
    if (role === 'medium' && s.medNow) return { kind: 'medium', targets: [s.medNow.target] };
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
    s.medNow = s.medPending || null;
    s.medPending = null;
    s.nightResult = {};
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
      if (!(s.seerLog[p.id] || []).some((x) => x.day === n)) (s.seerLog[p.id] ||= []).push({ day: n, target: tg, res: r[tg] === 'werewolf' ? 'wolf' : 'human' });
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
    // キューピッド（初日の夜に恋人を決める）
    if (n === 1 && !s.lovers) {
      for (const p of al) if (r[p.id] === 'cupid' && typeof s.acts[p.id] === 'string') s.lovers = [p.id, s.acts[p.id]];
    }
    for (const id of deaths) { const p = this.P(id); p.alive = false; p.death = { day: n, how: 'night' }; }
    // 恋人の後追い
    for (const id of [...deaths]) {
      const mate = this.loverOf(id);
      if (mate && this.P(mate)?.alive) { const q = this.P(mate); q.alive = false; q.death = { day: n, how: 'love' }; deaths.push(mate); }
    }
    shuffle(deaths);
    // パン屋：生きていれば毎朝パンが届く
    const hasBaker = s.players.some((x) => r[x.id] === 'baker');
    const bread = hasBaker ? s.players.some((x) => r[x.id] === 'baker' && x.alive) : null;
    s.history.push({ day: n, kind: 'night', deaths: [...deaths], bread });
    s.phase = 'morning';
    s.acts = {};
    this.anim('morning', { day: n, deaths, bread });
    this.arm(deaths.length ? T.morningDeath : T.morning, 'afterMorning');
    this.commit();
  }

  // 狩人：死んだ狩人がいれば、道連れを選ぶ時間をはさむ
  hunterCheck(from) {
    const s = this.s;
    s.hunterUsed ||= [];
    const h = s.players.find((p) => !p.alive && s.roles[p.id] === 'hunter' && !s.hunterUsed.includes(p.id));
    if (!h) return false;
    s.hunterUsed.push(h.id);
    s.hunter = { pid: h.id, from };
    s.phase = 'hunter';
    this.arm(T.hunter, 'hunterTimeout');
    this.commit();
    return true;
  }

  shoot(target) {
    const s = this.s;
    if (s.phase !== 'hunter' || !s.hunter) return;
    const from = s.hunter.from;
    const by = s.hunter.pid;
    this.clearTimer();
    let follow = null;
    if (target && this.P(target)?.alive) {
      const q = this.P(target); q.alive = false; q.death = { day: s.day, how: 'hunter' };
      const mate = this.loverOf(target);
      if (mate && this.P(mate)?.alive) { const m = this.P(mate); m.alive = false; m.death = { day: s.day, how: 'love' }; follow = mate; }
    } else target = null;
    s.history.push({ day: s.day, kind: 'shot', by, victim: target, follow });
    s.hunter = null;
    s.phase = 'shot';
    s.shotFrom = from;
    this.anim('shot', { by, victim: target, follow });
    this.arm(target ? T.shot : 3500, 'afterShot');
    this.commit();
  }

  afterShot() {
    const from = this.s.shotFrom;
    if (this.hunterCheck(from)) return;
    if (from === 'exec') { if (this.checkWin()) return; this.startNight(this.s.day + 1); return; }
    this.toDay();
  }

  afterMorning() {
    if (this.hunterCheck('morning')) return;
    this.toDay();
  }

  toDay() {
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
    // 処刑される人が決まったら、票の内訳を見せずにすぐ処刑の演出へ（決選投票・票なしのときだけ結果画面を挟む）
    if (top.length === 1 || (top.length > 1 && s.runoffDone)) { this.afterVoteResult(); return; }
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
    let follow = null;
    const mate = this.loverOf(victim);
    if (mate && this.P(mate)?.alive) { const q = this.P(mate); q.alive = false; q.death = { day: s.day, how: 'love' }; follow = mate; }
    s.history.push({ day: s.day, kind: 'exec', victim, lot: vr.lot, follow });
    s.phase = 'execution';
    this.anim('exec', { victim, lot: vr.lot, follow });
    this.arm(T.exec, 'afterExec');
    this.commit();
  }

  afterExec() {
    if (this.hunterCheck('exec')) return;
    if (this.checkWin()) return;
    this.startNight(this.s.day + 1);
  }

  // 夜の操作を決めた瞬間に、その人だけに返す結果
  instantResult(p, kind, tg) {
    const s = this.s, r = s.roles;
    s.nightResult ||= {};
    if (kind === 'divine') {
      const res = r[tg] === 'werewolf' ? 'wolf' : 'human';
      (s.seerLog[p.id] ||= []).push({ day: s.day, target: tg, res });
      s.nightResult[p.id] = { kind, target: tg, res };
    } else if (kind === 'medium' && s.medNow) {
      if (!s.mediumLog.some((x) => x.day === s.medNow.day)) s.mediumLog.push(s.medNow);
      s.nightResult[p.id] = { kind, target: s.medNow.target, res: s.medNow.res };
    } else if (kind === 'cupid') {
      s.nightResult[p.id] = { kind, targets: [p.id, tg] };
    } else {
      s.nightResult[p.id] = { kind, target: tg };
    }
  }

  betInfo(pid) {
    const s = this.s;
    const o = s.odds || balance(s.cfg) || { village: .5, wolf: .5, fox: 0, lovers: 0 };
    const mult = (p) => Math.max(1, Math.min(3, Math.round(((1 - p) / Math.max(p, 0.05)) * 10) / 10));
    const sides = [{ side: 'village', p: o.village }, { side: 'wolf', p: o.wolf }];
    if (s.cfg.fox) sides.push({ side: 'fox', p: o.fox || 0.1 });
    if (s.cfg.cupid) sides.push({ side: 'lovers', p: o.lovers || 0.1 });
    return { max: Math.max(5, s.scores[pid] || 0), sides: sides.map((x) => ({ side: x.side, mult: mult(x.p) })) };
  }

  loverOf(id) {
    const L = this.s.lovers;
    if (!L || !L.includes(id)) return null;
    return L[0] === id ? L[1] : L[0];
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
    if (win && s.lovers && s.lovers.every((id) => this.P(id)?.alive)) win = 'lovers';
    if (!win) return false;
    this.clearTimer();
    s.winner = win;
    this.applyScores(win);
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
      players: s.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive, host: !!p.host, owner: !!p.owner, bot: !!p.bot, death: p.death, done: done(p) })),
      cfg: s.cfg, cfgAuto: s.cfgAuto, settings: s.settings, candidates: s.candidates, voteResult: vr,
      skip: s.skip.length, winner: s.winner, reveal: ph === 'end' ? s.roles : null, lovers: ph === 'end' ? s.lovers : null, history: s.history,
      fun: s.fun || null,
      hunter: s.phase === 'hunter' ? s.hunter?.pid : null,
      scores: Object.fromEntries(s.players.map((p) => [p.id, s.scores[p.id] || 0])), round: s.round, lastResult: s.lastResult, pts: ph === 'lobby' ? points(s.cfg) : s.pts,
    };
  }

  privState(pid) {
    const s = this.s;
    const p = this.P(pid);
    if (!p) return { joined: false, phase: s.phase };
    const role = s.roles[pid] || null;
    const o = { joined: true, name: p.name, role, owner: !!p.owner };
    if (!role || s.phase === 'lobby') { o.role = null; return o; }
    const ids = (r) => s.players.filter((x) => s.roles[x.id] === r).map((x) => x.id);
    if (role === 'fanatic') o.wolves = ids('werewolf');
    if (role === 'werewolf') {
      o.wolves = ids('werewolf');
      if (s.phase === 'night') o.packPicks = Object.fromEntries(o.wolves.map((w) => [w, s.acts[w] ?? null]));
    }
    if (role === 'mason') o.masons = ids('mason');
    if (s.lovers?.includes(pid)) o.lover = this.loverOf(pid);
    if (role === 'cupid' && s.lovers) o.lovers = s.lovers;
    if (role === 'seer') o.seerLog = s.seerLog[pid] || [];
    if (role === 'medium') o.mediumLog = s.mediumLog;
    if (s.phase === 'role') o.ready = s.ready.includes(pid);
    if (s.phase === 'night' && p.alive) { o.act = this.actFor(p); o.acted = pid in s.acts; o.actTarget = s.acts[pid] ?? null; o.actResult = s.nightResult?.[pid] || null; }
    if (s.phase === 'vote' && p.alive) { o.voteTargets = this.voteTargets(pid); o.voted = s.votes[pid] ?? null; }
    if (s.phase === 'day') o.skipped = s.skip.includes(pid);
    if (!p.alive && s.settings.deadSee) o.allRoles = s.roles;
    if (!p.alive && s.settings.deadSee) o.allLovers = s.lovers;
    if (s.phase === 'hunter' && s.hunter?.pid === pid) o.shoot = { targets: this.alive().map((x) => x.id) };
    if (!p.alive && s.phase !== 'end') { o.betInfo = this.betInfo(pid); o.bet = s.bets?.[pid] || null; }
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
    for (const p of this.s.players) if (!p.bot) this.sendPriv(p.id);
    setTimeout(() => this.botTick(), 0);
    if (!this.P(this.localPid)) this.sendPrivRaw(this.localPid, { joined: false, phase: this.s.phase });
  }

  save() {
    try { localStorage.setItem('mj-host-' + this.room, JSON.stringify({ s: this.s, ident: { pub: this.ident.pub, jwk: this.ident.jwk }, mode: this.net.kind, broker: this.net.index })); } catch {}
  }

  // 正しく配れているかの確認用（GMが「役職を表示」したとき）
  rolesFor() { return this.s.roles; }
}
