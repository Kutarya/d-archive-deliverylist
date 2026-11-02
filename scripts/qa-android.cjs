const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const runtime=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=runtime('playwright');
const root=path.resolve(__dirname,'..'),adb='C:/Users/yunus/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const cmd=(...args)=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:30000}).trim();
const report={checks:[],errors:[],ocr:{},groupName:'Android Acceptance '+Date.now()};const ok=(name,data)=>{report.checks.push({name,data});console.log('PASS '+name+(data?' '+JSON.stringify(data):''));};
let browser,page;
(async()=>{try{
  const pid=cmd('shell','pidof','com.faturaatolyesi.app');assert.ok(pid);cmd('forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`);
  browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages().find(p=>p.url().includes('localhost'))||browser.contexts()[0].pages()[0];
  page.on('pageerror',e=>report.errors.push(e.message));await page.getByRole('heading',{name:'Start with a photo.'}).waitFor({timeout:60000});await page.screenshot({path:path.join(root,'artifacts/1.1.1/android-webview-home.png')});ok('Android uygulaması gerçek WebView içinde açıldı');
  const base64=(await fs.readFile(path.join(root,'artifacts/1.1.1/filled-invoice.png'))).toString('base64');
  await page.evaluate(({base64})=>{const data=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const file=new File([data],'native-ocr-invoice.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(file);const input=document.querySelector('input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));},{base64});
  await page.getByRole('heading',{name:'Review the details.'}).waitFor({timeout:90000});await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:90000});
  report.ocr={number:await page.getByLabel('Document number *',{exact:true}).inputValue(),supplier:await page.getByLabel('Supplier / seller',{exact:true}).inputValue(),quantity:await page.getByLabel('1. quantity',{exact:true}).inputValue(),price:await page.getByLabel('1. unit price',{exact:true}).inputValue(),currency:await page.getByLabel('Currency',{exact:true}).inputValue()};
  assert.match(report.ocr.number,/2026.*001/);assert.match(report.ocr.supplier,/Prauge/);assert.equal(report.ocr.quantity,'3');assert.equal(report.ocr.price,'125,50');assert.equal(report.ocr.currency,'CZK');ok('Paket içindeki ML Kit ile gerçek native OCR',report.ocr);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'artifacts/1.1.1/android-review.png'),fullPage:true});ok('Android kontrol ekranı taşmadan açıldı');
  await page.getByRole('button',{name:'Confirm details'}).click();await page.getByLabel('File name',{exact:true}).fill(report.groupName);await page.getByRole('button',{name:'Confirm and save to archive'}).click();await page.locator('.collection-card').filter({hasText:report.groupName}).waitFor({timeout:60000});ok('Android AtomicFile üzerinden kalıcı arşiv kaydı');
  await page.getByRole('button',{name:'Open file'}).first().click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});await page.getByRole('button',{name:'PDF',exact:true}).click();await page.locator('.pdf-preview canvas').first().waitFor({timeout:60000});ok('Android içinde gerçek PDF önizlemesi render edildi');
  await page.getByRole('button',{name:'Image',exact:true}).click();await page.locator('.image-preview-grid img').first().waitFor({timeout:60000});await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});ok('Android PNG çıktısı PDF ile aynı bilgilerden oluşturuldu');
  await page.getByRole('button',{name:'Excel',exact:true}).click();await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});await page.getByRole('button',{name:'Download Excel',exact:true}).click();
  for(let n=0;n<45;n++){if(cmd('shell','dumpsys','activity','activities').includes('documentsui.picker.PickActivity'))break;await new Promise(resolve=>setTimeout(resolve,1000));}
  cmd('shell','uiautomator','dump','/sdcard/fatura-save-picker.xml');const xml=cmd('shell','cat','/sdcard/fatura-save-picker.xml');await fs.writeFile(path.join(root,'artifacts/1.1.1/android-save-picker.xml'),xml);
  const saveNode=(xml.match(/<node\b[^>]*>/g)||[]).find(n=>/text="(?:Save|SAVE|Kaydet|KAYDET)"/.test(n)&&/clickable="true"/.test(n));
  assert.ok(saveNode,'Android kayıt penceresinde Kaydet düğmesi bulunamadı');const bounds=saveNode.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);cmd('shell','input','tap',String(Math.round((+bounds[1]+ +bounds[3])/2)),String(Math.round((+bounds[2]+ +bounds[4])/2)));
  await page.locator('.busy-overlay').waitFor({state:'hidden',timeout:60000});const exported='/sdcard/Download/'+report.groupName+'.xlsx';assert.ok(Number(cmd('shell',`stat -c %s '${exported}'`))>1000);cmd('pull',exported,path.join(root,'artifacts/1.1.1/Android-Acceptance.xlsx'));ok('Android sistem dosya seçicisi ile bu çalıştırmanın XLSX dosyası indirildi');
  assert.equal(report.errors.length,0);report.success=true;
}catch(e){report.success=false;report.failure=e.stack;console.error(e);if(page)await page.screenshot({path:path.join(root,'artifacts/1.1.1/android-failure.png'),fullPage:true}).catch(()=>{});}
finally{await fs.writeFile(path.join(root,'artifacts/1.1.1/android-acceptance.json'),JSON.stringify(report,null,2));if(browser)await browser.close();process.exitCode=report.success?0:1;}})();
