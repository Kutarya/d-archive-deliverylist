const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const runtime=createRequire('C:/Users/yunus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json'),{chromium}=runtime('playwright');
const root=path.resolve(__dirname,'..'),{version}=require('../package.json');
(async()=>{
 const exe=path.join(root,`release/windows/Invoice-Atelier-${version}.exe`);
 const child=spawn(exe,['--remote-debugging-port=9224'],{env:{...process.env,FATURA_DATA_DIR:path.join(root,`artifacts/${version}/portable-smoke-`+Date.now())},stdio:'ignore',windowsHide:true});
 let ready=false;for(let n=0;n<90;n++){try{const r=await fetch('http://127.0.0.1:9224/json/version');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
 assert.ok(ready,'Portable EXE açılmadı');const browser=await chromium.connectOverCDP('http://127.0.0.1:9224');const page=browser.contexts()[0].pages()[0];await page.getByRole('heading',{name:'Start with a photo.'}).waitFor();assert.match(page.url(),/^atolye:\/\/app\//);await page.screenshot({path:path.join(root,`artifacts/${version}/portable-exe.png`)});
 await fs.writeFile(path.join(root,`artifacts/${version}/portable-acceptance.json`),JSON.stringify({success:true,executable:exe,url:page.url(),pid:child.pid,standalone:true},null,2));console.log('PASS Teslim edilecek tek dosyalı portable EXE kendi paketinden açıldı');await page.close();await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
