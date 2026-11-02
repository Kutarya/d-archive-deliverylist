import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvoice} from '../src/ocr';
import {amounts,emptyInvoice,emptyItem,emptyStore,saveApproved,issues} from '../src/model';
import {formatExcelNumber} from '../src/xlsx-reader';
import {abortable} from '../src/async-task';
import type {OcrLine} from '../src/platform';
import {findTable,tableRows} from '../src/ocr-layout';

function token(text:string,x:number,y:number,width=100):OcrLine{return{text,x,y,width,height:24};}
test('Printed OCR preserves full company names and grouping separators in table prices',()=>{
 const tokens=[token('Satıcı:',10,10,80),token('Örnek',100,10,70),token('Mobilya',180,10,90),token('A.Ş.',280,10,50),token('Ürün',10,80),token('Miktar',500,80),token('fiyat',800,80),token('Tutar',1100,80),token('Çalışma masası',10,140,240),token('2adet',500,140),token('1.250,50',800,140),token('2.501,00',1100,140)];
 const invoice=parseInvoice('Fatura No: TR-1\nSatıcı: Örnek Mobilya A.Ş.\nGenel toplam 2.501,00 TL',tokens);
 assert.equal(invoice.supplier,'Örnek Mobilya A.Ş.');assert.equal(invoice.items[0].unitPrice,'1.250,50');assert.equal(invoice.items[0].unit,'adet');assert.equal(amounts(invoice.items[0])?.total,2501);
});
test('Qty glyph confusions and separate discount/VAT columns do not erase tax rates',()=>{
 const tokens=[token('Description',10,80,200),token('Oty',500,80,60),token('Price',800,80,80),token('Discount',1050,80,100),token('VAT%',1250,80,80),token('Total',1450,80,80),token('Cotton towels',10,140,230),token('5 pcs',500,140,90),token('20.00',800,140,70),token('10',1050,140,40),token('20',1250,140,40),token('108.00',1450,140,100)];
 const invoice=parseInvoice('Invoice no: TAX-1\nSupplier: Test Ltd\nGrand total: 108.00 GBP',tokens);
 assert.equal(invoice.items[0].quantity,'5');assert.equal(invoice.items[0].discount,'10');assert.equal(invoice.items[0].vat,'20');assert.equal(amounts(invoice.items[0])?.total,108);
});
test('Czech number-label glyph confusions do not become part of the identifier',()=>{
 for(const label of ['číslo','čÍsIo','čis1o','čisto'])assert.equal(parseInvoice(`DODACÍ LIST ${label}: CZ-26002`).number,'CZ-26002');
});
test('A faint Czech delivery heading with dropped letters retains its printed identifier',()=>{
 const invoice=parseInvoice('DODACI LST is: 16.10.26');
 assert.equal(invoice.number,'16.10.26');assert.equal(invoice.type,'Teslimat fişi');
});
test('A damaged Czech quantity heading still locates the table for separate numeric crops',()=>{
 const tokens=[token('Název zbozi',10,80,240),token('Mnostv',500,80,100),token('Cena',700,80,100),token('Cena celkem',950,80,150),token('WELL SOCKs',10,140,300),token('2003,00600',500,140,600)];
 const table=findTable(tokens);assert.ok(table);assert.equal(tableRows(tokens,table).length,1);
 // A merged numeric word is not guessed into values; its cells need real OCR crops.
 const invoice=parseInvoice('DODACI LIST cislo: 16.10.26',tokens);
 assert.equal(invoice.items[0].quantity,'');assert.equal(invoice.items[0].unitPrice,'');
});
test('An explicit document VAT percentage applies to rows without a VAT column',()=>{
 const invoice=parseInvoice('Invoice No: TAX-2\nSupplier: Test Ltd\nCotton towels 5 pcs 20.00 100.00\nVAT rate: 20%\nGrand total 120 GBP');
 assert.equal(invoice.items[0].vat,'20');assert.equal(amounts(invoice.items[0])?.total,120);
});
test('Preview number formats preserve percentages and locale-specific decimals',()=>{
 assert.equal(formatExcelNumber(.2,'0.0%','en'),'20.0%');assert.equal(formatExcelNumber(.2,'0.0%','tr'),'%20,0');assert.equal(formatExcelNumber(1250.5,'#,##0.00','tr'),'1.250,50');assert.equal(formatExcelNumber(1250.5,'#,##0.00','en'),'1,250.50');assert.equal(formatExcelNumber(1250.5,'General','cs'),'1250.5');
});
test('Cancellation rejects a pending reader and ignores its late result',async()=>{
 const controller=new AbortController();let complete!:(value:number)=>void;const task=abortable(new Promise<number>(resolve=>{complete=resolve;}),controller.signal);controller.abort();await assert.rejects(task,{name:'AbortError'});complete(1);
});
test('A rejected document cannot be approved and valid source records remain unchanged',()=>{
 const invoice={...emptyInvoice(),number:'INV-1',supplier:'Test Ltd',items:[{...emptyItem(),description:'Desk',quantity:'2',unitPrice:'100'}]},store={...emptyStore(),draft:[invoice]},before=structuredClone(store);
 assert.equal(issues(invoice).length,0);const saved=saveApproved(store,[invoice],null,'QA',false);assert.equal(saved.collections.length,1);assert.deepEqual(store,before);
});
