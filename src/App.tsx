import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, Files, FileSpreadsheet, ScanLine, ArrowRight, ArrowLeft, Check, CheckCircle2, Plus, X, Download, Search, Image as ImageIcon, FileText, RotateCw, Trash2, ChevronRight, FolderOpen, ShieldCheck, LoaderCircle, DatabaseBackup, MoreHorizontal, AlertCircle, Laptop, Sparkles, ZoomIn, Minus, Settings as SettingsIcon } from 'lucide-react';
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { emptyStore, emptyInvoice, money, issues, currencyTotals, saveApproved, mergeBackup, importCollection, columnLabel, settingsFor, replaceSource, totalMismatch, updateArchivedInvoices, type Store, type Invoice } from './model';
import { isAndroid, loadStore, persist, processPhoto, rotateImage, saveBlob } from './platform';
import { recognize } from './ocr';
import { sourcePages } from './source-files';
import { buildExcel, buildPdf, invoicePng, readExcel, type ExcelPreview } from './exports';
import { PdfPreview } from './PdfPreview';
import { createTranslator, dateText, documentCount as countDocuments, languages, languageNames, locales, localizeError, type Language, type LanguageSettings } from './i18n';
import { LanguageContext, useLanguage, useTranslation } from './LanguageContext';
import { version } from '../package.json';
import {InvoiceEditor} from './InvoiceEditor';
import {PhotoPanel} from './PhotoPanel';
import {ArchiveEditor} from './ArchiveEditor';
import {backNavigation,useBackAction} from './back-navigation';
import {isCameraCancellation} from './camera';
import {accessProblem,PhotoAccessDialog,usePhotoImport,type PhotoAccessProblem} from './PhotoImport';
import {mobileActivities} from './task-queue';
import {commitStoreMutation} from './store-transaction';
import {BusinessDefaultsSettings} from './BusinessDefaultsSettings';
import {applyBusinessDefaults, businessDefaultsFor} from './business-defaults';
import {rememberNativeReturn,clearNativeReturn,consumeNativeReturn} from './native-return';

