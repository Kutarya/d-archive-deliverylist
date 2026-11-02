// Export the supplied reference through the app's production Excel generator.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildExcel} from '../src/exports';
import {validateStore, type Store, type Collection} from '../src/model';
import {version} from '../package.json';

const store=JSON.parse(await fs.readFile(`artifacts/${version}/settings-tested-native-store.json`,'utf8')) as Store;validateStore(store);
const source=new ExcelJS.Workbook();await source.xlsx.readFile('C:/Users/yunus/OneDrive/Desktop/Documents - 20-10-2026.xlsx');
const metadata=source.getWorksheet('_InvoiceData')!;let json='';for(let row=2;row<=metadata.rowCount;row++)json+=String(metadata.getCell(row,1).value??'');
const original=JSON.parse(json) as Collection,group=store.collections.find(group=>group.id===original.id)!;assert.ok(group);
for(const invoice of original.invoices){const current=group.invoices.find(current=>current.id===invoice.id)!;assert.ok(current);for(const key of ['image','sourceHash','sourceName','supplier','customer'] as const)assert.equal(current[key],invoice[key]);}
const blob=await buildExcel(group,'en'),bytes=new Uint8Array(await blob.arrayBuffer()),check=new ExcelJS.Workbook();await check.xlsx.load(bytes.buffer);
assert.equal(check.worksheets.length,1);assert.equal(check.worksheets[0].name,'Documents');assert.equal(check.worksheets[0].pageSetup.fitToWidth,1);assert.equal(check.worksheets[0].pageSetup.fitToHeight,1);assert.equal((check.worksheets[0].getCell('J19').value as ExcelJS.CellFormulaValue).result,600);
await fs.mkdir('release/examples',{recursive:true});const output=`release/examples/Documents-20-10-2026-single-sheet.xlsx`;await fs.writeFile(output,bytes);console.log(output);
