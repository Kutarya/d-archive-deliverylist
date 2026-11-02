import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import messages from '../src/translations.json';
import {version} from '../package.json';
import { defaultSettings, documentCount, languages, translate, unitLabel, localizeError, type MessageKey } from '../src/i18n';
import { emptyInvoice, emptyItem, emptyStore, settingsFor, mergeBackup, validateStore, issues, type Collection } from '../src/model';
import { buildExcel } from '../src/exports';

test('All translation entries contain Czech and Turkish text with the same placeholders',()=>{
  const placeholders=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  for(const [key,value]of Object.entries(messages))for(const language of ['cs','tr'] as const){
    assert.ok(value[language].trim(),`${key}: ${language}`);
    assert.deepEqual(placeholders(value[language]),placeholders(key),`${key}: ${language} placeholders`);
  }
});

test('English is the independent default for interface and outputs, including legacy stores',()=>{
  assert.deepEqual(settingsFor(emptyStore()),{interfaceLanguage:'en',outputLanguage:'en'});
  assert.deepEqual(settingsFor({version:1,collections:[],draft:[]}),defaultSettings);
  const store=emptyStore();store.settings={interfaceLanguage:'tr',outputLanguage:'cs'};validateStore(store);
  const incoming=emptyStore();incoming.settings={interfaceLanguage:'en',outputLanguage:'en'};
  assert.deepEqual(mergeBackup(store,incoming).store.settings,store.settings);
  assert.throws(()=>validateStore({...store,settings:{interfaceLanguage:'de',outputLanguage:'cs'}}),/Invalid language settings/);
});

test('Document plurals, units and validation follow the requested language',()=>{
  assert.deepEqual([1,2,5].map(n=>documentCount(n,'cs')),['1 doklad','2 doklady','5 dokladů']);
  assert.equal(documentCount(2,'tr'),'2 belge');assert.equal(documentCount(2,'en'),'2 documents');
  assert.equal(unitLabel('adet','en'),'pcs');assert.equal(unitLabel('pcs','cs'),'ks');assert.equal(unitLabel('ks','tr'),'adet');
  assert.equal(issues(emptyInvoice(),'cs')[0],'Zadejte číslo dokladu.');assert.equal(issues(emptyInvoice(),'tr')[0],'Belge numarasını girin.');
  assert.equal(localizeError(new Error('Invalid archive record.'),'cs'),'Neplatný záznam archivu.');
  assert.equal(localizeError(new Error('unmapped technical failure'),'tr'),'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
});

for(const language of languages)test(`${language} Excel has localized worksheets, labels and linked formulas without modifying source data`,async()=>{
  const now='2026-10-20T09:00:00.000Z';
  const invoice={...emptyInvoice(),number:'LANG-001',supplier:'Example Ltd',date:'2026-10-20',currency:'CZK',items:[{...emptyItem(),description:'Oak chair',quantity:'3',unit:'adet',unitPrice:'125.50',discount:'10',vat:'21'}]};
  const group:Collection={id:'language-qa',name:'Language QA',createdAt:now,updatedAt:now,invoices:[invoice]};
  const before=structuredClone(group),blob=await buildExcel(group,language),book=new ExcelJS.Workbook();await book.xlsx.load(await blob.arrayBuffer());
  const text=(key:MessageKey)=>translate(key,language);
  const sheetNames=[text('Documents')];
  assert.deepEqual(book.worksheets.map(s=>s.name),sheetNames);
  const sheet=book.worksheets[0];
  const zip=await JSZip.loadAsync(await blob.arrayBuffer());assert.match(await zip.file('xl/tables/table1.xml')!.async('string'),/autoFilter ref="A18:M19"/,'Excel sorting includes hidden item IDs and all data rows');
  assert.ok(sheet.getCell('H12').value instanceof Date,'Invoice date remains a typed Excel date');
  assert.equal((sheet.getCell('H12').value as Date).toISOString().slice(0,10),'2026-10-20');
  assert.equal(sheet.getCell('B18').value,text('Item / description'));assert.equal(sheet.getCell('C18').value,text('Quantity'));
  assert.equal(sheet.getCell('D19').value,unitLabel('adet',language));assert.equal(sheet.getCell('C13').value,text('Invoice'));
  assert.equal((sheet.getCell('J19').value as any).result,410.01);
  assert.equal((sheet.getCell('I6').value as any).result,410.01);
  assert.equal(sheet.getColumn('X').hidden,true);assert.equal(sheet.getCell('X1').value,'INVOICE_ATELIER_SINGLE_V1');
  const json=Array.from({length:sheet.rowCount-1},(_,i)=>String(sheet.getCell(i+2,24).value??'')).join('');assert.equal(JSON.parse(json).group.invoices[0].type,'invoice');
  assert.deepEqual(group,before);
  await fs.mkdir(`artifacts/${version}`,{recursive:true});await fs.writeFile(`artifacts/${version}/formulas-${language}.xlsx`,new Uint8Array(await blob.arrayBuffer()));
});
