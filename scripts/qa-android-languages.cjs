const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const {chromium}=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json')('playwright');
const {version}=require('../package.json'),messages=require('../src/translations.json'),root=path.resolve(__dirname,'..'),art=path.join(root,'artifacts',version),adb='C:/Users/yunus/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const cmd=(...args)=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:30000}).trim();
const text=(key,language)=>language==='en'?key:messages[key][language];
const report={success:false,checks:[],errors:[]};let browser,page;
async function connect(){const pid=cmd('shell','pidof','com.faturaatolyesi.app');cmd('forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`);browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages()[0];page.on('pageerror',e=>report.errors.push(e.message));await page.waitForSelector('.mobile-nav');}
async function choose(ui,output){await page.locator('[data-testid=settings-mobile]').click();await page.locator('[data-testid=interface-language]').selectOption(ui);await page.locator('[data-testid=output-language]').selectOption(output);let saved;for(let n=0;n<60;n++){saved=await page.evaluate(async()=>JSON.parse((await window.Capacitor.Plugins.NativeDocuments.loadStore()).data).settings);if(saved?.interfaceLanguage===ui&&saved?.outputLanguage===output)break;await new Promise(r=>setTimeout(r,100));}assert.deepEqual(saved,{interfaceLanguage:ui,outputLanguage:output});}
(async()=>{try{
 const native=JSON.parse(await fs.readFile(path.join(art,'android-acceptance.json'),'utf8'));assert.ok(native.success);await connect();
 for(const [ui,output] of [['en','en'],['cs','cs'],['tr','tr'],['cs','tr']]){
   await choose(ui,output);assert.equal(await page.locator('html').getAttribute('lang'),ui);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(art,`android-settings-${ui}-${output}.png`),fullPage:true});
   await page.locator('.mobile-nav').getByRole('button',{name:text('My archive',ui),exact:true}).click();await page.getByRole('button',{name:native.groupName,exact:true}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});
   assert.deepEqual(await page.locator('.sheet-tabs button').allTextContents(),['Summary','Invoices','Items'].map(key=>text(key,output)).concat(text('Document {number}',output).replace('{number}','1')));
   await page.getByRole('button',{name:'PDF',exact:true}).click();await page.locator('.pdf-preview canvas').first().waitFor({timeout:60000});
   report.checks.push(`${ui} interface, ${output} Excel/PDF output and saved native language preferences`);console.log('PASS '+report.checks.at(-1));
 }
 await browser.close();browser=null;cmd('shell','am','force-stop','com.faturaatolyesi.app');cmd('shell','am','start','-W','-n','com.faturaatolyesi.app/.MainActivity');await connect();await page.locator('html[lang=cs]').waitFor();await page.locator('[data-testid=settings-mobile]').click();assert.equal(await page.locator('[data-testid=output-language]').inputValue(),'tr');
 report.checks.push('Czech interface and Turkish output settings survive native process restart');console.log('PASS '+report.checks.at(-1));
 await choose('en','en');assert.equal(report.errors.length,0);report.success=true;
 }catch(e){report.failure=e.stack;console.error(e);if(page)await page.screenshot({path:path.join(art,'android-language-failure.png'),fullPage:true}).catch(()=>{});}
 finally{if(browser)await browser.close();await fs.writeFile(path.join(art,'android-language-acceptance.json'),JSON.stringify(report,null,2));process.exitCode=report.success?0:1;}
})().catch(e=>{console.error(e);process.exitCode=1;});
