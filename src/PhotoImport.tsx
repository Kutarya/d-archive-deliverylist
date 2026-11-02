import {useRef,useState} from 'react';
import {registerPlugin} from '@capacitor/core';
import {AlertCircle,FolderOpen,Image as ImageIcon,Settings,X} from 'lucide-react';
import {isAndroid} from './platform';
import {cameraErrorMessage,isPhotoPermissionError} from './camera';
import {useLanguage,useTranslation} from './LanguageContext';
import {localizeError} from './i18n';
import {useBackAction} from './back-navigation';
import {mobileActivities,mobileImports} from './task-queue';

type PhotoSource='gallery'|'files';
type SelectedFile={name:string;mime:string;size:number;path:string;webPath:string};
type PhotoAccessApi={
  pickFiles(options:{source:PhotoSource;multiple:boolean;allowPdf:boolean}):Promise<{cancelled?:boolean;files:SelectedFile[]}>;
  releaseFiles(options:{paths:string[]}):Promise<void>;
  openSettings():Promise<void>;
};
export const PhotoAccess=registerPlugin<PhotoAccessApi>('PhotoAccess');
export type PhotoAccessProblem={source:'camera'|PhotoSource;permission:boolean;error:unknown};
export const accessProblem=(error:unknown,source:PhotoAccessProblem['source']):PhotoAccessProblem=>({source,permission:isPhotoPermissionError(error),error});

export function PhotoAccessDialog({problem,onClose,onRetry,onFiles}:{problem:PhotoAccessProblem;onClose:()=>void;onRetry:()=>void;onFiles?:()=>void}){
  const t=useTranslation(),language=useLanguage(),[settingsError,setSettingsError]=useState('');
  useBackAction(50,()=>{onClose();return true;});
  const title=problem.permission?(problem.source==='camera'?'Camera permission is required':'Photo access is not allowed'):(problem.source==='camera'?'Could not open the camera':'Could not open photos');
  const text=problem.permission?(problem.source==='camera'?'Camera permission was not granted. Allow Camera in the app permissions, then return and try again.':'Access to the selected photo was denied. Select the photo again to allow access, or check the app permissions in Settings.'):(cameraErrorMessage(problem.error)||'Could not open the photo picker. Please try again.');
  return <div className="modal-overlay photo-access-overlay"><section className="modal photo-access-dialog" role="alertdialog" aria-modal="true" aria-labelledby="photo-access-title" aria-describedby="photo-access-description" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}>
    <button type="button" autoFocus className="modal-close" aria-label={t('Close warning')} onClick={onClose}><X/></button><span className="modal-icon"><AlertCircle size={28}/></span>
    <h2 id="photo-access-title">{t(title)}</h2><p id="photo-access-description">{localizeError(new Error(text),language)}</p>
    {problem.permission&&<p>{t('Your documents are safe. You can continue without granting permission.')}</p>}
    {settingsError&&<p role="alert">{settingsError}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t('Cancel')}</button><button type="button" className="secondary" onClick={onRetry}>{t('Try again')}</button>{problem.permission&&isAndroid&&<button type="button" className="primary" onClick={()=>{setSettingsError('');void mobileActivities.run(()=>PhotoAccess.openSettings()).catch(error=>setSettingsError(localizeError(error,language)));}}><Settings size={17}/>{t('Open app settings')}</button>}</div>
    {onFiles&&<button type="button" className="text-button photo-access-alternative" onClick={onFiles}><FolderOpen size={17}/>{t(problem.source==='camera'?'Choose from gallery':'Choose files instead')}</button>}
  </section></div>;
}

