import { t, setLang, getLang, detectLang, LANGS, roleName, roleShort, roleAbility, list, joinNames } from './i18n.js';
import { ROLE_ORDER, ROLES, roleIcon, recommend, balance, validate, total, full } from './roles.js';
import { connect, newRoomCode, makeIdentity, loadIdentity } from './net.js';
import { Engine } from './engine.js';
import { Client } from './client.js';
import { sound } from './audio.js';
import * as fx from './fx.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const MODE = params.get('t') === 'bc' ? 'bc' : 'mqtt';

const app = {
  view: 'home', room: null, net: null, engine: null, client: null, status: 'connecting', err: null,
  ui: { modal: null, tab: 'how', showRoles: false, sel: null, panel: false, editName: false, copied: false, sound: false, holding: false, seen: false, waitedLong: false },
  inputs: {}, lastAnim: null,
};
window.__app = app;

/* ---------- 小物 ---------- */
const COLORS = ['#e0785a', '#d9a441', '#8fb573', '#4fae9b', '#5b9bd5', '#8a7cf0', '#c46aa8', '#e06a8a', '#a08a6a', '#6fb0c9', '#b5a642', '#9a6fd0'];
function colorOf(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
const av = (p, size = '') => `<span class="av ${size}" style="--c:${colorOf(p.id)}">${esc([...p.name][0] || '?')}</span>`;
const nameOf = (id) => app.client?.pub?.players.find((p) => p.id === id)?.name ?? '?';
const icon = {
  sound: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  help: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.3 9.4a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.1" fill="currentColor"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  crown: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 18l2-10 5 5 2-7 2 7 5-5 2 10z" fill="currentColor"/></svg>',
};
function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
const joinUrl = () => {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('r', app.room);
  if (app.net && app.net.index >= 0) u.searchParams.set('b', app.net.index);
  if (MODE === 'bc') u.searchParams.set('t', 'bc');
  return u.toString();
};

/* ---------- 起動 ---------- */
async function boot() {
  setLang(detectLang());
  const unlock = () => sound.unlock();
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('pointerdown', onHoldStart);
  ['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, onHoldEnd, true));
  window.addEventListener('blur', onHoldEnd);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-hold]')) e.preventDefault(); });
  const host = params.get('host');
  const r = params.get('r');
  if (host) await startHost(host.toUpperCase());
  else if (r) await startPlayer(r.toUpperCase(), params.get('b'));
  else { app.view = 'home'; sound.play('title'); render(); }
  setInterval(tickTimers, 250);
}

async function startHost(code) {
  let saved = null;
  if (code) { try { saved = JSON.parse(localStorage.getItem('mj-host-' + code) || 'null'); } catch {} }
  if (code && !saved) { location.replace(`?r=${code}${MODE === 'bc' ? '&t=bc' : ''}`); return; }
  const room = code || newRoomCode();
  app.view = 'host'; app.room = room; render();
  try {
    const net = await connect(saved?.mode === 'bc' || MODE === 'bc' ? 'bc' : 'mqtt', saved?.broker ?? null);
    const ident = saved ? await loadIdentity(saved.ident) : await makeIdentity();
    const engine = new Engine(room, net, ident, saved?.s);
    app.engine = engine; app.net = net;
    const client = new Client(room, net, engine);
    await client.start();
    client.on(onUpdate);
    app.client = client;
    net.status.on((s) => { app.status = s; renderHeader(); });
    restoreAnim();
    await engine.init();
    history.replaceState(null, '', `?host=${room}${MODE === 'bc' ? '&t=bc' : ''}`);
    try { localStorage.setItem('mj-last-host', room); } catch {}
  } catch (e) {
    app.err = 'net'; render();
  }
}

async function startPlayer(room, b) {
  app.view = 'player'; app.room = room; render();
  try {
    const net = await connect(MODE, b != null && b !== '' ? +b : 0);
    app.net = net;
    net.status.on((s) => { app.status = s; renderHeader(); });
    const client = new Client(room, net);
    client.on(onUpdate);
    app.client = client;
    restoreAnim();
    await client.start();
    setTimeout(() => { if (!client.pub) { app.ui.waitedLong = true; render(); } }, 9000);
  } catch (e) {
    app.err = 'net'; render();
  }
}

function restoreAnim() { try { app.lastAnim = sessionStorage.getItem('mj-anim-' + app.room); } catch {} }

let lastPhase = null;
function onUpdate() {
  const pub = app.client.pub;
  if (pub) {
    if (pub.phase !== lastPhase) {
      if (pub.phase === 'role') app.ui.seen = false;
      app.ui.sel = null;
      lastPhase = pub.phase;
    }
    handleAnim(pub);
    setBgm(pub);
  }
  render();
}

function handleAnim(pub) {
  const a = pub.anim;
  if (!a || a.id === app.lastAnim) return;
  app.lastAnim = a.id;
  try { sessionStorage.setItem('mj-anim-' + app.room, a.id); } catch {}
  const age = (app.client.animAge || 0) + (Date.now() - app.client.recvAt);
  if (age > 15000) return;
  const P = (id) => { const p = pub.players.find((x) => x.id === id) || { id, name: '?' }; return { ...p, color: colorOf(p.id) }; };
  if (a.kind === 'intro') fx.intro();
  else if (a.kind === 'night') fx.nightfall(a.day);
  else if (a.kind === 'morning') fx.morning(a.day, (a.deaths || []).map(P));
  else if (a.kind === 'exec') fx.execution(P(a.victim), a.lot);
  else if (a.kind === 'end') fx.ending(a.winner);
}

function setBgm(pub) {
  const m = { lobby: 'title', intro: 'night', role: 'night', night: 'night', morning: 'day', day: 'day', vote: 'vote', voteResult: 'vote', execution: 'vote', end: pub.winner === 'village' ? 'endVillage' : 'endWolf' };
  if (pub.phase === 'intro' && fx.busy()) return;
  sound.play(m[pub.phase] || 'title');
}

/* ---------- 描画 ---------- */
function render() {
  renderHeader();
  const main = $('#main');
  const html = mainView();
  if (main._html === html) return;
  const ae = document.activeElement;
  const focusId = ae && main.contains(ae) && ae.id ? ae.id : null;
  const selStart = focusId && ae.selectionStart != null ? ae.selectionStart : null;
  const sy = window.scrollY;
  main.innerHTML = html;
  main._html = html;
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); if (selStart != null && el.setSelectionRange) try { el.setSelectionRange(selStart, selStart); } catch {} }
  }
  window.scrollTo(0, sy);
  const pub = app.client?.pub;
  document.body.dataset.phase = pub?.phase || app.view;
  tickTimers();
}

