import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const root='D:/deliverylist',version=JSON.parse(await fs.readFile(`${root}/package.json`,'utf8')).version,output=`${root}/artifacts/${version}`;
const locales={en:'Documents',cs:'Doklady',tr:'Belgeler'};
const results=[];
for(const [language,sheetName] of Object.entries(locales)){
  const workbook=await SpreadsheetFile.importXlsx(await FileBlob.load(`${output}/formulas-${language}.xlsx`));workbook.recalculate();
  const sheet=workbook.worksheets.getItem(sheetName);
  const values=()=>({line:sheet.getRange('J19').values[0][0],invoice:sheet.getRange('J23').values[0][0],summary:sheet.getRange('I6').values[0][0]});
  const before=values();for(const amount of Object.values(before))assert.equal(amount,410.01);
  sheet.getRange('C19').values=[[6]];workbook.recalculate();const after=values();for(const amount of Object.values(after))assert.equal(amount,820.02);
  sheet.getRange('C19').values=[[3]];workbook.recalculate();assert.deepEqual(values(),before);
  for(const row of sheet.getRange('A1:J29').values)for(const value of row)if(typeof value==='string')assert.ok(!/^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!)/.test(value),`${language}: ${value}`);
  const image=await workbook.render({sheetName,range:'A1:J28',scale:1.3,format:'png'});await fs.writeFile(`${output}/excel-${language}-single-sheet.png`,new Uint8Array(await image.arrayBuffer()));
  results.push({language,before,after,restored:true});console.log(`PASS ${language}: single-sheet quantity changes update line, document and currency totals`);
}
await fs.writeFile(`${output}/formula-recalculation.json`,JSON.stringify({version,success:true,results},null,2));
