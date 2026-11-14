// 蝋燭人狼：全端末の対戦記録を集める口（Google Apps Script のウェブアプリ）
// 公開：自分として実行／全員がアクセス可。シートIDはスクリプトのプロパティ SHEET_ID に保存。
const WINNERS = ['village', 'wolf', 'fox', 'lovers', ''];

function sheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  let ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.create('月夜の人狼_対戦記録');
    props.setProperty('SHEET_ID', ss.getId());
  }
  let sh = ss.getSheetByName('games');
  if (!sh) {
    sh = ss.insertSheet('games');
    sh.appendRow(['記録日時', 'ゲームID', '部屋', '何戦目', '勝った陣営', '人数', '役職構成', '備考']);
    sh.setFrozenRows(1);
    const d = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
    if (d) ss.deleteSheet(d);
  }
  return sh;
}

// 最初に1回だけ手で実行：シートを作り、2026-11-13 の8戦を登録
function setup() {
  const sh = sheet_();
  if (sh.getLastRow() > 1) return;
  const day = new Date('2026-11-13T22:00:00+09:00');
  const seed = [
    ['BHB6D3', 1, 'fox'], ['BHB6D3', 2, ''], ['BHB6D3', 3, ''], ['BHB6D3', 4, 'lovers'],
    ['HFD7CH', 1, 'village'],
    ['3ASRXJ', 1, ''], ['3ASRXJ', 2, ''], ['3ASRXJ', 3, 'wolf'],
  ];
  seed.forEach(([room, r, w]) => sh.appendRow([day, 'seed-' + room + '-' + r, room, r, w, '', '', w ? '手入力' : '手入力（勝者の記録なし）']));
  Logger.log(sh.getParent().getUrl());
}

function stats_() {
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  const rows = n > 0 ? sh.getRange(2, 5, n, 1).getValues() : [];
  const o = { total: rows.length, known: 0, village: 0, wolf: 0, fox: 0, lovers: 0 };
  rows.forEach(([w]) => { if (w && o[w] != null) { o[w]++; o.known++; } });
  return o;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.a === 'add') {
    const id = String(p.id || '').slice(0, 40);
    const w = String(p.w || '');
    const n = Number(p.n || 0);
    if (!id || WINNERS.indexOf(w) < 0 || !w || n < 4 || n > 20) return json_({ ok: false, error: 'bad' });
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sh = sheet_();
      const last = sh.getLastRow();
      const ids = last > 1 ? sh.getRange(2, 2, last - 1, 1).getValues().map((r) => r[0]) : [];
      if (ids.indexOf(id) < 0) {
        sh.appendRow([new Date(), id, String(p.room || '').slice(0, 8), Number(p.r || 0), w, n, String(p.cfg || '').slice(0, 300), '']);
      }
    } finally { lock.releaseLock(); }
    return json_({ ok: true, stats: stats_() });
  }
  return json_({ ok: true, stats: stats_() });
}
