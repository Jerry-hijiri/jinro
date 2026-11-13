// 演出（開幕・夜・朝・襲撃・処刑・勝敗）。全端末で同時に再生される。
import { t, joinNames } from './i18n.js';
import { sound } from './audio.js';
import { roleIcon } from './roles.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let layer = null;
let current = null;
function root() {
  if (!layer) { layer = document.createElement('div'); layer.id = 'fx'; document.body.appendChild(layer); }
  return layer;
}
export const busy = () => !!current;

function stars(n = 90) {
  let h = '';
  for (let i = 0; i < n; i++) {
    const s = Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1;
    h += `<i style="left:${(Math.random() * 100).toFixed(2)}%;top:${(Math.random() * 70).toFixed(2)}%;width:${s}px;height:${s}px;animation-delay:${(Math.random() * 4).toFixed(2)}s"></i>`;
  }
  return `<div class="stars">${h}</div>`;
}

// 村のシルエット
function village(wolf = false) {
  let houses = '';
  const xs = [40, 120, 175, 260, 330, 420, 520, 600, 690, 770, 860, 940];
  xs.forEach((x, i) => {
    const w = 40 + ((i * 37) % 30), h = 30 + ((i * 53) % 34), y = 300 - h;
    houses += `<path d="M${x} ${y}h${w}v${h}h-${w}z M${x - 6} ${y} L${x + w / 2} ${y - 26 - (i % 3) * 6} L${x + w + 6} ${y}z"/>`;
    if (i % 3 !== 1) houses += `<rect class="win" x="${x + w / 2 - 5}" y="${y + 10}" width="9" height="10" style="animation-delay:${(i * 0.7) % 3}s"/>`;
  });
  houses += '<path d="M470 300V200h40v100z M462 200 L490 130 L518 200z M486 130v-22h8v22z M478 116h24v6h-24z"/>';
  let trees = '';
  [10, 90, 230, 380, 560, 650, 820, 980].forEach((x, i) => { const h = 50 + (i * 17) % 30; trees += `<path d="M${x} 300 L${x + 16} ${300 - h} L${x + 32} 300z"/>`; });
  const w = wolf ? `<g class="wolf"><path d="M14 98C6 96 6 88 14 88c6 0 8 4 10 2 0-16 2-28 8-36 4-8 6-14 8-20l-2-16 8 9c4-2 8-4 11-6l13-14-1 6-3 4c-2 5-4 9-6 13-3 6-4 12-2 20 3 10 3 24 3 48h-7l-1-18c-3 6-7 10-9 18z" transform="translate(560 112) scale(1.2)"/></g>` : '';
  return `<svg class="village" viewBox="0 0 1000 320" preserveAspectRatio="xMidYMax slice"><path class="hill" d="M0 320V250Q200 210 420 240T820 215Q900 205 1000 240V320z"/><path class="hill2" d="M520 300L548 246Q575 226 610 230Q650 236 672 300z M700 260Q800 200 900 210Q960 215 1000 235V320H700z"/>${w}<g class="houses">${trees}${houses}</g><rect y="298" width="1000" height="22"/></svg>`;
}

function mount(cls, html, ms, { skippable = true } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'fxs ' + cls;
    el.innerHTML = html + (skippable ? `<div class="fx-skip">${esc(t('tapSkip'))}</div>` : '');
    root().appendChild(el);
    const timers = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      el.classList.add('out');
      setTimeout(() => { el.remove(); if (current === ctrl) current = null; resolve(); window.dispatchEvent(new Event('fx-done')); }, 600);
    };
    const ctrl = { el, finish, at: (ms2, f) => timers.push(setTimeout(f, ms2)) };
    if (current) current.finish();
    current = ctrl;
    if (skippable) el.addEventListener('click', () => { if (el.dataset.armed) finish(); });
    setTimeout(() => { el.dataset.armed = '1'; }, 800);
    timers.push(setTimeout(finish, ms));
    ctrl.run = (f) => f(ctrl);
    mount.last = ctrl;
  });
}

