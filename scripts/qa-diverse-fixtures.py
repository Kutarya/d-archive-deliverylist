"""Synthetic documents only. No customer records are used by these tests."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

root = Path(__file__).resolve().parent.parent
out = root / 'artifacts' / json.loads((root / 'package.json').read_text(encoding='utf-8'))['version'] / 'fixtures'
out.mkdir(parents=True, exist_ok=True)
fontpath = root / 'public' / 'fonts'
font = ImageFont.truetype(str(fontpath / 'NotoSans-Regular.ttf'), 30)
bold = ImageFont.truetype(str(fontpath / 'NotoSans-Bold.ttf'), 42)
small = ImageFont.truetype(str(fontpath / 'NotoSans-Regular.ttf'), 23)

cases = [
    dict(file='english-invoice.png', title='INVOICE No: EN-26001', number='EN-26001',
         supplier='Supplier: Northwood Furniture Ltd', customer='Customer: Willow Design Studio',
         date='Date: 20.10.2026', currency='EUR', type='Fatura',
         headers=['Description', 'Quantity', 'Unit price', 'Total'],
         rows=[['Oak dining chair', '3 pcs', '125.50', '376.50'], ['Office desk', '2 pcs', '1000.00', '2000.00']], total='Grand total: 2376.50 EUR', expected=2376.50),
    dict(file='czech-delivery.jpg', title='DODACÍ LIST číslo: CZ-26002', number='CZ-26002',
         supplier='Dodavatel: Dřevěný Dům s.r.o.', customer='Odběratel: Nová Firma',
         date='Datum: 19.10.2026', currency='CZK', type='Teslimat fişi',
         headers=['Název zboží', 'Množství', 'Cena za MJ', 'Celkem'],
         rows=[['Pracovní stůl', '2 ks', '1500,50', '3001,00'], ['Police', '4 ks', '200,-', '800,-']], total='Celkem: 3801,00 Kč', expected=3801),
    dict(file='turkish-invoice.webp', title='FATURA No: TR-26003', number='TR-26003',
         supplier='Satıcı: Örnek Mobilya A.Ş.', customer='Alıcı: Işık Tasarım Ltd',
         date='Tarih: 18.10.2026', currency='TRY', type='Fatura',
         headers=['Ürün açıklaması', 'Miktar', 'Birim fiyat', 'Tutar'],
         rows=[['Çalışma masası', '2 adet', '1.250,50', '2.501,00'], ['Ahşap raf', '3 adet', '150,25', '450,75']], total='Genel toplam: 2.951,75 TL', expected=2951.75),
    dict(file='english-discount-vat.png', title='INVOICE No: TAX-26004', number='TAX-26004',
         supplier='Supplier: Sample Trading Ltd', customer='Customer: Demo Retail Ltd',
         date='Date: 20.10.2026', currency='GBP', type='Fatura',
         headers=['Description', 'Qty', 'Unit price', 'Discount %', 'VAT %', 'Total'],
         rows=[['Cotton towels', '5 pcs', '20.00', '10', '20', '108.00'], ['Table runner', '2 pcs', '30.00', '0', '20', '72.00']], total='Grand total: 180.00 GBP', expected=180),
    dict(file='delivery-whole-amount.png', title='DELIVERY NOTE No: DL-26005', number='DL-26005',
         supplier='Supplier: Example Textile', customer='Customer: Demo Shop',
         date='Date: 20.10.2026', currency='USD', type='Teslimat fişi',
         headers=['Product', 'Quantity', 'Price', 'Amount'],
         rows=[['Wool socks', '200 pcs', '3.00', '600.00']], total='Total due: 600.00 USD', expected=600),
]

images=[]
for case in cases:
    img=Image.new('RGB',(1800,1900),'white'); d=ImageDraw.Draw(img)
    d.text((85,75),case['title'],font=bold,fill='#163134')
    for y,text in [(200,case['supplier']),(270,case['customer']),(340,case['date'])]:
        d.text((85,y),text,font=font,fill='black')
    d.text((85,410),'Currency: '+case['currency'],font=font,fill='black')
    xs=[85,810,1110,1500] if len(case['headers'])==4 else [85,660,900,1150,1390,1580]
    d.rectangle((75,510,1730,605),fill='#edf6f4')
    for x,text in zip(xs,case['headers']):d.text((x,540),text,font=font if len(xs)==4 else small,fill='black')
    for n,row in enumerate(case['rows']):
        for x,text in zip(xs,row):d.text((x,665+n*115),text,font=font,fill='black')
        d.line((75,735+n*115,1730,735+n*115),fill='#c5d7d1',width=2)
    d.text((1050,1060),case['total'],font=font,fill='black')
    d.text((85,1730),'SYNTHETIC TEST DOCUMENT - NOT A REAL TRANSACTION',font=small,fill='#6e7d76')
    img.save(out/case['file'],quality=96)
    images.append(img)

blank=Image.new('RGB',(1800,1900),'white');d=ImageDraw.Draw(blank)
for y,text in [(80,'DELIVERY NOTE'),(200,'Supplier:'),(270,'Customer:'),(340,'Date:'),(540,'Description                 Quantity                 Unit price                 Total')]:
    d.text((85,y),text,font=font,fill='black')
blank.save(out/'blank-form.png')
(out/'broken-image.png').write_bytes(b'not an image')
rotated=images[0].rotate(2,expand=False,fillcolor='white').filter(ImageFilter.GaussianBlur(.3))
rotated.save(out/'slightly-skewed-invoice.jpg',quality=88)
pdf=canvas.Canvas(str(out/'two-page-documents.pdf'),pagesize=(595.28,628.35))
for img in [images[0],images[4]]:
    pdf.drawImage(ImageReader(img),0,0,width=595.28,height=628.35);pdf.showPage()
pdf.save()
(out/'expected.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(cases)} distinct layouts, blank, damaged, skewed image and 2-page PDF: {out}')
