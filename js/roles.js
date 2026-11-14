// 役職の定義・おすすめ構成・有利度の目安
export const ROLE_ORDER = ['villager', 'werewolf', 'seer', 'medium', 'knight', 'mason', 'baker', 'hunter', 'samurai', 'dictator', 'prince', 'elder', 'thief', 'dog', 'santa', 'chuuni', 'madman', 'fanatic', 'madsci', 'fox', 'immoral', 'cupid', 'vampire', 'dracula', 'cult'];
// 陣営（枠の色・勝敗の単位）
export const TEAMS = ['village', 'wolf', 'fox', 'lovers', 'vampire', 'cult'];

export const ROLES = {
  villager: { team: 'village', color: '#8fb573', max: 20 },
  werewolf: { team: 'wolf', color: '#d0473f', max: 5 },
  seer:     { team: 'village', color: '#8a7cf0', max: 2 },
  medium:   { team: 'village', color: '#5bb7c9', max: 1 },
  knight:   { team: 'village', color: '#d9b45a', max: 1 },
  mason:    { team: 'village', color: '#6aa3e0', max: 3 },
  madman:   { team: 'wolf', color: '#c46aa8', max: 2 },
  fox:      { team: 'fox', color: '#e98a3c', max: 1 },
  cupid:    { team: 'lovers', color: '#d06a9a', max: 1 },
  baker:    { team: 'village', color: '#d9a35a', max: 1 },
  hunter:   { team: 'village', color: '#8a6a3a', max: 1 },
  fanatic:  { team: 'wolf', color: '#9b3b5a', max: 1 },
  samurai:  { team: 'village', color: '#b8b0a0', max: 1 },
  dictator: { team: 'village', color: '#c9a227', max: 1 },
  prince:   { team: 'village', color: '#e0c060', max: 1 },
  elder:    { team: 'village', color: '#a89a7c', max: 1 },
  thief:    { team: 'village', color: '#6b6b8a', max: 1 },
  dog:      { team: 'village', color: '#9a7a50', max: 1 },
  santa:    { team: 'village', color: '#d04040', max: 1 },
  chuuni:   { team: 'village', color: '#7a5ac0', max: 2 },
  madsci:   { team: 'wolf', color: '#5ac08a', max: 1 },
  immoral:  { team: 'fox', color: '#5b93ea', max: 1 },
  vampire:  { team: 'vampire', color: '#8a3ad0', max: 2 },
  dracula:  { team: 'vampire', color: '#6a1a9a', max: 1 },
  cult:     { team: 'cult', color: '#1fa39a', max: 1 },
};
// 占い・霊媒の結果
export const seenAs = (role) => (role === 'werewolf' || role === 'dog' ? 'wolf' : role === 'dracula' ? 'vampire' : 'human');

