const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),art=path.join(root,'artifacts/1.1.1');
const adb='C:/Users/yunus/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const cmd=(...args)=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:60000}).trim();
const report={success:false,checks:[]};
async function dump(){cmd('shell','uiautomator','dump','/sdcard/invoice-release.xml');return cmd('shell','cat','/sdcard/invoice-release.xml');}
async function waitText(text){for(let n=0;n<12;n++){const xml=await dump();if(xml.includes(text))return xml;await new Promise(r=>setTimeout(r,800));}throw new Error('Release UI did not show: '+text);}
(async()=>{try{
 const native=JSON.parse(await fs.readFile(path.join(art,'android-acceptance.json'),'utf8'));assert.ok(native.success);
 const name=native.groupName||'Android Acceptance';
 cmd('shell','am','force-stop','com.faturaatolyesi.app');
 cmd('install','-r',path.join(root,'release/android/Invoice-Atelier-1.1.1.apk'));
 cmd('shell','am','start','-W','-n','com.faturaatolyesi.app/.MainActivity');
 let xml=await waitText('Start with a photo.');assert.ok(cmd('shell','pidof','com.faturaatolyesi.app'));
 const info=cmd('shell','dumpsys','package','com.faturaatolyesi.app');assert.match(info,/versionName=1.1.1/);assert.match(info,/versionCode=4\b/);assert.ok(!/pkgFlags=\[[^\]]*DEBUGGABLE/.test(info));
 report.checks.push('Signed release APK installed as an update and opened in English with debugging disabled');
 const node=(xml.match(/<node\b[^>]*>/g)||[]).find(n=>/(?:text|content-desc)="My archive"/.test(n));assert.ok(node,'Archive navigation missing');
 const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(b);cmd('shell','input','tap',String(Math.round((+b[1]+ +b[3])/2)),String(Math.round((+b[2]+ +b[4])/2)));
 xml=await waitText(name);assert.ok(xml.includes('My Excel archive'));
 report.checks.push('Existing native archive survived installation of the signed release APK');
 cmd('shell','screencap','-p','/sdcard/invoice-release.png');cmd('pull','/sdcard/invoice-release.png',path.join(art,'android-release.png'));
 report.version='1.1.1';report.versionCode=4;report.debuggable=false;report.updatedWithoutUninstall=true;report.archiveName=name;report.success=true;
 for(const check of report.checks)console.log('PASS '+check);
 }catch(e){report.failure=e.stack;console.error(e);}
 finally{await fs.writeFile(path.join(art,'android-release-acceptance.json'),JSON.stringify(report,null,2));process.exitCode=report.success?0:1;}
})().catch(e=>{console.error(e);process.exitCode=1;});
