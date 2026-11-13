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
      setTimeout(() => { el.remove(); if (current === ctrl) current = null; resolve(); }, 600);
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

export function morning(day, victims) {
  if (!victims.length) {
    const p = mount('fx-morning', `<div class="dawn"></div><div class="sun"></div>${village(false)}
      <div class="center-text"><h2>${esc(t('morningN', { n: day + 0 }))}</h2><p>${esc(t('morningPeace'))}</p></div>`, 7000);
    sound.sfxPlay('bell');
    return p;
  }
  const names = joinNames(victims.map((v) => v.name));
  const cards = victims.map((v) => `<div class="vcard"><div class="av" style="--c:${v.color}">${esc([...v.name.replace(/^CPU\s+/, '')][0] || '?')}</div><b>${esc(v.name)}</b></div>`).join('');
  const p = mount('fx-kill', `
    <div class="redsky"></div><div class="moon red"><span></span></div>
    <div class="kill-stage">${cards}</div>
    <svg class="claws" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path pathLength="100" d="M18 8 Q40 45 70 96"/><path pathLength="100" d="M32 4 Q54 42 84 92"/><path pathLength="100" d="M46 2 Q68 38 98 86"/>
    </svg>
    <div class="splat"></div><div class="vignette"></div>
    <div class="center-text low"><h2>${esc(t('morningN', { n: day }))}</h2><p>${esc(t('morningDead', { names }))}</p></div>`, 10000);
  const c = mount.last;
  sound.sfxPlay('heartbeat');
  c.at(2600, () => { c.el.classList.add('strike'); sound.sfxPlay('slash'); });
  c.at(3200, () => { sound.sfxPlay('impact'); });
  c.at(4200, () => sound.sfxPlay('bell'));
  return p;
}

export function execution(victim, lot) {
  const p = mount('fx-exec', `
    <div class="dark"></div><div class="spot"></div>
    <svg class="rope" viewBox="0 0 60 300"><path d="M30 0V210"/><ellipse cx="30" cy="238" rx="17" ry="27"/><path d="M24 205h12v14H24z"/></svg>
    <div class="ecard"><div class="av" style="--c:${victim.color}">${esc([...victim.name.replace(/^CPU\s+/, '')][0] || '?')}</div><b>${esc(victim.name)}</b></div>
    <div class="stamp">${esc(t('tag_exec'))}</div>
    <div class="ash"></div>
    <div class="center-text low"><p>${lot ? esc(t('lot')) + '<br>' : ''}${esc(t('executed', { name: victim.name }))}</p></div>`, 8600);
  const c = mount.last;
  sound.sfxPlay('drumroll');
  c.at(3300, () => { c.el.classList.add('hit'); sound.sfxPlay('stamp'); });
  c.at(5200, () => c.el.classList.add('fall'));
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