// 64x64 のシンボル（メダルの中に描く）
const P = {
  villager: '<path d="M12 31 32 13l20 18v23H12z" fill="currentColor"/><path d="M27 54V41h10v13z" fill="#0b0f1a" opacity=".55"/><rect x="16" y="35" width="7" height="7" rx="1" fill="#ffd77a"/><rect x="41" y="35" width="7" height="7" rx="1" fill="#ffd77a"/>',
  werewolf: '<path d="M13 9l11 15h16L51 9l2 23c0 13-8 19-14 22l-7 6-7-6C19 51 11 45 11 32z" fill="currentColor"/><path d="M20 33l9 3-8 2zM44 33l-9 3 8 2z" fill="#ffdf6b"/><path d="M28 46h8l-4 5z" fill="#0b0f1a"/>',
  seer: '<circle cx="32" cy="28" r="17" fill="currentColor"/><circle cx="26" cy="22" r="5" fill="#fff" opacity=".45"/><path d="M18 48h28l4 8H14z" fill="currentColor" opacity=".8"/><path d="M36 31a6 6 0 1 1-6-9 8 8 0 0 0 6 9z" fill="#fff" opacity=".7"/>',
  medium: '<path d="M32 6c6 8 7 13 3 18-2 2-5 2-6 0-3-4-1-10 3-18z" fill="#ffd77a"/><rect x="24" y="26" width="16" height="26" rx="3" fill="currentColor"/><path d="M14 54h36v4H14z" fill="currentColor" opacity=".8"/>',
  knight: '<path d="M32 6l20 7v16c0 14-9 23-20 29C21 52 12 43 12 29V13z" fill="currentColor"/><path d="M29 16h6v10h10v6H35v16h-6V32H19v-6h10z" fill="#0b0f1a" opacity=".5"/>',
  mason: '<circle cx="24" cy="32" r="13" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="40" cy="32" r="13" fill="none" stroke="currentColor" stroke-width="6" opacity=".85"/>',
  madman: '<path d="M10 16c14-6 30-6 44 0 0 20-8 36-22 40C18 52 10 36 10 16z" fill="currentColor"/><path d="M17 27c3-4 9-4 12 0-4 3-8 3-12 0zM35 27c3-4 9-4 12 0-4 3-8 3-12 0z" fill="#0b0f1a"/><path d="M20 39c8 8 16 8 24 0-4 9-20 9-24 0z" fill="#0b0f1a"/>',
  baker: '<path d="M10 40c0-12 10-20 22-20s22 8 22 20v6H10z" fill="currentColor"/><path d="M20 30l4 8M30 27l2 9M40 28l-1 9M48 32l-3 7" stroke="#0b0f1a" stroke-width="2.5" opacity=".5"/>',
  hunter: '<path d="M14 50L50 14" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="14" r="5" fill="currentColor"/>',
  fanatic: '<circle cx="32" cy="30" r="20" fill="currentColor"/><path d="M22 28l6 3-6 2zM42 28l-6 3 6 2z" fill="#0b0f1a"/>',
  cupid: '<path d="M32 54C14 42 8 32 8 23c0-8 6-13 12-13 5 0 9 3 12 8 3-5 7-8 12-8 6 0 12 5 12 13 0 9-6 19-24 31z" fill="currentColor"/><path d="M6 46L56 14" stroke="#f3e2c0" stroke-width="3"/><path d="M56 14l-9 1 5 6z" fill="#f3e2c0"/>',
  samurai: '<path d="M14 52L50 10" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M20 40l6 6" stroke="currentColor" stroke-width="7"/>',
  dictator: '<path d="M12 46l4-24 10 10 6-16 6 16 10-10 4 24z" fill="currentColor"/><rect x="12" y="48" width="40" height="6" fill="currentColor"/>',
  prince: '<path d="M14 40l4-18 8 8 6-12 6 12 8-8 4 18z" fill="currentColor"/><circle cx="32" cy="48" r="6" fill="currentColor"/>',
  elder: '<path d="M30 8h4v48h-4z" fill="currentColor"/><path d="M34 8c8 0 12 4 12 10h-4c0-4-3-6-8-6z" fill="currentColor"/>',
  thief: '<path d="M8 28c8-6 40-6 48 0v8c-8 6-40 6-48 0z" fill="currentColor"/><circle cx="22" cy="32" r="4" fill="#0b0f1a"/><circle cx="42" cy="32" r="4" fill="#0b0f1a"/>',
  dog: '<path d="M14 14l10 10h16l10-10 2 22c0 10-8 18-20 18S12 46 12 36z" fill="currentColor"/><circle cx="25" cy="34" r="3" fill="#0b0f1a"/><circle cx="39" cy="34" r="3" fill="#0b0f1a"/>',
  santa: '<path d="M12 40c4-20 28-30 40-20l-6 6c-6-4-20 0-24 14z" fill="currentColor"/><rect x="10" y="40" width="44" height="10" rx="5" fill="#f3e2c0"/><circle cx="52" cy="22" r="5" fill="#f3e2c0"/>',
  chuuni: '<path d="M32 6l6 18h18l-14 11 5 18-15-11-15 11 5-18L8 24h18z" fill="currentColor"/>',
  madsci: '<path d="M26 8h12v16l14 26c2 4-1 8-5 8H17c-4 0-7-4-5-8l14-26z" fill="currentColor"/><path d="M18 44h28" stroke="#0b0f1a" stroke-width="3" opacity=".5"/>',
  immoral: '<path d="M32 8l20 24-20 24-20-24z" fill="currentColor"/><path d="M32 20v24M22 32h20" stroke="#0b0f1a" stroke-width="4" opacity=".5"/>',
  vampire: '<path d="M6 20c10 4 16 4 26 0 10 4 16 4 26 0-4 18-14 30-26 36C20 50 10 38 6 20z" fill="currentColor"/><path d="M26 34l2 8 2-8zM34 34l2 8 2-8z" fill="#fff"/>',
  dracula: '<path d="M8 12l24 12 24-12-6 30-18 14-18-14z" fill="currentColor"/><path d="M26 36l2 8 2-8zM34 36l2 8 2-8z" fill="#fff"/>',
  cult: '<circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width="5"/><path d="M32 12v40M14 26h36" stroke="currentColor" stroke-width="5"/>',
  fox: '<path d="M9 7l15 19h16L55 7l-2 25-21 26-21-26z" fill="currentColor"/><path d="M14 30l9 4-7 3zM50 30l-9 4 7 3z" fill="#0b0f1a"/><path d="M27 48h10l-5 8z" fill="#fff" opacity=".8"/>',
};

