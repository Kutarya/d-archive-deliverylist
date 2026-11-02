const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const runtime=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json'),{chromium}=runtime('playwright');
const root=path.resolve(__dirname,'..'),adb='C:/Users/yunus/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const cmd=(...args)=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:30000}).trim();
(async()=>{
  const report=JSON.parse(await fs.readFile(path.join(root,'artifacts/1.1.1/android-acceptance.json'),'utf8'));
  cmd('shell','uiautomator','dump','/sdcard/fatura-save-picker.xml');const xml=cmd('shell','cat','/sdcard/fatura-save-picker.xml');
  const node=(xml.match(/<node\b[^>]*>/g)||[]).find(n=>/text="(?:Save|SAVE|Kaydet|KAYDET)"/.test(n)&&/clickable="true"/.test(n));assert.ok(node);
  const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);cmd('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));
  const pid=cmd('shell','pidof','com.faturaatolyesi.app');cmd('forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`);
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');const page=browser.contexts()[0].pages()[0];
  await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});
  const file=cmd('shell','find','/sdcard/Download','-name','Android Acceptance.xlsx');assert.ok(file);cmd('pull',file,path.join(root,'artifacts/1.1.1/Android-Acceptance.xlsx'));
  report.checks.push({name:'Android sistem dosya seçicisi ile gerçek XLSX kaydedildi'});console.log('PASS Android sistem dosya seçicisi ile gerçek XLSX kaydedildi');
  const saved=await page.evaluate(async()=>JSON.parse((await window.Capacitor.Plugins.NativeDocuments.loadStore()).data));assert.equal(saved.collections[0].invoices[0].number,'DL-2026-001');
  await page.reload();await page.getByRole('heading',{name:'Start with a photo.'}).waitFor();await page.locator('.mobile-nav').getByRole('button',{name:'My archive'}).click();await page.getByRole('heading',{name:'Android Acceptance',exact:true}).waitFor();report.checks.push({name:'Android uygulaması yeniden yüklenince arşiv korundu'});console.log('PASS Android yeniden açılışında arşiv korundu');
  await page.screenshot({path:path.join(root,'artifacts/1.1.1/android-archive.png'),fullPage:true});
  report.success=true;delete report.failure;await fs.writeFile(path.join(root,'artifacts/1.1.1/android-acceptance.json'),JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
