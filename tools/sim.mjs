// CPUだけで大量に対戦させて、止まらないか・勝率の偏りを確かめる。 node tools/sim.mjs [回数] [人数] [役職JSON]
let now = 1e12; const q = []; let seq = 0;
globalThis.Date.now = () => now;
globalThis.setTimeout = (f, ms = 0) => { const id = ++seq; q.push({ id, at: now + ms, f }); return id; };
globalThis.clearTimeout = (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
const { Engine } = await import('../js/engine.js');
const { randomBalanced, full } = await import('../js/roles.js');
const N = +(process.argv[2] || 200), P = +(process.argv[3] || 0), CFG = process.argv[4] ? JSON.parse(process.argv[4]) : null;
const wins = {}; const errs = []; let stuck = 0; let days = 0;
const roleWins = {};
for (let g = 0; g < N; g++) {
  q.length = 0;
  const n = P || 5 + Math.floor(Math.random() * 12);
  const e = new Engine('SIMROO', { pub() {}, sub() {}, kind: 'bc', index: 0 }, { pub: 'x', priv: null });
  e.s.settings.discuss = 60;
  for (let i = 0; i < n; i++) e.addBot();
  if (CFG) { e.s.cfg = full(CFG); e.s.cfg.villager = n - Object.entries(CFG).filter(([k]) => k !== 'villager').reduce((a, [, v]) => a + v, 0); }
  else e.s.cfg = randomBalanced(n);
  if (!e.start()) { errs.push('start ' + JSON.stringify(e.s.cfg)); continue; }
  let steps = 0;
  try {
    while (e.s.phase !== 'end' && q.length && steps < 20000) {
      q.sort((a, b) => a.at - b.at); const t = q.shift(); now = Math.max(now, t.at); t.f(); steps++;
    }
  } catch (err) { errs.push(err.stack.split('\n').slice(0, 3).join(' | ')); continue; }
  if (e.s.phase !== 'end') { stuck++; if (stuck < 4) errs.push('stuck at ' + e.s.phase + ' day ' + e.s.day); continue; }
  wins[e.s.winner] = (wins[e.s.winner] || 0) + 1; days += e.s.day;
  for (const [id, r] of Object.entries(e.s.origRoles)) { const o = (roleWins[r] ||= [0, 0]); o[1]++; if (e.s.winners.includes(id)) o[0]++; }
}
const tot = Object.values(wins).reduce((a, b) => a + b, 0);
console.log('games', tot, 'stuck', stuck, 'avgDay', (days / tot).toFixed(1));
console.log(Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, (100 * v / tot).toFixed(0) + '%'])));
console.log('role win%:', Object.entries(roleWins).sort().map(([r, [w, n]]) => `${r} ${(100 * w / n).toFixed(0)}%(${n})`).join(', '));
if (errs.length) console.log('ERR', [...new Set(errs)].slice(0, 6));
