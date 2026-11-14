# ChatGPTで作った2x2の役職画像シートを切り分ける。 python3 tools/cutroles.py シート.png 左上 右上 左下 右下
import sys, os
from PIL import Image
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
src, names = sys.argv[1], sys.argv[2:6]
im = Image.open(src).convert('RGB'); W, H = im.size
def dark_line(axis, center):
    # 中央付近で一番暗い列/行（区切りの黒線）を探す
    best, bi = 1e9, center
    for i in range(center - 40, center + 40):
        box = (i, 0, i + 1, H) if axis == 'x' else (0, i, W, i + 1)
        px = im.crop(box).resize((1, 64) if axis == 'x' else (64, 1))
        v = sum(sum(p) for p in px.getdata())
        if v < best: best, bi = v, i
    return bi
mx, my = dark_line('x', W // 2), dark_line('y', H // 2)
boxes = [(0, 0, mx, my), (mx, 0, W, my), (0, my, mx, H), (mx, my, W, H)]
for name, (x0, y0, x1, y1) in zip(names, boxes):
    if name == '-': continue
    pad = 10
    t = im.crop((x0 + pad, y0 + pad, x1 - pad, y1 - pad))
    w, h = t.size; ar = 501 / 757
    if w / h > ar: nw = int(h * ar); t = t.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = int(w / ar); t = t.crop((0, 0, w, nh))
    t = t.resize((501, 757), Image.LANCZOS)
    t.save(f'img/roles/{name}.webp', quality=82)
    s = 501; y = int(757 * 0.06)
    t.crop((0, y, s, y + s)).resize((192, 192), Image.LANCZOS).save(f'img/roles/thumb/{name}.webp', quality=80)
    print('saved', name)
