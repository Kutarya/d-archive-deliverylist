import {useEffect,useRef,useState} from 'react';
import {Check,Search,X,Image as ImageIcon} from 'lucide-react';
import {issues,totalMismatch,replaceSource,type Collection,type Invoice} from './model';
import {useLanguage,useTranslation} from './LanguageContext';
import {InvoiceEditor} from './InvoiceEditor';
import {PhotoPanel} from './PhotoPanel';
import {sourcePages} from './source-files';
import {locales,localizeError} from './i18n';
import {useBackAction} from './back-navigation';
import {usePhotoImport} from './PhotoImport';

export function ArchiveEditor({group,initialIndex=0,compact=false,onCancel,onSave}:{group:Collection;initialIndex?:number;compact?:boolean;onCancel:()=>void;onSave:(documents:Invoice[],baseUpdatedAt:string)=>Promise<void>}){
  const t=useTranslation(),language=useLanguage(),[documents,setDocuments]=useState(()=>structuredClone(group.invoices)),[active,setActive]=useState(initialIndex),[query,setQuery]=useState(''),[showValidation,setShowValidation]=useState(false),[ack,setAck]=useState(false),[saving,setSaving]=useState(false),[replacing,setReplacing]=useState(false),[error,setError]=useState(''),[showPhoto,setShowPhoto]=useState(()=>!compact&&window.innerWidth>=900),dialog=useRef<HTMLElement>(null);
  const doc=documents[Math.min(active,documents.length-1)],mismatch=documents.some(totalMismatch),baseUpdatedAt=useRef(group.updatedAt);
  const matches=(invoice:Invoice,value:string)=>(invoice.number+' '+invoice.supplier+' '+invoice.customer+' '+invoice.items.map(item=>item.description).join(' ')).toLocaleLowerCase(locales[language]).includes(value.toLocaleLowerCase(locales[language]));
  const visibleDocuments=documents.map((invoice,index)=>({invoice,index})).filter(({invoice})=>matches(invoice,query));
  const update=(invoice:Invoice)=>{setDocuments(docs=>docs.map(d=>d.id===invoice.id?invoice:d));setAck(false);};
  const photoImport=usePhotoImport(async files=>{
    const file=files[0],id=doc.id;setReplacing(true);setError('');
    try{if(file.type==='application/pdf'||/\.pdf$/i.test(file.name))throw new Error('Choose a JPG, PNG or WebP photo.');for await(const photo of sourcePages(file)){setDocuments(current=>current.map(invoice=>invoice.id===id?replaceSource(invoice,{image:photo.image,sourceName:photo.name,sourceHash:photo.hash}):invoice));setAck(false);break;}}
    catch(error){setError(localizeError(error,language));}finally{setReplacing(false);}
  },{multiple:false,allowPdf:false});
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
  const cancel=()=>{if(!saving)onCancel();};
  useBackAction(20,()=>{cancel();return true;});
  const save=async()=>{if(replacing)return;setShowValidation(true);const index=documents.findIndex(invoice=>issues(invoice,language).length);if(index>=0){setActive(index);setQuery('');setError(t('Correct the highlighted fields.'));return;}if(mismatch&&!ack)return;setSaving(true);setError('');try{await onSave(documents,baseUpdatedAt.current);}catch(error){setError(localizeError(error,language));setSaving(false);}};
  return <div className="modal-overlay archive-edit-overlay"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t(compact?'Edit rows':'Edit documents')} className="archive-editor-modal" onKeyDown={event=>{
    if((event.target as HTMLElement).closest('.photo-lightbox,.photo-access-dialog,.photo-source-dialog'))return;
    if(event.key==='Escape'){event.stopPropagation();cancel();}
    if(event.key==='Tab'){const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([hidden]):not(:disabled),select:not(:disabled),summary')??[]).filter(node=>node.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }}>
    <header className="archive-editor-head"><div><h2>{t(compact?'Edit rows':'Edit documents')}</h2><p>{group.name}</p></div><button type="button" aria-label={t('Cancel editing')} disabled={saving} onClick={cancel}><X/></button></header>
    <div className="archive-editor-tools"><label className="search"><Search size={17}/><input aria-label={t('Find a document')} placeholder={t('Find a document')} value={query} onChange={event=>{const value=event.target.value;setQuery(value);const next=documents.findIndex(invoice=>matches(invoice,value));if(next>=0)setActive(next);}}/></label><button type="button" className="secondary" onClick={()=>setShowPhoto(value=>!value)}><ImageIcon size={16}/>{t('Source photo')}</button></div>
    <div className="document-tabs">{visibleDocuments.map(({invoice,index})=><button type="button" key={invoice.id} className={index===active?'active':''} onClick={()=>{setActive(index);setError('');}}>{invoice.number}<small>{issues(invoice,language).length?t('Review'):totalMismatch(invoice)?t('Check total'):t('Ready')}</small></button>)}</div>
    {error&&<div className="error-box" role="alert">{error}</div>}
    <div className={`archive-editor-body ${showPhoto?'with-photo':''}`}>
      {!visibleDocuments.length?<div className="no-search-results"><p>{t('No matching documents.')}</p><button className="text-button" onClick={()=>setQuery('')}>{t('Clear search')}</button></div>:<>{showPhoto&&<PhotoPanel invoice={doc} onChange={update} onReplace={()=>photoImport.open()} disabled={saving||replacing||photoImport.picking}/>}<InvoiceEditor invoice={doc} onChange={update} compact={compact} disabled={saving||replacing} showValidation={showValidation}/></>}
    </div>
    <footer className="archive-editor-actions"><div>{mismatch&&<label className="check-row warning"><input type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)}/>{t('I checked the difference between the calculated total and the document.')}</label>}</div><button type="button" className="secondary" disabled={saving} onClick={cancel}>{t('Cancel')}</button><button type="button" className="primary" disabled={saving||replacing||(mismatch&&!ack)} onClick={()=>void save()}><Check size={17}/>{t('Save changes')}</button></footer>
    {photoImport.dialogs}
  </section></div>;
}