export function intro() {
  const p = mount('fx-intro', `
    <div class="sky"></div>${stars(120)}
    <div class="moon big"><span></span></div>
    <div class="fog f1"></div><div class="fog f2"></div>
    ${village(true)}
    <div class="intro-text">
      <p class="l1">${esc(t('intro1'))}</p>
      <h1>${esc(t('appTitle'))}</h1>
      <p class="l2">${esc(t('intro2'))}</p>
    </div>`, 9600);
  const c = mount.last;
  sound.play('night');
  c.at(3600, () => sound.sfxPlay('howl'));
  c.at(5000, () => sound.sfxPlay('impact'));
  return p;
}

export function nightfall(day) {
  const p = mount('fx-night', `<div class="sky"></div>${stars(80)}<div class="moon"><span></span></div>${village(false)}
    <div class="center-text"><h2>${esc(t('nightN', { n: day }))}</h2><p>${esc(t('nightFall'))}</p></div>`, 4200);
  sound.sfxPlay('night');
  return p;
}

// 場面画（ChatGPTで生成した絵）。読み込めなければ従来の演出に戻す
const SCENES = {};
function scene(name) {
  if (!SCENES[name]) {
    SCENES[name] = new Promise((res) => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = `img/scenes/${name}.webp`; });
  }
  return SCENES[name];
}
const SCENE_NAMES = ['kill', 'guillotine_plate', 'blade', 'alley'];
const sceneOk = {};
let gore = true;
export function setGore(v) { gore = !!v; }
// Geminiなどで作った動画（img/video/kill.mp4・exec.mp4）があれば最優先で使う
const VIDEOS = {};
['kill', 'exec'].forEach((n) => {
  VIDEOS[n] = fetch(`img/video/${n}.mp4`, { method: 'HEAD' }).then((r) => {
    if (!r.ok) return false;
    const v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.src = `img/video/${n}.mp4`; v.load();
    return true;
  }).catch(() => false);
  VIDEOS[n].then((ok) => { VIDEOS[n + 'Ok'] = ok; });
});
function playVideo(name, endHtml, fallback) {
  // 動画が暗転したら、上から爪痕・血しぶきを重ねてから結果の文字を出す
  const p = mount('fx-vid', `<video class="fxv" src="img/video/${name}.mp4" playsinline preload="auto"></video>
    <div class="slashes"><i></i><i></i><i></i></div><div class="flashw"></div><div class="amb-blood">${splatSvg()}</div><div class="drips">${drips(16)}</div>
    <div class="vid-end">${endHtml}</div>`, 30000);
  const c = mount.last;
  const v = c.el.querySelector('video');
  sound.play(null);
  v.volume = Math.max(0.2, sound.sfxVol);
  v.muted = !sound.sfxOn;
  v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  let hit = false;
  const strike = () => {
    if (hit) return; hit = true;
    c.el.classList.add('hit');
    if (name === 'kill') { sound.sfxPlay('slash'); sound.sfxPlay('gore'); c.at(300, () => sound.sfxPlay('hiss')); }
    else { sound.sfxPlay('gore'); sound.sfxPlay('hiss'); }
    const rest = Math.max(0, (v.duration - v.currentTime) * 1000);
    c.at(Math.max(1900, rest), () => c.el.classList.add('final'));
    c.at(Math.max(1900, rest) + 4000, c.finish);
  };
  const hitAt = () => (name === 'exec' ? 6.25 : 8.4);
  v.addEventListener('timeupdate', () => { if (v.duration && v.currentTime >= hitAt()) strike(); });
  v.addEventListener('ended', strike);
  v.addEventListener('error', () => { c.finish(); if (fallback) setTimeout(fallback, 650); });
  return p;
}
SCENE_NAMES.forEach((n) => scene(n).then((ok) => { sceneOk[n] = ok; }));

