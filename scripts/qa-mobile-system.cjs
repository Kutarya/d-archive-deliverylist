// One sequential entry point for the disposable-emulator acceptance suite.
// --resume reuses only successful reports for these exact installed APK bytes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),{version}=require('../package.json'),art=path.join(root,'artifacts',version),adb='C:/Users/yunus/AppData/Local/Android/Sdk/platform-tools/adb.exe',serial='emulator-5556',pkg='com.faturaatolyesi.app';
const cmd=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024}).trim();
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const apkSha256=hash(path.join(art,'tested-debug.apk')),report={version,apkSha256,success:false,stages:[]},lock=path.join(art,'mobile-system.lock');let ownsLock=false;
const read=name=>JSON.parse(fs.readFileSync(path.join(art,name),'utf8'));
const offline=()=>cmd('shell','settings','get','global','wifi_on')==='0'&&cmd('shell','settings','get','global','mobile_data')==='0';
const stages=[
  {name:'storage',script:'qa-storage-recovery.cjs',file:'storage-recovery.json'},
  {name:'restart',script:'qa-batch-restart.cjs',file:'batch-restart.json'},
  {name:'ocr',script:'qa-system-ocr.cjs',file:'system-ocr.json'},
  {name:'settings',script:'qa-mobile-document-settings.cjs',file:'mobile-document-settings.json'},
  {name:'export',script:'qa-native-export-recovery.cjs',file:'native-export-recovery.json'},
  {name:'native',file:'native-instrumentation.json'},
];
try{
  const processes=execFileSync('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^qemu' } | Select-Object -ExpandProperty CommandLine"],{encoding:'utf8'});assert.ok(processes.split(/\r?\n/).some(line=>line.includes('-read-only')&&line.includes('-port 5556')),'Use the dedicated read-only emulator');
  const installed=cmd('shell','pm','path',pkg).split(/\r?\n/).find(line=>line.endsWith('/base.apk'))?.replace(/^package:/,'');assert.ok(installed);assert.equal(cmd('shell','sha256sum',installed).split(/\s/)[0],apkSha256,'Installed APK bytes differ from tested-debug.apk');assert.equal(hash(path.join(root,'android/app/build/outputs/apk/debug/app-debug.apk')),apkSha256);
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,version,apkSha256}),{flag:'wx'});ownsLock=true;
  cmd('shell','svc','wifi','disable');cmd('shell','svc','data','disable');
  for(let retry=0;retry<30&&!offline();retry++)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);
  report.offline=offline();assert.equal(report.offline,true,'The test emulator must be offline');
  for(const stage of stages){let cached;try{cached=read(stage.file);}catch{}
    assert.equal(offline(),true,'Network changed before '+stage.name);
    if(process.argv.includes('--resume')&&cached?.success&&cached.offline===true&&cached.version===version&&cached.apkSha256===apkSha256){report.stages.push({name:stage.name,success:true,reusedExactApk:true});console.log('VERIFIED existing '+stage.name);continue;}
    console.log('RUN '+stage.name);
    if(stage.script)execFileSync(process.execPath,[path.join(root,'scripts',stage.script)],{cwd:root,stdio:'inherit',timeout:900000});
    else{
      cmd('install','--no-streaming','-r',path.join(root,'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'));
      const log=cmd('shell','am','instrument','-w','-e','class','com.faturaatolyesi.app.PhotoAccessTest,com.faturaatolyesi.app.RendererRecoveryTest',pkg+'.test/androidx.test.runner.AndroidJUnitRunner');fs.writeFileSync(path.join(art,'native-instrumentation.log'),log);assert.match(log,/OK \(8 tests\)/);fs.writeFileSync(path.join(art,stage.file),JSON.stringify({version,apkSha256,success:true,tests:8},null,2));
    }
    const result=read(stage.file);assert.equal(result.success,true,stage.name);assert.equal(result.version,version);assert.equal(result.apkSha256,apkSha256);assert.equal(offline(),true,'Network changed during '+stage.name);result.offline=true;fs.writeFileSync(path.join(art,stage.file),JSON.stringify(result,null,2));report.stages.push({name:stage.name,success:true,reusedExactApk:false});
  }
  report.success=true;
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(art,'mobile-system.json'),JSON.stringify(report,null,2));if(ownsLock)fs.unlinkSync(lock);}
