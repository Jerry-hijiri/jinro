# OGP画像(1200x630)を作る。 python3 tools/ogimage.py
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import os
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
W, H = 1200, 630
src = Image.open('img/src/intro_village.png').convert('RGB')
s = max(W / src.width, H / src.height); bg = src.resize((int(src.width*s), int(src.height*s)), Image.LANCZOS)
bg = bg.crop(((bg.width-W)//2, (bg.height-H)//2, (bg.width-W)//2+W, (bg.height-H)//2+H))
bg = ImageEnhance.Brightness(bg).enhance(0.55)
shade = Image.new('L', (W, H)); d = ImageDraw.Draw(shade)
for x in range(W): d.line([(x, 0), (x, H)], fill=int(210 * max(0, 1 - x / (W*0.62))))
bg = Image.composite(Image.new('RGB', (W, H), (5, 4, 3)), bg, shade)
d = ImageDraw.Draw(bg)
M = '/System/Library/Fonts/ヒラギノ明朝 ProN.ttc'
title = ImageFont.truetype(M, 128, index=1); sub = ImageFont.truetype(M, 34, index=1); small = ImageFont.truetype(M, 26, index=0)
gold = (232, 200, 114)
d.text((80, 150), 'WEREWOLF · 人狼', font=small, fill=(168, 154, 124))
glow = Image.new('RGBA', (W, H)); ImageDraw.Draw(glow).text((76, 196), '蝋燭人狼', font=title, fill=(232, 160, 60, 160))
bg.paste(glow.filter(ImageFilter.GaussianBlur(14)), (0, 0), glow.filter(ImageFilter.GaussianBlur(14)))
d.text((76, 196), '蝋燭人狼', font=title, fill=gold)
d.text((82, 370), '嘘と推理の、ひと晩', font=sub, fill=(232, 220, 192))
d.text((82, 470), '無料 ・ 登録不要 ・ スマホで遊ぶ対面人狼', font=small, fill=(200, 188, 160))
bg.save('img/og.jpg', quality=86)
print('ok')
