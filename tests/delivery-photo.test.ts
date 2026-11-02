import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvoice} from '../src/ocr';
import {amounts,num} from '../src/model';

test('Whole-amount accounting suffixes from Czech delivery forms remain valid numeric inputs',()=>{
  for(const value of ['600,-','600,—','600.--','600 Kč','EUR 600,-'])assert.equal(num(value),600,value);
  assert.equal(num('-600,-'),-600);
  assert.equal(num('3,-'),3);
  assert.equal(num('600-'),null);
});

test('A completed total determines currency ahead of preprinted currency headings',()=>{
  for(const currency of ['EUR','GBP','USD','TRY','CZK']){
    const invoice=parseInvoice(`DODACI LIST cislo: 16.10.26\nCena celkem Kč h\nCelkem ${currency}600,-`);
    assert.equal(invoice.currency,currency);
    assert.equal(num(invoice.statedTotal),600);
  }
});

test('A dedicated currency field takes priority, while totals also accept symbols',()=>{
  assert.equal(parseInvoice('Currency: EUR\nGrand total 600 CZK').currency,'EUR');
  assert.equal(parseInvoice('Cena celkem Kč h\nGrand total £600').currency,'GBP');
  assert.equal(parseInvoice('Cena celkem Kč h\nCelkem €600').currency,'EUR');
  assert.equal(parseInvoice('Supplier: Eurotext Ltd\nCelkem 600 Kč').currency,'CZK');
});

test('Impossible calendar dates are not silently rolled into another month',()=>{
  for(const date of ['31.02.2026','2026-02-29','31.04.2026','00.10.2026','20.13.2026'])assert.equal(parseInvoice(`Date: ${date}`).date,'',date);
  assert.equal(parseInvoice('Date: 29.02.2024').date,'2024-02-29');
  assert.equal(parseInvoice('Date: 2026-10-16').date,'2026-10-16');
});

test('A date-shaped document identifier does not become an unconfirmed document date',()=>{
  const invoice=parseInvoice('DODACI LIST cislo: 16.10.2026\nze dne\nDodavatel: Burhan');
  assert.equal(invoice.number,'16.10.2026');
  assert.equal(invoice.date,'');
  assert.equal(parseInvoice('DODACI LIST cislo: 16.10.26\nDate: 16.10.2026').date,'2026-10-16');
});

test('A transcribed delivery row accepts comma-dash amounts without changing source descriptions',()=>{
  const invoice=parseInvoice('DODACI LIST cislo: 16.10.26\nDodavatel: Burhan\nWOLL SOCKS 200 3,- 600,-\nCelkem EUR600,-');
  assert.equal(invoice.type,'Teslimat fişi');
  assert.equal(invoice.items[0].description,'WOLL SOCKS');
  assert.equal(invoice.items[0].quantity,'200');
  assert.equal(num(invoice.items[0].unitPrice),3);
  assert.equal(amounts(invoice.items[0])?.total,600);
  assert.equal(invoice.currency,'EUR');
  assert.equal(invoice.date,'');
});

test('Unreadable handwriting does not manufacture required document or item values',()=>{
  const invoice=parseInvoice('Název zboží\nBankovní spojení:\nCena celkem Kč h\nWELL Secs');
  assert.equal(invoice.number,'');
  assert.equal(invoice.supplier,'');
  assert.equal(invoice.items[0].quantity,'');
  assert.equal(invoice.items[0].unitPrice,'');
});

test('Tax and discount summaries after the grand total are not document totals',()=>{
  for(const [grand,extras,currency] of [
    ['Grand total: 600.00 EUR','Total VAT: 100.00 EUR\nTotal discount: 20.00 EUR','EUR'],
    ['Celkem k úhradě: 600,00 Kč','Celkem bez DPH: 500,00 Kč\nCelkem DPH: 100,00 Kč','CZK'],
    ['Genel toplam: 600,00 TL','Toplam KDV: 100,00 TL\nToplam indirim: 20,00 TL','TRY'],
  ]){
    const invoice=parseInvoice(`${grand}\n${extras}`);
    assert.equal(num(invoice.statedTotal),600,grand);
    assert.equal(invoice.currency,currency);
  }
});

test('An explicit amount due wins over a later generic total',()=>{
  const invoice=parseInvoice('Amount due: 600 EUR\nTotal: 100 CZK');
  assert.equal(num(invoice.statedTotal),600);
  assert.equal(invoice.currency,'EUR');
});
