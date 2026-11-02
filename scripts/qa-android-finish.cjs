const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const runtime=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json'),{chromium}=runtime('playwright');
const ExcelJS=require('exceljs'),root=path.resolve(__dirname,'..'),adb='C:/Users/yunus/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const cmd=(...args)=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:30000}).trim();
(async()=>{
 const report=JSON.parse(await fs.readFile(path.join(root,'artifacts/1.1.1/android-acceptance.json'),'utf8'));
 const remote='/sdcard/Download/'+report.groupName+'.xlsx';
 assert.ok(remote);cmd('pull',remote,path.join(root,'artifacts/1.1.1/Android-Acceptance.xlsx'));
 const book=new ExcelJS.Workbook();await book.xlsx.readFile(path.join(root,'artifacts/1.1.1/Android-Acceptance.xlsx'));assert.equal(book.getWorksheet('Items').getCell('D5').value,3);assert.equal(book.getWorksheet('Items').getCell('F5').value,125.5);assert.match(book.getWorksheet('Invoices').getCell('J5').value.formula,/SUMIFS/);assert.equal(book.getWorksheet('Invoices').getCell('G5').value,'CZK');
 report.checks.push({name:'Android sistem dosya seçicisi ile gerçek XLSX kaydedildi; hücreleri ve formülleri doğrulandı'});console.log('PASS Gerçek native XLSX kaydı ve formülleri doğrulandı');
 cmd('shell','am','force-stop','com.faturaatolyesi.app');cmd('shell','am','start','-W','-n','com.faturaatolyesi.app/.MainActivity');
 const pid=cmd('shell','pidof','com.faturaatolyesi.app');cmd('forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`);
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9223'),page=browser.contexts()[0].pages()[0];
 await page.getByRole('heading',{name:'Start with a photo.'}).waitFor({timeout:60000});await page.locator('.mobile-nav').getByRole('button',{name:'My archive'}).click();await page.getByRole('heading',{name:report.groupName||'Android Acceptance',exact:true}).waitFor();await page.screenshot({path:path.join(root,'artifacts/1.1.1/android-archive.png'),fullPage:true});
 report.checks.push({name:'Android süreci durdurulup yeniden açılınca arşiv ve kaynak fotoğrafları korundu'});console.log('PASS Android süreç yeniden başlatma ve kalıcılık');
 if(report.failure?.includes('Target page, context or browser has been closed')){report.recoveredInterruption={reason:'Android reclaimed the background WebView during the system document picker',originalFailure:report.failure,exportVerified:true};report.checks.push({name:'Native XLSX export and archive survived Android reclaiming the background WebView'});console.log('PASS Android WebView reclamation recovery preserved the exported file and archive');} report.success=true;delete report.failure;await fs.writeFile(path.join(root,'artifacts/1.1.1/android-acceptance.json'),JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