export function roleIcon(role, size = 40) {
  const r = ROLES[role];
  if (!r) return '';
  // 生成した肖像画の小絵（読めなければ記号にフォールバック）
  return `<span class="ricon pic t-${r.team}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 64 64" style="color:${r.color}" aria-hidden="true">${P[role]}</svg><img src="img/roles/thumb/${role}.webp" alt="" loading="lazy" onerror="this.remove()"></span>`;
}

export const PRESETS = {
  4: { werewolf: 1, seer: 1, knight: 1, villager: 1 },
  5: { werewolf: 1, seer: 1, villager: 3 },
  6: { werewolf: 1, madman: 1, seer: 1, knight: 1, villager: 2 },
  7: { werewolf: 1, madman: 1, seer: 1, knight: 1, villager: 3 },
  8: { werewolf: 2, seer: 1, medium: 1, knight: 1, villager: 3 },
  9: { werewolf: 2, madman: 1, seer: 1, medium: 1, knight: 1, villager: 3 },
  10: { werewolf: 2, madman: 1, seer: 1, medium: 1, knight: 1, villager: 4 },
  11: { werewolf: 2, madman: 1, seer: 1, medium: 1, knight: 1, villager: 5 },
  12: { werewolf: 3, madman: 1, seer: 1, medium: 1, knight: 1, mason: 2, villager: 3 },
  13: { werewolf: 3, madman: 1, seer: 1, medium: 1, knight: 1, mason: 2, villager: 4 },
  14: { werewolf: 3, madman: 1, seer: 1, medium: 1, knight: 1, mason: 2, fox: 1, villager: 4 },
  15: { werewolf: 3, madman: 1, seer: 1, medium: 1, knight: 1, mason: 2, fox: 1, villager: 5 },
  16: { werewolf: 3, madman: 1, seer: 1, medium: 1, knight: 1, mason: 2, fox: 1, villager: 6 },
};
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 20;

export function full(cfg) {
  const o = {};
  for (const r of ROLE_ORDER) o[r] = Math.max(0, cfg?.[r] | 0);
  return o;
}

export function recommend(n) {
  n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n | 0));
  if (PRESETS[n]) return full(PRESETS[n]);
  const c = full(PRESETS[16]);
  c.villager += n - 16;
  if (n >= 18) { c.werewolf = 4; c.villager -= 1; }
  return c;
}

export const total = (cfg) => ROLE_ORDER.reduce((a, r) => a + (cfg[r] | 0), 0);

// 有利度の目安（経験則のモデル。人狼側の勝率を推定する）
export function balance(cfgIn) {
  const c = full(cfgIn);
  const n = total(c);
  if (n < 3 || c.werewolf < 1) return null;
  const wolfSide = c.werewolf + 0.45 * c.madman + 0.65 * (c.fanatic || 0) + 0.55 * (c.madsci || 0);
  // 人狼の比率（少人数ほど1票の重みが大きい）
  let x = 6 * wolfSide / n;
  // 情報役・守り役の効き（初日の襲撃なしを前提に調整）
  x -= 0.9 * Math.min(c.seer, 1) + 0.3 * Math.max(0, c.seer - 1);
  x -= 0.15 * Math.min(c.medium, 1);
  x -= 0.25 * Math.min(c.knight, 1);
  x -= 0.35 * Math.min(c.samurai || 0, 1);
  x -= 0.25 * Math.min(c.dictator || 0, 1);
  x -= 0.08 * Math.min(c.prince || 0, 1);
  x -= 0.12 * Math.min(c.dog || 0, 1);
  x += 0.06 * (c.elder || 0); x -= 0.15 * (c.santa || 0);
  x -= c.mason >= 2 ? 0.1 : 0;
  x -= 0.2 * Math.min(c.hunter || 0, 1);
  x -= 0.3;
  let wolf = 1 / (1 + Math.exp(-1.7 * x));
  let fox = 0;
  if (c.fox) {
    fox = Math.min(0.32, 0.1 + 0.6 / n + 0.06 * (c.immoral || 0));
  }
  const lovers = c.cupid ? Math.min(0.25, 0.08 + 0.5 / n) : 0;
  const vamps = (c.vampire || 0) + (c.dracula || 0);
  const vampire = vamps ? Math.min(0.35, 0.12 * (c.vampire || 0) + 0.03 * (c.dracula || 0) + 0.5 / n) : 0;
  const cult = c.cult ? Math.min(0.2, 0.04 + 0.6 / (n * n) * 10) : 0;
  const rest = (1 - fox) * (1 - lovers) * (1 - vampire) * (1 - cult);
  let village = (1 - wolf) * rest;
  wolf = wolf * rest;
  fox = fox * (1 - lovers) * (1 - vampire) * (1 - cult);
  const vamp = vampire * (1 - lovers) * (1 - cult);
  const cul = cult * (1 - lovers);
  const diff = village - wolf;
  let label = 'even';
  if (diff > 0.35) label = 'strongV';
  else if (diff > 0.16) label = 'village';
  else if (diff < -0.35) label = 'strongW';
  else if (diff < -0.16) label = 'wolf';
  return { village, wolf, fox, lovers, vampire: vamp, cult: cul, label };
}