// Both review screens use the same native selection, cancellation and error handling.
export function usePhotoImport(onFiles:(files:File[],select?:boolean)=>Promise<void>,{multiple=true,allowPdf=true}:{multiple?:boolean;allowPdf?:boolean}={}){
  const t=useTranslation(),input=useRef<HTMLInputElement>(null),inFlight=useRef(false),retry=useRef<()=>void>(()=>{});
  const [choosing,setChoosing]=useState(false),[picking,setPicking]=useState(false),[problem,setProblem]=useState<PhotoAccessProblem|null>(null);
  const [importing,setImporting]=useState(0),[selection,setSelection]=useState<{current:number;total:number;name:string}|null>(null);
  useBackAction(40,()=>{if(!choosing)return false;setChoosing(false);return true;});
  async function pick(source:PhotoSource){
    if(inFlight.current)return;
    setChoosing(false);setProblem(null);
    if(!isAndroid){retry.current=()=>input.current?.click();input.current?.click();return;}
    inFlight.current=true;setPicking(true);retry.current=()=>void pick(source);
    let files:SelectedFile[]=[],pickerReleased=false;
    try{
      const result=await mobileActivities.run(()=>PhotoAccess.pickFiles({source,multiple,allowPdf}));files=result.files??[];
      inFlight.current=false;setPicking(false);pickerReleased=true;
      if(result.cancelled)return;
      setImporting(count=>count+1);
      let lastSelection:typeof selection=null;
      try{await mobileImports.run(async()=>{
        // Decode one file at a time. Other selections can open while this batch
        // is processed; their imports stay behind this batch in the FIFO queue.
        for(let index=0;index<files.length;index++){
          const file=files[index];lastSelection={current:index+1,total:files.length,name:file.name};setSelection(lastSelection);
          try{
          const response=await fetch(file.webPath);
          if(!response.ok)throw new Error('Could not read the selected files. Please select them again.');
          await onFiles([new File([await response.blob()],file.name,{type:file.mime})],index===0);
          }catch(error){setProblem(accessProblem(error,source));}
          finally{await PhotoAccess.releaseFiles({paths:[file.path]}).catch(()=>{});}
        }
      });}finally{setImporting(count=>count-1);setSelection(current=>current===lastSelection?null:current);}
    }catch(error){setProblem(accessProblem(error,source));}
    finally{
      if(!pickerReleased){inFlight.current=false;setPicking(false);}
      if(files.length)await PhotoAccess.releaseFiles({paths:files.map(file=>file.path)}).catch(()=>{});
    }
  }
  function open(source:PhotoSource|'choose'='choose'){
    if(inFlight.current)return;
    setProblem(null);
    if(source==='choose'&&isAndroid)setChoosing(true);else void pick(source==='choose'?'files':source);
  }
  const dialogs=<>
    <input ref={input} hidden type="file" accept={allowPdf?'image/jpeg,image/png,image/webp,application/pdf,.pdf':'image/jpeg,image/png,image/webp'} multiple={multiple} onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value='';if(files.length)void onFiles(files).catch(error=>setProblem(accessProblem(error,'files')));}}/>
    {choosing&&<div className="modal-overlay photo-access-overlay"><section className="modal photo-source-dialog" role="dialog" aria-modal="true" aria-label={t('Add a photo')} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setChoosing(false);}}}><button type="button" className="modal-close" autoFocus aria-label={t('Close photo selection')} onClick={()=>setChoosing(false)}><X/></button><h2>{t('Add a photo')}</h2><p>{t('Choose photos from your gallery or browse files on your device.')}</p><button type="button" className="primary full-width" onClick={()=>void pick('gallery')}><ImageIcon size={20}/>{t('Choose from gallery')}</button><button type="button" className="secondary full-width" onClick={()=>void pick('files')}><FolderOpen size={20}/>{t('Choose files')}</button><button type="button" className="text-button" onClick={()=>setChoosing(false)}>{t('Cancel')}</button></section></div>}
    {problem&&<PhotoAccessDialog problem={problem} onClose={()=>setProblem(null)} onRetry={()=>{setProblem(null);retry.current();}} onFiles={problem.source==='gallery'?()=>void pick('files'):undefined}/>}
  </>;
  return {open,picking,dialogs,importing:importing>0,selection};
}
