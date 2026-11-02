from pathlib import Path
from PIL import Image, ImageDraw
base=Path(__file__).resolve().parent.parent
im=Image.new('RGBA',(512,512),(0,0,0,0));d=ImageDraw.Draw(im)
d.rounded_rectangle((0,0,511,511),radius=115,fill='#087f73')
d.polygon([(154,98),(295,98),(366,171),(366,407),(317,385),(261,409),(208,385),(144,407),(144,112)],fill='white')
d.polygon([(295,98),(295,171),(366,171)],fill='#b3e0d1')
for y,w in [(219,104),(275,104),(331,66)]:d.rounded_rectangle((199,y,199+w,y+19),radius=8,fill='#087f73')
(base/'assets').mkdir(exist_ok=True)
im.save(base/'assets/icon.png');im.save(base/'assets/icon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
res=base/'android/app/src/main/res'
for name,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    folder=res/f'mipmap-{name}';folder.mkdir(exist_ok=True)
    im.resize((size,size),Image.Resampling.LANCZOS).save(folder/'ic_launcher.png')
    im.resize((size,size),Image.Resampling.LANCZOS).save(folder/'ic_launcher_round.png')
    fg=Image.new('RGBA',(size*2,size*2));small=im.resize((int(size*1.25),int(size*1.25)),Image.Resampling.LANCZOS);fg.alpha_composite(small,((fg.width-small.width)//2,(fg.height-small.height)//2));fg.save(folder/'ic_launcher_foreground.png')
print('Windows ve Android simgeleri oluşturuldu.')
