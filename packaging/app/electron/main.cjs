const {app, BrowserWindow, ipcMain, dialog, protocol, net, session} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const {pathToFileURL} = require('node:url');
protocol.registerSchemesAsPrivileged([{scheme:'atolye',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true,allowServiceWorkers:true}}]);
// The English display name must continue using the existing archive location.
app.setPath('userData',process.env.FATURA_DATA_DIR?path.resolve(process.env.FATURA_DATA_DIR):path.join(app.getPath('appData'),'fatura-atolyesi'));
app.commandLine.appendSwitch('lang','en-GB');
let mainWindow,closeHandlerReady=false,closing=false,allowClose=false;
const storePath = () => path.join(app.getPath('userData'),'archive-v1.json');
const validateData = data => { const x=JSON.parse(data); if(x.version!==1 || !Array.isArray(x.collections) || !Array.isArray(x.draft)) throw new Error('Invalid archive.'); };
async function atomicWrite(file,data) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp'; const handle=await fs.open(tmp,'w');
  try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
  let previous;
  try { previous=await fs.readFile(file,'utf8'); } catch(e) {if(e.code!=='ENOENT')throw e;}
  if(previous){let valid=true;try{validateData(previous);}catch{valid=false;}if(valid)await fs.copyFile(file,file+'.bak');}
  await fs.rename(tmp,file);
}
const trusted = event => { if(!mainWindow || event.sender!==mainWindow.webContents || !event.senderFrame.url.startsWith('atolye://app/')) throw new Error('Access denied.'); };
ipcMain.handle('store:load',async event => {
  trusted(event);
  let invalid=false;
  for(const suffix of ['', '.bak']) try { const data=await fs.readFile(storePath()+suffix,'utf8'); validateData(data); return data; } catch(e) { if(e.code==='ENOENT') continue; invalid=true; }
  if(invalid)throw new Error('Could not read the archive. Existing files were preserved.');
  return '';
});
ipcMain.handle('store:save',async(event,data)=>{trusted(event);validateData(data); await atomicWrite(storePath(),data);});
ipcMain.on('store:close-handler',(event,ready)=>{try{trusted(event);closeHandlerReady=ready===true;}catch{}});
ipcMain.on('store:finish-close',(event,saved)=>{
  try{trusted(event);}catch{return;}
  if(!closing)return;
  if(saved===true){allowClose=true;mainWindow.close();}else closing=false;
});
ipcMain.handle('file:save',async(event,{name,mime,base64,language='en'})=>{
  trusted(event);
  if(typeof base64!=='string' || base64.length>250*1024*1024) throw new Error('Invalid file size.');
  const ext=path.extname(name).slice(1);
  const labels={en:['Save file','Save'],cs:['Uložit soubor','Uložit'],tr:['Dosyayı kaydet','Kaydet']}[language]||['Save file','Save'];
  const chosen=await dialog.showSaveDialog(mainWindow,{title:labels[0],buttonLabel:labels[1],defaultPath:path.join(app.getPath('downloads'),path.basename(name)),filters:[{name:ext.toUpperCase(),extensions:[ext]}]});
  if(chosen.canceled || !chosen.filePath) return {cancelled:true};
  await fs.writeFile(chosen.filePath,Buffer.from(base64,'base64')); return {path:chosen.filePath};
});
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus();}});
  app.whenReady().then(()=>{
    const dist=path.resolve(__dirname,'../dist');
    protocol.handle('atolye',request=>{
      const url=new URL(request.url); const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file=path.resolve(dist,relative);
      if(url.hostname!=='app' || (file!==dist && !file.startsWith(dist+path.sep))) return new Response('Forbidden',{status:403});
      return net.fetch(pathToFileURL(file).href);
    });
    session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===mainWindow?.webContents && permission==='media'));
    mainWindow=new BrowserWindow({width:1360,height:920,minWidth:760,minHeight:600,title:'Invoice Atelier',backgroundColor:'#f5f7f8',autoHideMenuBar:true,icon:path.join(__dirname,'../dist/favicon.svg'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    // Let the renderer drain its save queue, including the debounced last edit.
    mainWindow.on('close',event=>{if(allowClose||!closeHandlerReady||mainWindow.webContents.isDestroyed())return;event.preventDefault();if(!closing){closing=true;mainWindow.webContents.send('store:before-close');}});
    mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    mainWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('atolye://app/'))event.preventDefault();});
    mainWindow.loadURL('atolye://app/index.html');
  });
  app.on('window-all-closed',()=>app.quit());
}
