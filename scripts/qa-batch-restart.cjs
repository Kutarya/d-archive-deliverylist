// Fault injection is restricted to the disposable, read-only Android emulator.
// A delayed native result makes the interruption window repeatable; OCR itself is real.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {chromium}=require('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),{version}=require('../package.json'),art=path.join(root,'artifacts',version),pkg='com.faturaatolyesi.app',adb='C:/Users/yunus/AppData/Local/Android/Sdk/platform-tools/adb.exe',serial='emulator-5556';
const before=process.env.QA_EXPECT_IMPORT_LOSS==='1',report={version,phase:before?'before-batch-fix':'after-batch-fix',success:false,checks:[],errors:[]};let browser,page;
const cmd=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024}).trim();
const ok=name=>{report.checks.push(name);console.log('PASS '+name);};
async function connect(){cmd('shell','am','start','-W','-n',pkg+'/.MainActivity');cmd('forward','tcp:9239','localabstract:webview_devtools_remote_'+cmd('shell','pidof',pkg));browser=await chromium.connectOverCDP('http://127.0.0.1:9239');page=browser.contexts()[0].pages().find(p=>p.url().includes('localhost'))||browser.contexts()[0].pages()[0];page.setDefaultTimeout(45000);page.on('pageerror',error=>report.errors.push(error.message));await page.waitForSelector('main h1');}
const load=()=>page.evaluate(async()=>{const data=(await window.Capacitor.Plugins.NativeDocuments.loadStore()).data;return data?JSON.parse(data):null;});
(async()=>{try{
  const processes=execFileSync('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^qemu' } | Select-Object -ExpandProperty CommandLine"],{encoding:'utf8'});assert.ok(processes.split(/\r?\n/).some(line=>line.includes('-read-only')&&line.includes('-port 5556')));
  report.apkSha256=crypto.createHash('sha256').update(await fs.readFile(path.join(root,'android/app/build/outputs/apk/debug/app-debug.apk'))).digest('hex');
  await connect();await fs.writeFile(path.join(art,`batch-${report.phase}-previous-store.json`),JSON.stringify(await load()));
  await browser.close();browser=null;cmd('shell','am','force-stop',pkg);
  const seed=path.join(art,'batch-restart-seed.json');await fs.writeFile(seed,JSON.stringify({version:1,collections:[],draft:[],settings:{interfaceLanguage:'en',outputLanguage:'en'}}));cmd('push',seed,'/data/local/tmp/atelier-batch-seed.json');cmd('shell','run-as',pkg,'cp','/data/local/tmp/atelier-batch-seed.json','files/archive-v1.json');
  await connect();await page.getByRole('heading',{name:'Start with a photo.',exact:true}).waitFor();console.log('START isolated empty native archive');
  await page.evaluate(()=>{const cap=window.Capacitor,original=cap.nativePromise;window.batchTrace={nativeCalls:0};cap.nativePromise=function(plugin,method,options){const result=original.call(this,plugin,method,options);if(plugin==='NativeDocuments'&&method==='recognize'){window.batchTrace.nativeCalls++;return result.then(value=>new Promise(resolve=>setTimeout(()=>resolve(value),45000)));}return result;};});
  const names=['english-invoice.png','czech-delivery.jpg','turkish-invoice.webp'];
  await page.locator('input[type=file]').first().setInputFiles(names.map(name=>path.join(art,'fixtures',name)));
  await page.waitForFunction(()=>window.batchTrace.nativeCalls>0,{}, {timeout:45000});
  const pending=await load();report.selectedNames=names;report.persistedBeforeInterruption=pending.draft.map(inv=>inv.sourceName);console.log('STAGED '+JSON.stringify(report.persistedBeforeInterruption));
  await page.screenshot({path:path.join(art,`batch-${report.phase}.png`)});await browser.close();browser=null;cmd('shell','am','force-stop',pkg);await connect();
  await page.waitForFunction(()=>!document.querySelector('.reading-status,.busy-overlay'),{}, {timeout:180000});
  const recovered=await load();report.persistedAfterRestart=recovered.draft.map(inv=>inv.sourceName);report.resultingNumbers=recovered.draft.map(inv=>inv.number);
  assert.deepEqual(report.errors,[]);
  if(before){assert.equal(pending.draft.length,1);assert.equal(recovered.draft.length,1);report.reproducedLoss=true;ok('The old import flow loses the two unstaged selections after an Android process stop');}
  else{assert.deepEqual(report.persistedBeforeInterruption,names);assert.deepEqual(report.persistedAfterRestart,names);assert.deepEqual(report.resultingNumbers,['EN-26001','CZ-26002','TR-26003']);for(const inv of recovered.draft)assert.ok(inv.image.length>1000);ok('All selected photos are durable before the first native reading');ok('All pending photos resume in order after process death with their original source images');}
  report.success=true;
}catch(error){report.failure=error.stack;console.error(error);if(page)await page.screenshot({path:path.join(art,'batch-restart-failure.png')}).catch(()=>{});}
finally{await browser?.close().catch(()=>{});try{cmd('forward','--remove','tcp:9239');}catch{}await fs.writeFile(path.join(art,before?'batch-before.json':'batch-restart.json'),JSON.stringify(report,null,2));process.exitCode=report.success?0:1;}})();
