# 説明ページ（遊び方・プライバシー・利用規約）を生成する。 python3 tools/pages.py
import json, subprocess, os, html
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
CONTACT = os.environ.get('JINRO_CONTACT', 'hijiri.teramoto@sekiya-so.com')
js = r"""
globalThis.localStorage={getItem(){},setItem(){}};globalThis.document={documentElement:{}};
const m=await import('./js/i18n.js'); const R=await import('./js/roles.js'); m.setLang('ja');
console.log(JSON.stringify({roles:Object.keys(R.ROLES).map(r=>[r,R.ROLES[r].team,m.roleName(r),m.roleShort(r),m.roleAbility(r)]),steps:m.list('howSteps')}));
"""
d = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js]))
TEAM = {'village': '市民陣営', 'wolf': '人狼陣営', 'fox': '妖狐', 'lovers': '恋人'}
CSS = """:root{--bg:#050403;--fg:#e8dcc0;--mut:#a89a7c;--gold:#e8c872;--line:#2a241b;--card:#0e0b08}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.85 'Zen Kaku Gothic New',system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}a{color:var(--gold)}
h1{font-family:'Shippori Mincho B1',serif;font-size:clamp(28px,6vw,40px);color:var(--gold);margin:8px 0 4px;letter-spacing:.06em}
h2{font-family:'Shippori Mincho B1',serif;color:var(--gold);font-size:22px;margin:40px 0 8px;border-bottom:1px solid var(--line);padding-bottom:6px}
h3{font-size:17px;margin:20px 0 4px}p,li{color:var(--fg)}.mut{color:var(--mut);font-size:14px}
.top{display:flex;gap:16px;flex-wrap:wrap;font-size:14px;margin-bottom:24px}.top a{text-decoration:none}
.role{display:flex;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0}
.role img{width:72px;height:72px;border-radius:8px;object-fit:cover;flex:none}.role b{color:var(--gold)}
.tag{display:inline-block;font-size:12px;border:1px solid var(--line);border-radius:99px;padding:0 8px;margin-left:6px;color:var(--mut)}
.cta{display:inline-block;margin:16px 0;padding:12px 24px;background:var(--gold);color:#1a1408;border-radius:10px;font-weight:700;text-decoration:none}
footer{border-top:1px solid var(--line);margin-top:48px;padding-top:16px;font-size:13px;color:var(--mut)}"""
NAV = '<nav class="top"><a href="/">▶ 遊ぶ</a><a href="/about/">遊び方</a><a href="/privacy/">プライバシーポリシー</a><a href="/terms/">利用規約</a></nav>'
FOOT = '<footer>蝋燭人狼 — 運営：SEKIYA.so（大分県）' + (f' ／ お問い合わせ：<a href="mailto:{CONTACT}">{CONTACT}</a>' if CONTACT else '') + '</footer>'
def page(path, title, desc, body):
    os.makedirs(path, exist_ok=True)
    open(f'{path}/index.html', 'w').write(f"""<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="google-adsense-account" content="ca-pub-3774532248262939">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}｜蝋燭人狼</title>
<meta name="description" content="{desc}"><link rel="canonical" href="https://rousoku-jinro.uk/{path}/"><meta property="og:title" content="{title}｜蝋燭人狼"><meta property="og:description" content="{desc}"><meta property="og:image" content="https://rousoku-jinro.uk/img/og.jpg"><meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@800&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><main>{NAV}{body}{FOOT}</main></body></html>""")
e = html.escape
steps = ''.join(f'<h3>{i+1}. {e(a)}</h3><p>{e(b)}</p>' for i, (a, b) in enumerate(d['steps']))
roles = ''.join(f'<div class="role"><img src="/img/roles/{r}.webp" alt="{e(n)}" loading="lazy" onerror="this.remove()"><div><b>{e(n)}</b><span class="tag">{TEAM.get(t,t)}</span><br><span class="mut">{e(s)}</span><p style="margin:4px 0 0">{e(a)}</p></div></div>' for r, t, n, s, a in d['roles'])
page('about', '遊び方と役職', '完全無料・登録不要でスマホで遊べる対面人狼ゲーム「蝋燭人狼」の遊び方・12役職の説明・勝利条件。', f"""
<h1>蝋燭人狼の遊び方</h1><p>蝋燭人狼は、同じ場所に集まった4〜20人が、それぞれのスマホで遊ぶ人狼ゲームです。アプリのインストールも会員登録も要りません。オーナーが部屋を作り、画面のQRコードを読み取るだけで参加できます。司会（ゲームマスター）の進行はアプリが代わりに行うので、全員がプレイヤーとして遊べます。</p>
<p>日本語・English・한국어・中文に対応しているので、言葉の違う友達とも同じ部屋で遊べます。</p><p><b>完全無料</b>です。料金・課金・会員登録は一切ありません。</p><h2>おすすめの遊び方</h2><p>スマホだけでも遊べますが、PCやタブレットで部屋を作り、机の真ん中に置くのがおすすめです。その画面が「みんなで見る大画面」になり、夜の演出・朝の発表・議論の残り時間・投票の結果を全員で見られます。ろうそくを囲むように、画面を囲んで遊んでください。</p>
<a class="cta" href="/">今すぐ部屋を作る</a>
<h2>ゲームの流れ</h2>{steps}
<h2>役職一覧</h2><p>参加人数に合わせて、オーナーが役職を選びます。「自動で組む」を押すと、人数に合わせて市民側と人狼側の力がつり合う組み合わせを毎回ランダムに作ります。</p>{roles}
<h2>勝利条件</h2><ul><li><b>市民陣営</b>：人狼を全員処刑する</li><li><b>人狼陣営</b>：生きている人狼の数が、それ以外の人の数と同じかそれ以上になる</li><li><b>妖狐</b>：どちらかの陣営の勝利が決まった時点で生き残っている</li><li><b>恋人</b>：恋人の2人が最後まで生き残る（ほかの陣営より優先）</li></ul>
<h2>はじめて遊ぶときのコツ</h2><ul><li>最初は5〜7人、村人・人狼・占い師だけの少ない構成がおすすめです。</li><li>夜は全員がスマホを操作します。能力のない人も「怪しい人」を選ぶので、操作している様子から役職はばれません。</li><li>PCやタブレットを机の真ん中に置くと、議論の残り時間や投票の結果をみんなで見られます。</li><li>残酷な演出は設定で切り替えられます。</li></ul>
<h2>よくある質問</h2><h3>料金はかかりますか？</h3><p>完全無料です。課金要素もありません。サーバー代は広告でまかなう予定です。</p><h3>個人情報は必要ですか？</h3><p>必要ありません。ゲーム内で使う名前はニックネームで構いません。詳しくは<a href="/privacy/">プライバシーポリシー</a>をご覧ください。</p><h3>オンラインで離れて遊べますか？</h3><p>通信は離れていても届きますが、話し合いは同じ場所で顔を合わせて行う前提で作っています。通話アプリと組み合わせれば離れていても遊べます。</p>
""")
page('privacy', 'プライバシーポリシー', '蝋燭人狼のプライバシーポリシー。', f"""
<h1>プライバシーポリシー</h1><p class="mut">制定日：2026年11月14日 ／ 運営：SEKIYA.so</p>
<p>蝋燭人狼（以下「本サービス」）は、利用者の情報を次のとおり取り扱います。</p>
<h2>1. 取得する情報</h2><ul><li><b>ゲーム内のニックネーム・ゲームの進行データ</b>：同じ部屋の端末どうしで共有するため、公開の中継サーバー（MQTT）を通して送受信します。送受信の内容は部屋ごとの鍵で暗号化しています。</li><li><b>対戦の記録</b>：ゲーム終了時に、部屋コード・勝った陣営・人数・役職の構成を集計用サーバー（Google Apps Script）に送ります。名前は送りません。トップ画面の「みんなの戦績」に使います。</li><li><b>端末に保存する情報</b>：言語・音量・名前などの設定を、利用者の端末（ブラウザのローカルストレージ）に保存します。運営者は見ることができません。</li></ul>
<p>氏名・メールアドレス・住所などの個人情報を入力していただくことはありません。</p>
<h2>2. 広告について</h2><p>本サービスは、第三者配信の広告サービス「Google AdSense」を利用する予定です。Google などの第三者配信事業者は Cookie を使い、利用者が本サービスや他のウェブサイトに過去にアクセスした情報に基づいて広告を配信します。</p><p>Google が広告 Cookie を使用することにより、Google やそのパートナーは本サービスや他のサイトへのアクセス情報に基づいて広告を配信できます。利用者は <a href="https://www.google.com/settings/ads" rel="noopener">Google の広告設定</a> でパーソナライズ広告を無効にできます。また <a href="https://www.aboutads.info/choices/" rel="noopener">www.aboutads.info</a> で第三者配信事業者の Cookie を無効にできます。</p><p>Google による情報の取り扱いは <a href="https://policies.google.com/technologies/partner-sites?hl=ja" rel="noopener">Google のポリシーと規約</a> をご覧ください。</p>
<h2>3. 外部サービス</h2><p>文字の表示に Google Fonts を利用しています。これらのサービスには、利用者の IP アドレスなどが送られることがあります。</p>
<h2>4. 第三者への提供</h2><p>法令に基づく場合を除き、取得した情報を第三者に提供しません。</p>
<h2>5. 改定</h2><p>本ポリシーは必要に応じて改定し、このページでお知らせします。</p>
""")
page('terms', '利用規約', '蝋燭人狼の利用規約。', """
<h1>利用規約</h1><p class="mut">制定日：2026年11月14日 ／ 運営：SEKIYA.so</p>
<h2>1. サービス</h2><p>蝋燭人狼（以下「本サービス」）は、ブラウザで遊べる人狼ゲームです。無料で利用でき、広告を表示することがあります。</p>
<h2>2. 禁止事項</h2><ul><li>法令や公序良俗に反する名前・発言での利用</li><li>他の利用者を不快にさせる行為、なりすまし</li><li>本サービスや中継サーバーに過度な負荷をかける行為、不正なアクセス</li><li>本サービスの画像・音声・映像を無断で転用・再配布すること</li></ul>
<h2>3. 免責</h2><p>本サービスは現状のまま提供します。通信の状況により、ゲームが途中で止まる・記録が残らないことがあります。本サービスの利用で生じた損害について、運営者は故意または重大な過失がある場合を除き責任を負いません。</p>
<h2>4. 変更・終了</h2><p>運営者は、予告なく本サービスの内容を変更し、または提供を終了することがあります。</p>
<h2>5. 準拠法</h2><p>本規約は日本法に従って解釈します。</p>
""")
print('ok', len(d['roles']), 'roles')
