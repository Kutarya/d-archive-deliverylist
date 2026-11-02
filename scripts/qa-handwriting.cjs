const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const {_electron}=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright');
const {version}=require('../package.json'),root=path.resolve(__dirname,'..'),art=path.join(root,'artifacts',version);
const input=process.env.QA_PHOTO||'C:/Users/yunus/Downloads/WhatsApp Image 2026-10-20 at 11.03.32.jpeg';
const report={version,success:false,executable:process.env.QA_EXECUTABLE||'development',source:input,checks:[],errors:[],console:[],network:[]};
let app,page;
(async()=>{await fs.mkdir(art,{recursive:true});try{
 const dataDir=path.join(art,'handwriting-data-'+Date.now());
 app=await _electron.launch({executablePath:process.env.QA_EXECUTABLE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.QA_EXECUTABLE?[]:[root],env:{...process.env,FATURA_DATA_DIR:dataDir}});page=await app.firstWindow();
 page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error'||message.type()==='warning')report.console.push(message.text().slice(0,600));});
 await page.route(/^https?:\/\//,route=>{report.network.push(route.request().url());return route.abort();});
 await page.getByRole('heading',{name:'Start with a photo.'}).waitFor();await page.locator('input[type=file]').first().setInputFiles(input);
 await page.getByRole('heading',{name:'Review the details.'}).waitFor({timeout:180000});await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:180000});await page.locator('.reading-status').waitFor({state:'hidden',timeout:180000});
 let store;for(let n=0;n<80;n++){store=await page.evaluate(async()=>JSON.parse(await window.desktop.loadStore()));if(store.draft.length)break;await new Promise(r=>setTimeout(r,100));}
 const invoice=store.draft[0];report.automatic={...invoice,image:undefined};report.dataDir=dataDir;
 await page.screenshot({path:path.join(art,'handwriting-automatic.png'),fullPage:true});
 assert.match(invoice.engine,/document recognition/,'The enhanced local reader did not complete');report.checks.push('Bundled local document reader completed with external network requests blocked');
 assert.equal(invoice.number,'16.10.26');assert.equal(invoice.type,'Teslimat fişi');assert.equal(invoice.date,'');report.checks.push('Document number and delivery-note type are filled automatically; no issue date is invented');
 assert.equal(invoice.supplier.toLowerCase(),'burhan');assert.equal(invoice.customer.replace(/\s+/g,' ').trim(),'BELLA ALSACE');report.checks.push('Supplier and customer are filled from the photo without typing into the form');
 assert.equal(invoice.items[0].description.toUpperCase(),'WOLL SOCKS');assert.equal(Number(invoice.items[0].quantity.replace(',','.')),200);assert.equal(Number(invoice.items[0].unitPrice.replace(',','.')),3);report.checks.push('Handwritten description, quantity and unit price are filled automatically in separate fields');
 assert.equal(invoice.currency,'EUR');assert.equal(Number(invoice.statedTotal.replace(',','.')),600);report.checks.push('Currency and stated total are read separately from the preprinted currency heading');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.success=true;
 }catch(error){report.failure=error.stack;console.error(error);}
 finally{await fs.writeFile(path.join(art,'handwriting-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(app)await app.close().catch(()=>{});process.exitCode=report.success?0:1;}
})().catch(error=>{console.error(error);process.exitCode=1;});
