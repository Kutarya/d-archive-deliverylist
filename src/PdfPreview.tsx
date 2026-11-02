import { useEffect, useRef, useState } from 'react';
import { getDocument } from './pdf-runtime';
import { useTranslation } from './LanguageContext';
export function PdfPreview({blob}: {blob:Blob}) {
  const t=useTranslation();
  const container=useRef<HTMLDivElement>(null);const [error,setError]=useState('');
  useEffect(()=>{
    setError('');
    let cancelled=false;let task:ReturnType<typeof getDocument>|undefined;
    void (async()=>{
      try{
        task=getDocument({data:new Uint8Array(await blob.arrayBuffer())});const pdf=await task.promise;
        if(!container.current||cancelled)return;container.current.replaceChildren();
        for(let n=1;n<=pdf.numPages;n++){
          if(cancelled)return;const page=await pdf.getPage(n);const viewport=page.getViewport({scale:1.4});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;canvas.setAttribute('aria-label',t('PDF page {number}',{number:n}));container.current?.append(canvas);
          await page.render({canvas,viewport}).promise;
        }
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:String(e));}
    })();return()=>{cancelled=true;void task?.destroy();};
  },[blob,t('PDF page {number}')]);
  return <div className="pdf-preview">{error&&<div className="error-box">{t('Could not preview PDF. Use Download PDF to open the file.')}</div>}<div ref={container}/></div>;
}
