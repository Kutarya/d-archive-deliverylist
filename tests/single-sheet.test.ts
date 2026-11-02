import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildExcel} from '../src/exports';
import {readSingleSheet} from '../src/single-sheet-excel';
import {emptyInvoice,emptyItem,type Collection} from '../src/model';
import type {SheetCells} from '../src/xlsx-reader';

function xmlValues(sheet:ExcelJS.Worksheet):SheetCells {
  const cells:SheetCells['cells']=new Map(),hidden=new Set<number>();
  sheet.eachRow((row,r)=>{const values=new Map<number,string|number|boolean>();row.eachCell((cell,c)=>{
    let value:any=cell.value;if(value instanceof Date)value=(value.getTime()-Date.UTC(1899,11,30))/86400000;
    else if(value&&typeof value==='object'&&'formula'in value)value=value.result;
    if(value!==undefined&&value!==null)values.set(c,value);
  });cells.set(r,values);});
  sheet.columns.forEach((col,index)=>{if(col.hidden)hidden.add(index+1);});
  return {name:sheet.name,state:'visible',cells,display:new Map(),hidden,merges:[]};
}
async function workbook() {
  const invoice={...emptyInvoice(),number:'0000123',date:'2026-10-21',supplier:'Source Company',supplierTax:'0000456',supplierAddress:'Prague\nOriginal address',customer:'Buyer',customerTax:'0012',currency:'CZK',image:'original-photo',sourceHash:'hash',sourceName:'photo.jpg',items:[{...emptyItem(),description:'Oak chair',quantity:'3',unit:'adet',unitPrice:'125.50',discount:'10',vat:'21'},{...emptyItem(),description:'Table',quantity:'2',unitPrice:'50'}]};
  const group:Collection={id:'single-qa',name:'All details',createdAt:'2026-10-21T00:00:00Z',updatedAt:'2026-10-21T00:00:00Z',invoices:[invoice]};
  const before=structuredClone(group),book=new ExcelJS.Workbook();await book.xlsx.load(await(await buildExcel(group,'cs')).arrayBuffer());assert.deepEqual(group,before);return {group,book,sheet:book.worksheets[0]};
}
test('A single actual worksheet contains full source data and prints on one page without extra tabs',async()=>{
  const {group,book,sheet}=await workbook();assert.equal(book.worksheets.length,1);assert.equal(sheet.pageSetup.fitToWidth,1);assert.equal(sheet.pageSetup.fitToHeight,1);assert.match(sheet.pageSetup.printArea!,/^A1:J/);
  const imported=readSingleSheet([xmlValues(sheet)],'en')!;assert.equal(imported.invoices[0].number,'0000123');assert.equal(imported.invoices[0].supplierTax,'0000456');assert.equal(imported.invoices[0].date,'2026-10-21');
  assert.equal(imported.invoices[0].items[0].unit,'adet');assert.equal(imported.invoices[0].image,group.invoices[0].image);assert.equal(imported.invoices[0].sourceName,'photo.jpg');assert.equal(imported.invoices[0].supplierAddress,'Prague\nOriginal address');
});
test('Sorted Excel edits remain attached to the correct item IDs and document fields',async()=>{
  const {group,sheet}=await workbook(),first=sheet.getRow(19).values,second=sheet.getRow(20).values;
  sheet.getRow(19).values=second;sheet.getRow(20).values=first;sheet.getCell('C20').value=6;sheet.getCell('E19').value=0;
  sheet.getCell('C12').value='EDIT-001';sheet.getCell('H14').value='Edited Buyer';sheet.getCell('H13').value='EUR';
  const imported=readSingleSheet([xmlValues(sheet)],'tr')!;
  assert.equal(imported.invoices[0].number,'EDIT-001');assert.equal(imported.invoices[0].customer,'Edited Buyer');assert.equal(imported.invoices[0].currency,'EUR');
  assert.equal(imported.invoices[0].items[0].id,group.invoices[0].items[1].id);assert.equal(imported.invoices[0].items[0].unitPrice,'0');
  assert.equal(imported.invoices[0].items[1].id,group.invoices[0].items[0].id);assert.equal(imported.invoices[0].items[1].quantity,'6');assert.equal(imported.invoices[0].items[1].discount,'10');assert.equal(imported.invoices[0].image,group.invoices[0].image);
});
test('Invalid values and damaged item identity cannot silently replace archived documents',async()=>{
  const {sheet}=await workbook();sheet.getCell('C19').value=0;assert.throws(()=>readSingleSheet([xmlValues(sheet)],'en'),/invalid document/);
  sheet.getCell('C19').value=3;sheet.getCell('L19').value='missing-document';assert.throws(()=>readSingleSheet([xmlValues(sheet)],'en'),/invalid document/);
});

test('A row added within the item table imports with a new stable identity',async()=>{
  const {sheet}=await workbook(),cells=xmlValues(sheet);
  cells.cells.set(21,new Map<number,string|number|boolean>([[2,'Added in Excel'],[3,4],[4,'pcs'],[5,20],[6,0],[7,0]]));
  const imported=readSingleSheet([cells],'en')!;assert.equal(imported.invoices[0].items.length,3);assert.equal(imported.invoices[0].items[2].description,'Added in Excel');assert.equal(imported.invoices[0].items[2].quantity,'4');assert.ok(imported.invoices[0].items[2].id);
});

test('Missing editable field bindings fail instead of restoring stale metadata',async()=>{
  const {sheet}=await workbook(),cells=xmlValues(sheet);cells.cells.get(14)!.delete(11);
  assert.throws(()=>readSingleSheet([cells],'en'),/invalid document/);
});
