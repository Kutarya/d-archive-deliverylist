const fs = require('node:fs/promises');
const path = require('node:path');
const {createRequire} = require('node:module');
const runtime = createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {_electron} = runtime('playwright');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {execFileSync} = require('node:child_process');
const {version} = require('../package.json');
const messages = require('../src/translations.json');
const root = path.resolve(__dirname, '..');
const image = process.env.QA_PHOTO || 'C:/Users/yunus/AppData/Local/Temp/codex-clipboard-5f52cc21-7dae-4c42-b467-137ab97d040f.png';
const artifact = path.resolve(process.env.QA_ARTIFACTS || path.join(root, 'artifacts', version, 'real-photo'));
let app, page;
const idle = async()=>{await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:150000});await page.locator('.reading-status').waitFor({state:'hidden',timeout:150000});await page.locator('.preview-loading').waitFor({state:'hidden',timeout:60000});};
const load = async()=>page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()));
async function saved(check){for(let n=0;n<80;n++){const store=await load();if(check(store))return store;await new Promise(r=>setTimeout(r,100));}throw Error('Saved archive did not match the expected state');}
const text = (key,language)=>language==='en'?key:messages[key][language];
async function enterReference(){
  await page.getByLabel('Document number *',{exact:true}).fill('16.10.26');
  await page.getByLabel('Document date',{exact:true}).fill('');
  await page.getByLabel('Document type',{exact:true}).selectOption('Teslimat fişi');
  await page.getByLabel('Currency',{exact:true}).selectOption('EUR');
  await page.getByLabel('Supplier / seller',{exact:true}).fill('Burhan');
  await page.getByLabel('Buyer / customer',{exact:true}).fill('BELLA ALSACE');
  await page.getByLabel('1. item name',{exact:true}).fill('WOLL SOCKS');
  await page.getByLabel('1. quantity',{exact:true}).fill('200');
  await page.getByLabel('1. unit price',{exact:true}).fill('3');
  await page.getByLabel('Total shown in photo',{exact:true}).fill('600');
  try{return await saved(store=>store.draft[0]?.items[0]?.quantity==='200'&&store.draft[0]?.statedTotal==='600');}
  catch(error){
    const fields=await page.locator('main input').evaluateAll(nodes=>nodes.map(node=>({label:node.getAttribute('aria-label'),value:node.value})));
    console.log('Manual-entry DOM diagnostics '+JSON.stringify(fields));
    await page.screenshot({path:path.join(artifact,'manual-entry-failure.png'),fullPage:true});
    throw error;
  }
}
(async () => {
  await fs.mkdir(artifact, {recursive:true});
  const report = {version,image, executable:process.env.QA_EXECUTABLE || 'development', errors:[], network:[],checks:[]};
  const dataDir=path.join(artifact,'data-'+Date.now());
  const ok=name=>{report.checks.push(name);console.log('PASS '+name);};
  try {
    app = await _electron.launch({executablePath:process.env.QA_EXECUTABLE || path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.QA_EXECUTABLE?[]:[root],env:{...process.env,FATURA_DATA_DIR:dataDir}});
    page = await app.firstWindow();
    page.on('pageerror', e=>report.errors.push(e.message));
    await page.route(/^https?:\/\//, route=>{report.network.push(route.request().url());return route.abort();});
    await page.getByRole('heading',{name:'Start with a photo.'}).waitFor();
    await page.locator('input[type=file]').nth(0).setInputFiles(image);
    await page.getByRole('heading',{name:'Review the details.'}).waitFor({timeout:150000});
    await idle();
    const automatic=await saved(store=>store.draft?.length===1),source=automatic.draft[0];
    report.automaticOcr={...source,image:undefined};
    report.automaticRecognitionComplete=!!(source.number&&source.items[0]?.description&&source.items[0]?.quantity&&source.items[0]?.unitPrice);
    report.manualReference={number:'16.10.26',date:'',supplier:'Burhan',customer:'BELLA ALSACE',description:'WOLL SOCKS',quantity:200,unitPrice:3,total:600,currency:'EUR',origin:'Visual transcription for QA; not automatically recognized or user-approved business data'};
    report.limits=['The offline OCR does not reliably recognize this handwritten photo.','The date-shaped entry is retained as the document number; an issue date was not assumed.','The visual transcription is a review example and must be checked before business use.'];
    await page.screenshot({path:path.join(artifact,'automatic-review.png'),fullPage:true});
    if(!report.automaticRecognitionComplete){await page.getByRole('button',{name:'Confirm details',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog').count(),0);ok('Actual handwritten-photo OCR remains reviewable and incomplete required data cannot be saved');}
    await enterReference();
    for(const language of ['en','cs','tr']){
      await page.locator('[data-testid=settings-nav]').click();await page.locator('[data-testid=interface-language]').selectOption(language);
      await page.getByRole('button',{name:text('Scan documents',language)}).click();
      await page.getByRole('button',{name:text('Read again',language),exact:true}).click();
      const dialog=page.getByRole('dialog',{name:text('Read this photo again?',language)});await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes(text('This replaces extracted details, including manual corrections. The source photo is kept.',language)));
      await page.setViewportSize({width:320,height:800});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'Reread dialog overflows at 320px');await page.screenshot({path:path.join(artifact,'reread-'+language+'-phone.png'),fullPage:true});await page.setViewportSize({width:1360,height:920});
      assert.equal((await load()).draft[0].items[0].quantity,'200');
      await dialog.getByRole('button',{name:text('Cancel',language),exact:true}).click();
      assert.equal(await page.getByLabel(text('Document number *',language),{exact:true}).inputValue(),'16.10.26');
      ok(language+' reread dialog is translated and cancellation preserves manual corrections');
    }
    await page.locator('[data-testid=settings-nav]').click();await page.locator('[data-testid=interface-language]').selectOption('en');await page.getByRole('button',{name:'Scan documents'}).click();
    for(let round=1;round<=3;round++){
      const previousItem=(await load()).draft[0].items[0].id;
      await page.getByRole('button',{name:'Read again',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Read and replace details',exact:true}).click();await page.locator('.busy-overlay').waitFor({state:'visible',timeout:30000});await idle();
      const reread=await saved(store=>store.draft[0].items[0].id!==previousItem&&store.draft[0].number===source.number&&store.draft[0].items[0].quantity===source.items[0].quantity);
      for(const key of ['id','image','sourceHash','sourceName','createdAt'])assert.equal(reread.draft[0][key],source[key],key);
      await enterReference();
      ok('Reread round '+round+' preserves identity and subsequent manual corrections are saved');
    }
    await enterReference();await page.screenshot({path:path.join(artifact,'reviewed-reference.png'),fullPage:true});
    await page.getByRole('button',{name:'Confirm details',exact:true}).click();await page.getByLabel('File name',{exact:true}).fill('Delivery-16.10.26');await page.getByRole('button',{name:'Confirm and save to archive',exact:true}).click();await idle();
    const archive=await saved(store=>store.collections.length===1&&store.draft.length===0);assert.equal(archive.collections[0].invoices[0].image,source.image);ok('Visually transcribed example is saved in an isolated QA archive with its source photo');
    await app.evaluate(({dialog},folder)=>{global.qaOutput='en';dialog.showSaveDialog=async(window,options)=>({canceled:false,filePath:folder+'/'+global.qaOutput+'-'+options.defaultPath.replaceAll('\\','/').split('/').pop()});},artifact);
    for(const language of ['en','cs','tr']){
      await page.locator('[data-testid=settings-nav]').click();await page.locator('[data-testid=output-language]').selectOption(language);await app.evaluate((_,lang)=>{global.qaOutput=lang;},language);
      await page.getByRole('button',{name:/My Excel archive/,exact:false}).first().click();await page.getByRole('button',{name:'Delivery-16.10.26',exact:true}).click();await idle();
      await page.getByRole('button',{name:'Download Excel',exact:true}).click();await idle();
      const book=new ExcelJS.Workbook();await book.xlsx.readFile(path.join(artifact,language+'-Delivery-16.10.26.xlsx'));const items=book.getWorksheet(text('Items',language)),invoices=book.getWorksheet(text('Invoices',language));
      assert.equal(items.getCell('C5').value,'WOLL SOCKS');assert.equal(items.getCell('D5').value,200);assert.equal(items.getCell('F5').value,3);assert.equal(items.getCell('M5').value.result,600);assert.equal(invoices.getCell('G5').value,'EUR');assert.equal(invoices.getCell('D5').value,null);
      await page.getByRole('button',{name:'PDF',exact:true}).click();await page.locator('.pdf-preview canvas').first().waitFor({timeout:60000});await idle();await page.getByRole('button',{name:'Download PDF',exact:true}).click();await idle();
      const content=execFileSync('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['-X','utf8','-c','from pypdf import PdfReader; import sys; print("\\n".join(p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages))',path.join(artifact,language+'-Delivery-16.10.26.pdf')],{encoding:'utf8'});
      assert.ok(content.includes('WOLL SOCKS'));assert.ok(content.includes(text('Grand total',language)));assert.match(content,/600/);
      await page.getByRole('button',{name:'Image',exact:true}).click();await page.locator('.image-preview-grid img').first().waitFor();await idle();await page.getByRole('button',{name:'Download image',exact:true}).click();await idle();
      assert.ok((await fs.stat(path.join(artifact,language+'-16.10.26.png'))).size>1000);
      ok(language+' actual Excel/PDF/PNG downloads retain 200 × 3 = 600 EUR and source item text');
    }
    await app.close();app=null;
    app=await _electron.launch({executablePath:process.env.QA_EXECUTABLE || path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.QA_EXECUTABLE?[]:[root],env:{...process.env,FATURA_DATA_DIR:dataDir}});page=await app.firstWindow();await page.waitForSelector('.capture-card');
    const restored=await load();assert.deepEqual(restored.collections,archive.collections);assert.equal(restored.settings.outputLanguage,'tr');ok('Restart preserves the reviewed example, photo, formulas inputs and output language');
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.dataDir=dataDir;report.success=true;
  } catch(error) {report.success=false;report.failure=error.stack;}
  finally {
    await fs.writeFile(path.join(artifact,'ocr-result.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    if(app)await app.close().catch(()=>{});
    process.exitCode=report.success?0:1;
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
