from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
p=Path(__file__).resolve().parent.parent
img=Image.new('RGB',(1600,2000),'white');d=ImageDraw.Draw(img)
font=ImageFont.truetype(str(p/'public/fonts/NotoSans-Regular.ttf'),34)
big=ImageFont.truetype(str(p/'public/fonts/NotoSans-Bold.ttf'),48)
d.text((90,90),'DODACI LIST cislo: DL-2026-001',font=big,fill='#163134')
for y,t in [(210,'Dodavatel: Prauge Atelier'),(280,'Odberatel: Nova Firma'),(350,'Datum: 20.10.2026')]:d.text((90,y),t,font=font,fill='black')
d.rectangle((80,465,1510,570),fill='#edf5f1');
for x,t in [(95,'Nazev zbozi'),(700,'Mnozstvi'),(1000,'Cena za MJ'),(1280,'Celkem')]:d.text((x,500),t,font=font,fill='black')
for y,desc,q,price,total in [(640,'Drevena zidle','3 ks','125,50','376,50'),(750,'Pracovni stul','2 ks','1000,00','2000,00')]:
    for x,t in [(95,desc),(700,q),(1000,price),(1280,total)]:d.text((x,y),t,font=font,fill='black')
    d.line((85,y+65,1510,y+65),fill='#cfded5',width=2)
d.text((930,990),'Celkem 2376,50 Kc',font=font,fill='black')
d.text((90,1700),'QA SAMPLE - PRINTED DOCUMENT',font=font,fill='#7a8a81')
img.save(p/'artifacts/filled-invoice.png')
for n in [2,3,4]:
    variant=img.copy();v=ImageDraw.Draw(variant);v.rectangle((80,80,1520,165),fill='white');v.text((90,90),f'DODACI LIST cislo: DL-2026-00{n}',font=big,fill='#163134');variant.save(p/f'artifacts/filled-invoice-{n}.png')
print('Basili dolu belge test gorseli hazir.')