function Field({label,value,onChange,type='text',placeholder='',wide=false}: {label:string;value:string;onChange:(value:string)=>void;type?:string;placeholder?:string;wide?:boolean}) {
  const language=useLanguage();
  return <label className={`field ${wide?'wide':''}`}><span>{label}</span><input lang={language} aria-label={label} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;
}
function MoneySet({invoices}: {invoices:Invoice[]}) {
  const language=useLanguage();
  return <>{Object.entries(currencyTotals(invoices)).map(([cur,n])=><span key={cur}>{money(n,cur,language)}</span>)}</>;
}
function DocArt() {
  const t=useTranslation();
  return <div className="doc-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-sheet"><div className="art-top"><span/><i/></div><b>{t("INVOICE")}</b><div className="art-lines"><i/><i/><i/></div><div className="art-table">{Array.from({length:12},(_,i)=><i key={i}/>)}</div><div className="art-total"/></div><div className="art-scan scan-top"/><div className="art-scan scan-bottom"/><div className="art-badge"><FileSpreadsheet size={22}/><span>.xlsx</span><Check size={16}/></div><div className="art-spark"><Sparkles size={22}/></div></div>;
}
function ExcelGrid({sheets}: {sheets:ExcelPreview}) {
  const t=useTranslation();
  const [tab,setTab]=useState(0);const sheet=sheets[Math.min(tab,sheets.length-1)];
  if(!sheet)return <div className="empty-inline">{t("No sheets to preview.")}</div>;
  return <div className="excel-preview"><div className="excel-heading"><FileSpreadsheet size={17}/>{t("Excel preview")}<small>{t("Workbook sheets")}</small></div><div className="excel-scroll"><table><thead><tr><th/>{sheet.columns.map(col=><th key={col}>{columnLabel(col-1)}</th>)}</tr></thead><tbody>{sheet.rows.map((r,i)=><tr key={i} className={i<2?'excel-title':i===3?'excel-labels':''}><th>{i+1}</th>{r.map((c,j)=>{
    const column=sheet.columns[j],merge=sheet.merges?.find(m=>i+1>=m.row&&i+1<m.row+m.rowSpan&&column>=m.column&&column<m.column+m.colSpan);
    const first=merge?sheet.columns.find(n=>n>=merge.column&&n<merge.column+merge.colSpan):column;
    if(merge&&(i+1!==merge.row||column!==first))return null;
    const colSpan=merge?sheet.columns.filter(n=>n>=merge.column&&n<merge.column+merge.colSpan).length:1;
    return <td key={j} rowSpan={merge?.rowSpan} colSpan={colSpan} className={/^[\s\d,.+−%-]+$/.test(c)?'excel-number':''}>{c}</td>;
  })}</tr>)}</tbody></table></div><div className="sheet-tabs">{sheets.map((s,i)=><button key={s.name} onClick={()=>setTab(i)} className={i===Math.min(tab,sheets.length-1)?'active':''}>{s.name}</button>)}</div><small className="preview-note">{t("Preview shows the first 250 rows per sheet. Download the Excel file for all records.")}</small></div>;
}
export default function App() {
  const [store,setStore]=useState<Store>(emptyStore),[loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState('');
  const [page,setPage]=useState<'scan'|'review'|'archive'|'group'|'backup'|'settings'>('scan');
  const [active,setActive]=useState(0),[groupId,setGroupId]=useState(''),[query,setQuery]=useState('');
  const [busy,setBusy]=useState(''),[progress,setProgress]=useState(0),[notice,setNotice]=useState(''),[error,setError]=useState(''),[saveStatus,setSaveStatus]=useState<''|'Saving'|'Saved on this device'|'Save failed'>('');
  const [saveOpen,setSaveOpen]=useState(false),[target,setTarget]=useState('new'),[newName,setNewName]=useState(''),[separate,setSeparate]=useState(false),[ack,setAck]=useState(false);
  const [view,setView]=useState<'excel'|'pdf'|'image'>('excel'),[preview,setPreview]=useState<ExcelPreview>([]),[pdf,setPdf]=useState<Blob|null>(null),[docIndex,setDocIndex]=useState(0),[png,setPng]=useState('');
  const [previewBusy,setPreviewBusy]=useState(false);
  const [archiveEdit,setArchiveEdit]=useState<{index:number;compact:boolean}|null>(null),[renaming,setRenaming]=useState(false),[renameName,setRenameName]=useState('');
  const [showValidation,setShowValidation]=useState(false),[saveScope,setSaveScope]=useState<'all'|'ready'|'current'>('all'),[saveCurrentId,setSaveCurrentId]=useState('');
  const replaceId=useRef(''),cameraOpening=useRef(false);
  const [cameraPicking,setCameraPicking]=useState(false);
  const [cameraProblem,setCameraProblem]=useState<PhotoAccessProblem|null>(null);
  const [cameraOpen,setCameraOpen]=useState(false),[deleteId,setDeleteId]=useState(''),[pendingDeleteId,setPendingDeleteId]=useState('');
  const [rereadId,setRereadId]=useState('');
  const [readingIds,setReadingIds]=useState<string[]>([]),[readingId,setReadingId]=useState(''),[adding,setAdding]=useState(false);
  const [enhancing,setEnhancing]=useState(false);
  const readingQueue=useRef<{id:string;image:string}[]>([]),reading=useRef(false),readingController=useRef<AbortController|null>(null),importTail=useRef<Promise<void>>(Promise.resolve());
  const readingTask=useRef<Promise<void>|null>(null);
  const importRef=useRef<HTMLInputElement>(null),backupRef=useRef<HTMLInputElement>(null),videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null),cameraRequest=useRef(0);
  const ref=useRef(store);ref.current=store;const group=store.collections.find(c=>c.id===groupId),doc=store.draft[Math.min(active,store.draft.length-1)];
  const updateStore=(update:(current:Store)=>Store)=>{const next=update(ref.current);ref.current=next;setStore(next);return next;};
  const commitStore=(change:(current:Store)=>Store)=>{setError('');return commitStoreMutation(()=>ref.current,value=>{ref.current=value;setStore(value);},persist,change);};
  const settings=settingsFor(store),language=settings.interfaceLanguage,outputLanguage=settings.outputLanguage,locale=locales[language];
  const t=createTranslator(language),outputText=createTranslator(outputLanguage);
  const documentCount=(count:number)=>countDocuments(count,language);
  const changeDraft=(invoice:Invoice)=>updateStore(s=>({...s,draft:s.draft.map(current=>current.id===invoice.id?invoice:current)}));
  const photoImport=usePhotoImport(takeFiles);
  const photoReplacement=usePhotoImport(async files=>replacePhoto(files[0],replaceId.current),{multiple:false,allowPdf:false});
  useEffect(()=>{const onBack=(event:Event)=>{if(backNavigation.dispatch())event.preventDefault();};window.addEventListener('atelier:back',onBack);return()=>window.removeEventListener('atelier:back',onBack);},[]);
  useBackAction(0,()=>{
    if(busy)return true;
    if(saveOpen){setSaveOpen(false);return true;}
    if(renaming){setRenaming(false);return true;}
    if(cameraOpen){closeCamera();return true;}
    if(deleteId){setDeleteId('');return true;}
    if(pendingDeleteId){setPendingDeleteId('');return true;}
    if(rereadId){setRereadId('');return true;}
    if(page==='group'){goto('archive');return true;}
    if(page==='archive'||page==='backup'||page==='settings'){goto(ref.current.draft.length?'review':'scan');return true;}
    if(page==='review'){goto('scan');return true;}
    return false;
  });
  function addManual(){const invoice=applyBusinessDefaults(emptyInvoice(),businessDefaultsFor(ref.current),'manual');const next=updateStore(s=>({...s,draft:[...s.draft,invoice]}));setActive(next.draft.length-1);setShowValidation(false);setError('');setPage('review');}
  async function replacePhoto(file:File,id:string){await run(t('Replace photo'),async()=>{
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name))throw new Error(t('Choose a JPG, PNG or WebP photo.'));
    for await(const photo of sourcePages(file)){
      const next=updateStore(s=>({...s,draft:s.draft.map(invoice=>invoice.id===id?replaceSource(invoice,{image:photo.image,sourceName:photo.name,sourceHash:photo.hash}):invoice)}));await persist(next);setNotice(t('Photo replaced. Your details and previous photo were kept.'));break;
    }
  });}
  const changeSettings=(key:keyof LanguageSettings,value:Language)=>{
    setError('');setNotice('');const next={...ref.current,settings:{...settingsFor(ref.current),[key]:value}};
    ref.current=next;setStore(next);setSaveStatus('Saving');
    void persist(next).then(()=>setSaveStatus('Saved on this device')).catch(error=>{setError(localizeError(error,language));setSaveStatus('Save failed');});
  };
  useEffect(()=>{document.documentElement.lang=language;},[language]);
  const totalDocs=store.collections.reduce((s,c)=>s+c.invoices.length,0);
  useEffect(()=>{let cancelled=false;loadStore().then(s=>{
    if(cancelled)return;ref.current=s;setStore(s);setLoaded(true);
    const resume=isAndroid?consumeNativeReturn():null,resumeGroup=resume?s.collections.find(group=>group.id===resume.groupId):undefined;
    if(resume&&resumeGroup){setGroupId(resume.groupId);setView(resume.view);setDocIndex(Math.min(resume.docIndex,Math.max(0,resumeGroup.invoices.length-1)));setPage('group');}
    else if(s.draft.length){setPage('review');setNotice(createTranslator(settingsFor(s).interfaceLanguage)("Your unfinished documents were saved. Continue from the review screen."));}
    for(const d of s.draft)if(d.engine==='Pending text recognition'&&d.image)readingQueue.current.push({id:d.id,image:d.image});
    setReadingIds(readingQueue.current.map(d=>d.id));if(readingQueue.current.length)void processReadingQueue();
  }).catch(e=>{if(!cancelled)setLoadError(String(e.message));});return()=>{cancelled=true;};},[]);
  useEffect(()=>{if(!loaded)return;setSaveStatus('Saving');let cancelled=false;const timer=setTimeout(()=>persist(ref.current).then(()=>{if(!cancelled)setSaveStatus('Saved on this device');}).catch(e=>{if(!cancelled){setError(t('Save error: {message}',{message:localizeError(e,language)}));setSaveStatus('Save failed');}}),350);return()=>{cancelled=true;clearTimeout(timer);};},[store,loaded]);
  useEffect(()=>window.desktop?.onBeforeClose(async()=>{
    if(!loaded)return;
    setBusy(t('Saving'));
    try{let snapshot;do{snapshot=ref.current;await persist(snapshot);}while(snapshot!==ref.current);}
    catch(e){setBusy('');setSaveStatus('Save failed');setError(t('Save error: {message}',{message:localizeError(e,language)}));throw e;}
  }),[loaded,language]);
  useEffect(()=>{if(!loaded)return;const onHidden=()=>{if(document.visibilityState==='hidden')void persist(ref.current).catch(e=>{setSaveStatus('Save failed');setError(t('Save error: {message}',{message:localizeError(e,language)}));});};document.addEventListener('visibilitychange',onHidden);return()=>document.removeEventListener('visibilitychange',onHidden);},[loaded,language]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>()=>{streamRef.current?.getTracks().forEach(t=>t.stop());readingController.current?.abort();},[]);
  async function run(label:string,action:()=>Promise<void>) {setError('');setBusy(label);try{await action();}catch(e){console.error(e);setError(localizeError(e,language));}finally{setBusy('');}}
  async function rereadPhoto(id:string) {
    setRereadId('');
    if(isAndroid)await importTail.current.catch(()=>{});
    const source=ref.current.draft.find(d=>d.id===id);
    if(!source?.image||readingIds.includes(id))return;
    await commitStore(s=>({...s,draft:s.draft.map(d=>d.id===id?{...d,engine:'Pending text recognition'}:d)}));
    readingQueue.current.push({id,image:source.image});setReadingIds(ids=>[...ids,id]);
    void processReadingQueue();
  }
  async function takeFiles(files:File[],select=true) {
    if(!files.length)return;
    if(files.length>20){setError(t("Select up to 20 photos at a time."));return;}
    setError('');setAdding(true);
    const task=importTail.current.catch(()=>{}).then(async()=>{
      // Stage a whole Android selection durably before reading it. Otherwise
      // process death during photo one loses the remaining selected files.
      let first=true;
      for(const file of files)try{
        for await(const source of sourcePages(file)){
          if([...ref.current.draft,...ref.current.collections.flatMap(c=>c.invoices)].some(d=>d.sourceHash===source.hash)){setNotice(t('{name} is already saved and was not added again.',{name:file.name}));continue;}
          const inv={...applyBusinessDefaults(emptyInvoice(),businessDefaultsFor(ref.current),'manual'),sourceHash:source.hash,image:source.image,sourceName:source.name,engine:'Pending text recognition'};
          const next=updateStore(s=>({...s,draft:[...s.draft,inv]}));
          readingQueue.current.push({id:inv.id,image:inv.image});setReadingIds(ids=>[...ids,inv.id]);
          if(first&&select){setActive(next.draft.length-1);setPage('review');first=false;}
          await persist(next);if(!isAndroid)void processReadingQueue();
        }
      }catch(e){console.error(e);setError(t('Could not add {name}: {message}',{name:file.name,message:localizeError(e,language)}));}
    });
    importTail.current=task;
    try{await task;void processReadingQueue();}finally{if(importTail.current===task)setAdding(false);}
  }
  async function processReadingQueue(){
    if(reading.current)return readingTask.current??Promise.resolve();reading.current=true;
    const task=drainReadingQueue();readingTask.current=task;return task;
  }
  async function drainReadingQueue(){
    await Promise.resolve();
    try{while(readingQueue.current.length){
      // An incoming selection may prepare its next photo between heavy reader
      // jobs. Never wait for reading from the import task itself.
      if(isAndroid)await importTail.current.catch(()=>{});
      const next=readingQueue.current.shift()!;
      if(!ref.current.draft.some(d=>d.id===next.id)){setReadingIds(ids=>ids.filter(id=>id!==next.id));continue;}
      const controller=new AbortController();readingController.current=controller;setReadingId(next.id);setProgress(0);setEnhancing(false);
      const timeout=setTimeout(()=>controller.abort(),90000);
      try{
        const source=ref.current.draft.find(d=>d.id===next.id)!;
        let workingImage=next.image;for(let turn=0;turn<(source.imageRotation??0);turn++)workingImage=await rotateImage(workingImage);
        const fresh=await recognize(workingImage,setProgress,controller.signal,()=>setEnhancing(true),async partial=>{
          const snapshot=updateStore(s=>({...s,draft:s.draft.map(d=>d.id===next.id&&d.image===next.image?{...applyBusinessDefaults(partial,businessDefaultsFor(s),'scan'),id:d.id,image:d.image,imageRotation:d.imageRotation,sourceHistory:d.sourceHistory,sourceName:d.sourceName,sourceHash:d.sourceHash,createdAt:d.createdAt,engine:'Pending text recognition'}:d)}));
          await persist(snapshot);
        });
        const updated=updateStore(s=>({...s,draft:s.draft.map(d=>d.id===next.id&&d.image===next.image?{...applyBusinessDefaults(fresh,businessDefaultsFor(s),'scan'),id:d.id,image:d.image,imageRotation:d.imageRotation,sourceHistory:d.sourceHistory,sourceName:d.sourceName,sourceHash:d.sourceHash,createdAt:d.createdAt}:d)}));
        await persist(updated);
      }catch(e){
        console.error(e);
        const updated=updateStore(s=>({...s,draft:s.draft.map(d=>d.id===next.id?{...d,engine:'Manual review required'}:d)}));await persist(updated).catch(()=>{});
        setNotice(t('Reading stopped. Your photo is saved; complete the details or read it again.'));
      }finally{clearTimeout(timeout);readingController.current=null;setReadingIds(ids=>ids.filter(id=>id!==next.id));}
    }}finally{reading.current=false;readingTask.current=null;setReadingId('');setProgress(0);}
  }
  async function openCamera() {
    if(cameraOpening.current)return;
    setCameraProblem(null);
    if(isAndroid){cameraOpening.current=true;setCameraPicking(true);try{
      const photo=await mobileActivities.run(async()=>{
        let permission=await NativeCamera.checkPermissions();
        if(permission.camera!=='granted')permission=await NativeCamera.requestPermissions({permissions:['camera']});
        if(permission.camera!=='granted')throw new Error('User denied access to camera');
        return NativeCamera.getPhoto({quality:95,width:2600,height:2600,resultType:CameraResultType.Uri,source:CameraSource.Camera,correctOrientation:true,saveToGallery:false});
      });
      cameraOpening.current=false;setCameraPicking(false);
      if(!photo.webPath)throw new Error('Could not read the photo.');
      const response=await fetch(photo.webPath);if(!response.ok)throw new Error('Could not read the photo.');const blob=await response.blob();
      await takeFiles([new File([blob],`${t('Camera')}-${Date.now()}.jpg`,{type:blob.type})]);
    }catch(error){if(!isCameraCancellation(error))setCameraProblem(accessProblem(error,'camera'));}
    finally{cameraOpening.current=false;setCameraPicking(false);}return;}
    setError('');setCameraOpen(true);const request=++cameraRequest.current;
    try {const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:2560}},audio:false});if(request!==cameraRequest.current){stream.getTracks().forEach(t=>t.stop());return;}streamRef.current=stream;requestAnimationFrame(()=>{if(videoRef.current){videoRef.current.srcObject=stream;void videoRef.current.play().catch(()=>{});}});}
    catch(error) {if(request===cameraRequest.current){setCameraOpen(false);setCameraProblem(accessProblem(error,'camera'));}}
  }
  function closeCamera(){cameraRequest.current++;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setCameraOpen(false);}
  async function capture(){const video=videoRef.current;if(!video?.videoWidth)return;const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d')!.drawImage(video,0,0);closeCamera();const blob=await new Promise<Blob>(resolve=>c.toBlob(b=>resolve(b!),'image/jpeg',0.95));await takeFiles([new File([blob],`${t('Camera')}-${Date.now()}.jpg`,{type:'image/jpeg'})]);}
  async function openGroup(id:string,selected:'excel'|'pdf'|'image'='excel'){setGroupId(id);setView(selected);setPage('group');setDocIndex(0);setPreview([]);setPdf(null);setPng('');}
  useEffect(()=>{
    if(page!=='group'||!group)return;let cancelled=false;
    setPreviewBusy(true);setError('');setPng('');
    void (async()=>{
      if(view==='excel'){
        if(group.invoices.length){const blob=await processPhoto(()=>buildExcel(group,outputLanguage));const {preview}=await processPhoto(()=>readExcel(new File([blob],'preview.xlsx'),outputLanguage));if(!cancelled)setPreview(preview);}
        else if(group.importedFile){const blob=await(await fetch(group.importedFile)).blob();const {preview}=await processPhoto(()=>readExcel(new File([blob],group.importedName || 'import.xlsx'),outputLanguage));if(!cancelled)setPreview(preview);}
      }else if(view==='pdf'&&group.invoices.length){const blob=await processPhoto(()=>buildPdf(group,outputLanguage));if(!cancelled)setPdf(blob);}
      else if(view==='image'&&group.invoices[docIndex]){const blob=await processPhoto(()=>invoicePng(group.invoices[docIndex],outputLanguage));if(!cancelled)setPng(URL.createObjectURL(blob));}
    })().catch(e=>{if(!cancelled)setError(localizeError(e,language));}).finally(()=>{if(!cancelled)setPreviewBusy(false);});return()=>{cancelled=true;};
  },[page,groupId,view,docIndex,group?.updatedAt,outputLanguage]);
  useEffect(()=>()=>{if(png)URL.revokeObjectURL(png);},[png]);
  const readyDocuments=store.draft.filter(invoice=>!readingIds.includes(invoice.id)&&!issues(invoice,language).length);
  const selectedDocuments=saveScope==='current'?store.draft.filter(invoice=>invoice.id===saveCurrentId):saveScope==='ready'?readyDocuments:store.draft;
  const currentIssues=store.draft.flatMap((d,i)=>issues(d,language).map(message=>store.draft.length>1?t('Document {number}: {message}',{number:i+1,message}):message));
  const mismatch=selectedDocuments.some(totalMismatch);
  function openSave(scope:'all'|'ready'|'current'='all'){
    setShowValidation(true);setError('');const chosen=scope==='all'&&(currentIssues.length||readingIds.length)?'ready':scope;
    const docs=chosen==='current'?(doc?[doc]:[]):chosen==='ready'?readyDocuments:store.draft;
    if(!docs.length||docs.some(invoice=>issues(invoice,language).length||readingIds.includes(invoice.id))){setError(t('Correct the highlighted fields.'));requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('main [aria-invalid=true]')?.focus());return;}
    setSaveScope(chosen);setSaveCurrentId(doc?.id??'');setNewName(outputText('Documents - {date}',{date:dateText(new Date(),outputLanguage)}));setAck(false);setSeparate(false);setSaveOpen(true);
  }
  async function confirmSave(){await run(t("Saving documents to archive"),async()=>{
    if(selectedDocuments.some(invoice=>readingIds.includes(invoice.id)))throw new Error(t('Reading'));
    if(mismatch&&!ack)throw new Error(t("Confirm that you have checked the difference between the document total and the calculated total."));
    await commitStore(current=>saveApproved(current,selectedDocuments,target==='new'?null:target,newName,separate,outputLanguage));setSaveOpen(false);setActive(0);setTarget('new');setSeparate(false);setNotice(t("Documents saved. Open them as Excel, PDF or images."));setPage('archive');
  });}
  async function exportGroup(kind:'xlsx'|'pdf'|'png'){
    if(!group)return;await run(t("Preparing file"),async()=>{
      let blob:Blob,name:string;
      if(kind==='xlsx'){blob=group.invoices.length?await processPhoto(()=>buildExcel(group,outputLanguage)):await(await fetch(group.importedFile!)).blob();name=group.name+'.xlsx';}
      else if(kind==='pdf'){if(!group.invoices.length)throw new Error(t("This workbook has no recognized invoices. You can download the original Excel file."));blob=await processPhoto(()=>buildPdf(group,outputLanguage));name=group.name+'.pdf';}
      else {blob=await processPhoto(()=>invoicePng(group.invoices[docIndex],outputLanguage));name=group.invoices[docIndex].number+'.png';}
      if(isAndroid)rememberNativeReturn({groupId:group.id,view,docIndex});
      try {if(await saveBlob(blob,name,language))setNotice(t("File saved."));}
      finally {if(isAndroid)clearNativeReturn();}
    });
  }
  async function importExcel(file:File){await run(t("Opening Excel"),async()=>{
    const result=await processPhoto(()=>readExcel(file,outputLanguage));
    await commitStore(current=>importCollection(current,result.group));
    setGroupId(result.group.id);setDocIndex(0);setPng('');setPdf(null);setView('excel');setPreview(result.preview);setPage('group');setNotice(result.group.invoices.length?t("Excel file added to the archive."):t("The original Excel file was archived. Files from other apps open as previews."));
  });}
  async function restore(file:File){await run(t("Importing backup"),async()=>{
    const incoming=JSON.parse(await file.text());
    let count=0;await commitStore(current=>{const merged=mergeBackup(current,incoming);count=merged.addedCollections;return merged.store;});
    setNotice(t('Backup merged. {count} files added; existing records preserved.',{count}));setPage('archive');
  });}
  const goto=(p:typeof page)=>{setPage(p);setError('');};
  return <LanguageContext.Provider value={language}><div className="app-shell">
    <aside className="sidebar"><a className="brand" onClick={()=>goto('scan')}><span className="brand-icon"><ScanLine size={25}/></span><span>invoice<span className="brand-light">atelier</span><small>{t("DOCUMENTS TO DATA")}</small></span></a><div className="workspace-label">{t("WORKSPACE")}</div>
      <nav><button className={page==='scan'||page==='review'?'selected':''} onClick={()=>goto(store.draft.length?'review':'scan')}><ScanLine size={20} />{t("Scan documents")}{store.draft.length>0&&<em>{store.draft.length}</em>}</button><button className={page==='archive'||page==='group'?'selected':''} onClick={()=>goto('archive')}><Files size={20}/>{t("My Excel archive")}<span className="nav-count">{store.collections.length}</span></button><button className={page==='backup'?'selected':''} onClick={()=>goto('backup')}><DatabaseBackup size={20}/>{t("Backup and transfer")}</button><button data-testid="settings-nav" className={page==='settings'?'selected':''} onClick={()=>goto('settings')}><SettingsIcon size={20}/>{t('Settings')}</button></nav>
      <div className="sidebar-bottom"><div className="local-card"><ShieldCheck size={22}/><b>{t("Your documents, with you.")}</b><p>{t("Photos and records stay on this device.")}</p><span><i/>{t("Works offline")}</span></div><div className="app-version"><span className="user-icon">IA</span><div>Invoice Atelier<small>{t("Version {version}",{version})}</small></div><Laptop size={17}/></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div><span className="mobile-brand"><ScanLine size={21}/> invoice atelier</span><span className="breadcrumb">{t("Workspace")}<ChevronRight size={14}/> {page==='archive'?t("My Excel archive"):page==='group'?group?.name:page==='backup'?t("Backup and transfer"):page==='settings'?t('Settings'):t("Scan documents")}</span></div><div className="topbar-right"><span className="save-indicator"><i/>{t(saveStatus || 'Local workspace')}</span><span className="avatar">IA</span></div></header>
      <main>
        {notice&&<div className="toast" role="status"><CheckCircle2 size={18}/>{notice}<button aria-label={t("Dismiss notification")} onClick={()=>setNotice('')}><X size={17}/></button></div>}
        {(error||loadError)&&<div className="error-box" role="alert"><AlertCircle size={19}/><span>{loadError?localizeError(loadError,language):error}</span>{!loadError&&<button aria-label={t("Dismiss error")} onClick={()=>setError('')}><X size={17}/></button>}</div>}
        {(readingIds.length>0||adding||photoImport.importing)&&<div className="reading-status" role="status">
          <LoaderCircle className="spin" size={19}/><div><b>{t('Reading documents in the background')}</b>
          {photoImport.selection&&<small>{t('File {current} of {total}',{current:photoImport.selection.current,total:photoImport.selection.total})} · {photoImport.selection.name}</small>}
          {readingId&&<small>{t(enhancing?'Improving photo recognition':'Reading text')} · {store.draft.find(invoice=>invoice.id===readingId)?.sourceName}</small>}
          <small>{t('You can add another photo or switch documents while reading.')} {t('{count} remaining',{count:readingIds.length})}</small>
          {readingId&&<progress max={1} value={progress}/>}</div>
          {readingId&&<button className="secondary" onClick={()=>readingController.current?.abort()}>{t('Stop current reading')}</button>}
        </div>}
        {!loaded&&!loadError&&<div className="empty-state"><LoaderCircle className="spin"/>{t("Opening archive…")}</div>}
        {loaded&&page==='scan'&&<>
          <div className="page-heading"><div><div className="eyebrow">{t("LESS PAPERWORK, MORE TIME")}</div><h1>{t("Start with a photo.")}</h1><p>{t("Upload an invoice or delivery note. Review it and turn it into Excel.")}</p></div><span className="badge"><span/>{t("Safe on your device")}</span></div>
          <div className="steps"><div className="step current"><span>1</span><div>{t("Add a document")}<small>{t("Take or upload a photo")}</small></div></div><ChevronRight/><div className="step"><span>2</span><div>{t("Review the details")}<small>{t("Read, edit and confirm")}</small></div></div><ChevronRight/><div className="step"><span>3</span><div>{t("Save to Excel")}<small>{t("New or existing file")}</small></div></div></div>
          <section className={`capture-card${isAndroid?' android-capture':''}`} onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add('dragging');}} onDragLeave={e=>e.currentTarget.classList.remove('dragging')} onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');if(!busy)void takeFiles(Array.from(e.dataTransfer.files));}}>
            <div className="capture-content"><div className="mini-label"><ScanLine size={15}/>{t("NEW DOCUMENT")}</div><h2>{t("From paper,")}<br/>{t("to organized Excel.")}</h2><p>{t("Extract details from invoices and delivery notes.")}{" "}<br className="desktop-only"/>{t("Save one document or combine several invoices.")}</p><div className="capture-buttons"><button className="primary" onClick={()=>void openCamera()} disabled={!!busy||photoImport.picking||cameraPicking}><Camera size={19}/>{t("Take a photo")}</button>{isAndroid&&<button className="secondary" onClick={()=>photoImport.open('gallery')} disabled={!!busy||photoImport.picking||cameraPicking}><ImageIcon size={19}/>{t('Choose from gallery')}</button>}<button className="secondary" onClick={()=>photoImport.open('files')} disabled={!!busy||photoImport.picking||cameraPicking}><Upload size={19}/>{t(isAndroid?'Choose files':'Upload photos')}</button></div><button type="button" className="text-button manual-entry" onClick={addManual}><Plus size={15}/>{t("Enter manually")}</button><small className="upload-hint">{t("JPG, PNG, WebP, PDF · Select multiple files")}</small></div><DocArt/>
          </section>
          {store.draft.length>0&&<button className="resume-card" onClick={()=>goto('review')}><div><FileText/><span><b>{t('{documents} awaiting review',{documents:documentCount(store.draft.length)})}</b><small>{t("Pick up where you left off.")}</small></span></div><ArrowRight size={20}/></button>}
          <div className="feature-row"><div><span><ScanLine/></span><b>{t("From photos to data")}</b><p>{t("Extract document numbers, dates, companies and items.")}</p></div><div><span><FileSpreadsheet/></span><b>{t("Excel with formulas")}</b><p>{t("Calculations update with quantities, prices and tax.")}</p></div><div><span><FolderOpen/></span><b>{t("One place for every file")}</b><p>{t("Reopen your files as Excel, PDF or images.")}</p></div></div>
          <section className="recent"><div className="section-heading"><h3>{t("Recent files")}</h3><button className="text-button" onClick={()=>goto('archive')}>{t("Open archive")}<ArrowRight size={16}/></button></div>{!store.collections.length?<div className="empty-inline"><div className="empty-icon"><Files size={25}/></div><div><b>{t("Your first file will appear here")}</b><p>{t("Add a photo and save your reviewed documents to the archive.")}</p></div></div>:store.collections.slice(0,3).map(c=><button key={c.id} className="recent-row" onClick={()=>void openGroup(c.id)}><span className="file-icon"><FileSpreadsheet/></span><span><b>{c.name}</b><small>{documentCount(c.invoices.length)} · {dateText(c.updatedAt,language)}</small></span><span className="recent-money"><MoneySet invoices={c.invoices}/></span><ChevronRight size={18}/></button>)}</section>
        </>}
        {loaded&&page==='review'&&<>
          <div className="page-heading"><div><div className="eyebrow">{t("STEP 2 · REVIEW")}</div><h1>{t("Review the details.")}</h1><p>{t("Compare with the photo and fill in any missing details. Confirm to save to the archive.")}</p></div><div className="review-add-actions"><button className="text-button" onClick={addManual}>{t("Enter manually")}</button><button className="secondary" onClick={()=>photoImport.open()} disabled={!!busy||photoImport.picking||cameraPicking}><Plus size={18}/>{t("Add document")}</button></div></div>
          {!doc?<div className="empty-state"><ScanLine size={40}/><h2>{t("No documents awaiting review")}</h2><button className="primary" onClick={()=>goto('scan')}>{t("Add a photo")}</button></div>:<>
            <div className="document-tabs">{store.draft.map((d,i)=><button className={doc.id===d.id?'active':''} onClick={()=>setActive(i)} key={d.id}>{d.image?<img className="document-thumb" src={d.image} loading="lazy" alt=""/>:<FileText size={16}/>}<span className="document-tab-label">{d.number||d.sourceName||t('Document {number}',{number:i+1})}</span><small>{readingIds.includes(d.id)?t("Reading"):issues(d,language).length?t("Review"):totalMismatch(d)?t("Check total"):t("Ready")}</small></button>)}</div>
            <div className="review-layout"><PhotoPanel invoice={doc} onChange={changeDraft} disabled={readingIds.includes(doc.id)||!!busy||photoReplacement.picking} onReplace={()=>{replaceId.current=doc.id;photoReplacement.open();}} onReread={()=>setRereadId(doc.id)} onRemove={()=>setPendingDeleteId(doc.id)}/><InvoiceEditor invoice={doc} onChange={changeDraft} disabled={readingIds.includes(doc.id)} showValidation={showValidation}/></div>
            <div className="review-actions"><button className="secondary" onClick={()=>goto('scan')}><ArrowLeft size={17}/>{t('Back to upload')}</button><span>{t('{ready} ready, {pending} need review',{ready:readyDocuments.length,pending:store.draft.length-readyDocuments.length})}</span>{store.draft.length>1&&<button className="secondary save-current" disabled={!!busy||!doc||readingIds.includes(doc.id)} onClick={()=>openSave('current')}>{t('Save this document')}</button>}<button className="primary" disabled={!!busy||!store.draft.length} onClick={()=>openSave()}><Check size={19}/>{t('Confirm details')}<ArrowRight size={17}/></button></div>
          </>}
        </>}
        {loaded&&page==='archive'&&<>
          <div className="page-heading"><div><div className="eyebrow">{t("EVERYTHING IN ITS PLACE")}</div><h1>{t("My Excel archive")}</h1><p>{t("Open approved documents, combine them in a file and export.")}</p></div><button className="primary" onClick={()=>goto('scan')}><Plus size={18}/>{t("New document")}</button></div>
          <div className="stat-row"><div><span className="stat-icon"><FolderOpen/></span><span><b>{store.collections.length}</b><small>{t("Excel file")}</small></span></div><div><span className="stat-icon"><FileText/></span><span><b>{totalDocs}</b><small>{t("Approved documents")}</small></span></div><div><span className="stat-icon"><ShieldCheck/></span><span><b>{t("On this device")}</b><small>{t("Saved with source photos")}</small></span></div></div>
          <div className="archive-toolbar"><label className="search"><Search size={19}/><input aria-label={t("Search archive")} placeholder={t("Search files, document numbers or companies…")} value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="secondary" onClick={()=>importRef.current?.click()}><Upload size={17}/>{t("Import Excel")}</button></div>
          <div className="archive-grid">{store.collections.filter(c=>(c.name+' '+c.invoices.map(d=>d.number+' '+d.supplier+' '+d.customer).join(' ')).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))).map(c=><article className="collection-card" key={c.id}><div className="collection-top"><span className="file-icon"><FileSpreadsheet size={27}/></span><button className="icon-button" aria-label={t('Remove file {name}',{name:c.name})} onClick={()=>setDeleteId(c.id)}><Trash2 size={17}/></button></div><button className="collection-title" onClick={()=>void openGroup(c.id)}><h3>{c.name}</h3></button><p>{c.invoices.length?t('{documents} · {rows} item rows',{documents:documentCount(c.invoices.length),rows:c.invoices.reduce((s,i)=>s+i.items.length,0)}):t("Imported Excel")}</p><div className="collection-amount"><MoneySet invoices={c.invoices}/></div><div className="collection-bottom"><small>{dateText(c.updatedAt,language)}</small><button className="text-button" onClick={()=>void openGroup(c.id)}>{t("Open file")}<ArrowRight size={16}/></button></div></article>)}</div>
          {store.collections.length>0&&!store.collections.some(c=>(c.name+' '+c.invoices.map(d=>d.number+' '+d.supplier+' '+d.customer).join(' ')).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)))&&<div className="no-search-results"><p>{t('No files match your search.')}</p><button className="text-button" onClick={()=>setQuery('')}>{t('Clear search')}</button></div>}
          {!store.collections.length&&<div className="empty-state"><Files size={44}/><h2>{t("Your archive is ready for its first document")}</h2><p>{t("Upload a photo and confirm the details to see your file here.")}</p><button className="primary" onClick={()=>goto('scan')}>{t("Add document")}</button></div>}
        </>}
        {loaded&&page==='group'&&group&&<>
          <button className="text-button back-link" onClick={()=>goto('archive')}><ArrowLeft size={16}/>{t("Back to archive")}</button><div className="page-heading"><div><div className="eyebrow">{t("EXCEL FILE")}</div><h1>{group.name}</h1><p>{documentCount(group.invoices.length)} · <MoneySet invoices={group.invoices}/></p></div><button className="primary" onClick={()=>{setTarget(group.id);goto('scan');}}><Plus size={18}/>{t("Add documents to this file")}</button></div>
          <div className="group-actions">{group.invoices.length>0&&<button className="secondary" onClick={()=>setArchiveEdit({index:docIndex,compact:false})}><FileText size={17}/>{t("Edit documents")}</button>}<button className="text-button" onClick={()=>{setRenameName(group.name);setRenaming(true);}}>{t("Rename file")}</button></div><div className="document-toolbar"><div className="view-tabs"><button className={view==='excel'?'active':''} onClick={()=>setView('excel')}><FileSpreadsheet size={17}/>Excel</button><button className={view==='pdf'?'active':''} onClick={()=>setView('pdf')} disabled={!group.invoices.length}><FileText size={17}/>PDF</button><button className={view==='image'?'active':''} onClick={()=>setView('image')} disabled={!group.invoices.length}><ImageIcon size={17}/>{t("Image")}</button></div><button className="secondary" disabled={!!busy} onClick={()=>void exportGroup(view==='excel'?'xlsx':view==='pdf'?'pdf':'png')}><Download size={17}/>{view==='excel'?t("Download Excel"):view==='pdf'?t("Download PDF"):t("Download image")}</button></div>
          {group.importedFile&&<div className="info-box">{t("The original imported Excel file is preserved.")}<button className="text-button" onClick={()=>void run(t("Opening original"),async()=>{await saveBlob(await(await fetch(group.importedFile!)).blob(),group.importedName!,language);})}>{t("Download original Excel")}</button>{group.invoices.length>0&&<span>{t("Added invoices appear in a new Excel export with formulas.")}</span>}</div>}
          {previewBusy&&<div className="preview-loading" role="status"><LoaderCircle className="spin" size={18}/>{t('Preparing preview')}</div>}{view==='excel'&&<>{group.invoices.length>0&&<div className="excel-edit-banner"><div><b>{t('Items and amounts')}</b><p>{t('Edit quantities and prices here. Totals update immediately.')}</p></div><button className="primary" onClick={()=>setArchiveEdit({index:0,compact:true})}><FileSpreadsheet size={16}/>{t('Edit rows')}</button></div>}<ExcelGrid key={group.id} sheets={preview}/></>}{view==='pdf'&&pdf&&<PdfPreview blob={pdf}/>}
          {view==='image'&&<><div className="document-tabs">{group.invoices.map((d,i)=><button className={docIndex===i?'active':''} key={d.id} onClick={()=>setDocIndex(i)}>{d.number}</button>)}</div><div className="image-preview-grid"><div><h3>{t("Generated document")}</h3>{png&&<img src={png} alt={t("Generated document image")}/>}</div><div><h3>{t("Source photo")}</h3>{group.invoices[docIndex]?.image?<><PhotoPanel invoice={group.invoices[docIndex]} onChange={()=>{}} disabled/><button className="secondary" onClick={()=>void run(t("Saving photo"),async()=>{const inv=group.invoices[docIndex];const blob=await(await fetch(inv.image)).blob();await saveBlob(blob,`${inv.number}-${outputText('source')}.${blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg'}`,language);})}><Download size={16}/>{t("Download source photo")}</button></>:<p>{t("This record has no source photo.")}</p>}</div></div></>}
        </>}
        {loaded&&page==='backup'&&<><div className="page-heading"><div><div className="eyebrow">{t("TAKE YOUR RECORDS WITH YOU")}</div><h1>{t("Backup and transfer")}</h1><p>{t("Move your archive between computers, phones and tablets.")}</p></div></div><div className="backup-grid"><div className="backup-card"><DatabaseBackup size={33}/><h2>{t("Back up your archive")}</h2><p>{t("Photos, documents and pending drafts are saved in a single backup file.")}</p><button className="primary" disabled={!!busy} onClick={()=>void run(t("Preparing backup"),async()=>{if(await saveBlob(new Blob([JSON.stringify(ref.current)],{type:'application/json'}),outputText('Invoice-Atelier-Backup-{date}.json',{date:new Date().toISOString().slice(0,10)}),language))setNotice(t("Archive backup saved."));})}><Download size={17}/>{t("Create backup file")}</button></div><div className="backup-card"><Upload size={33}/><h2>{t("Import a backup")}</h2><p>{t("Add an archive from another device. Existing records are kept and duplicate documents are skipped.")}</p><button className="secondary" disabled={!!busy} onClick={()=>backupRef.current?.click()}><Upload size={17}/>{t("Choose backup file")}</button></div><div className="backup-card"><FileSpreadsheet size={33}/><h2>{t("Open an existing Excel file")}</h2><p>{t("Reimport Excel files created by this app. Preview sheets from other Excel files.")}</p><button className="secondary" disabled={!!busy} onClick={()=>importRef.current?.click()}><FolderOpen size={17}/>{t("Choose Excel file")}</button></div></div><div className="info-box"><ShieldCheck size={20}/><span>{t("Each device keeps its own archive. Transfer a backup file to move records between devices. Back up your records before uninstalling.")}</span></div></>}

        {loaded&&page==='settings'&&<>
          <div className="page-heading"><div><div className="eyebrow">{t('LANGUAGES AND FIXED DETAILS')}</div><h1>{t('Settings')}</h1><p>{t('Choose languages and save fixed company details for new documents.')}</p></div></div>
          <div className="language-settings">
            <section className="backup-card"><SettingsIcon size={30}/><h2>{t('Interface language')}</h2><p>{t('Menus, settings, buttons and messages use this language.')}</p><label className="field"><span>{t('Interface language')}</span><select data-testid="interface-language" aria-label={t('Interface language')} value={language} onChange={e=>changeSettings('interfaceLanguage',e.target.value as Language)}>{languages.map(code=><option key={code} value={code} lang={code}>{languageNames[code]}</option>)}</select></label></section>
            <section className="backup-card"><FileSpreadsheet size={30}/><h2>{t('Output language')}</h2><p>{t('Excel sheets and headings, PDF documents and generated images use this language.')}</p><label className="field"><span>{t('Output language')}</span><select data-testid="output-language" aria-label={t('Output language')} value={outputLanguage} onChange={e=>changeSettings('outputLanguage',e.target.value as Language)}>{languages.map(code=><option key={code} value={code} lang={code}>{languageNames[code]}</option>)}</select></label><button className="text-button" onClick={()=>changeSettings('outputLanguage',language)}>{t('Use interface language for outputs')}</button></section>
          </div><div className="info-box"><ShieldCheck size={20}/><span>{t('Language choices are saved on this device. Source photos, names and entered document content are preserved.')} {t('Output previews update when you change the output language.')}</span></div>
          <BusinessDefaultsSettings value={businessDefaultsFor(store)} pendingCount={store.draft.length} onSave={async value=>{
            await commitStore(s=>({...s,businessDefaults:structuredClone(value)}));setNotice(t('Fixed details saved on this device.'));
          }} onFillPending={async()=>{
            await commitStore(s=>({...s,draft:s.draft.map(invoice=>readingIds.includes(invoice.id)?invoice:applyBusinessDefaults(invoice,businessDefaultsFor(s),'pending'))}));setNotice(t('Empty fields in pending documents were filled.'));
          }}/>
        </>}
      </main><footer className="footer"><span>{t("From photos to Excel with formulas.")}</span><span>Invoice Atelier · {version}</span></footer>
    </div>
    <nav className="mobile-nav"><button className={page==='scan'||page==='review'?'active':''} onClick={()=>goto(store.draft.length?'review':'scan')}><ScanLine size={21}/>{t("Scan documents")}</button><button className={page==='archive'||page==='group'?'active':''} onClick={()=>goto('archive')}><Files size={21}/>{t("My archive")}</button><button className={page==='backup'?'active':''} onClick={()=>goto('backup')}><DatabaseBackup size={21}/>{t("Backup")}</button><button data-testid="settings-mobile" className={page==='settings'?'active':''} onClick={()=>goto('settings')}><SettingsIcon size={21}/>{t('Settings')}</button></nav>
    {photoImport.dialogs}<input ref={importRef} hidden type="file" accept=".xlsx" onChange={e=>{if(e.target.files?.[0])void importExcel(e.target.files[0]);e.target.value='';}}/><input ref={backupRef} hidden type="file" accept=".json" onChange={e=>{if(e.target.files?.[0])void restore(e.target.files[0]);e.target.value='';}}/>
    {busy&&<div className="busy-overlay" role="status"><div><span className="scan-spinner"><ScanLine size={34}/></span><h3>{busy}</h3><p>{t("Preparing your documents and formulas.")}</p>{progress>0&&progress<1?<progress max={1} value={progress}/>:<LoaderCircle className="spin" size={22}/>}</div></div>}
    {saveOpen&&<div className="modal-overlay"><section className="modal" role="dialog" aria-modal="true" aria-label={t("Save to Excel file")}><button className="modal-close" aria-label={t("Close save dialog")} onClick={()=>setSaveOpen(false)}><X/></button><span className="modal-icon"><FileSpreadsheet size={28}/></span><h2>{t("Where should we save these?")}</h2><p>{t('Save {documents} to a new file or an existing Excel archive.',{documents:documentCount(selectedDocuments.length)})}</p>{store.draft.length>1&&<label className="field save-scope"><span>{t('Save selection')}</span><select aria-label={t('Save selection')} value={saveScope} onChange={event=>{setSaveScope(event.target.value as typeof saveScope);setAck(false);setSeparate(false);}}><option value="all">{t('All pending documents')} ({store.draft.length})</option><option value="ready">{t('All ready documents')} ({readyDocuments.length})</option><option value="current">{t('This document only')}</option></select></label>}{selectedDocuments.some(invoice=>issues(invoice,language).length)&&<div className="warning">{t('Some selected documents need review. Choose ready documents or finish their details.')}</div>}{selectedDocuments.length<store.draft.length&&<p className="selection-note">{t('{count} documents will stay in review.',{count:store.draft.length-selectedDocuments.length})}</p>}<label className={`save-choice ${target==='new'?'selected':''}`}><input type="radio" name="target" checked={target==='new'} onChange={()=>setTarget('new')}/><span><b>{t("Create a new Excel file")}</b><small>{t("Start a new file for these documents.")}</small></span><Plus size={19}/></label>{target==='new'&&<Field label={t("File name")} value={newName} onChange={setNewName}/>}
      <div className="save-collection-list">{store.collections.map(c=><label className={`save-choice ${target===c.id?'selected':''}`} key={c.id}><input type="radio" name="target" checked={target===c.id} onChange={()=>{setTarget(c.id);setSeparate(false);}}/><span><b>{c.name}</b><small>{documentCount(c.invoices.length)}</small></span><FileSpreadsheet size={19}/></label>)}</div>{selectedDocuments.length>1&&<label className="check-row"><input type="checkbox" checked={separate} onChange={e=>{setSeparate(e.target.checked);if(e.target.checked)setTarget('new');}}/>{t("Save each document to a separate Excel file")}</label>}{mismatch&&<label className="check-row warning"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>{t("I checked the difference between the calculated total and the document.")}</label>}<button className="primary full-width" onClick={()=>void confirmSave()} disabled={!!busy||!selectedDocuments.length||selectedDocuments.some(invoice=>issues(invoice,language).length||readingIds.includes(invoice.id))||(mismatch&&!ack)}><Check size={19}/>{t("Confirm and save to archive")}</button><small className="modal-foot">{t("Excel, PDF and image exports are available on the next screen.")}</small></section></div>}
    {photoReplacement.dialogs}
    {renaming&&group&&<div className="modal-overlay"><section className="modal" role="dialog" aria-modal="true" aria-label={t('Rename file')}><h2>{t('Rename file')}</h2><Field label={t('File name')} value={renameName} onChange={setRenameName}/><div className="modal-actions"><button className="secondary" onClick={()=>setRenaming(false)}>{t('Cancel')}</button><button className="primary" disabled={!renameName.trim()||!!busy} onClick={()=>void run(t('Saving'),async()=>{await commitStore(store=>({...store,collections:store.collections.map(collection=>collection.id===group.id?{...collection,name:renameName.trim(),updatedAt:new Date().toISOString()}:collection)}));setRenaming(false);setNotice(t('File renamed.'));})}>{t('Save changes')}</button></div></section></div>}
    {archiveEdit&&group&&<ArchiveEditor key={group.id} group={group} initialIndex={archiveEdit.index} compact={archiveEdit.compact} onCancel={()=>setArchiveEdit(null)} onSave={async(documents,baseUpdatedAt)=>{await commitStore(current=>updateArchivedInvoices(current,group.id,documents,baseUpdatedAt));setArchiveEdit(null);setNotice(t('Changes saved. Excel, PDF and images are updated.'));}}/>}
    {cameraOpen&&<div className="modal-overlay camera-overlay"><section className="camera-modal" role="dialog" aria-modal="true" aria-label={t("Take a document photo")}><div className="panel-head"><b>{t("Place the document in the frame")}</b><button aria-label={t("Close camera")} onClick={closeCamera}><X/></button></div><video ref={videoRef} autoPlay playsInline muted/><p>{t("Use good lighting and keep the whole page in the frame.")}</p><button className="primary" onClick={()=>void capture()}><Camera size={19}/>{t("Capture and read photo")}</button></section></div>}
    {cameraProblem&&<PhotoAccessDialog problem={cameraProblem} onClose={()=>setCameraProblem(null)} onRetry={()=>void openCamera()} onFiles={()=>{setCameraProblem(null);photoImport.open('gallery');}}/>}

    {rereadId&&<div className="modal-overlay"><section className="modal" role="dialog" aria-modal="true" aria-label={t('Read this photo again?')}><h2>{t('Read this photo again?')}</h2><p>{t('This replaces extracted details, including manual corrections. The source photo is kept.')}</p><div className="modal-actions"><button className="secondary" onClick={()=>setRereadId('')}>{t('Cancel')}</button><button className="primary" onClick={()=>void run(t('Saving'),()=>rereadPhoto(rereadId))}>{t('Read and replace details')}</button></div></section></div>}
    {pendingDeleteId&&<div className="modal-overlay"><section className="modal" role="dialog" aria-modal="true" aria-label={t('Remove pending document')}><h2>{t('Remove this pending document?')}</h2><div className="modal-actions"><button className="secondary" onClick={()=>setPendingDeleteId('')}>{t('Cancel')}</button><button className="danger-button" onClick={()=>{if(readingId===pendingDeleteId)readingController.current?.abort();readingQueue.current=readingQueue.current.filter(d=>d.id!==pendingDeleteId);setReadingIds(ids=>ids.filter(id=>id!==pendingDeleteId));updateStore(s=>({...s,draft:s.draft.filter(i=>i.id!==pendingDeleteId)}));setActive(Math.max(0,active-1));setPendingDeleteId('');}}><Trash2 size={17}/>{t('Remove')}</button></div></section></div>}
    {deleteId&&<div className="modal-overlay"><section className="modal" role="dialog" aria-modal="true" aria-label={t("Remove from archive")}><h2>{t("Remove this file from the archive?")}</h2><p>{t("This also removes its documents and source photos. Downloaded Excel files are kept.")}</p><div className="modal-actions"><button className="secondary" onClick={()=>setDeleteId('')}>{t("Cancel")}</button><button className="danger-button" onClick={()=>void run(t("Removing file"),async()=>{await commitStore(current=>({...current,collections:current.collections.filter(c=>c.id!==deleteId)}));setDeleteId('');})}><Trash2 size={17}/>{t("Remove")}</button></div></section></div>}
  </div></LanguageContext.Provider>;
}
