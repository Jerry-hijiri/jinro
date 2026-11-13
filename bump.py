# 公開前に実行：JS/CSSに版番号を付け、端末に残った古いキャッシュを避ける（python3 bump.py）
import re, os, time
os.chdir(os.path.dirname(os.path.abspath(__file__)))
v = time.strftime('%Y%m%d%H%M%S')
mods = sorted(f for f in os.listdir('js') if f.endswith('.js'))
imap = '<script type="importmap">{"imports":{' + ','.join(f'"./js/{m}":"./js/{m}?v={v}"' for m in mods) + '}}</script>'
s = open('index.html').read()
s = re.sub(r'<script type="importmap">.*?</script>\n?', '', s)
s = re.sub(r'href="css/style\.css(\?v=\d+)?"', f'href="css/style.css?v={v}"', s)
s = re.sub(r'<script type="module"[^>]*>[^<]*</script>', imap + '\n<script type="module">import "./js/app.js";</script>', s)
open('index.html', 'w').write(s)
print('version', v)
