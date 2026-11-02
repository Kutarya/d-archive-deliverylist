const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const runtime=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {_electron}=runtime('playwright'),ExcelJS=require('exceljs'),{version}=require('../package.json');
const root=path.resolve(__dirname,'..'),art=path.join(root,'artifacts',version),fixtures=path.join(art,'fixtures');
const report={version,executable:process.env.QA_EXECUTABLE||'development',success:false,checks:[],ocr:[],errors:[],network:[]};let app,page;
const ok=(name,data)=>{report.checks.push({name,data});console.log('PASS '+name+(data?' '+JSON.stringify(data):''));};
const idle=async()=>{await page.waitForFunction(()=>!document.querySelector('.reading-status')&&!document.querySelector('.busy-overlay')&&!document.querySelector('.preview-loading'),{},{timeout:240000});};
const store=async()=>page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()));
async function upload(files){await page.locator('input[type=file]').nth(0).setInputFiles(files.map(file=>path.join(fixtures,file)));}
async function saveDraft(name){await page.getByRole('button',{name:'Confirm details',exact:true}).click();await page.getByLabel('File name',{exact:true}).fill(name);const ack=page.getByLabel('I checked the difference between the calculated total and the document.');if(await ack.count())await ack.check();await page.getByRole('button',{name:'Confirm and save to archive'}).click();await idle();}
(async()=>{await fs.mkdir(art,{recursive:true});const dataDir=path.join(art,'regression-data-'+Date.now());
try{
 app=await _electron.launch({executablePath:process.env.QA_EXECUTABLE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.QA_EXECUTABLE?[]:[root],env:{...process.env,FATURA_DATA_DIR:dataDir}});
 page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.route(/^https?:\/\//,route=>{report.network.push(route.request().url());return route.abort();});
 await page.waitForSelector('.capture-card');await app.evaluate(({dialog},folder)=>{dialog.showSaveDialog=async(win,o)=>({canceled:false,filePath:folder+'/'+o.defaultPath.replaceAll('\\','/').split('/').pop()});},art);
 await upload(['english-invoice.png']);await page.locator('.reading-status').waitFor();assert.equal(await page.locator('.busy-overlay').count(),0);
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Add document',exact:true}).click();const picker=await chooser;await picker.setFiles(path.join(fixtures,'czech-delivery.jpg'));
 await page.waitForFunction(()=>document.querySelectorAll('.document-tabs button').length===2);await page.locator('.document-tabs button').first().click();await page.locator('.document-tabs button').nth(1).click();ok('Second file picker and document switching work during real OCR');
 await idle();
 const expected=JSON.parse(await fs.readFile(path.join(fixtures,'expected.json'),'utf8'));
 for(const item of expected.slice(2)){await upload([item.file]);await idle();}
 const state=await store();
 for(const expectedDoc of expected){const actual=state.draft.find(d=>d.sourceName===expectedDoc.file);assert.ok(actual);report.ocr.push({file:expectedDoc.file,number:actual.number,type:actual.type,currency:actual.currency,supplier:actual.supplier,customer:actual.customer,items:actual.items,statedTotal:actual.statedTotal,engine:actual.engine});
   assert.equal(actual.number,expectedDoc.number,`${expectedDoc.file}: document number`);assert.equal(actual.type,expectedDoc.type);assert.equal(actual.currency,expectedDoc.currency);
   assert.equal(actual.items.length,expectedDoc.rows.length,`${expectedDoc.file}: item count`);
   const numeric=value=>Number(String(value).replace(/[A-Za-zČč₺€£$]/g,'').trim().replace(/([.,])[-–—]+$/,'$100').replace(/\s/g,'').replace(/\.(?=.*[,])/g,'').replace(',','.'));
   const round=value=>Math.round((value+Number.EPSILON)*100)/100;
   let calculated=0;
   for(let index=0;index<actual.items.length;index++){const line=actual.items[index],source=expectedDoc.rows[index];assert.equal(line.description,source[0]);assert.equal(numeric(line.quantity),Number(source[1].match(/[\d.,]+/)[0]));assert.equal(numeric(line.unitPrice),numeric(source[2]));const discount=source.length===6?Number(source[3]):0,vat=source.length===6?Number(source[4]):0;assert.equal(numeric(line.discount),discount);assert.equal(numeric(line.vat),vat);const gross=round(numeric(line.quantity)*numeric(line.unitPrice)),net=round(gross-round(gross*discount/100));calculated=round(calculated+net+round(net*vat/100));}
   assert.equal(calculated,expectedDoc.expected,`${expectedDoc.file}: independently calculated total`);assert.equal(numeric(actual.statedTotal),expectedDoc.expected);assert.equal(actual.supplier,expectedDoc.supplier.split(': ')[1]);assert.equal(actual.customer,expectedDoc.customer.split(': ')[1]);
 }
 await fs.writeFile(path.join(art,'ocr-actual.json'),JSON.stringify(report.ocr,null,2));ok('Five diverse synthetic documents were read with real offline OCR');
 await page.screenshot({path:path.join(art,'review-diverse.png'),fullPage:true});
 await upload(['english-invoice.png']);await idle();assert.equal((await store()).draft.length,5);ok('Selecting the same file again does not duplicate it');
 await upload(['broken-image.png','slightly-skewed-invoice.jpg']);await idle();assert.equal((await store()).draft.length,6);ok('A damaged file does not discard or block the next valid image');
 // Remove only the isolated extra fixture through the app's confirmation dialog.
 await page.getByRole('button',{name:'Remove pending document',exact:true}).click();await page.getByRole('dialog',{name:'Remove pending document'}).getByRole('button',{name:'Remove',exact:true}).click();
 await saveDraft('Diverse documents');await page.getByRole('button',{name:'Open file',exact:true}).first().click();await idle();
 await page.getByRole('button',{name:'Download Excel',exact:true}).click();await idle();const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(path.join(art,'Diverse documents.xlsx'));assert.equal(workbook.getWorksheet('Items').getColumn(15).hidden,true);ok('Excel export contains typed inputs, formulas and stable hidden item IDs');
 await page.locator('.sheet-tabs button').filter({hasText:/^Items$/}).click();assert.match(await page.locator('.excel-scroll').innerText(),/20[.,]0\s?%/);assert.ok(await page.locator('.excel-scroll td[colspan]').count());await page.screenshot({path:path.join(art,'excel-preview.png'),fullPage:true});ok('Excel preview shows merged headings, formatted money and percentages');
 // Sort entire rows, edit inputs, delete one row, add a copied row; reimport the real file.
 const items=workbook.getWorksheet('Items');const one=items.getRow(5).values.slice(),two=items.getRow(6).values.slice();items.getRow(5).values=two;items.getRow(6).values=one;items.getCell('D6').value=6;items.getRow(7).values=[];
 const copy=items.getRow(5).values.slice();copy[3]='Additional desk';copy[4]=1;copy[15]='';items.getRow(items.rowCount+1).values=copy;
 const edited=path.join(art,'edited-sorted.xlsx');await workbook.xlsx.writeFile(edited);await page.locator('input[type=file]').nth(1).setInputFiles(edited);await idle();const imported=(await store()).collections[0];assert.equal(imported.invoices[0].items[1].quantity,'6');assert.equal(imported.invoices[0].items[1].description,'Oak dining chair');assert.equal(imported.invoices[0].items.length,3);assert.equal(imported.invoices[1].items.length,1);ok('Sorted, added and deleted Excel rows reimport without restoring stale metadata');
 await page.getByRole('button',{name:'PDF',exact:true}).click();await idle();await page.locator('.pdf-preview canvas').first().waitFor({timeout:60000});await page.getByRole('button',{name:'Download PDF',exact:true}).click();await idle();ok('All approved documents export and render as a multi-document PDF');
 await page.getByRole('button',{name:'Image',exact:true}).click();await idle();await page.locator('.document-tabs button').nth(1).click();await idle();assert.match(await page.locator('.image-preview-grid img').last().getAttribute('src'),/^data:image/);await page.getByRole('button',{name:'Download image',exact:true}).click();await idle();ok('Archived source and generated images switch to another document');
 await page.getByRole('button',{name:'Add documents to this file'}).click();await upload(['two-page-documents.pdf']);await idle();assert.equal((await store()).draft.length,2);ok('Each PDF page becomes a separate reviewable document');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(art,'review-phone.png'),fullPage:true});ok('Phone review has no page overflow');
 await page.setViewportSize({width:1360,height:900});
 await upload(['blank-form.png']);await page.getByRole('button',{name:'Stop current reading'}).click();await idle();let blank=(await store()).draft.find(d=>d.sourceName==='blank-form.png');assert.ok(blank);assert.equal(blank.number,'');assert.equal(blank.items[0].description,'');await page.getByLabel('Document number *',{exact:true}).fill('MANUAL-REVIEW');await page.getByRole('button',{name:'Read again',exact:true}).click();await page.getByRole('dialog',{name:'Read this photo again?'}).getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.getByLabel('Document number *',{exact:true}).inputValue(),'MANUAL-REVIEW');ok('Cancelling real OCR keeps the photo editable, and cancelling a reread preserves manual corrections');
 await page.waitForFunction(()=>document.querySelector('.save-indicator')?.textContent?.includes('Saved on this device'));await app.close();app=null;
 app=await _electron.launch({executablePath:process.env.QA_EXECUTABLE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.QA_EXECUTABLE?[]:[root],env:{...process.env,FATURA_DATA_DIR:dataDir}});page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.getByRole('heading',{name:'Review the details.'}).waitFor();await page.locator('.document-tabs button').last().click();assert.equal(await page.getByLabel('Document number *',{exact:true}).inputValue(),'MANUAL-REVIEW');assert.equal((await store()).draft.length,3);ok('Source photos, approved archive and pending manual corrections survive a process restart');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);ok('No renderer errors or external network requests');report.success=true;report.dataDir=dataDir;
}catch(e){report.failure=e.stack;console.error(e);if(page){report.latestStore=await store().catch(()=>null);await page.screenshot({path:path.join(art,'regression-failure.png'),fullPage:true}).catch(()=>{});}}
finally{await fs.writeFile(path.join(art,'regression-acceptance.json'),JSON.stringify(report,null,2));await app?.close().catch(()=>{});process.exitCode=report.success?0:1;}
})();