export function validate(cfgIn, n) {
  const c = full(cfgIn);
  const errs = [];
  if (n < MIN_PLAYERS) errs.push(['minPlayers', { n: MIN_PLAYERS }]);
  if (total(c) !== n) errs.push(['needMatch', { n, a: total(c) }]);
  if (c.werewolf < 1) errs.push(['needWolf']);
  const humans = n - c.werewolf;
  if (c.werewolf >= humans) errs.push(['tooManyWolves']);
  if (c.mason === 1) errs.push(['masonPair']);
  if (c.immoral && !c.fox) errs.push(['needFox']);
  return errs;
}

// 勝敗の点数：勝ちにくい側ほど勝ったときの点が高く、勝ちやすい側ほど負けたときの減点が大きい
export function points(cfg) {
  const b = balance(cfg);
  if (!b) return null;
  const f = (p) => ({ win: Math.max(4, Math.round(20 * (1 - p))), lose: Math.max(1, Math.round(10 * p)) });
  const o = { village: f(b.village), wolf: f(b.wolf) };
  if (b.fox) o.fox = f(b.fox);
  if (b.lovers) o.lovers = f(b.lovers);
  if (b.vampire) o.vampire = f(b.vampire);
  if (b.cult) o.cult = f(b.cult);
  return o;
}

// 人数に合わせて、毎回ちがう「力関係がつり合った」構成を作る（直前と同じ構成は避ける）
export function randomBalanced(nIn, prev = null, tries = 600) {
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, nIn | 0));
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const same = (a, b) => b && ROLE_ORDER.every((r) => (a[r] | 0) === (b[r] | 0));
  const wolfRange = n <= 5 ? [1, 1] : n <= 7 ? [1, 2] : n <= 11 ? [2, 2] : n <= 15 ? [2, 3] : [3, 4];
  const cands = [];
  for (let i = 0; i < tries; i++) {
    const c = full({});
    c.werewolf = R(...wolfRange);
    c.seer = 1;
    let left = n - c.werewolf - 1;
    const opt = [
      ['medium', n >= 6 ? 0.6 : 0.15], ['knight', n >= 5 ? 0.65 : 0.3], ['baker', 0.3], ['hunter', n >= 6 ? 0.4 : 0.15],
      ['madman', n >= 6 ? 0.5 : 0.15], ['fanatic', n >= 7 ? 0.35 : 0.1], ['fox', n >= 9 ? 0.35 : n >= 7 ? 0.12 : 0], ['cupid', n >= 6 ? 0.3 : 0],
      ['samurai', n >= 7 ? 0.2 : 0], ['dictator', n >= 7 ? 0.15 : 0], ['prince', n >= 6 ? 0.15 : 0], ['elder', n >= 7 ? 0.1 : 0],
      ['thief', n >= 7 ? 0.12 : 0], ['chuuni', 0.12], ['dog', n >= 9 ? 0.1 : 0], ['santa', n >= 8 ? 0.08 : 0], ['madsci', n >= 9 ? 0.12 : 0],
      ['vampire', n >= 11 ? 0.12 : 0], ['cult', n >= 10 ? 0.06 : 0],
    ];
    for (const [r, p] of opt.sort(() => Math.random() - 0.5)) {
      if (left <= 1) break;
      if (Math.random() < p) { c[r] = 1; left--; }
    }
    if (n >= 10 && left >= 3 && Math.random() < 0.35) { c.mason = 2; left -= 2; }
    if (c.fox && left >= 2 && n >= 12 && Math.random() < 0.3) { c.immoral = 1; left--; }
    c.villager = left;
    if (c.villager < 0 || validate(c, n).length) continue;
    const b = balance(c);
    if (!b) continue;
    const gap = Math.abs(b.village - b.wolf);
    cands.push({ c, gap, b });
  }
  cands.sort((a, b) => a.gap - b.gap);
  const good = cands.filter((x) => x.b.label === 'even' && !same(x.c, prev)).slice(0, 25);
  const pool = good.length ? good : cands.filter((x) => !same(x.c, prev)).slice(0, 5);
  return (pool[Math.floor(Math.random() * pool.length)] || { c: recommend(n) }).c;
}
