const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const runtime=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json'),{_electron}=runtime('playwright');
const ExcelJS=require('exceljs'),messages=require('../src/translations.json'),{version}=require('../package.json');
const root=path.resolve(__dirname,'..'),art=path.join(root,'artifacts',version),python='C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const languages=['en','cs','tr'],text=(key,language)=>language==='en'?key:messages[key][language];
const report={version,success:false,checks:[],errors:[],combinations:[],nativeDialogs:[]};
const ok=message=>{report.checks.push(message);console.log('PASS '+message);};
let app,page,activeCase='initial';
const idle=async()=>{await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});await page.locator('.preview-loading').waitFor({state:'hidden',timeout:60000});};
async function start(dataDir){
 app=await _electron.launch({executablePath:process.env.QA_EXECUTABLE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.QA_EXECUTABLE?[]:[root],env:{...process.env,FATURA_DATA_DIR:dataDir}});
 page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));
 await page.waitForSelector('.capture-card');
 await app.evaluate(({dialog},folder)=>{global.qaCase='initial';global.qaDialogs=[];dialog.showSaveDialog=async(window,options)=>{global.qaDialogs.push({case:global.qaCase,title:options.title,button:options.buttonLabel});return {canceled:false,filePath:folder+'/'+global.qaCase+'-'+options.defaultPath.replaceAll('\\','/').split('/').pop()};};},art);
}
async function choose(ui,output){
 await page.locator('[data-testid=settings-nav]').click();await page.locator('[data-testid=interface-language]').selectOption(ui);await page.locator('[data-testid=output-language]').selectOption(output);
 let saved;for(let n=0;n<600;n++){saved=await page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()).settings);if(saved?.interfaceLanguage===ui&&saved?.outputLanguage===output)break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.deepEqual(saved,{interfaceLanguage:ui,outputLanguage:output});
 assert.equal(await page.locator('html').getAttribute('lang'),ui);assert.equal(await page.locator('main h1').innerText(),text('Settings',ui));
}
async function download(kind,ui,output){
 await page.getByRole('button',{name:kind==='xlsx'?'Excel':kind==='pdf'?'PDF':text('Image',ui),exact:true}).click();await idle();
 if(kind==='pdf')await page.locator('.pdf-preview canvas').first().waitFor({timeout:60000});
 if(kind==='png')await page.locator('.image-preview-grid img').first().waitFor({timeout:60000});
 await page.getByRole('button',{name:text(kind==='xlsx'?'Download Excel':kind==='pdf'?'Download PDF':'Download image',ui),exact:true}).click();await idle();
 const filename=path.join(art,activeCase+'-'+(kind==='png'?'LANG-001':'Language-QA')+'.'+kind);assert.ok((await fs.stat(filename)).size>1000);return filename;
}
(async()=>{await fs.mkdir(art,{recursive:true});const dataDir=path.join(art,'language-data-'+Date.now());await fs.mkdir(dataDir,{recursive:true});
 const now=new Date().toISOString(),invoice={id:'language-invoice',sourceHash:'language-fixture',sourceName:'fixture.png',image:'',ocrText:'',confidence:null,engine:'',number:'LANG-001',date:'2026-10-20',type:'Fatura',supplier:'Example Ltd',supplierTax:'',supplierAddress:'',customer:'Buyer Ltd',customerTax:'',customerAddress:'',currency:'CZK',orderNumber:'',transport:'Courier',plate:'QA 001',deliveredBy:'Sender',receivedBy:'Receiver',notes:'',statedTotal:'',items:[{id:'item-1',description:'Oak chair',quantity:'3',unit:'pcs',unitPrice:'125.50',discount:'10',vat:'21'}],createdAt:now,approvedAt:now};
 await fs.writeFile(path.join(dataDir,'archive-v1.json'),JSON.stringify({version:1,collections:[{id:'language-collection',name:'Language-QA',createdAt:now,updatedAt:now,invoices:[invoice]}],draft:[]}));
 try{
  await start(dataDir);await choose('en','en');ok('Legacy archive opens with independent English defaults');
  for(const ui of languages){
   for(const output of languages){
    activeCase=ui+'-'+output;await app.evaluate((_,value)=>{global.qaCase=value;},activeCase);await choose(ui,output);
    await page.locator('.sidebar').getByRole('button',{name:new RegExp(text('My Excel archive',ui))}).click();await page.locator('.collection-title').click();await idle();
    await page.getByRole('button',{name:text('Edit rows',ui),exact:true}).click();const editor=page.getByRole('dialog',{name:text('Edit rows',ui),exact:true});await editor.getByLabel(text('Document number *',ui),{exact:true}).fill('');await editor.getByRole('button',{name:text('Save changes',ui),exact:true}).click();assert.equal(await editor.getByLabel(text('Document number *',ui),{exact:true}).getAttribute('aria-invalid'),'true');assert.ok((await editor.innerText()).includes(text('Enter a document number.',ui)));await editor.getByRole('button',{name:text('Cancel',ui),exact:true}).click();
    assert.deepEqual(await page.locator('.sheet-tabs button').allTextContents(),[text('Documents',output)]);
    const expectedDate=new Date('2026-10-20T00:00:00Z').toLocaleDateString({en:'en-GB',cs:'cs-CZ',tr:'tr-TR'}[output],{timeZone:'UTC'});assert.ok((await page.locator('.excel-scroll').innerText()).replace(/\s/g,'').includes(expectedDate.replace(/\s/g,'')),`${activeCase}: localized date preview`);
    const xlsx=await download('xlsx',ui,output),book=new ExcelJS.Workbook();await book.xlsx.readFile(xlsx);
    assert.equal(book.worksheets.length,1);assert.equal(book.worksheets[0].getCell('C18').value,text('Quantity',output));assert.equal(book.worksheets[0].getCell('C13').value,text('Invoice',output));assert.equal(book.worksheets[0].getCell('X1').value,'INVOICE_ATELIER_SINGLE_V1');
    for(const sheet of book.worksheets)sheet.eachRow(row=>row.eachCell(cell=>{if(cell.value&&typeof cell.value==='object'&&cell.value.formula){for(const match of cell.value.formula.matchAll(/'([^']+)'!/g))assert.ok(book.getWorksheet(match[1]),'Broken formula sheet '+match[1]);}}));
    const pdf=await download('pdf',ui,output);const content=execFileSync(python,['-X','utf8','-c','from pypdf import PdfReader; import sys; print("\\n".join(p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages))',pdf],{encoding:'utf8',maxBuffer:1024*1024});
    assert.ok(content.includes(text('Document no.',output)),`${activeCase}: missing PDF document heading`);assert.ok(content.includes(text('Grand total',output)),`${activeCase}: missing PDF total heading`);assert.ok(content.includes(text('Transport: {transport}',output).split('{transport}')[0]));
    if(ui===output){await download('png',ui,output);await page.screenshot({path:path.join(art,'output-'+output+'.png'),fullPage:true});}
    report.combinations.push({interface:ui,output,excel:true,pdf:true,png:ui===output,editor:true});ok(`${ui} interface with ${output} Excel/PDF output`);
   }
   await choose(ui,'en');
   for(const width of [320,390,820]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${ui} settings overflow at ${width}`);if(width===390)await page.screenshot({path:path.join(art,'settings-'+ui+'-phone.png'),fullPage:true});}
   await page.setViewportSize({width:1360,height:900});await page.screenshot({path:path.join(art,'settings-'+ui+'-desktop.png'),fullPage:true});ok(`${ui} settings fit phone and tablet widths`);
   await fs.writeFile(path.join(art,'invalid-language-backup.json'),JSON.stringify({version:1,collections:[null],draft:[]}));await page.locator('input[type=file]').nth(2).setInputFiles(path.join(art,'invalid-language-backup.json'));await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),new RegExp(text('Invalid archive record.',ui)));ok(`${ui} backup validation uses the interface language`);
  }
  report.nativeDialogs=await app.evaluate(()=>global.qaDialogs);for(const item of report.nativeDialogs){const ui=item.case.split('-')[0];assert.equal(item.title,text('Save file',ui));assert.equal(item.button,text('Save',ui));}ok('Windows save dialog labels follow interface language independently of outputs');
  await choose('cs','tr');await app.close();app=null;await start(dataDir);assert.equal(await page.locator('html').getAttribute('lang'),'cs');await page.locator('[data-testid=settings-nav]').click();assert.equal(await page.locator('[data-testid=interface-language]').inputValue(),'cs');assert.equal(await page.locator('[data-testid=output-language]').inputValue(),'tr');ok('Czech interface and Turkish output preferences survive a process restart');
  assert.equal(report.errors.length,0,report.errors.join('\n'));report.success=true;report.executable=process.env.QA_EXECUTABLE||'development';report.dataDir=dataDir;
 }catch(error){report.failure=error.stack;console.error(error);if(page)await page.screenshot({path:path.join(art,'language-failure.png'),fullPage:true}).catch(()=>{});}
 finally{if(app)await app.close().catch(()=>{});await fs.writeFile(path.join(art,'language-acceptance.json'),JSON.stringify(report,null,2));process.exitCode=report.success?0:1;}
})().catch(error=>{console.error(error);process.exitCode=1;});
