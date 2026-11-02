import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {emptyInvoice,emptyItem,emptyStore,amounts,totals,num,issues,saveApproved,currencyTotals,mergeBackup,importCollection,validateStore,documentTypeLabel,columnLabel,money,type Collection} from '../src/model';
import {parseInvoice} from '../src/ocr';
import {buildExcel} from '../src/exports';
const example=()=>({...emptyInvoice(),number:'DL-2026-001',supplier:'Prauge Atölye',customer:'Müşteri Çekya',date:'2026-10-20',currency:'CZK',items:[{...emptyItem(),description:'Dřevěná židle',quantity:'3',unit:'ks',unitPrice:'125,50',discount:'10',vat:'21'},{...emptyItem(),description:'Çalışma masası',quantity:'2',unitPrice:'1000',discount:'0',vat:'21'}]});
test('Yerel sayılar, boş alan ve sıfır birbirinden ayrılır',()=>{assert.equal(num('1.234,56'),1234.56);assert.equal(num('1,234.56'),1234.56);assert.equal(num('1 234,50 Kč'),1234.5);assert.equal(num('0'),0);assert.equal(num(''),null);assert.equal(num('belirsiz'),null);});
test('İndirim, KDV ve toplam satır düzeyinde yuvarlanır',()=>{const d=example();assert.deepEqual(amounts(d.items[0]),{gross:376.5,discount:37.65,net:338.85,tax:71.16,total:410.01});assert.deepEqual(totals(d),{net:2338.85,tax:491.16,total:2830.01,discount:37.65});});
test('Eksik miktar veya fiyat sahte sıfır tutara dönüştürülmez',()=>{const d=example();d.items[0].quantity='';assert.equal(amounts(d.items[0]),null);assert.ok(issues(d).some(s=>s.includes('quantity')));d.items[0].quantity='3';d.items[0].unitPrice='0';assert.equal(issues(d).length,0);});
test('Boş teslimat formundan ürün veya belge numarası uydurulmaz',()=>{const d=parseInvoice('DODACÍ LIST číslo:\nDodavatel:\nOdběratel:\nNázev zboží Množství a MJ Cena za 1 MJ Cena celkem Kč h\nCelkem\nPM 70');assert.equal(d.number,'');assert.equal(d.items[0].description,'');assert.equal(d.statedTotal,'');assert.equal(d.currency,'CZK');});
test('Çekçe ve Türkçe yazılı satırlar ayrıştırılır',()=>{const d=parseInvoice('DODACI LIST cislo: DL-2026-001\nDodavatel: Prauge Atelier\nOdberatel: Nova Firma\nze dne: 20.10.2026\n1 Drevena zidle 3 ks 125,50 376,50\nCelkem 376,50 Kč');assert.equal(d.number,'DL-2026-001');assert.equal(d.date,'2026-10-20');assert.equal(d.supplier,'Prauge Atelier');assert.equal(d.items[0].quantity,'3');assert.equal(d.items[0].unitPrice,'125,50');});
test('Onaylanana kadar arşiv oluşmaz; tekrar onay kayıt çoğaltmaz',()=>{const d=example(),s=emptyStore();s.draft=[d];assert.equal(s.collections.length,0);const out=saveApproved(s,[d],null,'Ekim',false);assert.equal(out.collections.length,1);assert.equal(out.draft.length,0);assert.equal(s.collections.length,0);assert.throws(()=>saveApproved(out,[d],out.collections[0].id,'',false),/already/);});
test('Birden fazla belge mevcut dosyaya veya ayrı dosyalara kaydedilebilir',()=>{const a=example(),b={...example(),number:'002'},c={...example(),number:'003'};const first=saveApproved(emptyStore(),[a],null,'Ekim',false);const merged=saveApproved(first,[b,c],first.collections[0].id,'',false);assert.equal(merged.collections.length,1);assert.equal(merged.collections[0].invoices.length,3);const separated=saveApproved(emptyStore(),[a,b],null,'',true);assert.equal(separated.collections.length,2);});
test('TRY ve CZK tutarları birbirine eklenmez',()=>{const a=example(),b={...example(),currency:'TRY'};assert.deepEqual(currencyTotals([a,b]),{CZK:2830.01,TRY:2830.01});});
test('Gerçek XLSX; typed girişler, formüller, bağlı özet ve kaynak metadata içerir',async()=>{
  const d=example(),now=new Date().toISOString();const group:Collection={id:'qa-group',name:'Ekim Belgeleri',createdAt:now,updatedAt:now,invoices:[d,{...example(),number:'DL-2026-002',currency:'TRY'}]};
  const blob=await buildExcel(group);const book=new ExcelJS.Workbook();const bytes=await blob.arrayBuffer();await book.xlsx.load(bytes);
  assert.equal(book.worksheets.length,1);const s=book.worksheets[0];
  assert.equal(s.getCell('C19').value,3);assert.equal(s.getCell('E19').value,125.5);assert.equal(s.getCell('F19').value,0.1);assert.deepEqual(s.getCell('J19').value,{formula:'ROUND(H19+I19,2)',result:410.01});assert.match(String((s.getCell('I6').value as any).formula),/SUMIFS/);assert.equal((s.getCell('I6').value as any).result,2830.01);assert.equal(s.getCell('A5').value,'TRY');assert.equal(s.getColumn('X').hidden,true);assert.equal(s.pageSetup.fitToHeight,1);assert.equal(s.pageSetup.fitToWidth,1);const zip=await JSZip.loadAsync(bytes);assert.match(await zip.file('xl/workbook.xml')!.async('string'),/fullCalcOnLoad="1"/);
  await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/formula-acceptance.xlsx',new Uint8Array(bytes));
});