const drips = (n = 14) => Array.from({ length: n }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;--h:${(18 + Math.random() * 40).toFixed(0)}vh;--w:${(3 + Math.random() * 7).toFixed(1)}px;animation-delay:${(Math.random() * 1.2).toFixed(2)}s"></i>`).join('');
const spray = (n = 26) => Array.from({ length: n }, () => { const a = -Math.PI * (0.08 + Math.random() * 0.84); const d = 14 + Math.random() * 46; const sz = 2 + Math.random() * 6; return `<i style="--x:${(Math.cos(a) * d).toFixed(1)}vmin;--y:${(Math.sin(a) * d * 0.9).toFixed(1)}vmin;--r:${(a * 180 / Math.PI + 90).toFixed(0)}deg;--w:${sz.toFixed(1)}px;--l:${(sz * (3 + Math.random() * 5)).toFixed(0)}px;animation-delay:${(Math.random() * .18).toFixed(2)}s"></i>`; }).join('');

export function morning(day, victims) {
  if (victims.length && gore && VIDEOS.killOk) return playVideo('kill', `<div class="center-text low"><h2>${esc(t('morningN', { n: day }))}</h2><p>${esc(t('morningDead', { names: joinNames(victims.map((v) => v.name)) }))}</p></div>`, () => { VIDEOS.killOk = false; morning(day, victims); });
  if (victims.length && gore && sceneOk.alley && sceneOk.kill) return ambush(day, victims);
  if (!victims.length) {
    const p = mount('fx-morning', `<div class="dawn"></div><div class="sun"></div>${village(false)}
      <div class="center-text"><h2>${esc(t('morningN', { n: day + 0 }))}</h2><p>${esc(t('morningPeace'))}</p></div>`, 7000);
    sound.sfxPlay('bell');
    return p;
  }
  const names = joinNames(victims.map((v) => v.name));
  const cards = victims.map((v) => `<div class="vcard"><div class="av" style="--c:${v.color}">${esc([...v.name.replace(/^CPU\s+/, '')][0] || '?')}</div><b>${esc(v.name)}</b></div>`).join('');
  const real = gore && sceneOk.kill;
  const p = mount('fx-kill' + (real ? ' real' : ''), `
    ${real ? '<div class="scene-img" style="background-image:url(img/scenes/kill.webp)"></div><div class="lightning"></div>' : '<div class="redsky"></div><div class="moon red"><span></span></div>'}
    <div class="kill-stage">${cards}</div>
    <div class="slashes"><i></i><i></i><i></i></div>
    <div class="splat"></div><div class="mist"></div><div class="drips">${drips()}</div><div class="vignette"></div>
    <div class="center-text low"><h2>${esc(t('morningN', { n: day }))}</h2><p>${esc(t('morningDead', { names }))}</p></div>`, 11000);
  const c = mount.last;
  sound.sfxPlay('heartbeat');
  c.at(1200, () => sound.sfxPlay('growl'));
  c.at(2600, () => { c.el.classList.add('strike'); sound.sfxPlay('slash'); });
  c.at(3100, () => { sound.sfxPlay('impact'); sound.sfxPlay('gore'); });
  c.at(4600, () => sound.sfxPlay('bell'));
  return p;
}

// 血痕（ふちが不規則でトゲと飛沫のある形を毎回ランダムに描く）
function splatPath(cx, cy, R) {
  const n = 22 + Math.floor(Math.random() * 10);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = R * (0.55 + Math.random() * 0.35);
    if (Math.random() < 0.25) r = R * (1.1 + Math.random() * 0.9);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const p0 = pts[i - 1], p1 = pts[i % n];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    d += ` Q${p0[0].toFixed(1)} ${p0[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return d + 'Z';
}
function splatSvg() {
  let g = '';
  for (let k = 0; k < 6; k++) {
    const cx = 10 + Math.random() * 80, cy = 15 + Math.random() * 70, R = 3 + Math.random() * 8;
    g += `<path class="sp" style="animation-delay:${(Math.random() * .25).toFixed(2)}s;transform-origin:${cx}px ${cy}px" d="${splatPath(cx, cy, R)}"/>`;
    for (let j = 0; j < 9; j++) {
      const a = Math.random() * Math.PI * 2, d = R * (1.3 + Math.random() * 2.6), r = 0.25 + Math.random() * 0.9;
      g += `<circle class="sp" style="animation-delay:${(Math.random() * .3).toFixed(2)}s;transform-origin:${cx}px ${cy}px" cx="${(cx + Math.cos(a) * d).toFixed(1)}" cy="${(cy + Math.sin(a) * d).toFixed(1)}" r="${r.toFixed(2)}"/>`;
    }
  }
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="bl" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#8e0a05"/><stop offset=".6" stop-color="#5e0000"/><stop offset="1" stop-color="#3a0000"/></radialGradient></defs><g fill="url(#bl)">${g}</g></svg>`;
}

// 襲撃の映像：逃げる → 振り返る → 安堵 → 黒い影に襲われる → 視点が地面に落ちる
function ambush(day, victims) {
  const names = joinNames(victims.map((v) => v.name));
  const blobs = splatSvg();
  const p = mount('fx-amb', `
    <div class="amb-cam">
      <div class="amb-img a-run" style="background-image:url(img/scenes/alley.webp)"></div>
      <div class="amb-img a-back" style="background-image:url(img/scenes/alley.webp)"></div>
      <div class="amb-img a-wolf" style="background-image:url(img/scenes/kill.webp)"></div>
      <div class="amb-img a-ground" style="background-image:url(img/scenes/alley.webp)"></div>
    </div>
    <div class="amb-pan"></div>
    <div class="amb-black"></div>
    <div class="slashes"><i></i><i></i><i></i></div>
    <div class="amb-blood">${blobs}</div>
    <div class="drips">${drips(16)}</div>
    <div class="amb-vig"></div>
    <div class="amb-end"><div class="scene-img" style="background-image:url(img/scenes/kill.webp)"></div>
      <div class="center-text low"><h2>${esc(t('morningN', { n: day }))}</h2><p>${esc(t('morningDead', { names }))}</p></div></div>`, 16500);
  const c = mount.last;
  const step = (cls) => c.el.classList.add(cls);
  sound.play(null);
  step('run');
  sound.sfxPlay('flee');
  c.at(3800, () => { step('look'); sound.sfxPlay('whoosh'); });
  c.at(4400, () => { step('calm'); sound.sfxPlay('relief'); });
  c.at(7000, () => sound.sfxPlay('lowgrowl'));
  c.at(7700, () => { step('scare'); sound.sfxPlay('roar'); });
  c.at(8400, () => { step('cut'); sound.sfxPlay('slash'); sound.sfxPlay('gore'); });
  c.at(8700, () => { step('fall'); sound.sfxPlay('hiss'); sound.sfxPlay('thud'); });
  c.at(9100, () => sound.sfxPlay('dying'));
  c.at(11200, () => step('dead'));
  c.at(12200, () => { step('final'); sound.sfxPlay('bell'); });
  return p;
}

export function execution(victim, lot) {
  if (gore && VIDEOS.execOk) return playVideo('exec', `<div class="center-text low"><p>${lot ? esc(t('lot')) + '<br>' : ''}${esc(t('executed', { name: victim.name }))}</p></div>`, () => { VIDEOS.execOk = false; execution(victim, lot); });
  const real = gore && sceneOk.guillotine_plate && sceneOk.blade;
  const ini = esc([...victim.name.replace(/^CPU\s+/, '')][0] || '?');
  const p = mount('fx-exec' + (real ? ' real' : ''), real ? `
    <div class="gstage"><div class="gscene"><div class="gmist"></div>
      <svg class="ghead" viewBox="0 0 100 110"><defs><radialGradient id="hg" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#3a2a22"/><stop offset=".7" stop-color="#140c09"/><stop offset="1" stop-color="#050302"/></radialGradient></defs><path d="M50 4C25 4 10 22 10 48c0 22 12 40 26 50 8 6 20 6 28 0 14-10 26-28 26-50C90 22 75 4 50 4z" fill="url(#hg)"/><path d="M12 40C10 16 30 0 54 2c24 2 38 22 34 42-6-14-18-22-38-22S16 30 12 40z" fill="#070403"/><path d="M14 44c4-18 20-30 40-28 18 2 30 14 32 30-8-8-14-10-20-6-10-8-26-8-36 2-6-2-12 0-16 2z" fill="#030201"/><path d="M20 70c6 14 18 24 30 24s24-10 30-24c-6 8-18 14-30 14S26 78 20 70z" fill="#000" opacity=".5"/></svg>
      <img class="gblade" src="img/scenes/blade.webp" alt="">
      <div class="spray">${spray(34)}</div>
    </div></div>
    <div class="streak"></div><div class="flashw"></div><div class="drips">${drips(18)}</div><div class="vignette"></div>
    <div class="ecard top"><div class="av" style="--c:${victim.color}">${ini}</div><b>${esc(victim.name)}</b></div>
    <div class="center-text low"><p>${lot ? esc(t('lot')) + '<br>' : ''}${esc(t('executed', { name: victim.name }))}</p></div>` : `
    <div class="dark"></div><div class="spot"></div>
    <svg class="rope" viewBox="0 0 60 300"><path d="M30 0V210"/><ellipse cx="30" cy="238" rx="17" ry="27"/><path d="M24 205h12v14H24z"/></svg>
    <div class="ecard"><div class="av" style="--c:${victim.color}">${ini}</div><b>${esc(victim.name)}</b></div>
    <div class="stamp">${esc(t('tag_exec'))}</div>
    <div class="ash"></div>
    <div class="center-text low"><p>${lot ? esc(t('lot')) + '<br>' : ''}${esc(t('executed', { name: victim.name }))}</p></div>`, 9500);
  const c = mount.last;
  sound.sfxPlay('drumroll');
  if (real) {
    c.at(3300, () => { c.el.classList.add('drop'); sound.sfxPlay('blade'); });
    c.at(3480, () => { c.el.classList.add('hit'); sound.sfxPlay('thud'); sound.sfxPlay('gore'); });
    c.at(4600, () => sound.sfxPlay('crowd'));
  } else {
    c.at(3300, () => { c.el.classList.add('hit'); sound.sfxPlay('stamp'); });
    c.at(5200, () => c.el.classList.add('fall'));
  }
  return p;
}

export function ending(winner) {
  const cls = { village: 'win-v', wolf: 'win-w', fox: 'win-f' }[winner];
  const icon = { village: 'seer', wolf: 'werewolf', fox: 'fox' }[winner];
  const p = mount('fx-end ' + cls, `
    <div class="bg"></div><div class="rays"></div>${winner !== 'village' ? stars(70) : ''}
    ${winner === 'wolf' ? '<div class="moon red"><span></span></div>' + village(true) : ''}
    ${winner === 'fox' ? '<div class="wisps"><i></i><i></i><i></i><i></i><i></i><i></i></div>' : ''}
    <div class="center-text"><div class="emblem">${roleIcon(winner === 'village' ? 'villager' : icon, 96)}</div><h2>${esc(t('win_title_' + winner))}</h2><p>${esc(t('win_sub_' + winner))}</p></div>`, 8000);
  if (winner === 'village') { sound.sfxPlay('fanfare'); sound.play('endVillage'); }
  else if (winner === 'wolf') { sound.sfxPlay('doom'); mount.last.at(900, () => sound.sfxPlay('howl')); sound.play('endWolf'); }
  else { sound.sfxPlay('fox'); sound.play('endWolf'); }
  return p;
}
