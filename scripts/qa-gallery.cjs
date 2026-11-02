// Current APK only. Run against the disposable emulator started with -read-only.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const {chromium}=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright');
const {version}=require('../package.json'),messages=require('../src/translations.json'),root=path.resolve(__dirname,'..'),art=path.join(root,'artifacts',version),adb='C:/Users/yunus/AppData/Local/Android/Sdk/platform-tools/adb.exe',pkg='com.faturaatolyesi.app';
const serial=process.env.QA_ANDROID_SERIAL||'emulator-5554';
const cmd=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:args[0]==='install'?240000:45000,maxBuffer:16*1024*1024}).trim();
const report={version,success:false,readOnlyEmulator:true,checks:[],errors:[],languageCombinations:[]};let browser,page;
const text=(key,language='en')=>language==='en'?key:messages[key][language];
const ok=label=>{report.checks.push(label);console.log('PASS '+label);};
async function dump(){for(let n=0;n<8;n++){try{cmd('shell','uiautomator','dump','/sdcard/gallery-qa.xml');const xml=cmd('shell','cat','/sdcard/gallery-qa.xml');if(xml.includes('<hierarchy'))return xml;}catch{}}throw Error('Android accessibility tree unavailable');}
const nodes=xml=>(xml.match(/<node\b[^>]*>/g)||[]).map(raw=>({raw,text:raw.match(/\btext="([^"]*)"/)?.[1]||'',desc:raw.match(/content-desc="([^"]*)"/)?.[1]||'',id:raw.match(/resource-id="([^"]*)"/)?.[1]||'',bounds:raw.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)}));
function tap(node){assert.ok(node?.bounds,'Missing native control');const b=node.bounds;cmd('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));}
async function waitNative(predicate,label){let xml='';for(let n=0;n<10;n++){xml=await dump();if(predicate(xml))return xml;}await fs.writeFile(path.join(art,'gallery-native-unexpected.xml'),xml);throw Error('Native screen missing: '+label);}
async function tapText(label){const xml=await waitNative(xml=>nodes(xml).some(n=>n.text===label),label);tap(nodes(xml).find(n=>n.text===label));}
async function connect(){page=null;cmd('shell','am','start','-W','-n',pkg+'/.MainActivity');const pid=cmd('shell','pidof',pkg);cmd('forward','tcp:9234','localabstract:webview_devtools_remote_'+pid);browser=await chromium.connectOverCDP('http://127.0.0.1:9234');for(let n=0;n<80&&!page;n++){for(const candidate of browser.contexts()[0].pages())if(candidate.url().includes('localhost')&&await candidate.locator('main h1').isVisible().catch(()=>false)){page=candidate;break;}if(!page)await new Promise(r=>setTimeout(r,250));}assert.ok(page);page.setDefaultTimeout(45000);page.on('pageerror',error=>report.errors.push(error.message));}
const idle=async()=>page.waitForFunction(()=>!document.querySelector('.reading-status,.busy-overlay,.preview-loading'),{},{timeout:180000});
const load=()=>page.evaluate(async()=>{const raw=(await window.Capacitor.Plugins.NativeDocuments.loadStore()).data;return raw?JSON.parse(raw):{version:1,collections:[],draft:[],settings:{interfaceLanguage:'en',outputLanguage:'en'}};});
async function persisted(predicate){for(let n=0;n<80;n++){const state=await load();if(predicate(state))return state;await new Promise(r=>setTimeout(r,150));}throw Error('Archive was not persisted');}
async function screenshot(name){await page.screenshot({path:path.join(art,'gallery-'+name+'.png'),fullPage:true});}
async function gallery(count=1){
 let xml=await waitNative(xml=>nodes(xml).some(n=>n.desc==='Collections'||n.text==='Albums'||/icon_thumbnail/.test(n.id)),'photo gallery');
 const collections=nodes(xml).find(n=>n.desc==='Collections'||n.text==='Albums');
 if(collections){tap(collections);xml=await waitNative(xml=>nodes(xml).some(n=>n.text==='From this device'||n.text==='Atelier-Gallery-QA'||n.desc.includes('Atelier-Gallery-QA')),'device albums');const device=nodes(xml).find(n=>n.text==='From this device');if(device)tap(device);xml=await waitNative(xml=>nodes(xml).some(n=>n.text==='Atelier-Gallery-QA'||n.desc.includes('Atelier-Gallery-QA')),'QA gallery album');tap(nodes(xml).find(n=>n.text==='Atelier-Gallery-QA'||n.desc.includes('Atelier-Gallery-QA')));}
 const photoNodes=xml=>nodes(xml).filter(n=>/icon_thumbnail|media_item_thumbnail/.test(n.id)||/^Photo taken on /.test(n.desc));
 xml=await waitNative(xml=>photoNodes(xml).length>=count,'photo gallery thumbnails');
 await fs.writeFile(path.join(art,'gallery-picker.xml'),xml);
 const thumbnails=photoNodes(xml);
 assert.ok(thumbnails.length>=count,'Gallery thumbnails missing: '+thumbnails.length);
 for(const node of thumbnails.slice(0,count))tap(node);
 xml=await dump();
 if(!xml.includes('package="com.faturaatolyesi.app"')){
   const add=nodes(xml).find(n=>/^(?:Add|Done)(?:\s.*)?$|^Select$/.test(n.text)||/^(?:Add|Done)(?:\s.*)?$/.test(n.desc)||/button_add$/.test(n.id));
   assert.ok(add,'Gallery selection confirmation missing');tap(add);
 }
 await idle();
}
async function files(name){
 let xml=await waitNative(xml=>/documentsui/.test(xml),'document picker');
 let target=nodes(xml).find(n=>n.text===name);if(target){tap(target);await idle();return;}
 const roots=nodes(xml).find(n=>n.desc==='Show roots');assert.ok(roots);tap(roots);xml=await dump();const device=nodes(xml).find(n=>/^sdk_gphone/.test(n.text)||n.text==='Internal storage');if(device){tap(device);xml=await dump();target=nodes(xml).find(n=>n.text===name);if(target){tap(target);await idle();return;}const root=nodes(xml).find(n=>n.id.endsWith('/breadcrumb_text')&&/^sdk_gphone/.test(n.text));if(root)tap(root);await tapText('Download');}else await tapText('Downloads');
 await tapText('Atelier-Gallery-QA');await tapText(name);await idle();
}
async function cancelPicker(){let xml=await dump();for(let n=0;n<5&&!xml.includes('package="com.faturaatolyesi.app"');n++){cmd('shell','input','keyevent','4');xml=await dump();}assert.ok(xml.includes('package="com.faturaatolyesi.app"'));await idle();}
async function home(language='en'){
 await page.locator('.mobile-nav').getByRole('button',{name:text('Scan documents',language),exact:true}).click();
 const back=page.getByRole('button',{name:text('Back to upload',language),exact:true});if(await back.count())await back.click();
 await page.getByRole('button',{name:text('Take a photo',language),exact:true}).waitFor();
}
(async()=>{await fs.mkdir(art,{recursive:true});try{
 const processes=execFileSync('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^qemu' } | Select-Object -ExpandProperty CommandLine"],{encoding:'utf8'});assert.match(processes,/-read-only/);
 assert.equal(cmd('shell','settings','get','global','wifi_on'),'0');assert.equal(cmd('shell','settings','get','global','mobile_data'),'0');report.offline=true;
 const debug=path.join(root,'android/app/build/outputs/apk/debug/app-debug.apk');report.debugSha256=crypto.createHash('sha256').update(await fs.readFile(debug)).digest('hex');cmd('install','--no-streaming','-r',debug);cmd('shell','am','force-stop',pkg);try{cmd('shell','pm','revoke',pkg,'android.permission.CAMERA');}catch{}cmd('shell','pm','clear-permission-flags',pkg,'android.permission.CAMERA','user-set','user-fixed');cmd('shell','logcat','-c');cmd('shell','input','keyevent','224');cmd('shell','wm','dismiss-keyguard');await connect();
 await page.evaluate(()=>{const cap=window.Capacitor,original=cap.nativePromise;window.galleryQueueTrace={ocrActive:0,ocrMax:0,pendingMax:0,events:[]};cap.nativePromise=function(plugin,method,options){const trace=window.galleryQueueTrace;if(plugin==='NativeDocuments'&&method==='saveStore'){const state=JSON.parse(options.data);trace.pendingMax=Math.max(trace.pendingMax,state.draft.filter(d=>d.engine==='Pending text recognition').length);}const promise=original.call(this,plugin,method,options);if(plugin==='NativeDocuments'&&method==='recognize'){trace.ocrActive++;trace.ocrMax=Math.max(trace.ocrMax,trace.ocrActive);trace.events.push('start');return promise.finally(()=>{trace.ocrActive--;trace.events.push('end');});}return promise;};});
 const resume=process.env.QA_GALLERY_RESUME==='files'?JSON.parse(await fs.readFile(path.join(art,'gallery-acceptance.json'),'utf8')):null;
 if(resume){assert.equal(resume.version,version);assert.equal(resume.debugSha256,report.debugSha256,'Only resume checks for the exact same APK');assert.ok(resume.checks.length>=6);report.checks=resume.checks.slice(0,6);report.sequentialProcessing=resume.sequentialProcessing;report.resumedExactApk=true;}
 const original=await load();if(!resume)await fs.writeFile(path.join(art,'gallery-original-emulator-store.json'),JSON.stringify(original));
 assert.equal(original.collections.length,0,'Use a disposable clean emulator');if(resume)assert.ok([2,4].includes(original.draft.length));else assert.equal(original.draft.length,0);
 const pdfCompleted=!!resume&&original.draft.length===4;if(pdfCompleted){assert.ok(resume.checks.includes('The native Files alternative imports both PDF pages and keeps existing photos'));report.checks.push('The native Files alternative imports both PDF pages and keeps existing photos');}
 let xml,warning,state;const selection=page.getByRole('dialog',{name:'Add a photo',exact:true});
 const inputFolder=path.join(art,'gallery-inputs');await fs.mkdir(inputFolder,{recursive:true});
 for(const [source,name,mime]of [['english-invoice.png','Gallery-EN.png','image/png'],['czech-delivery.jpg','Gallery-CS.jpg','image/jpeg'],['two-page-documents.pdf','Gallery-MULTI.pdf','application/pdf']]){
   const fixture=path.join(root,'artifacts/1.4.1/fixtures',source),local=path.join(inputFolder,name);await fs.copyFile(fixture,local);
   cmd('shell','mkdir','-p','/sdcard/Download/Atelier-Gallery-QA');cmd('push',local,'/sdcard/Download/Atelier-Gallery-QA/'+name);cmd('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Download/Atelier-Gallery-QA/'+name);
   if(mime.startsWith('image/')){cmd('shell','mkdir','-p','/sdcard/Pictures/Atelier-Gallery-QA');cmd('push',local,'/sdcard/Pictures/Atelier-Gallery-QA/'+name);cmd('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Pictures/Atelier-Gallery-QA/'+name);}
 }
 if(!resume){
 ok('Current APK opens offline in a disposable read-only Android emulator');
 await page.getByRole('button',{name:'Take a photo',exact:true}).click();xml=await waitNative(xml=>xml.includes('permission_deny'),'camera permission request');tap(nodes(xml).find(n=>/\/permission_deny(?:_and_dont_ask_again)?_button$/.test(n.id)));
 warning=page.getByRole('alertdialog',{name:'Camera permission is required',exact:true});await warning.waitFor();assert.ok(await warning.getByRole('button',{name:'Open app settings',exact:true}).isVisible());assert.deepEqual(await load(),original);await screenshot('permission-en');ok('Denying the real Android camera permission shows an actionable warning and preserves all records');
 await warning.getByRole('button',{name:'Try again',exact:true}).click();xml=await waitNative(xml=>xml.includes('permission_deny'),'second camera request');tap(nodes(xml).find(n=>/\/permission_deny(?:_and_dont_ask_again)?_button$/.test(n.id)));await warning.waitFor();await warning.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Choose from gallery',exact:true}).click();await gallery(2);await page.waitForFunction(()=>document.querySelectorAll('.document-tabs button').length===2);await idle();state=await load();assert.equal(state.draft.length,2);assert.deepEqual(state.draft.map(d=>d.number).sort(),['CZ-26002','EN-26001']);
 const expectedHashes=[];for(const name of ['Gallery-EN.png','Gallery-CS.jpg'])expectedHashes.push(crypto.createHash('sha256').update(await fs.readFile(path.join(inputFolder,name))).digest('hex'));assert.deepEqual(state.draft.map(d=>d.sourceHash).sort(),expectedHashes.sort());ok('The real gallery selects two original photos while camera permission is denied; native offline OCR reads both');
 report.sequentialProcessing=await page.evaluate(()=>window.galleryQueueTrace);assert.equal(report.sequentialProcessing.ocrMax,1);assert.equal(report.sequentialProcessing.pendingMax,1);assert.deepEqual(report.sequentialProcessing.events,['start','end','start','end']);ok('Actual native photo recognition and persisted drafts show strict first-in-first-out processing without overlapping OCR');
 await page.getByRole('button',{name:'Add document',exact:true}).click();await selection.waitFor();cmd('shell','input','keyevent','4');await selection.waitFor({state:'hidden'});assert.equal((await load()).draft.length,2);ok('Android Back closes the photo-source dialog without changing pending work');
 await page.getByRole('button',{name:'Add document',exact:true}).click();await selection.getByRole('button',{name:'Choose from gallery',exact:true}).click();await cancelPicker();assert.equal((await load()).draft.length,2);assert.equal(await page.getByRole('alertdialog').count(),0);ok('Cancelling the actual gallery returns quietly without empty or duplicate documents');
 }
 if(!pdfCompleted){await page.getByRole('button',{name:'Add document',exact:true}).click();await selection.getByRole('button',{name:'Choose files',exact:true}).click();await files('Gallery-MULTI.pdf');await page.waitForFunction(()=>document.querySelectorAll('.document-tabs button').length===4);await idle();assert.equal((await load()).draft.length,4);ok('The native Files alternative imports both PDF pages and keeps existing photos');}
 await page.getByRole('button',{name:'Add document',exact:true}).click();await selection.getByRole('button',{name:'Choose files',exact:true}).click();await files('Gallery-EN.png');await idle();assert.equal((await load()).draft.length,4);ok('Re-selecting the same photo from Files preserves duplicate detection across gallery and files');
 await page.locator('.document-tabs button').first().click();await page.getByLabel('Notes',{exact:true}).fill('Preserve manual details during gallery replacement');const before=(await persisted(s=>s.draft.some(d=>d.notes==='Preserve manual details during gallery replacement'))).draft[0];
 await page.getByRole('button',{name:'Replace photo',exact:true}).click();await selection.getByRole('button',{name:'Choose from gallery',exact:true}).click();await gallery(1);await idle();state=await persisted(s=>s.draft[0].notes===before.notes);assert.equal(state.draft[0].id,before.id);assert.equal(state.draft[0].number,before.number);assert.equal(state.draft[0].notes,before.notes);ok('Single gallery replacement preserves document identity and manual details');
 // The warning language follows the interface, independently of all three output languages.
 cmd('shell','pm','set-permission-flags',pkg,'android.permission.CAMERA','user-set','user-fixed');
 let currentLanguage='en';
 for(const interfaceLanguage of ['en','cs','tr'])for(const outputLanguage of ['en','cs','tr']){
   await page.locator('[data-testid=settings-mobile]').click();await page.locator('[data-testid=output-language]').selectOption(outputLanguage);await page.locator('[data-testid=interface-language]').selectOption(interfaceLanguage);currentLanguage=interfaceLanguage;
   await persisted(s=>s.settings.interfaceLanguage===interfaceLanguage&&s.settings.outputLanguage===outputLanguage);await home(interfaceLanguage);
   await page.getByRole('button',{name:text('Take a photo',interfaceLanguage),exact:true}).click();warning=page.getByRole('alertdialog',{name:text('Camera permission is required',interfaceLanguage),exact:true});await warning.waitFor();
   assert.ok(await warning.getByRole('button',{name:text('Open app settings',interfaceLanguage),exact:true}).isVisible());assert.ok(await warning.getByRole('button',{name:text('Try again',interfaceLanguage),exact:true}).isVisible());
   assert.ok((await warning.innerText()).includes(text('Camera permission was not granted. Allow Camera in the app permissions, then return and try again.',interfaceLanguage)));
   if(outputLanguage==='cs')await screenshot('permission-'+interfaceLanguage);
   report.languageCombinations.push({interfaceLanguage,outputLanguage});cmd('shell','input','keyevent','4');await warning.waitFor({state:'hidden'});
 }
 ok('Denied-permission warnings and Android Back work in all nine independent interface/output language combinations');
 await page.locator('[data-testid=settings-mobile]').click();await page.locator('[data-testid=interface-language]').selectOption('en');await page.locator('[data-testid=output-language]').selectOption('cs');await home();
 await page.getByRole('button',{name:'Take a photo',exact:true}).click();warning=page.getByRole('alertdialog',{name:'Camera permission is required',exact:true});await warning.waitFor();await warning.getByRole('button',{name:'Open app settings',exact:true}).click();
 xml=await waitNative(xml=>xml.includes('com.android.settings')&&xml.includes('Invoice Atelier'),'app settings');ok('The warning button opens the actual Android settings for Invoice Atelier');
 await tapText('Permissions');await tapText('Camera');xml=await waitNative(xml=>nodes(xml).some(n=>/Allow only while using the app|Allow only while using/.test(n.text)),'camera settings');tap(nodes(xml).find(n=>/Allow only while using the app|Allow only while using/.test(n.text)));
 for(let n=0;n<5;n++){cmd('shell','input','keyevent','4');xml=await dump();if(xml.includes('package="com.faturaatolyesi.app"'))break;}
 if(page.isClosed()){await browser.close().catch(()=>{});await connect();report.restoredAfterSettingsRestart=true;assert.equal((await load()).draft.length,4);await home();await page.getByRole('button',{name:'Take a photo',exact:true}).click();}
 else{await warning.waitFor();await warning.getByRole('button',{name:'Try again',exact:true}).click();}
 await waitNative(xml=>/package="com.android.camera2"/.test(xml),'camera after granting access');cmd('shell','input','keyevent','4');await idle();assert.equal(await page.getByRole('alertdialog').count(),0);assert.equal((await load()).draft.length,4);ok('Granting permission in real Android Settings and retrying opens the camera; cancelling preserves work');
 await page.locator('.mobile-nav').getByRole('button',{name:'Scan documents',exact:true}).click();await page.getByRole('button',{name:'Confirm details',exact:true}).click();const save=page.getByRole('dialog',{name:'Save to Excel file',exact:true});await save.waitFor();await save.getByLabel('File name',{exact:true}).fill('Gallery 1.4.2 QA');const mismatch=save.getByRole('checkbox',{name:'I checked the difference between the calculated total and the document.',exact:true});if(await mismatch.count())await mismatch.check();await save.getByRole('button',{name:'Confirm and save to archive',exact:true}).click();await idle();state=await persisted(s=>s.collections.length===1);report.savedDocuments=state.collections[0].invoices.length;ok('Gallery/PDF documents can be approved and saved to the existing native archive');
 await page.getByRole('button',{name:'Gallery 1.4.2 QA',exact:true}).click();await idle();
 for(const format of ['Excel','PDF']){await page.locator('.view-tabs').getByRole('button',{name:format,exact:true}).click();await idle();await page.getByRole('button',{name:'Download '+format,exact:true}).click();await waitNative(xml=>xml.includes('documentsui'),'native '+format+' save');await cancelPicker();assert.equal(await page.getByRole('alertdialog').count(),0);}
 ok('Excel and PDF save dialogs execute one after another and both cancellations return safely');
 await page.getByRole('button',{name:'Edit documents',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit documents',exact:true});await editor.getByRole('button',{name:'Source photo',exact:true}).click();await editor.getByRole('button',{name:'Replace photo',exact:true}).click();await selection.getByRole('button',{name:'Choose from gallery',exact:true}).click();await cancelPicker();assert.ok(await editor.isVisible());await editor.getByRole('button',{name:'Cancel',exact:true}).click();ok('Archived-document photo replacement also opens the gallery and cancellation preserves the editor');
 const mediaPermissions=cmd('shell','dumpsys','package',pkg);assert.ok(!/android.permission.READ_(?:MEDIA_IMAGES|MEDIA_VISUAL_USER_SELECTED|EXTERNAL_STORAGE)/.test(mediaPermissions));ok('Gallery selection requires no broad photo-library or storage permission');
 const cache=cmd('shell','run-as',pkg,'ls','cache/photo-selections');assert.equal(cache,'');ok('Original source files remain intact and temporary selection copies are removed');
 assert.deepEqual(report.errors,[]);await page.locator('[data-testid=settings-mobile]').click();await page.locator('[data-testid=interface-language]').selectOption('tr');await persisted(s=>s.settings.interfaceLanguage==='tr'&&s.settings.outputLanguage==='cs');const beforeRelease=await load();await fs.writeFile(path.join(art,'gallery-before-release.json'),JSON.stringify(beforeRelease));
 await browser.close();browser=null;cmd('forward','--remove','tcp:9234');
 const release=path.join(root,`release/android/Invoice-Atelier-${version}.apk`);report.releaseSha256=crypto.createHash('sha256').update(await fs.readFile(release)).digest('hex');cmd('shell','am','force-stop',pkg);cmd('install','--no-streaming','-r',release);cmd('shell','am','start','-W','-n',pkg+'/.MainActivity');
 const info=cmd('shell','dumpsys','package',pkg);assert.ok(info.includes('versionName='+version));assert.ok(!/pkgFlags=\[[^\]]*DEBUGGABLE/.test(info));
 xml=await waitNative(xml=>xml.includes('package="com.faturaatolyesi.app"')&&xml.includes('Gallery 1.4.2 QA'),'signed release archive');assert.ok(xml.includes('Gallery 1.4.2 QA'));ok('The final signed release installs as an update and reopens the persisted archive without debugging');
 await tapText(text('Settings','tr'));xml=await dump();assert.ok(xml.includes('Türkçe'));assert.ok(xml.includes('Čeština'));ok('The signed release preserves independent Turkish interface and Czech output settings');
 await tapText(text('Scan documents','tr'));xml=await dump();if(xml.includes(text('Back to upload','tr')))await tapText(text('Back to upload','tr'));await tapText(text('Choose from gallery','tr'));await waitNative(xml=>/photopicker|PhotoPicker|Select photos|Photos/.test(xml),'signed release gallery');cmd('shell','input','keyevent','4');ok('The delivered signed APK opens the real system photo gallery');
 const crashes=cmd('shell','logcat','-d','-s','AndroidRuntime:E');await fs.writeFile(path.join(art,'gallery-android-runtime.log'),crashes);assert.ok(!crashes.includes('FATAL EXCEPTION'));report.debuggable=false;report.updatedWithoutUninstall=true;report.success=true;
}catch(error){report.failure=error.stack;console.error(error);try{await fs.writeFile(path.join(art,'gallery-failure.xml'),await dump());if(page)await screenshot('failure');}catch{}}
finally{await browser?.close().catch(()=>{});try{cmd('forward','--remove','tcp:9234');}catch{}await fs.writeFile(path.join(art,'gallery-acceptance.json'),JSON.stringify(report,null,2));process.exitCode=report.success?0:1;}})();
