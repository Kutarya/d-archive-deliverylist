const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  loadStore:()=>ipcRenderer.invoke('store:load'),
  saveStore:data=>ipcRenderer.invoke('store:save',data),
  onBeforeClose:callback=>{
    const listener=async()=>{try{await callback();ipcRenderer.send('store:finish-close',true);}catch{ipcRenderer.send('store:finish-close',false);}};
    ipcRenderer.on('store:before-close',listener);ipcRenderer.send('store:close-handler',true);
    return()=>{ipcRenderer.removeListener('store:before-close',listener);ipcRenderer.send('store:close-handler',false);};
  },
  saveFile:options=>ipcRenderer.invoke('file:save',options)
});
