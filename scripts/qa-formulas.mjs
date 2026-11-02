import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const workbook=await SpreadsheetFile.importXlsx(await FileBlob.load('D:/deliverylist/artifacts/formula-acceptance.xlsx'));
workbook.recalculate();
const items=workbook.worksheets.getItem('Items'),invoices=workbook.worksheets.getItem('Invoices'),summary=workbook.worksheets.getItem('Summary');
const before={line:items.getRange('M5').values[0][0],invoice:invoices.getRange('J5').values[0][0],summary:summary.getRange('E5').values[0][0]};
assert.equal(before.line,410.01);assert.equal(before.invoice,2830.01);assert.equal(before.summary,2830.01);
items.getRange('D5').values=[[6]];workbook.recalculate();
const after={line:items.getRange('M5').values[0][0],invoice:invoices.getRange('J5').values[0][0],summary:summary.getRange('E5').values[0][0],otherCurrency:summary.getRange('E6').values[0][0]};
assert.equal(after.line,820.02);assert.equal(after.invoice,3240.02);assert.equal(after.summary,3240.02);assert.equal(after.otherCurrency,2830.01);
items.getRange('D5').values=[[3]];workbook.recalculate();
await fs.writeFile('D:/deliverylist/artifacts/english-1.0.1/formula-recalculation.json',JSON.stringify({success:true,before,after},null,2));
for(const [sheetName,range] of [['Summary','A1:F8'],['Invoices','B1:M8'],['Items','B1:N9'],['Document 1','A1:H22']]){
  const blob=await workbook.render({sheetName,range,scale:1.5,format:'png'});await fs.writeFile(`D:/deliverylist/artifacts/english-1.0.1/excel-${sheetName.replace(/\s/g,'-')}.png`,new Uint8Array(await blob.arrayBuffer()));
}
console.log(JSON.stringify({success:true,before,after}));