function renderHeader() {
  const h = $('#top');
  const pub = app.client?.pub;
  let chip = '';
  if (pub && pub.phase !== 'lobby') {
    const ph = pub.phase;
    const label = ph === 'night' ? t('nightN', { n: pub.day }) : ['morning', 'day', 'vote', 'voteResult', 'execution'].includes(ph) ? t('dayN', { n: pub.day }) : t('phase_' + ph);
    chip = `<span class="phase-chip ${ph}">${esc(label)}${ph !== 'night' && ph !== 'end' && ph !== 'intro' && ph !== 'role' ? ' · ' + esc(t('phase_' + ph)) : ''}</span>`;
  }
  const st = app.status;
  const html = `
    <button class="brand" data-act="home" aria-label="home"><span class="mini-moon"></span><span class="brand-t">${esc(t('appTitle'))}</span></button>
    <div class="hd-mid">${chip}</div>
    <div class="hd-right">
      ${app.room ? `<span class="room-chip" title="${esc(t('roomCode'))}">${esc(app.room)}<i class="dot ${st}" title="${esc(t(st))}"></i></span>` : ''}
      <button class="icon-btn" data-act="sound" aria-label="${esc(t('sound'))}">${sound.bgmOn || sound.sfxOn ? icon.sound : icon.mute}</button>
      <button class="icon-btn" data-act="help" aria-label="${esc(t('howTo'))}">${icon.help}</button>
      <label class="lang-sel">${icon.globe}<select id="langSel" data-change="lang" aria-label="${esc(t('language'))}">${LANGS.map(([k, n]) => `<option value="${k}" ${k === getLang() ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    </div>
    ${app.ui.sound ? soundPanel() : ''}`;
  if (h._html !== html) { h.innerHTML = html; h._html = html; }
  const m = $('#modal');
  const mh = app.ui.modal ? helpModal() : '';
  if (m._html !== mh) { m.innerHTML = mh; m._html = mh; m.hidden = !mh; }
}

function soundPanel() {
  return `<div class="sound-pop card">
    <label class="sw"><input type="checkbox" data-change="bgmOn" ${sound.bgmOn ? 'checked' : ''}><span></span>${esc(t('bgm'))}</label>
    <input type="range" min="0" max="1" step="0.05" value="${sound.bgmVol}" data-change="bgmVol" aria-label="BGM">
    <label class="sw"><input type="checkbox" data-change="sfxOn" ${sound.sfxOn ? 'checked' : ''}><span></span>${esc(t('sfx'))}</label>
    <input type="range" min="0" max="1" step="0.05" value="${sound.sfxVol}" data-change="sfxVol" aria-label="SFX">
  </div>`;
}

function mainView() {
  if (app.err === 'net') return `<section class="center"><div class="card msg"><h2>${esc(t('offline'))}</h2><p>${esc(t('notFound'))}</p><button class="btn" data-act="reload">↻</button></div></section>`;
  if (app.view === 'home') return homeView();
  const c = app.client;
  if (!c || !c.pub) {
    return `<section class="center"><div class="card msg"><div class="spinner"></div><p>${esc(t('connecting'))}</p>${app.ui.waitedLong ? `<p class="note">${esc(t('notFound'))}</p>` : ''}</div></section>`;
  }
  const pub = c.pub;
  const priv = c.priv;
  if (app.view === 'host') {
    if (pub.phase === 'lobby') return hostLobby(pub);
    const playing = pub.players.some((p) => p.id === app.engine.localPid);
    if (!playing) return gmBoard(pub);
    return playerGame(pub, priv) + hostPanel(pub);
  }
  if (!c.gotPriv) return `<section class="center"><div class="card msg"><div class="spinner"></div><p>${esc(t('connecting'))}</p></div></section>`;
  if (priv?.kicked) return `<section class="center"><div class="card msg"><p>${esc(t('kicked'))}</p><button class="btn" data-act="home">${esc(t('close'))}</button></div></section>`;
  if (!priv?.joined) {
    if (pub.phase !== 'lobby') return `<section class="center"><div class="card msg"><p>${esc(t('gameStarted'))}</p></div></section>`;
    return joinForm(pub);
  }
  if (pub.phase === 'lobby') return playerLobby(pub, priv);
  return playerGame(pub, priv);
}

/* ---------- ホーム ---------- */
function homeView() {
  let last = null;
  try { last = localStorage.getItem('mj-last-host'); if (last && !localStorage.getItem('mj-host-' + last)) last = null; } catch {}
  const strip = ROLE_ORDER.map((r) => `<span class="strip-i" title="${esc(roleName(r))}">${roleIcon(r, 34)}</span>`).join('');
  return `<section class="home">
    <div class="hero">
      <div class="hero-moon"></div>
      <p class="kicker">WEREWOLF · 人狼 · 늑대인간 · 狼人</p>
      <h1>${esc(t('appTitle'))}</h1>
      <p class="tagline">${esc(t('tagline'))}</p>
      <div class="strip">${strip}</div>
    </div>
    <div class="card home-card">
      <button class="btn primary big" data-act="create">${esc(t('createRoom'))}</button>
      ${last ? `<button class="btn ghost" data-act="resume" data-room="${esc(last)}">${esc(t('resume'))}（${esc(last)}）</button>` : ''}
      <div class="divider"><span>${esc(t('joinByCode'))}</span></div>
      <div class="row">
        <input id="codeIn" class="code-in" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="${esc(t('roomCode'))}" value="${esc(app.inputs.codeIn || '')}">
        <button class="btn" data-act="joinCode">${esc(t('join'))}</button>
      </div>
      <p class="note">${esc(t('homeNote'))}</p>
    </div>
    <div class="guide-btns">
      <button class="btn ghost" data-act="help" data-tab="how">${esc(t('howTo'))}</button>
      <button class="btn ghost" data-act="help" data-tab="roles">${esc(t('rolesGuide'))}</button>
    </div>
  </section>`;
}

/* ---------- 説明 ---------- */
function howToHtml() {
  const steps = list('howSteps').map(([h, b], i) => `<li><span class="num">${i + 1}</span><div><b>${esc(h)}</b><p>${esc(b)}</p></div></li>`).join('');
  const tips = list('tips').map((x) => `<li>${esc(x)}</li>`).join('');
  return `<ol class="steps">${steps}</ol><h4 class="tips-h">${esc(t('tipsTitle'))}</h4><ul class="tips">${tips}</ul>`;
}
function roleEntry(r, count = null) {
  const team = ROLES[r].team;
  return `<div class="role-entry">
    <div class="re-icon">${roleIcon(r, 46)}</div>
    <div class="re-body">
      <div class="re-h"><b>${esc(roleName(r))}</b>${count != null ? `<span class="cnt">×${count}</span>` : ''}<span class="team t-${team}">${esc(t('team_' + team))}</span></div>
      <p>${esc(roleShort(r))}</p>
      <p class="ab"><span>${esc(t('ability'))}</span>${esc(roleAbility(r))}</p>
    </div></div>`;
}
function rolesHtml(cfg = null) {
  return `<div class="role-list">${ROLE_ORDER.filter((r) => !cfg || cfg[r] > 0).map((r) => roleEntry(r, cfg ? cfg[r] : null)).join('')}</div>`;
}
function helpModal() {
  const tab = app.ui.tab;
  return `<div class="modal-bg" data-act="closeModal"></div>
  <div class="modal card" role="dialog" aria-modal="true">
    <div class="tabs">
      <button class="tab ${tab === 'how' ? 'on' : ''}" data-act="tab" data-tab="how">${esc(t('howTo'))}</button>
      <button class="tab ${tab === 'roles' ? 'on' : ''}" data-act="tab" data-tab="roles">${esc(t('rolesGuide'))}</button>
      <button class="x" data-act="closeModal" aria-label="${esc(t('close'))}">×</button>
    </div>
    <div class="modal-body">${tab === 'how' ? howToHtml() : rolesHtml()}</div>
  </div>`;
}

/* ---------- オーナーのロビー ---------- */
function qrSvg(text) {
  try {
    const q = window.qrcode(0, 'M');
    q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch { return ''; }
}
function balanceMeter(cfg) {
  const b = balance(cfg);
  if (!b) return '';
  const v = Math.round(b.village * 100), w = Math.round(b.wolf * 100), f = 100 - v - w;
  return `<div class="balance">
    <div class="bal-h"><span>${esc(t('balance'))}</span><b class="bal-${b.label}">${esc(t('bal_' + b.label))}</b></div>
    <div class="bal-bar"><i class="bv" style="width:${v}%"></i>${b.fox ? `<i class="bf" style="width:${f}%"></i>` : ''}<i class="bw" style="width:${w}%"></i></div>
    <div class="bal-legend"><span class="lv">${esc(t('villageSide'))} ${v}%</span>${b.fox ? `<span class="lf">${esc(t('foxSide'))} ${f}%</span>` : ''}<span class="lw">${esc(t('wolfSide'))} ${w}%</span></div>
    <p class="note">${esc(t('balNote'))}</p>
  </div>`;
}
function hostLobby(pub) {
  const e = app.engine;
  const n = pub.players.length;
  const cfg = full(pub.cfg);
  const errs = validate(cfg, n);
  const hostIn = pub.players.some((p) => p.id === e.localPid);
  const url = joinUrl();
  const rows = ROLE_ORDER.map((r) => `<div class="re-row">
      <span class="re-i">${roleIcon(r, 34)}</span>
      <div class="re-t"><b>${esc(roleName(r))}</b><small>${esc(roleShort(r))}</small></div>
      <div class="stepper"><button data-act="cfg" data-role="${r}" data-d="-1" ${cfg[r] <= 0 ? 'disabled' : ''} aria-label="-">−</button><span>${cfg[r]}</span><button data-act="cfg" data-role="${r}" data-d="1" ${cfg[r] >= ROLES[r].max ? 'disabled' : ''} aria-label="+">＋</button></div>
    </div>`).join('');
  const sel = (k, opts) => `<select data-change="setting" data-key="${k}">${opts.map(([v, l]) => `<option value="${v}" ${pub.settings[k] == v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const tog = (k) => `<label class="sw"><input type="checkbox" data-change="settingB" data-key="${k}" ${pub.settings[k] ? 'checked' : ''}><span></span>${esc(t({ guardTwice: 'optGuard', deadSee: 'optDeadSee', showVotes: 'optShowVotes' }[k]))}</label>`;
  return `<section class="grid2 lobby">
    <div class="col">
      <div class="card invite">
        <h3>${esc(t('scanToJoin'))}</h3>
        <div class="qr-wrap"><div class="qr">${qrSvg(url)}</div></div>
        <div class="code-big"><small>${esc(t('roomCode'))}</small>${esc(app.room)}</div>
        <div class="row"><input class="url" readonly value="${esc(url)}" aria-label="URL"><button class="btn sm" data-act="copy">${esc(app.ui.copied ? t('copied') : t('copyLink'))}</button></div>
      </div>
      <div class="card">
        <h3>${esc(t('playersN', { n }))}</h3>
        <ul class="plist">${pub.players.map((p) => `<li>${av(p)}<span class="pn">${esc(p.name)}</span>${p.host ? `<span class="badge">${icon.crown}${esc(t('host'))}</span>` : `<button class="btn xs ghost" data-act="kick" data-id="${esc(p.id)}">${esc(t('kick'))}</button>`}</li>`).join('') || `<li class="empty">${esc(t('scanToJoin'))}…</li>`}</ul>
        <div class="host-join">
          ${hostIn ? `<button class="btn sm ghost" data-act="hostLeave">${esc(t('hostLeave'))}</button>` : `<div class="row"><input id="hostName" maxlength="12" placeholder="${esc(t('hostName'))}" value="${esc(app.inputs.hostName || '')}"><button class="btn sm" data-act="hostJoin">${esc(t('hostPlays'))}</button></div><p class="note">${esc(t('gmNote'))}</p>`}
        </div>
      </div>
    </div>
    <div class="col">
      <div class="card">
        <div class="card-h"><h3>${esc(t('roleSetup'))}</h3><button class="btn sm ${pub.cfgAuto ? 'on' : ''}" data-act="rec">${pub.cfgAuto ? '✓ ' + esc(t('autoOn')) : esc(t('recommended'))}</button></div>
        <p class="note rec-note">${esc(t('recFor', { n: Math.max(4, n) }))}：${ROLE_ORDER.filter((r) => recommend(n)[r]).map((r) => `${esc(roleName(r))}${recommend(n)[r]}`).join(' / ')}</p>
        <div class="roles-edit">${rows}</div>
        <div class="total ${total(cfg) === n ? 'ok' : 'ng'}">${esc(t('totalLine', { a: total(cfg), n }))}</div>
        ${balanceMeter(cfg)}
      </div>
      <div class="card">
        <h3>${esc(t('settings'))}</h3>
        <div class="set-row"><span>${esc(t('discussTime'))}</span>${sel('discuss', [60, 120, 180, 240, 300, 420, 600].map((s) => [s, t('minutes', { n: s / 60 })]))}</div>
        ${tog('guardTwice')}${tog('deadSee')}${tog('showVotes')}
      </div>
      ${errs.length ? `<ul class="errs">${errs.map(([k, v]) => `<li>${esc(t(k, v))}</li>`).join('')}</ul>` : ''}
      <button class="btn primary big start" data-act="start" ${errs.length ? 'disabled' : ''}>${esc(t('start'))}</button>
    </div>
  </section>`;
}

/* ---------- 参加者：受付 ---------- */
function joinForm(pub) {
  return `<section class="narrow">
    <div class="card join-card">
      <div class="join-moon"></div>
      <h2>${esc(t('appTitle'))}</h2>
      <p class="note">${esc(t('roomCode'))} <b>${esc(app.room)}</b> · ${esc(t('playersN', { n: pub.players.length }))}</p>
      <label class="lbl" for="joinName">${esc(t('yourName'))}</label>
      <input id="joinName" maxlength="12" placeholder="${esc(t('namePh'))}" value="${esc(app.inputs.joinName || '')}" autocomplete="nickname" enterkeyhint="go">
      <button class="btn primary big" data-act="join">${esc(t('join'))}</button>
    </div>
    <div class="card"><h3>${esc(t('howTo'))}</h3>${howToHtml()}</div>
  </section>`;
}

function playerLobby(pub, priv) {
  const n = pub.players.length;
  return `<section class="narrow">
    <div class="card">
      <div class="card-h"><h3>${esc(t('playersN', { n }))}</h3><span class="waiting-dot">${esc(t('waitingHost'))}</span></div>
      <ul class="plist">${pub.players.map((p) => `<li class="${p.id === app.client.pid ? 'me' : ''}">${av(p)}<span class="pn">${esc(p.name)}</span>${p.id === app.client.pid ? `<span class="badge me">${esc(t('you'))}</span>` : ''}${p.host ? `<span class="badge">${icon.crown}${esc(t('host'))}</span>` : ''}</li>`).join('')}</ul>
      ${app.ui.editName ? `<div class="row"><input id="renameIn" maxlength="12" value="${esc(app.inputs.renameIn ?? priv.name)}"><button class="btn sm" data-act="rename">${esc(t('save'))}</button></div>` : `<div class="row end"><button class="btn xs ghost" data-act="editName">${esc(t('editName'))}</button><button class="btn xs ghost" data-act="leave">${esc(t('leave'))}</button></div>`}
    </div>
    <div class="card"><h3>${esc(t('rolesInGame'))}</h3>${rolesHtml(full(pub.cfg))}${balanceMeter(pub.cfg)}</div>
    <div class="card"><h3>${esc(t('howTo'))}</h3>${howToHtml()}</div>
  </section>`;
}

/* ---------- 参加者：ゲーム中 ---------- */
function partnersHtml(priv) {
  const P = (ids) => ids.filter((id) => id !== app.client.pid).map((id) => esc(nameOf(id)));
  if (priv.role === 'werewolf') { const x = P(priv.wolves || []); return `<div class="partners"><span>${esc(t('partners_wolf'))}</span><b>${x.length ? x.join(' / ') : esc(t('noPartner'))}</b></div>`; }
  if (priv.role === 'mason') { const x = P(priv.masons || []); return `<div class="partners"><span>${esc(t('partners_mason'))}</span><b>${x.length ? x.join(' / ') : esc(t('noPartner'))}</b></div>`; }
  return '';
}
function roleCardHtml(priv) {
  const r = priv.role;
  const team = ROLES[r].team;
  return `<div class="role-card" style="--rc:${ROLES[r].color}">
    <div class="rc-icon">${roleIcon(r, 104)}</div>
    <div class="rc-name">${esc(roleName(r))}</div>
    <div class="team t-${team}">${esc(t('team_' + team))}</div>
    <p class="rc-short">${esc(roleShort(r))}</p>
    <p class="rc-ab"><span>${esc(t('ability'))}</span>${esc(roleAbility(r))}</p>
    <p class="rc-win">🏆 ${esc(t('win_' + team))}</p>
    ${partnersHtml(priv)}
  </div>`;
}
function notesHtml(priv) {
  const items = [];
  for (const x of priv.seerLog || []) items.push(`<li><span class="d">${esc(t('dayTag', { n: x.day }))}</span>${roleIcon('seer', 18)} ${esc(t('seerRes', { name: nameOf(x.target), res: '' }))}<b class="res ${x.res}">${esc(x.res === 'wolf' ? t('resWolf') : t('resHuman'))}</b></li>`);
  for (const x of priv.mediumLog || []) items.push(`<li><span class="d">${esc(t('dayTag', { n: x.day }))}</span>${roleIcon('medium', 18)} ${esc(t('medRes', { name: nameOf(x.target), res: '' }))}<b class="res ${x.res}">${esc(x.res === 'wolf' ? t('resWolf') : t('resHuman'))}</b></li>`);
  if (!['seer', 'medium'].includes(priv.role)) return '';
  return `<div class="notes"><h4>${esc(t('myNotes'))}</h4>${items.length ? `<ul>${items.join('')}</ul>` : `<p class="note">${esc(t('noNotes'))}</p>`}</div>`;
}
function myPanel(priv) {
  if (!priv?.role) return '';
  return `<div class="card my">
    <div class="peek ${app.ui.holding ? 'show' : ''}" data-hold>
      <span class="peek-hide">${esc(t('peek'))}</span>
      <span class="peek-show">${roleIcon(priv.role, 30)}<b>${esc(roleName(priv.role))}</b>${partnersHtml(priv)}${notesHtml(priv)}</span>
    </div>
  </div>`;
}
function tag(p) {
  if (p.alive) return '';
  return `<span class="tag ${p.death?.how}">${esc(t(p.death?.how === 'exec' ? 'tag_exec' : 'tag_night'))}</span>`;
}
function grid(players, o = {}) {
  return `<div class="pgrid ${o.selectable ? 'selectable' : ''}">${players.map((p) => {
    const can = o.selectable && o.targets?.includes(p.id);
    const sel = o.selected === p.id;
    const role = o.roles?.[p.id];
    return `<${can ? 'button' : 'div'} class="ptok ${p.alive ? '' : 'dead'} ${sel ? 'sel' : ''} ${can ? 'can' : ''} ${o.selectable && !can ? 'dim' : ''}" ${can ? `data-act="pick" data-id="${esc(p.id)}"` : ''}>
      ${av(p, 'lg')}
      <span class="pt-name">${esc(p.name)}${p.id === app.client.pid ? `<small>（${esc(t('you'))}）</small>` : ''}</span>
      ${tag(p)}
      ${role ? `<span class="pt-role">${roleIcon(role, 18)}${esc(roleName(role))}</span>` : ''}
      ${o.showDone && p.alive ? `<span class="done ${p.done ? 'y' : ''}">${p.done ? '✓' : '…'}</span>` : ''}
      ${o.extra ? o.extra(p) : ''}
    </${can ? 'button' : 'div'}>`;
  }).join('')}</div>`;
}
const progress = (pub) => { const al = pub.players.filter((p) => p.alive); return { a: al.filter((p) => p.done).length, b: al.length }; };

function playerGame(pub, priv) {
  if (!priv) return '';
  const me = pub.players.find((p) => p.id === app.client.pid);
  const dead = me && !me.alive;
  const ph = pub.phase;
  if (ph === 'intro') return `<section class="center"><div class="card msg night-msg"><div class="moon-sm"></div><p>${esc(t('intro2'))}</p></div></section>`;
  if (ph === 'role') return roleReveal(pub, priv);
  if (ph === 'end') return endView(pub, priv);
  if (dead) return spectator(pub, priv);
  if (ph === 'night') return nightView(pub, priv);
  if (ph === 'morning' || ph === 'day') return dayView(pub, priv);
  if (ph === 'vote') return voteView(pub, priv);
  if (ph === 'voteResult' || ph === 'execution') return resultView(pub, priv);
  return '';
}

function roleReveal(pub, priv) {
  if (!priv.role) return '';
  const ready = pub.players.filter((p) => p.done).length;
  return `<section class="narrow role-screen">
    <h2 class="ttl">${esc(t('yourRole'))}</h2>
    <div class="flip ${app.ui.holding ? 'show' : ''}" data-hold>
      <div class="face back"><div class="back-emblem"></div><b>${esc(t('holdToReveal'))}</b><small>${esc(t('holdHint'))}</small></div>
      <div class="face front">${roleCardHtml(priv)}</div>
    </div>
    <button class="btn primary big" data-act="ready" ${!app.ui.seen || priv.ready ? 'disabled' : ''}>${priv.ready ? '✓ ' : ''}${esc(t('confirmed'))}</button>
    <p class="waiting">${esc(t('waitingOthers', { a: ready, b: pub.players.length }))}</p>
  </section>`;
}

function nightView(pub, priv) {
  const act = priv.act;
  const pr = progress(pub);
  const head = `<div class="phase-head night"><div class="moon-sm"></div><h2>${esc(t('nightN', { n: pub.day }))}</h2></div>`;
  const pack = priv.role === 'werewolf' && priv.packPicks && (priv.wolves || []).length > 1
    ? `<div class="pack"><span>${roleIcon('werewolf', 18)} ${esc(t('packPicks'))}</span>${Object.entries(priv.packPicks).filter(([w]) => w !== app.client.pid).map(([w, tg]) => `<b>${esc(nameOf(w))} → ${tg ? esc(nameOf(tg)) : esc(t('notYet'))}</b>`).join('')}</div>` : '';
  if (!act) return `<section class="narrow">${head}</section>`;
  if (priv.acted) {
    return `<section class="narrow">${head}
      <div class="card msg night-msg"><div class="zzz">☾</div><p><b>${esc(t('acted'))}</b>${priv.actTarget ? `：${esc(nameOf(priv.actTarget))}` : ''}</p><p class="waiting">${esc(t('waitDawn', pr))}</p>${pack}</div>
      ${myPanel(priv)}</section>`;
  }
  const prompt = t('act_' + act.kind);
  const players = pub.players.filter((p) => p.alive || act.targets.includes(p.id));
  return `<section class="narrow">${head}
    <div class="card prompt-card"><p class="prompt">${esc(prompt)}</p>${act.kind === 'suspect' ? `<p class="note">${esc(t('act_suspectNote'))}</p>` : ''}${pack}</div>
    ${grid(players.filter((p) => p.alive), { selectable: true, targets: act.targets, selected: app.ui.sel })}
    <div class="sticky-act"><button class="btn primary big" data-act="doAct" ${app.ui.sel && act.targets.includes(app.ui.sel) ? '' : 'disabled'}>${esc(t('decide'))}${app.ui.sel ? `：${esc(nameOf(app.ui.sel))}` : ''}</button></div>
    ${myPanel(priv)}
  </section>`;
}

function lastNightBanner(pub) {
  const h = [...(pub.history || [])].reverse().find((x) => x.kind === 'night' && x.day === pub.day);
  if (!h) return '';
  return h.deaths.length
    ? `<div class="banner dead">${esc(t('morningDeadShort', { names: joinNames(h.deaths.map(nameOf)) }))}</div>`
    : `<div class="banner peace">${esc(t('morningPeace'))}</div>`;
}

function dayView(pub, priv) {
  const al = pub.players.filter((p) => p.alive).length;
  const isDay = pub.phase === 'day';
  return `<section class="narrow">
    <div class="phase-head day"><div class="sun-sm"></div><h2>${esc(t('dayN', { n: pub.day }))} · ${esc(t('discussion'))}</h2>${isDay ? `<div class="timer" data-deadline="1">--:--</div>` : ''}</div>
    ${lastNightBanner(pub)}
    <p class="hint">${esc(t('discussHint'))}</p>
    ${grid(pub.players)}
    <p class="note center-t">${esc(t('aliveN', { n: al }))}</p>
    ${isDay ? `<button class="btn ${priv.skipped ? 'on' : 'ghost'} wide" data-act="skip">${esc(t(priv.skipped ? 'skipVoted' : 'skipVote', { a: pub.skip, b: Math.floor(al / 2) + 1 }))}</button>` : ''}
    ${myPanel(priv)}
  </section>`;
}

function voteView(pub, priv) {
  const pr = progress(pub);
  const runoff = !!pub.candidates;
  const head = `<div class="phase-head vote"><h2>${esc(runoff ? t('runoff') : t('vote'))}</h2></div>`;
  if (priv.voted) {
    return `<section class="narrow">${head}<div class="card msg"><p><b>${esc(t('voted'))}</b>：${esc(nameOf(priv.voted))}</p><p class="waiting">${esc(t('votingN', pr))}</p></div>${grid(pub.players.filter((p) => p.alive), { showDone: true })}</section>`;
  }
  const targets = priv.voteTargets || [];
  return `<section class="narrow">${head}
    <div class="card prompt-card"><p class="prompt">${esc(runoff ? t('runoffHint', { names: joinNames(pub.candidates.map(nameOf)) }) : t('voteHint'))}</p></div>
    ${grid(pub.players.filter((p) => p.alive), { selectable: true, targets, selected: app.ui.sel, showDone: true })}
    <div class="sticky-act"><button class="btn danger big" data-act="doVote" ${app.ui.sel && targets.includes(app.ui.sel) ? '' : 'disabled'}>${esc(t('decide'))}${app.ui.sel ? `：${esc(nameOf(app.ui.sel))}` : ''}</button></div>
    ${myPanel(priv)}
  </section>`;
}

function tallyHtml(pub) {
  const vr = pub.voteResult;
  if (!vr) return '';
  const counts = vr.counts || {};
  const ids = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const max = Math.max(1, ...Object.values(counts));
  const voters = (id) => (vr.votes || []).filter(([, to]) => to === id).map(([from]) => esc(nameOf(from)));
  const rows = ids.map((id) => {
    const p = pub.players.find((x) => x.id === id) || { id, name: '?' };
    const top = vr.top.includes(id);
    return `<li class="${top ? 'top' : ''} ${vr.victim === id ? 'victim' : ''}">
      <div class="tl">${av(p)}<b>${esc(p.name)}</b><span class="vn">${esc(t('votesN', { n: counts[id] }))}</span></div>
      <div class="tbar"><i style="width:${(counts[id] / max) * 100}%"></i></div>
      ${vr.votes ? `<div class="voters">← ${voters(id).join('、')}</div>` : ''}
    </li>`;
  }).join('');
  const foot = pub.phase === 'execution' && vr.victim
    ? `<p class="exec-line">${vr.lot ? esc(t('lot')) + '<br>' : ''}${esc(t('executed', { name: nameOf(vr.victim) }))}</p>`
    : !ids.length ? `<p class="note">${esc(t('noExec'))}</p>` : '';
  return `<div class="card tally"><h3>${esc(t('voteResult'))}${vr.runoff ? ` · ${esc(t('runoff'))}` : ''}</h3><ul>${rows}</ul>${foot}</div>`;
}

function resultView(pub, priv) {
  return `<section class="narrow"><div class="phase-head vote"><h2>${esc(t('voteResult'))}</h2></div>${tallyHtml(pub)}${myPanel(priv)}</section>`;
}

function spectator(pub, priv) {
  const ph = pub.phase;
  const pr = progress(pub);
  let sub = '';
  if (ph === 'night') sub = t('waitDawn', pr);
  else if (ph === 'vote') sub = t('votingN', pr);
  else if (ph === 'day') sub = t('discussion');
  return `<section class="narrow ghost-view">
    <div class="card msg dead-msg"><div class="ghost-i">✝</div><h2>${esc(t('youDead'))}</h2><p>${esc(t('youDeadNote'))}</p>${ph === 'day' ? '<div class="timer" data-deadline="1">--:--</div>' : ''}<p class="waiting">${esc(sub)}</p></div>
    ${ph === 'voteResult' || ph === 'execution' ? tallyHtml(pub) : ''}
    ${priv.allRoles ? `<h3 class="sec-h">${esc(t('spectator'))}</h3>` : ''}
    ${grid(pub.players, { roles: priv.allRoles, showDone: ph === 'night' || ph === 'vote' })}
    ${myPanel(priv)}
  </section>`;
}

function timelineHtml(pub) {
  const rows = (pub.history || []).map((h) => {
    if (h.kind === 'night') return `<li><span class="d">${esc(t('nightN', { n: h.day }))}</span>${h.deaths.length ? `${esc(t('tag_night'))}：${esc(joinNames(h.deaths.map(nameOf)))}` : esc(t('morningPeace'))}</li>`;
    return `<li><span class="d">${esc(t('dayN', { n: h.day }))}</span>${h.victim ? `${esc(t('tag_exec'))}：${esc(nameOf(h.victim))}${h.lot ? ' 🎲' : ''}` : esc(t('noExec'))}</li>`;
  }).join('');
  return rows ? `<div class="card"><h3>${esc(t('timeline'))}</h3><ul class="timeline">${rows}</ul></div>` : '';
}

function endView(pub, priv) {
  const w = pub.winner;
  const roles = pub.reveal || {};
  const wins = (r) => (w === 'fox' ? r === 'fox' : ROLES[r]?.team === w);
  const rows = pub.players.map((p) => {
    const r = roles[p.id];
    return `<li class="${wins(r) ? 'win' : ''} ${p.alive ? '' : 'dead'}">${av(p)}<b class="pn">${esc(p.name)}</b><span class="rr">${roleIcon(r, 22)}${esc(roleName(r))}</span>${tag(p)}${wins(r) ? `<span class="wm">${esc(t('winnerMark'))}</span>` : ''}</li>`;
  }).join('');
  const isHost = app.view === 'host';
  return `<section class="narrow">
    <div class="win-banner w-${w}"><div class="wb-i">${roleIcon(w === 'village' ? 'villager' : w === 'wolf' ? 'werewolf' : 'fox', 64)}</div><h2>${esc(t('win_title_' + w))}</h2><p>${esc(t('win_sub_' + w))}</p></div>
    <div class="card"><h3>${esc(t('allRoles'))}</h3><ul class="reveal">${rows}</ul></div>
    ${timelineHtml(pub)}
    ${isHost ? `<button class="btn primary big wide" data-act="again">${esc(t('playAgain'))}</button>` : `<p class="note center-t">${esc(t('waitingHost'))}</p>`}
  </section>`;
}

/* ---------- オーナー：進行役 ---------- */
function controls(pub) {
  const ph = pub.phase;
  const b = [];
  if (ph === 'day') { b.push(`<button class="btn" data-act="toVote">${esc(t('toVote'))}</button>`); b.push(`<button class="btn ghost" data-act="addMin">${esc(t('addMin'))}</button>`); }
  if (['intro', 'role', 'night', 'morning', 'vote', 'voteResult', 'execution'].includes(ph)) b.push(`<button class="btn ghost" data-act="force">${esc(t('forceNext'))}</button>`);
  if (ph !== 'end') b.push(`<button class="btn ghost xs" data-act="endGame">${esc(t('endGame'))}</button>`);
  return b.join('');
}
function hostPanel(pub) {
  return `<div class="host-panel ${app.ui.panel ? 'open' : ''}">
    <button class="hp-toggle" data-act="panel">${icon.crown} ${esc(t('hostPanel'))}</button>
    ${app.ui.panel ? `<div class="hp-body"><p class="note">${esc(t('progress'))}：${esc(t('phase_' + pub.phase))}${['night', 'vote', 'role'].includes(pub.phase) ? ` ${progress(pub).a}/${progress(pub).b}` : ''}</p>${controls(pub)}</div>` : ''}
  </div>`;
}
function gmBoard(pub) {
  const ph = pub.phase;
  const roles = app.ui.showRoles ? app.engine.rolesFor() : null;
  let title = t('phase_' + ph), sub = '';
  if (ph === 'night') { title = t('nightN', { n: pub.day }); sub = t('waitDawn', progress(pub)); }
  if (ph === 'role') { title = t('phase_role'); sub = t('waitingOthers', { a: pub.players.filter((p) => p.done).length, b: pub.players.length }); }
  if (ph === 'day' || ph === 'morning') { title = `${t('dayN', { n: pub.day })} · ${t('discussion')}`; sub = t('discussHint'); }
  if (ph === 'vote') { title = pub.candidates ? t('runoff') : t('vote'); sub = t('votingN', progress(pub)); }
  if (ph === 'end') return endView(pub, null) + '';
  return `<section class="gm">
    <div class="gm-head ${ph}">
      <div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>
      ${ph === 'day' ? '<div class="timer big" data-deadline="1">--:--</div>' : ''}
    </div>
    ${ph === 'day' || ph === 'morning' ? lastNightBanner(pub) : ''}
    ${ph === 'voteResult' || ph === 'execution' ? tallyHtml(pub) : ''}
    ${grid(pub.players, { roles, showDone: ['night', 'vote', 'role'].includes(ph) || false, extra: ph === 'role' ? (p) => `<span class="done ${p.done ? 'y' : ''}">${p.done ? '✓' : '…'}</span>` : null })}
    <div class="gm-ctrl card">${controls(pub)}<button class="btn ghost xs" data-act="toggleRoles">${esc(app.ui.showRoles ? t('hideRoles') : t('showRoles'))}</button></div>
    <div class="gm-qr"><div class="qr">${qrSvg(joinUrl())}</div><span>${esc(app.room)}</span></div>
  </section>`;
}

/* ---------- タイマー ---------- */
function tickTimers() {
  const c = app.client;
  document.querySelectorAll('[data-deadline]').forEach((el) => {
    if (!c?.deadline) { el.textContent = '--:--'; return; }
    const ms = c.deadline - Date.now();
    el.textContent = fmt(ms);
    el.classList.toggle('urgent', ms < 30000);
  });
}

/* ---------- 操作 ---------- */
function onHoldStart(e) {
  const h = e.target.closest('[data-hold]');
  if (!h) return;
  e.preventDefault();
  app.ui.holding = true;
  h.classList.add('show');
  if (!app.ui.seen && app.client?.pub?.phase === 'role') { app.ui.seen = true; sound.sfxPlay('reveal'); setTimeout(render, 0); }
}
function onHoldEnd() {
  if (!app.ui.holding) return;
  app.ui.holding = false;
  document.querySelectorAll('[data-hold].show').forEach((x) => x.classList.remove('show'));
  render();
}

function onInput(e) { if (e.target.id) app.inputs[e.target.id] = e.target.value; }
function onChange(e) {
  const el = e.target;
  const k = el.dataset.change;
  if (!k) return;
  if (k === 'lang') { setLang(el.value); $('#main')._html = null; render(); }
  else if (k === 'bgmOn') sound.setBgm(el.checked);
  else if (k === 'sfxOn') sound.setSfx(el.checked);
  else if (k === 'bgmVol') sound.setBgmVol(+el.value);
  else if (k === 'sfxVol') sound.setSfxVol(+el.value);
  else if (k === 'setting') app.engine?.setSetting(el.dataset.key, +el.value);
  else if (k === 'settingB') app.engine?.setSetting(el.dataset.key, el.checked);
  renderHeader();
}

const actions = {
  home() { location.href = location.pathname + (MODE === 'bc' ? '?t=bc' : ''); },
  reload() { location.reload(); },
  create() { sound.sfxPlay('confirm'); startHost(null); },
  resume(el) { location.href = `?host=${el.dataset.room}${MODE === 'bc' ? '&t=bc' : ''}`; },
  joinCode() {
    const c = (app.inputs.codeIn || '').trim().toUpperCase();
    if (c.length < 4) return;
    location.href = `?r=${encodeURIComponent(c)}${MODE === 'bc' ? '&t=bc' : ''}`;
  },
  help(el) { app.ui.modal = 'help'; app.ui.tab = el.dataset.tab || 'how'; renderHeader(); },
  tab(el) { app.ui.tab = el.dataset.tab; renderHeader(); },
  closeModal() { app.ui.modal = null; renderHeader(); },
  sound() { app.ui.sound = !app.ui.sound; renderHeader(); },
  async copy() {
    try { await navigator.clipboard.writeText(joinUrl()); } catch { const i = $('.url'); i?.select(); document.execCommand?.('copy'); }
    app.ui.copied = true; render(); setTimeout(() => { app.ui.copied = false; render(); }, 1800);
  },
  kick(el) { app.engine.kick(el.dataset.id); },
  hostJoin() {
    const n = (app.inputs.hostName || '').trim();
    if (!n) { $('#hostName')?.focus(); return; }
    app.engine.hostJoin(n); sound.sfxPlay('join');
  },
  hostLeave() { app.engine.hostLeave(); },
  cfg(el) { app.engine.setCfg(el.dataset.role, +el.dataset.d); sound.sfxPlay('click'); },
  rec() { app.engine.applyRec(); sound.sfxPlay('select'); },
  start() { if (app.engine.start()) sound.sfxPlay('confirm'); },
  join() {
    const n = (app.inputs.joinName || '').trim();
    if (!n) { $('#joinName')?.focus(); return; }
    app.client.send({ t: 'join', name: n }); sound.sfxPlay('join');
  },
  editName() { app.ui.editName = true; render(); },
  rename() {
    const n = (app.inputs.renameIn || '').trim();
    if (n) app.client.send({ t: 'join', name: n });
    app.ui.editName = false; delete app.inputs.renameIn; render();
  },
  leave() {
    app.client.send({ t: 'leave' });
    try { (MODE === 'bc' ? sessionStorage : localStorage).removeItem('mj-id-' + app.room); } catch {}
    setTimeout(() => actions.home(), 300);
  },
  ready() { if (!app.ui.seen) return; app.client.send({ t: 'ready' }); sound.sfxPlay('confirm'); },
  pick(el) { app.ui.sel = el.dataset.id; sound.sfxPlay('select'); render(); },
  doAct() { if (!app.ui.sel) return; app.client.send({ t: 'act', target: app.ui.sel }); sound.sfxPlay('confirm'); },
  doVote() { if (!app.ui.sel) return; app.client.send({ t: 'vote', target: app.ui.sel }); sound.sfxPlay('confirm'); },
  skip() { app.client.send({ t: 'skip' }); sound.sfxPlay('click'); },
  panel() { app.ui.panel = !app.ui.panel; render(); },
  toVote() { app.engine.startVote(); },
  addMin() { app.engine.addTime(60); },
  force() {
    const pub = app.client.pub;
    const pr = progress(pub);
    if (['night', 'vote'].includes(pub.phase) && pr.a < pr.b && !confirm(t('forceConfirm'))) return;
    app.engine.forceNext();
  },
  endGame() { if (confirm(t('endConfirm'))) app.engine.backToLobby(); },
  again() { app.engine.backToLobby(); },
  toggleRoles() { app.ui.showRoles = !app.ui.showRoles; render(); },
};

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) { if (app.ui.sound && !e.target.closest('.sound-pop')) { app.ui.sound = false; renderHeader(); } return; }
  if (el.disabled) return;
  const f = actions[el.dataset.act];
  if (f) { e.preventDefault(); f(el); }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.ui.modal) actions.closeModal();
  if (e.key === 'Enter' && e.target.id === 'joinName') actions.join();
  if (e.key === 'Enter' && e.target.id === 'codeIn') actions.joinCode();
  if (e.key === 'Enter' && e.target.id === 'hostName') actions.hostJoin();
  if (e.key === 'Enter' && e.target.id === 'renameIn') actions.rename();
});

boot();
