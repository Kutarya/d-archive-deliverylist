import test from 'node:test';
import assert from 'node:assert/strict';
import {amounts,emptyInvoice,emptyItem,emptyStore,invoiceProblems,issues,replaceSource,saveApproved,updateArchivedInvoices,validateStore,type Collection} from '../src/model';
import {safeFileName} from '../src/platform';

const document=()=>({...emptyInvoice(),number:'DOC-1',supplier:'Source Company',image:'original-data',sourceName:'original.jpg',sourceHash:'original-hash',items:[{...emptyItem(),description:'Desk',quantity:'2',unitPrice:'100'}]});
test('Saving only a ready document leaves incomplete drafts intact',()=>{
 const ready=document(),incomplete=emptyInvoice(),store={...emptyStore(),draft:[ready,incomplete]},before=structuredClone(store),saved=saveApproved(store,[ready],null,'Selected',false);
 assert.equal(saved.draft.length,1);assert.equal(saved.draft[0].id,incomplete.id);assert.equal(saved.collections[0].invoices[0].id,ready.id);assert.deepEqual(store,before);
});
test('Archive changes preserve record identity, source history and unedited documents',()=>{
 const first=document(),second={...document(),id:'other-doc'},group:Collection={id:'file',name:'Existing',createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z',invoices:[first,second]},store={...emptyStore(),collections:[group]},before=structuredClone(store),edit={...first,items:first.items.map(item=>({...item,quantity:'5'}))};
 const next=updateArchivedInvoices(store,group.id,[edit],group.updatedAt);assert.equal(next.collections[0].invoices[0].items[0].quantity,'5');assert.equal(next.collections[0].invoices[0].image,first.image);assert.equal(next.collections[0].invoices[0].id,first.id);assert.deepEqual(next.collections[0].invoices[1],second);assert.deepEqual(store,before);
});
test('Invalid edits and concurrent archive changes cannot overwrite saved documents',()=>{
 const first=document(),store={...emptyStore(),collections:[{id:'file',name:'Existing',createdAt:'now',updatedAt:'revision-2',invoices:[first]}]};
 assert.throws(()=>updateArchivedInvoices(store,'file',[first],'revision-1'),/changed while/);assert.throws(()=>updateArchivedInvoices(store,'file',[{...first,number:''}]),/document number/);assert.throws(()=>updateArchivedInvoices(store,'file',[{...first,id:'unknown'}]),/Invalid document/);
});
test('Photo replacement and restoration keep manual details and retain every source',()=>{
 const original=document(),replaced=replaceSource(original,{image:'new-data',sourceName:'new.jpg',sourceHash:'new-hash'});
 assert.equal(replaced.number,original.number);assert.deepEqual(replaced.items,original.items);assert.equal(replaced.sourceHistory?.[0].image,'original-data');assert.equal(original.image,'original-data');
 const restored=replaceSource(replaced,replaced.sourceHistory![0]);assert.equal(restored.image,original.image);assert.deepEqual(restored.sourceHistory?.map(photo=>photo.image),['new-data']);
});
test('Photo history and presentation rotation survive validated backup data',()=>{
 const invoice={...document(),imageRotation:1,sourceHistory:[{image:'earlier-photo',sourceName:'earlier.png',sourceHash:'old'}]},store={...emptyStore(),draft:[invoice]};validateStore(JSON.parse(JSON.stringify(store)));assert.throws(()=>validateStore({...store,draft:[{...invoice,sourceHistory:[null]}]}),/Invalid document/);assert.throws(()=>validateStore({...store,draft:[{...invoice,imageRotation:91}]}),/Invalid document/);
});
test('Date and overflowing amounts report the exact fields requiring correction',()=>{
 const invoice=document();assert.ok(invoiceProblems({...invoice,date:'2026-02-31'}).some(problem=>problem.field==='date'));const item={...invoice.items[0],quantity:'9'.repeat(200),unitPrice:'9'.repeat(200)};assert.equal(amounts(item),null);assert.ok(issues({...invoice,items:[item]}).length);assert.equal(issues({...invoice,date:'2024-02-29'}).length,0);
});
test('Download names retain their extension and avoid Windows reserved names',()=>{
 const long=safeFileName('A'.repeat(250)+'.xlsx');assert.equal(long.length,160);assert.ok(long.endsWith('.xlsx'));assert.equal(safeFileName('CON.pdf'),'_CON.pdf');assert.equal(safeFileName('invoice: 1/2.xlsx'),'invoice- 1-2.xlsx');
});