test('English labels and number formats preserve legacy document type values',()=>{
  assert.equal(documentTypeLabel('Fatura'),'Invoice');assert.equal(documentTypeLabel('Teslimat fişi'),'Delivery note');
  assert.equal(emptyInvoice().type,'Fatura');assert.equal(emptyItem().unit,'pcs');
  assert.equal(num('£1,234.56'),1234.56);assert.equal(num('1 234,56 GBP'),1234.56);assert.equal(money(1234.56,'GBP'),'£1,234.56');
  assert.deepEqual([0,25,26,29,51,52,701].map(columnLabel),['A','Z','AA','AD','AZ','BA','ZZ']);
});

test('Backup merge is immutable and repeated imports do not duplicate archived documents or drafts',()=>{
  const a=example(),b=example(),pending=example();
  const current=saveApproved(emptyStore(),[a],null,'Archive',false);current.draft=[b];
  const snapshot=structuredClone(current),incoming=structuredClone(current);
  incoming.collections[0].invoices.push(b,b);incoming.draft=[pending,pending,a,b];
  const first=mergeBackup(current,incoming).store;assert.deepEqual(current,snapshot);
  assert.equal(first.collections.length,1);assert.equal(first.collections[0].invoices.length,2);
  assert.deepEqual(first.draft.map(d=>d.id),[pending.id]);
  const second=mergeBackup(first,incoming).store;assert.deepEqual(second,first);
});

test('Backup merge skips duplicate invoice IDs across incoming files',()=>{
  const d=example(),incoming=saveApproved(emptyStore(),[d],null,'First',false);
  incoming.collections.push({...structuredClone(incoming.collections[0]),id:'another-file'});
  const merged=mergeBackup(emptyStore(),incoming);assert.equal(merged.addedCollections,1);assert.equal(merged.store.collections.length,1);
});

test('Reimported Excel edits replace matching invoices and preserve later additions',()=>{
  const a=example(),b=example(),current=saveApproved(emptyStore(),[a,b],null,'Current archive',false);
  const original=structuredClone(current),incoming=structuredClone(current.collections[0]);incoming.invoices=[structuredClone(a)];incoming.invoices[0].items[0].quantity='6';
  const next=importCollection(current,incoming);assert.deepEqual(current,original);
  assert.equal(next.collections.length,1);assert.equal(next.collections[0].invoices.length,2);
  assert.equal(next.collections[0].invoices[0].items[0].quantity,'6');assert.equal(next.collections[0].invoices[1].id,b.id);
});

test('Malformed backup records are rejected before they can corrupt the archive',()=>{
  assert.throws(()=>validateStore({version:1,collections:[null],draft:[]}),/Invalid archive record/);
  assert.throws(()=>validateStore({version:1,collections:[],draft:[null]}),/Invalid document data/);
  const broken=emptyStore();broken.draft=[example()];(broken.draft[0] as any).supplier=null;
  assert.throws(()=>validateStore(broken),/Invalid document data/);
  broken.draft=[example()];(broken.draft[0].items[0] as any).discount=null;
  assert.throws(()=>validateStore(broken),/Invalid item data/);
});

test('English delivery notes retain their document number and type during OCR parsing',()=>{
  const d=parseInvoice('DELIVERY NOTE No: DN-2026-008\nSupplier: Example Ltd\nCustomer: Sample Buyer\nDate: 20.10.2026\nWooden chair 3 pcs 125.50 376.50\nGrand total 376.50 GBP');
  assert.equal(d.number,'DN-2026-008');assert.equal(d.type,'Teslimat fişi');assert.equal(d.currency,'GBP');assert.equal(d.items[0].unit,'pcs');
});
