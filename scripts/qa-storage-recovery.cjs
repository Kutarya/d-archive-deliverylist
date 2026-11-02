// Controlled bridge write failures on a dedicated read-only emulator.
// Source photos and the previously committed native archive are real.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),{version}=require('../package.json'),before=process.env.QA_EXPECT_STORAGE_BUGS==='1';
const art=path.join(root,'artifacts',process.env.QA_OUTPUT_VERSION||version),pkg='com.faturaatolyesi.app',serial='emulator-5556',adb='C:/Users/yunus/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const report={version,phase:before?'before-storage-fix':'after-storage-fix',success:false,checks:[],cases:[],errors:[]};let page,browser,seed;
const cmd=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024}).trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const load=()=>page.evaluate(async()=>JSON.parse((await window.Capacitor.Plugins.NativeDocuments.loadStore()).data));
const fingerprints=store=>[...store.collections.flatMap(group=>group.invoices),...store.draft].map(inv=>({id:inv.id,image:inv.image,hash:inv.sourceHash,name:inv.sourceName})).sort((a,b)=>a.id.localeCompare(b.id));
async function connect(){
  cmd('shell','am','start','-W','-n',pkg+'/.MainActivity');cmd('forward','tcp:9241','localabstract:webview_devtools_remote_'+cmd('shell','pidof',pkg));
  browser=await chromium.connectOverCDP('http://127.0.0.1:9241');page=browser.contexts()[0].pages().find(p=>p.url().includes('localhost'))||browser.contexts()[0].pages()[0];page.setDefaultTimeout(30000);
  page.on('pageerror',error=>report.errors.push(error.message));await page.waitForSelector('main h1');
}
async function reset(){
  await browser?.close().catch(()=>{});browser=null;cmd('shell','am','force-stop',pkg);
  const file=path.join(art,'storage-recovery-seed.json');await fs.writeFile(file,JSON.stringify(seed));cmd('push',file,'/data/local/tmp/atelier-storage-seed.json');cmd('shell','run-as',pkg,'mkdir','-p','files');cmd('shell','run-as',pkg,'cp','/data/local/tmp/atelier-storage-seed.json','files/archive-v1.json');
  await connect();await page.getByRole('heading',{name:'Review the details.',exact:true}).waitFor();
  await page.evaluate(()=>{const cap=window.Capacitor,original=cap.nativePromise;window.storageFault={blocked:false,failed:0};cap.nativePromise=function(plugin,method,options){if(plugin==='NativeDocuments'&&method==='saveStore'&&window.storageFault.blocked){window.storageFault.failed++;return Promise.reject(new Error('Could not save the archive.'));}return original.call(this,plugin,method,options);};});
}
async function block(value){await page.evaluate(value=>{window.storageFault.blocked=value;},value);}
async function saved(predicate){const deadline=Date.now()+90000;while(Date.now()<deadline){const store=await load();if(predicate(store))return store;await pause(200);}throw Error('Expected native archive was not saved');}
async function idle(){await page.locator('.busy-overlay').waitFor({state:'hidden'});}
const ok=name=>{report.checks.push(name);console.log('PASS '+name);};
async function caseResult(name,reproduced,details={}){report.cases.push({name,reproduced,...details});if(before)assert.equal(reproduced,true,name+' baseline did not reproduce');else assert.equal(reproduced,false,name+' remains broken');}
(async()=>{await fs.mkdir(art,{recursive:true});try{
  const processes=execFileSync('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^qemu' } | Select-Object -ExpandProperty CommandLine"],{encoding:'utf8'});assert.ok(processes.split(/\r?\n/).some(line=>/-avd Atelier_\d+ -read-only/.test(line)&&line.includes('-port 5556')));
  const installed=cmd('shell','pm','path',pkg).replace(/^package:/,'');report.apkSha256=cmd('shell','sha256sum',installed).split(/\s/)[0];report.installedVersion=cmd('shell','dumpsys','package',pkg).match(/versionName=([^\s]+)/)?.[1];assert.equal(report.installedVersion,version);
  seed=JSON.parse(await fs.readFile(path.join(root,'artifacts/1.5.1/settings-tested-native-store.json'),'utf8'));seed.settings={interfaceLanguage:'en',outputLanguage:'en'};assert.equal(seed.draft.length,2);assert.equal(seed.collections.length,2);
  const originalSources=fingerprints(seed);

  await reset();await page.locator('[data-testid=settings-mobile]').click();await page.locator('[data-testid=default-supplier]').fill('Retried company');await block(true);await page.locator('[data-testid=save-defaults]').click();await page.getByText('Could not save fixed details. Please try again.',{exact:true}).waitFor();
  assert.deepEqual((await load()).businessDefaults,seed.businessDefaults);const canRetry=await page.locator('[data-testid=save-defaults]').isEnabled();await caseResult('settings-retry',!canRetry,{input:await page.locator('[data-testid=default-supplier]').inputValue()});
  if(!before){assert.equal(await page.locator('[data-testid=default-supplier]').inputValue(),'Retried company');await pause(800);await block(false);await page.locator('[data-testid=save-defaults]').click();const store=await saved(store=>store.businessDefaults.supplier==='Retried company');await page.getByRole('alert').waitFor({state:'hidden'});assert.deepEqual(fingerprints(store),originalSources);ok('Failed fixed details retain the unsaved form and can be retried without changing source records or leaving a stale error');}

  await reset();await page.locator('.mobile-nav').getByRole('button',{name:'My archive',exact:true}).click();await page.getByRole('button',{name:seed.collections[0].name,exact:true}).click();await page.getByRole('button',{name:'Edit documents',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Edit documents',exact:true});await dialog.getByLabel('Document number *',{exact:true}).fill('ARCHIVE-RETRY');await block(true);await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await dialog.getByRole('alert').waitFor();await idle();assert.equal((await load()).collections[0].invoices[0].number,seed.collections[0].invoices[0].number);await block(false);await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await pause(500);
  const conflict=await dialog.isVisible()&&await dialog.getByRole('alert').innerText().catch(()=>'');await caseResult('archive-retry',!!conflict,{error:conflict||null});
  if(!before){await dialog.waitFor({state:'hidden'});const store=await saved(store=>store.collections[0].invoices[0].number==='ARCHIVE-RETRY');assert.deepEqual(fingerprints(store),originalSources);ok('A failed archive edit can be saved again without a false version conflict or photo loss');}

  await reset();await page.getByRole('button',{name:'Confirm details',exact:true}).click();dialog=page.getByRole('dialog',{name:'Save to Excel file',exact:true});await dialog.getByLabel('File name',{exact:true}).fill('STORAGE-RETRY');await block(true);await dialog.getByRole('button',{name:'Confirm and save to archive',exact:true}).click();await page.getByRole('alert').first().waitFor();await idle();const archiveRetry=await dialog.getByRole('button',{name:'Confirm and save to archive',exact:true}).isEnabled();assert.equal((await load()).draft.length,2);await caseResult('approval-retry',!archiveRetry);
  if(!before){assert.equal(await dialog.getByLabel('File name',{exact:true}).inputValue(),'STORAGE-RETRY');await block(false);await dialog.getByRole('button',{name:'Confirm and save to archive',exact:true}).click();await dialog.waitFor({state:'hidden'});const store=await saved(store=>store.draft.length===0&&store.collections.length===3);assert.deepEqual(fingerprints(store),originalSources);assert.equal(store.collections.filter(group=>group.name==='STORAGE-RETRY').length,1);ok('Failed approval keeps both pending documents and the destination so retry archives each source once');}

  await reset();await block(true);await page.getByRole('button',{name:'Read again',exact:true}).click();await page.getByRole('dialog',{name:'Read this photo again?',exact:true}).getByRole('button',{name:'Read and replace details',exact:true}).click();await pause(700);await idle();
  const stuck=await page.locator('.document-tabs button').first().innerText().then(text=>text.includes('Reading'))&&!await page.getByRole('button',{name:'Stop current reading',exact:true}).count();await caseResult('reread-retry',stuck);assert.deepEqual(fingerprints(await load()),originalSources);
  if(!before){await page.getByRole('alert').first().waitFor();assert.equal(await page.getByLabel('Document number *',{exact:true}).isEnabled(),true);await block(false);await page.getByRole('button',{name:'Read again',exact:true}).click();await page.getByRole('dialog',{name:'Read this photo again?',exact:true}).getByRole('button',{name:'Read and replace details',exact:true}).click();await saved(store=>store.draft[0].number==='EN-26001'&&store.draft[0].engine!=='Pending text recognition');await page.locator('.reading-status').waitFor({state:'hidden',timeout:120000});assert.deepEqual(fingerprints(await load()),originalSources);assert.deepEqual(report.errors,[]);ok('A rejected reread request stays editable and retry completes real OCR without an unhandled rejection');}
  else{assert.ok(report.errors.some(error=>error.includes('Could not save the archive.')));report.reproducedBugs=report.cases.filter(item=>item.reproduced).length;ok('Four storage failure defects reproduced on the previous APK');}
  await page.screenshot({path:path.join(art,before?'storage-before.png':'storage-recovery.png')});report.success=true;
}catch(error){report.failure=error.stack;console.error(error);if(page)await page.screenshot({path:path.join(art,'storage-recovery-failure.png')}).catch(()=>{});}
finally{await browser?.close().catch(()=>{});try{cmd('forward','--remove','tcp:9241');}catch{}await fs.writeFile(path.join(art,before?'storage-before.json':'storage-recovery.json'),JSON.stringify(report,null,2));process.exitCode=report.success?0:1;}})();
