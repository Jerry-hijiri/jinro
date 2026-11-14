// 全端末の対戦記録（Google Apps Script のウェブアプリに送る・読む）
export const STATS_URL = 'https://script.google.com/macros/s/AKfycbxnofcRXVcWZPxWb0DJ8U62kmplXmt0Y0JNONhyDt5rbSSqoTN8AUWM71JQ0rqN_aMF/exec';
const ok = () => STATS_URL.startsWith('https://');

export async function fetchStats() {
  if (!ok()) return null;
  try {
    const r = await fetch(STATS_URL + '?a=get&_=' + Date.now());
    const j = await r.json();
    if (j?.stats) { try { localStorage.setItem('mj-stats', JSON.stringify(j.stats)); } catch {} }
    return j?.stats || null;
  } catch { return null; }
}
export function cachedStats() {
  try { return JSON.parse(localStorage.getItem('mj-stats') || 'null'); } catch { return null; }
}
export async function reportGame(g) {
  if (!ok()) return false;
  const q = new URLSearchParams({ a: 'add', id: g.id, room: g.room, r: g.round, w: g.winner, n: g.n, cfg: g.cfg });
  try {
    const r = await fetch(STATS_URL + '?' + q.toString());
    const j = await r.json();
    if (j?.stats) { try { localStorage.setItem('mj-stats', JSON.stringify(j.stats)); } catch {} }
    return !!j?.ok;
  } catch { return false; }
}
