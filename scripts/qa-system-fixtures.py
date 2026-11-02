"""Additional synthetic interruption and total-summary fixtures; originals stay intact."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

root=Path(__file__).resolve().parent.parent
out=root/'artifacts'/json.loads((root/'package.json').read_text(encoding='utf-8'))['version']/'fixtures'
font=ImageFont.truetype(str(root/'public/fonts/NotoSans-Regular.ttf'),30)
bold=ImageFont.truetype(str(root/'public/fonts/NotoSans-Bold.ttf'),42)
small=ImageFont.truetype(str(root/'public/fonts/NotoSans-Regular.ttf'),23)
img=Image.new('RGB',(1800,1900),'white'); draw=ImageDraw.Draw(img)
for y,text in [(75,'INVOICE No: FOOTER-151'),(200,'Supplier: Example Trading Ltd'),(270,'Customer: Demo Shop'),(340,'Date: 21.10.2026'),(410,'Currency: EUR'),(460,'VAT rate: 20%')]:
    draw.text((85,y),text,font=bold if y==75 else font,fill='black')
draw.rectangle((75,520,1730,615),fill='#edf6f4')
for x,text in zip([85,810,1110,1500],['Description','Quantity','Unit price','Total']): draw.text((x,550),text,font=font,fill='black')
for x,text in zip([85,810,1110,1500],['Cotton towels','5 pcs','100.00','600.00']): draw.text((x,675),text,font=font,fill='black')
for y,text in [(1000,'Grand total: 600.00 EUR'),(1120,'Total VAT: 100.00 EUR'),(1200,'Total discount: 0.00 EUR')]: draw.text((1000,y),text,font=font,fill='black')
draw.text((85,1730),'SYNTHETIC TEST DOCUMENT - NOT A REAL TRANSACTION',font=small,fill='#6e7d76')
img.save(out/'vat-footer-invoice.png')
printed=Image.open(out/'english-invoice.png').convert('RGB')
printed.rotate(90,expand=True).save(out/'rotated-invoice.jpg',quality=94)
ImageEnhance.Contrast(printed).enhance(.4).save(out/'faint-invoice.jpg',quality=90)
for source,target in [('english-invoice.png','retry-consistency.jpg'),('delivery-whole-amount.png','after-stop.jpg'),('turkish-invoice.webp','after-error.jpg')]:
    Image.open(out/source).convert('RGB').save(out/target,quality=91)
print(out)
