import {useEffect,useRef,useState} from 'react';
import {Image as ImageIcon,RotateCw,ZoomIn,ZoomOut,X,Upload,History,Maximize,RotateCcw} from 'lucide-react';
import {replaceSource,type Invoice} from './model';
import {useTranslation} from './LanguageContext';
import {useBackAction} from './back-navigation';

type Props={invoice:Invoice;onChange:(invoice:Invoice)=>void;onReplace?:()=>void;onReread?:()=>void;onRemove?:()=>void;disabled?:boolean};
export function PhotoPanel({invoice,onChange,onReplace,onReread,onRemove,disabled=false}:Props){
  const t=useTranslation(),[open,setOpen]=useState(false),[zoom,setZoom]=useState(1),[history,setHistory]=useState<number|null>(null),[size,setSize]=useState({width:1,height:1}),container=useRef<HTMLDivElement>(null);
  const source=history===null?invoice:invoice.sourceHistory?.[history]??invoice;
  const rotation=source.imageRotation??0;
  useBackAction(30,()=>{if(!open)return false;setOpen(false);return true;});
  useEffect(()=>{setHistory(null);setZoom(1);},[invoice.id,invoice.image]);
  useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);if(event.key==='+'||event.key==='=')setZoom(z=>Math.min(4,z+.25));if(event.key==='-')setZoom(z=>Math.max(.5,z-.25));};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);},[open]);
  const swapped=rotation%2!==0;
  const image=<img className="source-image" src={source.image} alt={t(open?'Enlarged document photo':'Uploaded document')} onLoad={event=>setSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})} style={{transform:`rotate(${rotation*90}deg)`,maxWidth:swapped?`${Math.min(100,100*size.width/size.height)}%`:'100%'}}/>;
  return <aside className="source-panel photo-panel">
    <div className="panel-head"><span><ImageIcon size={17}/>{t('Source photo')}</span><div><button type="button" aria-label={t('Rotate photo')} disabled={!invoice.image||disabled||history!==null} onClick={()=>onChange({...invoice,imageRotation:((invoice.imageRotation??0)+1)%4})}><RotateCw size={17}/></button><button type="button" aria-label={t('Enlarge photo')} disabled={!source.image} onClick={()=>{setZoom(1);setOpen(true);}}><ZoomIn size={17}/></button></div></div>
    {source.image?<button type="button" className="photo-stage" onClick={()=>{setZoom(1);setOpen(true);}} aria-label={t('Enlarge photo')}>{image}</button>:<div className="empty-inline">{t('No source photo')}</div>}
    <div className="source-footer"><small>{source.sourceName}</small>{onReread&&<button type="button" className="text-button" onClick={onReread} disabled={disabled||!invoice.image}><RotateCw size={14}/>{t('Read again')}</button>}</div>
    {onReplace&&<button type="button" className="secondary replace-photo" disabled={disabled} onClick={onReplace}><Upload size={15}/>{t('Replace photo')}</button>}
    {!!invoice.sourceHistory?.length&&<details className="source-history"><summary><History size={15}/>{t('Previous photos')} ({invoice.sourceHistory.length})</summary><button type="button" className={history===null?'active':''} onClick={()=>setHistory(null)}>{t('Current photo')}</button>{invoice.sourceHistory.map((photo,index)=><div key={index}><button type="button" className={history===index?'active':''} onClick={()=>setHistory(index)}>{photo.sourceName||`${index+1}`}</button>{history===index&&<button type="button" className="text-button" disabled={disabled} onClick={()=>{onChange(replaceSource(invoice,photo));setHistory(null);}}><RotateCcw size={14}/>{t('Restore this photo')}</button>}</div>)}<small>{t('Source photo history is kept in your backup.')}</small></details>}
    <details className="ocr-details"><summary>{t('Recognized text')}</summary><pre>{invoice.ocrText||t('No readable text was found in this photo. You can complete the fields manually.')}</pre></details>
    <p className="source-note">{t('Handwriting and faint text may be missed. Check quantities and prices before saving.')}</p>
    {onRemove&&<button type="button" className="danger-text" onClick={onRemove}>{t('Remove pending document')}</button>}
    {open&&<div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={t('Photo view')}><div className="photo-lightbox-toolbar"><span>{source.sourceName}</span><button type="button" aria-label={t('Zoom out')} onClick={()=>setZoom(z=>Math.max(.5,z-.25))}><ZoomOut/></button><strong>{Math.round(zoom*100)}%</strong><button type="button" aria-label={t('Zoom in')} onClick={()=>setZoom(z=>Math.min(4,z+.25))}><ZoomIn/></button><button type="button" aria-label={t('Fit to screen')} onClick={()=>{setZoom(1);container.current?.scrollTo(0,0);}}><Maximize/></button><button type="button" aria-label={t('Close photo')} autoFocus onClick={()=>setOpen(false)}><X/></button></div><div className="photo-lightbox-scroll" ref={container}><div style={{width:`${zoom*100}%`,minHeight:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>{image}</div></div></div>}
  </aside>;
}
