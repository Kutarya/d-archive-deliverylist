const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const runtime=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {_electron}=runtime('playwright');
const root=path.resolve(__dirname,'..'),art=path.join(root,'artifacts','1.1.1');
const assert=require('node:assert/strict');
const report={checks:[],errors:[],network:[],ocr:{}};
const ok=(name,data)=>{report.checks.push({name,data});console.log('PASS '+name+(data?' '+JSON.stringify(data):''));};
let app,page;
async function start(dataDir){
  app=await _electron.launch({executablePath:process.env.QA_EXECUTABLE || path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.QA_EXECUTABLE?[]:[root],env:{...process.env,FATURA_DATA_DIR:dataDir}});
  page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));
  await page.route(/^https?:\/\//,route=>{report.network.push(route.request().url());return route.abort();});
  await page.getByRole('heading',{name:'Start with a photo.'}).waitFor();
  await app.evaluate(({dialog},folder)=>{dialog.showSaveDialog=async(win,options)=>({canceled:false,filePath:folder+'/'+options.defaultPath.replaceAll('\\','/').split('/').pop()});},art);
}
(async()=>{
  const dataDir=path.join(art,'desktop-data-'+Date.now());
  try{
    await start(dataDir);await page.screenshot({path:path.join(art,'home-desktop.png'),fullPage:true});ok('Masaüstü ana ekranı açıldı');
    await page.locator('input[type=file]').nth(0).setInputFiles('C:/Users/yunus/AppData/Local/Temp/codex-clipboard-cf3c293f-2cb3-4c5d-bca5-c875c56db88f.png');
    await page.getByRole('heading',{name:'Review the details.'}).waitFor({timeout:120000});
    assert.equal(await page.getByLabel('Document number *',{exact:true}).inputValue(),'');
    assert.equal(await page.getByLabel('1. item name',{exact:true}).inputValue(),'');
    await page.getByRole('button',{name:'Confirm details'}).click();await page.getByRole('alert').waitFor();ok('Gönderilen gerçek boş form okunuyor; bilgi uydurulmuyor ve eksik belge onaylanmıyor');
    await page.getByRole('button',{name:'Remove pending document'}).click();await page.getByRole('dialog',{name:'Remove pending document'}).getByRole('button',{name:'Remove',exact:true}).click();
    await page.locator('input[type=file]').nth(0).setInputFiles(path.join(art,'filled-invoice.png'));
    await page.getByLabel('Document number *',{exact:true}).waitFor({timeout:120000});
    await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:120000});
    report.ocr={number:await page.getByLabel('Document number *',{exact:true}).inputValue(),supplier:await page.getByLabel('Supplier / seller',{exact:true}).inputValue(),description:await page.getByLabel('1. item name',{exact:true}).inputValue(),quantity:await page.getByLabel('1. quantity',{exact:true}).inputValue(),price:await page.getByLabel('1. unit price',{exact:true}).inputValue()};
    assert.match(report.ocr.number,/2026.*001/);assert.match(report.ocr.supplier,/Prauge/i);assert.match(report.ocr.description,/Drevena/i);assert.equal(report.ocr.quantity,'3');assert.equal(report.ocr.price,'125,50');ok('Dolu basılı fotoğraftan gerçek çevrimdışı OCR',report.ocr);
    await page.getByLabel('1. discount',{exact:true}).fill('10');await page.getByLabel('1. VAT',{exact:true}).fill('21');
    const rows=await page.locator('.item-grid').count();assert.equal(rows,2);await page.getByLabel('2. VAT',{exact:true}).fill('21');
    await page.getByLabel('Total shown in photo',{exact:true}).fill('2830,01');
    await page.screenshot({path:path.join(art,'review-desktop.png'),fullPage:true});
    await page.getByRole('button',{name:'Confirm details'}).click();await page.getByRole('dialog',{name:'Save to Excel file'}).waitFor();await page.getByLabel('File name',{exact:true}).fill('Acceptance Test');await page.getByRole('button',{name:'Confirm and save to archive'}).click();await page.locator('.collection-card').waitFor();ok('Fotoğraf kontrol edildikten sonra yeni Excel arşivine kaydedildi');
    await page.getByRole('button',{name:'Open file'}).first().click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});await page.getByRole('button',{name:'Download Excel',exact:true}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});
    assert.ok((await fs.stat(path.join(art,'Acceptance Test.xlsx'))).size>1000);ok('Gerçek XLSX dosyası Windows dosya köprüsünden kaydedildi');
    await page.getByRole('button',{name:'PDF',exact:true}).click();await page.locator('.pdf-preview canvas').first().waitFor({timeout:60000});await page.getByRole('button',{name:'Download PDF',exact:true}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});await page.screenshot({path:path.join(art,'pdf-desktop.png'),fullPage:true});ok('PDF oluşturuldu, sayfa render edildi ve dosyası kaydedildi');
    await page.getByRole('button',{name:'Image',exact:true}).click();await page.locator('.image-preview-grid img').first().waitFor({timeout:60000});await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});await page.getByRole('button',{name:'Download image',exact:true}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});ok('Oluşturulan resim ve kaynak fotoğraf açıldı; PNG kaydedildi');
    await page.setViewportSize({width:390,height:844});await page.locator('.mobile-nav').getByRole('button',{name:'Scan documents'}).click();await page.screenshot({path:path.join(art,'home-phone.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));ok('390 px telefon düzeni taşmıyor');
    await page.setViewportSize({width:820,height:1180});await page.screenshot({path:path.join(art,'home-tablet.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));ok('820 px tablet düzeni taşmıyor');
    await page.setViewportSize({width:1360,height:900});await page.getByRole('button',{name:'Backup and transfer',exact:true}).click();await page.getByRole('button',{name:'Create backup file'}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});ok('Fotoğrafları içeren arşiv yedeği kaydedildi');
    await new Promise(resolve=>setTimeout(resolve,650));await app.close();await start(dataDir);await page.getByRole('button',{name:/My Excel archive/}).click();await page.getByRole('heading',{name:'Acceptance Test',exact:true}).waitFor();ok('Uygulama kapatılıp açıldığında arşiv ve fotoğraf verileri korundu');
    await page.locator('input[type=file]').nth(1).setInputFiles('C:/Users/yunus/Downloads/Junior_Data_Analyst_All_5_Tasks_Duzeltilmis.xlsx');await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});assert.equal(await page.locator('.sheet-tabs button').count(),11);await page.getByRole('button',{name:'Download original Excel'}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});assert.deepEqual(await fs.readFile(path.join(art,'Junior_Data_Analyst_All_5_Tasks_Duzeltilmis.xlsx')),await fs.readFile('C:/Users/yunus/Downloads/Junior_Data_Analyst_All_5_Tasks_Duzeltilmis.xlsx'));ok('Kullanıcının gerçek 11 sayfalık Excel’i açıldı; orijinal dosya değişmeden korundu');
    await page.getByRole('button',{name:'Back to archive'}).click();await page.getByRole('button',{name:'Acceptance Test',exact:true}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});await page.getByRole('button',{name:'Add documents to this file'}).click();
    await page.locator('input[type=file]').nth(0).setInputFiles(path.join(art,'filled-invoice-2.png'));await page.getByRole('heading',{name:'Review the details.'}).waitFor({timeout:120000});await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:120000});await page.getByRole('button',{name:'Confirm details'}).click();await page.getByRole('button',{name:'Confirm and save to archive'}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});
    let persisted=await page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()));assert.equal(persisted.collections.find(c=>c.name==='Acceptance Test').invoices.length,2);ok('İkinci fotoğraf mevcut Excel dosyasına eklendi');
    await page.getByRole('button',{name:'New document',exact:true}).click();await page.locator('input[type=file]').nth(0).setInputFiles([path.join(art,'filled-invoice-3.png'),path.join(art,'filled-invoice-4.png')]);await page.getByRole('heading',{name:'Review the details.'}).waitFor({timeout:120000});await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:120000});assert.equal(await page.locator('.document-tabs button').count(),2);await page.getByRole('button',{name:'Confirm details'}).click();await page.getByLabel('Save each document to a separate Excel file').check();await page.getByRole('button',{name:'Confirm and save to archive'}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});persisted=await page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()));assert.equal(persisted.collections.filter(c=>c.invoices.length===1).length,2);ok('Toplu fotoğraflar ayrı Excel dosyaları olarak arşivlendi');
    const ExcelJS=require('exceljs');const edited=new ExcelJS.Workbook();await edited.xlsx.readFile(path.join(art,'Acceptance Test.xlsx'));edited.getWorksheet('Items').getCell('D5').value=6;await edited.xlsx.writeFile(path.join(art,'edited-english.xlsx'));
    await page.locator('input[type=file]').nth(1).setInputFiles(path.join(art,'edited-english.xlsx'));await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});
    persisted=await page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()));let archive=persisted.collections.find(c=>c.name==='Acceptance Test');assert.equal(archive.invoices.length,2);assert.equal(archive.invoices[0].items[0].quantity,'6');ok('English Excel edits are applied on reimport; invoices added after export are preserved');
    const legacy=new ExcelJS.Workbook();await legacy.xlsx.readFile(path.join(root,'artifacts/legacy-1.0.0.xlsx'));legacy.getWorksheet('Kalemler').getCell('D5').value=9;await legacy.xlsx.writeFile(path.join(art,'edited-legacy.xlsx'));
    await page.locator('input[type=file]').nth(1).setInputFiles(path.join(art,'edited-legacy.xlsx'));await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});
    persisted=await page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()));assert.equal(persisted.collections.find(c=>c.id==='qa-group').invoices[0].items[0].quantity,'9');assert.deepEqual(await page.locator('.sheet-tabs button').allTextContents(),['Summary','Invoices','Items','Document 1','Document 2']);ok('Legacy 1.0.0 Excel is recognized, edited quantities are imported, and new output is English');
    const backup=(await fs.readdir(art)).find(n=>n.startsWith('Invoice-Atelier-Backup-'));assert.ok(backup);
    const beforeRestore=await page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()));
    for(let n=0;n<2;n++){await page.locator('input[type=file]').nth(2).setInputFiles(path.join(art,backup));await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});}
    const afterRestore=await page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()));assert.deepEqual(afterRestore,beforeRestore);ok('Importing the same backup twice preserves records and avoids duplicates');
    await fs.writeFile(path.join(art,'invalid-backup.json'),JSON.stringify({version:1,collections:[null],draft:[]}));await page.locator('input[type=file]').nth(2).setInputFiles(path.join(art,'invalid-backup.json'));await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Invalid archive record/);assert.deepEqual(await page.evaluate(async()=>JSON.parse(await window.desktop.loadStore())),beforeRestore);ok('Malformed backup is rejected in English without changing saved data');
    const wide=new ExcelJS.Workbook();const wideSheet=wide.addWorksheet('Wide');wideSheet.getRow(1).values=Array.from({length:30},(_,i)=>'Column '+(i+1));await wide.xlsx.writeFile(path.join(art,'wide.xlsx'));await page.locator('input[type=file]').nth(1).setInputFiles(path.join(art,'wide.xlsx'));await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});assert.equal(await page.locator('.excel-scroll thead th').last().innerText(),'AD');ok('Excel preview labels columns after Z correctly');
    await page.getByRole('button',{name:'Scan documents',exact:true}).click();
    await page.evaluate(()=>{window._originalCamera=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window._resolveCamera=resolve;});});
    await page.getByRole('button',{name:'Take a photo',exact:true}).click();await page.getByRole('button',{name:'Close camera',exact:true}).click();
    await page.evaluate(()=>{window._cameraStopped=false;window._resolveCamera({getTracks:()=>[{stop:()=>{window._cameraStopped=true;}}]});});await page.waitForFunction(()=>window._cameraStopped===true);await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=window._originalCamera;});ok('Camera closes a late stream after cancellation (mock media stream)');
    assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.title(),'Invoice Atelier');
    assert.equal(report.errors.length,0,report.errors.join('\n'));assert.equal(report.network.length,0,'Uygulama internete istek atmış');ok('English document language and title; no external network requests or renderer errors');
    report.dataDir=dataDir;report.executable=process.env.QA_EXECUTABLE || 'development';report.success=true;
  }catch(e){report.success=false;report.failure=e.stack;console.error(e);if(page)await page.screenshot({path:path.join(art,'failure.png'),fullPage:true}).catch(()=>{});}
  finally{await fs.writeFile(path.join(art,'desktop-acceptance.json'),JSON.stringify(report,null,2));if(app)await app.close().catch(()=>{});process.exitCode=report.success?0:1;}
})();
