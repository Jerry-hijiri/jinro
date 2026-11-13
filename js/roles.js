// 役職の定義・おすすめ構成・有利度の目安
export const ROLE_ORDER = ['villager', 'werewolf', 'seer', 'medium', 'knight', 'mason', 'madman', 'fox'];

export const ROLES = {
  villager: { team: 'village', color: '#8fb573', max: 20 },
  werewolf: { team: 'wolf', color: '#d0473f', max: 5 },
  seer:     { team: 'village', color: '#8a7cf0', max: 2 },
  medium:   { team: 'village', color: '#5bb7c9', max: 1 },
  knight:   { team: 'village', color: '#d9b45a', max: 1 },
  mason:    { team: 'village', color: '#6aa3e0', max: 3 },
  madman:   { team: 'wolf', color: '#c46aa8', max: 2 },
  fox:      { team: 'fox', color: '#e98a3c', max: 1 },
};

// 64x64 のシンボル（メダルの中に描く）
const P = {
  villager: '<path d="M12 31 32 13l20 18v23H12z" fill="currentColor"/><path d="M27 54V41h10v13z" fill="#0b0f1a" opacity=".55"/><rect x="16" y="35" width="7" height="7" rx="1" fill="#ffd77a"/><rect x="41" y="35" width="7" height="7" rx="1" fill="#ffd77a"/>',
  werewolf: '<path d="M13 9l11 15h16L51 9l2 23c0 13-8 19-14 22l-7 6-7-6C19 51 11 45 11 32z" fill="currentColor"/><path d="M20 33l9 3-8 2zM44 33l-9 3 8 2z" fill="#ffdf6b"/><path d="M28 46h8l-4 5z" fill="#0b0f1a"/>',
  seer: '<circle cx="32" cy="28" r="17" fill="currentColor"/><circle cx="26" cy="22" r="5" fill="#fff" opacity=".45"/><path d="M18 48h28l4 8H14z" fill="currentColor" opacity=".8"/><path d="M36 31a6 6 0 1 1-6-9 8 8 0 0 0 6 9z" fill="#fff" opacity=".7"/>',
  medium: '<path d="M32 6c6 8 7 13 3 18-2 2-5 2-6 0-3-4-1-10 3-18z" fill="#ffd77a"/><rect x="24" y="26" width="16" height="26" rx="3" fill="currentColor"/><path d="M14 54h36v4H14z" fill="currentColor" opacity=".8"/>',
  knight: '<path d="M32 6l20 7v16c0 14-9 23-20 29C21 52 12 43 12 29V13z" fill="currentColor"/><path d="M29 16h6v10h10v6H35v16h-6V32H19v-6h10z" fill="#0b0f1a" opacity=".5"/>',
  mason: '<circle cx="24" cy="32" r="13" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="40" cy="32" r="13" fill="none" stroke="currentColor" stroke-width="6" opacity=".85"/>',
  madman: '<path d="M10 16c14-6 30-6 44 0 0 20-8 36-22 40C18 52 10 36 10 16z" fill="currentColor"/><path d="M17 27c3-4 9-4 12 0-4 3-8 3-12 0zM35 27c3-4 9-4 12 0-4 3-8 3-12 0z" fill="#0b0f1a"/><path d="M20 39c8 8 16 8 24 0-4 9-20 9-24 0z" fill="#0b0f1a"/>',
  fox: '<path d="M9 7l15 19h16L55 7l-2 25-21 26-21-26z" fill="currentColor"/><path d="M14 30l9 4-7 3zM50 30l-9 4 7 3z" fill="#0b0f1a"/><path d="M27 48h10l-5 8z" fill="#fff" opacity=".8"/>',
};

export function roleIcon(role, size = 40) {
  const r = ROLES[role];
  if (!r) return '';
  return `<svg class="ricon" width="${size}" height="${size}" viewBox="0 0 64 64" style="color:${r.color}" aria-hidden="true">${P[role]}</svg>`;
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
  const wolfSide = c.werewolf + 0.45 * c.madman;
  // 人狼の比率（少人数ほど1票の重みが大きい）
  let x = 6 * wolfSide / n;
  // 情報役・守り役の効き（初日の襲撃なしを前提に調整）
  x -= 0.9 * Math.min(c.seer, 1) + 0.3 * Math.max(0, c.seer - 1);
  x -= 0.15 * Math.min(c.medium, 1);
  x -= 0.25 * Math.min(c.knight, 1);
  x -= c.mason >= 2 ? 0.1 : 0;
  x -= 0.3;
  let wolf = 1 / (1 + Math.exp(-1.7 * x));
  let fox = 0;
  if (c.fox) {
    fox = Math.min(0.3, 0.1 + 0.6 / n);
  }
  let village = (1 - wolf) * (1 - fox);
  wolf = wolf * (1 - fox);
  const diff = village - wolf;
  let label = 'even';
  if (diff > 0.35) label = 'strongV';
  else if (diff > 0.16) label = 'village';
  else if (diff < -0.35) label = 'strongW';
  else if (diff < -0.16) label = 'wolf';
  return { village, wolf, fox, label };
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
  return errs;
}

// 勝敗の点数：勝ちにくい側ほど勝ったときの点が高く、勝ちやすい側ほど負けたときの減点が大きい
export function points(cfg) {
  const b = balance(cfg);
  if (!b) return null;
  const f = (p) => ({ win: Math.max(4, Math.round(20 * (1 - p))), lose: Math.max(1, Math.round(10 * p)) });
  const o = { village: f(b.village), wolf: f(b.wolf) };
  if (b.fox) o.fox = f(b.fox);
  return o;
}
