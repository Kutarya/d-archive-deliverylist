import { createWorker, PSM } from 'tesseract.js';
import { emptyInvoice, emptyItem, num, type Invoice, type Item } from './model';
import { isAndroid, NativeDocuments, processPhoto, type OcrLine } from './platform';
import {centerX,findTable,partyValue,tableRows,ocrNumber} from './ocr-layout';
import { abortable } from './async-task';
import {hasCompleteReading,recognitionScore,refineTokens} from './recognition-quality';
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toLowerCase().replace(/\bcis[l1it]o\b/g,'cislo');
function totalPriority(line:string):number {
  const text=fold(line);
  // Tax/net/discount summaries often follow the payable amount. They must
  // not replace that amount merely because their label starts with "Total".
  if(/^(?:total|celkem|toplam)\s*(?:vat\b|tax\b|discount\b|quantity\b|items?\b|dph\b|bez\s+dph\b|kdv\b|indirim\b|adet\b|miktar\b|net\b|excl)/.test(text))return 0;
  if(/^(?:genel\s*toplam\b|odenecek\b|grand\s*total\b|total\s*(?:due|payable)\b|amount\s*due\b|celkem\s*k\s*uhrade\b)/.test(text))return 2;
  return /^(?:celkem\b|total\b|toplam\b)/.test(text)?1:0;
}
function currencyIn(text: string): string | undefined {
  const code = text.match(/(?:^|[^a-z])((?:CZK|EUR|TRY|USD|GBP))(?![a-z])/i)?.[1];
  if (code) return code.toUpperCase();
  if (/€/.test(text)) return 'EUR';
  if (/£/.test(text)) return 'GBP';
  if (/\$/.test(text)) return 'USD';
  if (/₺|\bTL\b/i.test(text)) return 'TRY';
  if (/Kč|\bkc\b/i.test(text)) return 'CZK';
}
function documentDate(lines: string[], number: string): string {
  const labeled = lines.filter(line => /\b(?:datum|ze dne|tarih|date)\b/i.test(fold(line)));
  // A date-shaped identifier in the document-number box is not an issue date.
  const other = lines.filter(line => !number || !line.includes(number));
  for (const line of [...labeled,...other]) {
    const match = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/) || line.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
    if (!match) continue;
    const iso = match[1].length === 4;
    const year = Number(iso ? match[1] : match[3]), month = Number(match[2]), day = Number(iso ? match[3] : match[1]);
    const date = new Date(Date.UTC(year,month-1,day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month-1 && date.getUTCDate() === day) return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return '';
}
export function rowsFromTokens(tokens: OcrLine[]): OcrLine[][] {
  const rows: OcrLine[][] = [];
  for (const t of [...tokens].sort((a,b) => a.y-b.y || a.x-b.x)) {
    const cy = t.y+t.height/2;
    const row = rows.find(r => Math.abs((r.reduce((s,v) => s+v.y+v.height/2,0)/r.length)-cy) < Math.max(6, t.height*0.65));
    if (row) row.push(t); else rows.push([t]);
  }
  return rows.map(r => r.sort((a,b) => a.x-b.x));
}
function extractItems(text: string, tokens: OcrLine[]): Item[] {
  const table=findTable(tokens);
  if(table){
    const items:Item[]=[];
    for(const row of tableRows(tokens,table)){
      const left=row.filter(token=>centerX(token)<table.quantityLeft).map(token=>token.text).join(' ').replace(/^\d+[.)]?\s+/,'').trim();
      const cell=(start:number,end:number)=>row.filter(token=>centerX(token)>=start&&centerX(token)<end&&token.width<Math.max(50,(end-start)*1.8)).map(token=>token.text).join(' ');
      const value=(kind:typeof table.columns[number]['kind'])=>{const col=table.columns.find(col=>col.kind===kind);return col?cell(col.left,col.right):'';};
      const q=value('quantity'),p=value('price');
      const numeric=(value:string)=>ocrNumber(value.replace(/%/g,''))??'';
      if(left)items.push({...emptyItem(),description:left,quantity:numeric(q),unit:q.match(/(?:\b|(?<=\d))(ks|kg|m2|m²|m|l|adet|pcs|kutu)\b/i)?.[1]??'pcs',unitPrice:numeric(p),discount:numeric(value('discount'))||'0',vat:numeric(value('vat'))||'0'});
    }
    if(items.length)return items;
  }
  const rows = rowsFromTokens(tokens);
  const header = rows.findIndex(r => /nazev|urun|description|product|malzeme/.test(fold(r.map(t => t.text).join(' '))) && /mnoz|miktar|qty|quantity|cena|fiyat|price/.test(fold(r.map(t => t.text).join(' '))));
  const out: Item[] = [];
  if (header >= 0) {
    const h = rows[header];
    const q = h.find(t => /mnoz|miktar|qty|quantity/.test(fold(t.text)));
    const desc = h.find(t => /nazev|urun|description|product|malzeme/.test(fold(t.text)));
    if (q && desc) for (const row of rows.slice(header+1)) {
      const line = row.map(t=>t.text).join(' ');
      if (/^(celkem|toplam|subtotal|total|zpusob|predal|prevzal|razitko|kdv|vat)\b/.test(fold(line))) break;
      const left = row.filter(t=>t.x+t.width/2 < q.x-10).map(t=>t.text).join(' ').replace(/^\d+[.)]?\s+/,'').trim();
      const right = row.filter(t=>t.x+t.width/2 >= q.x-10).map(t=>t.text).join(' ');
      const vals = right.match(/\d+(?:[.,]\d+)?/g) || [];
      if (left && vals.length>=2 && /[a-zA-ZÀ-ž]/.test(left)) out.push({...emptyItem(), description: left, quantity: vals[0]!, unit: right.match(/\b(ks|kg|m2|m²|m|l|adet|pcs|kutu)\b/i)?.[0] || 'pcs', unitPrice: vals[1]!});
    }
  }
  if (!out.length) for (const line of text.split('\n')) {
    if (/celkem|toplam|total|datum|tarih|date|ico|dic|vkn|tax|hesap|banka|bank|tel|phone|\bkdv\b|\bvat\b|\bno\b/i.test(fold(line))) continue;
    const m = line.trim().match(/^(?:\d+[.)]?\s+)?(.+?[a-zA-ZÀ-ž])\s+(\d+(?:[.,]\d+)?)\s*(ks|kg|m2|m²|m|l|adet|pcs|kutu)?\s+(\d+(?:[.,](?:\d{1,2}|[-–—]{1,2}))?)(?:\s+(\d+(?:[.,](?:\d{1,2}|[-–—]{1,2}))?))?\s*(?:Kč|TL|₺|€|CZK|TRY|EUR|USD|GBP)?$/i);
    if (m && !/cena|fiyat|price|mnozstvi/.test(fold(m[1]))) out.push({...emptyItem(), description:m[1].trim(), quantity:m[2], unit:m[3] || 'pcs', unitPrice:m[4]});
  }
  return out;
}
export function parseInvoice(text: string, tokens: OcrLine[] = []): Invoice {
  const inv = emptyInvoice(); inv.ocrText = text;
  const lines = [...text.split('\n'),...rowsFromTokens(tokens).map(row=>row.map(token=>token.text).join(' '))].map(s=>s.trim()).filter(Boolean);
  const value = (keys: RegExp,accept:(value:string)=>boolean=()=>true) => {
    for (let i=0;i<lines.length;i++) {
      const m = fold(lines[i]).match(keys);
      if (!m) continue;
      const after = lines[i].slice((m.index || 0)+m[0].length).replace(/^[\s:;#.-]+/,'').trim();
      if (after && accept(after) && !/^(cislo|ze dne|vystavil|dodavatel|odberatel|bankovni|na zaklade|ic|dic|k[cč]|h|no|tarih|date)$/i.test(fold(after))) return after;
    }
    return '';
  };
  inv.number = value(/(?:dodaci\s+(?:l[i1]?st|ust)\s*(?:cislo|is(?=\s*:))?|delivery\s+(?:note|slip)\s*(?:number|no|#)?|fatura\s*(?:no(?:su)?|numarasi)|invoice\s*(?:number|no|#)|belge\s*(?:no|numarasi)|faktura\s*(?:cislo|c\.)?)\s*:*/i,value=>/\d/.test(value)).replace(/^(?:cislo|no)\s*[:.]?\s*/i,'');
  if (inv.number && !/\d/.test(inv.number)) inv.number = '';
  inv.date = documentDate(lines, inv.number);
  inv.supplier = value(/(?:dodavatel|tedarikci|satici|supplier|seller)\s*:*/);
  inv.customer = value(/(?:odberatel|alici|musteri|customer|buyer)\s*:*/);
  inv.supplier=partyValue(tokens,/dodavatel|tedarikci|satici|supplier|seller/)?.text??inv.supplier;
  inv.customer=partyValue(tokens,/odberatel|alici|musteri|customer|buyer/)?.text??inv.customer;
  inv.supplierTax = value(/(?:vkn|vergi\s*(?:no|numarasi)|ic[.:]?|ico|tax\s*id)\s*:*/).match(/\b\d{8,11}\b/)?.[0] || '';
  inv.orderNumber = value(/(?:objednavky\s*c[.:]?|siparis\s*no|order\s*(?:no|number))\s*:*/);
  inv.transport = value(/(?:zpusob\s*dopravy|tasima\s*sekli|transport)\s*:*/);
  inv.plate = value(/(?:spz|plaka)\s*:*/);
  inv.deliveredBy = value(/(?:predal|teslim\s*eden)\s*:*/);
  inv.receivedBy = value(/(?:prevzal|teslim\s*alan)\s*:*/);
  const totalLines = lines.filter(line=>totalPriority(line)>0).sort((a,b)=>totalPriority(a)-totalPriority(b));
  const declaredCurrency = lines.find(line=>/\b(?:currency|mena|para\s*birimi)\s*:/i.test(fold(line)));
  // Printed currency on an empty form must not override the completed total.
  inv.currency = (declaredCurrency && currencyIn(declaredCurrency)) || totalLines.map(currencyIn).filter(Boolean).at(-1) || currencyIn(text) || 'TRY';
  inv.type = /dodaci\s+(?:l[i1]?st|ust)|delivery\s+(?:note|slip)|teslimat|irsaliye/i.test(fold(text)) ? 'Teslimat fişi' : 'Fatura';
  for (const line of totalLines.reverse()) {
    const amount = line.match(/[+-]?\d(?:[\d\s.,]*\d)?(?:[.,][-–—]{1,2})?/g)?.pop()?.trim();
    if (amount && num(amount)!==null) { inv.statedTotal = amount; break; }
  }
  const items = extractItems(text,tokens); inv.items = items.length ? items : [emptyItem()];
  const table=findTable(tokens);
  for(const [field,label]of [['vat',/(?:\bvat\b|\bdph\b|\bkdv\b)(?:\s*(?:rate|oran[ıi]))?\s*[:%]?\s*(\d+(?:[.,]\d+)?)\s*%/i],['discount',/(?:discount|sleva|indirim)(?:\s*(?:rate|oran[ıi]))?\s*[:%]?\s*(\d+(?:[.,]\d+)?)\s*%/i]] as const){
    if(table?.columns.some(column=>column.kind===field))continue;
    const match=fold(text).match(label);if(match&&num(match[1])!==null&&num(match[1])!<=100)for(const item of inv.items)item[field]=match[1];
  }
  return inv;
}
async function basicRecognition(image: string, progress: (p:number)=>void, signal?: AbortSignal,onPartial?:(invoice:Invoice)=>Promise<void>|void): Promise<Invoice> {
  if (isAndroid) {
    let best:Invoice|undefined;
    let originalTokens:OcrLine[]=[];
    const passes=[{rotation:0,enhance:false}];
    for(let index=0;index<passes.length;index++){
      progress(.1+index*.15);
      const result=await abortable(processPhoto(()=>{
        if(signal?.aborted)throw new DOMException('Aborted','AbortError');
        return NativeDocuments.recognize({image,...passes[index]});
      }),signal);
      if(index===0)originalTokens=result.lines;
      const invoice=parseInvoice(result.text,passes[index].enhance?refineTokens(originalTokens,result.lines):result.lines);invoice.confidence=result.confidence??null;invoice.engine='On-device text recognition';
      if(!best||recognitionScore(invoice)>recognitionScore(best)){best=invoice;await onPartial?.(best);}
      if(hasCompleteReading(best))break;
      if(index===0){
        // ML Kit reports text angles. Upright handwriting does not benefit
        // from three extra full-page rotations before its enhanced pass.
        const rotation=result.suggestedRotation??0;
        passes.push(rotation?{rotation,enhance:false}:{rotation:0,enhance:true});
      }
    }
    progress(1);return best!;
  }
  const base = new URL('./ocr/',document.baseURI).href;
  const workerTask = createWorker(['tur','ces','eng'], 1, {
    workerPath: base+'worker.min.js', corePath: base+'core', langPath: base+'lang',
    workerBlobURL: true, logger: m => { if (m.status==='recognizing text') progress(m.progress); }
  });
  // A worker that finishes loading after cancellation must also be released.
  void workerTask.then(worker=>{if(signal?.aborted)void worker.terminate();},()=>{});
  const worker = await abortable(workerTask,signal);
  const stop=()=>{void worker.terminate();}; signal?.addEventListener('abort',stop,{once:true});
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
    const result = await abortable(worker.recognize(image, {}, { blocks: true }),signal);
    const tokens: OcrLine[] = [];
    result.data.blocks?.forEach(b=>b.paragraphs.forEach(p=>p.lines.forEach(l=>l.words.forEach(w=>tokens.push({text:w.text,x:w.bbox.x0,y:w.bbox.y0,width:w.bbox.x1-w.bbox.x0,height:w.bbox.y1-w.bbox.y0,confidence:w.confidence})))));
    const inv = parseInvoice(result.data.text,tokens); inv.confidence=result.data.confidence; inv.engine='Offline text recognition'; return inv;
  } finally { signal?.removeEventListener('abort',stop); await worker.terminate(); }
}
export async function recognize(image:string,progress:(value:number)=>void,signal?:AbortSignal,onEnhanced?:()=>void,onPartial?:(invoice:Invoice)=>Promise<void>|void):Promise<Invoice>{
  let basic:Invoice|undefined;
  try{basic=await basicRecognition(image,value=>progress(value*.35),signal,onPartial);}catch(error){if(signal?.aborted)throw error;console.warn('Basic text recognition failed',error);}
  if(basic&&hasCompleteReading(basic)){progress(1);return basic;}
  const enhancedController=new AbortController(),cancelEnhanced=()=>enhancedController.abort();
  signal?.addEventListener('abort',cancelEnhanced,{once:true});if(signal?.aborted)cancelEnhanced();
  // Keep a difficult photo from holding every later document indefinitely.
  // If the enhanced pass times out, retain the useful native reading.
  const enhancedTimeout=setTimeout(cancelEnhanced,isAndroid?30000:65000);
  try{
    onEnhanced?.();
    const {readDocument}=await import('./document-reader');
    const result=await processPhoto(()=>readDocument(image,value=>progress(.35+value*.65),undefined,enhancedController.signal,async partial=>{
      const candidate=parseInvoice(partial.text,partial.lines);candidate.confidence=partial.confidence;candidate.engine='Offline document recognition';
      if(!basic||recognitionScore(candidate)>recognitionScore(basic)){basic=candidate;await onPartial?.(candidate);}
      return hasCompleteReading(candidate);
    }));
    const document=parseInvoice(result.text,result.lines);document.confidence=result.confidence;document.engine='Offline document recognition';
    if(basic){
      // The full-page reader supplies context that a cropped handwriting pass
      // can lose (for example "No:" or the leading digits of a grand total).
      for(const key of ['number','date','supplier','customer','supplierTax','customerTax','supplierAddress','customerAddress','orderNumber','transport','plate','deliveredBy','receivedBy','statedTotal'] as const){
        const reliable=['number','date','statedTotal'].includes(key)&&(basic.confidence??0)>=75&&(key!=='number'||/^[\p{L}\d][\p{L}\d._/-]*$/u.test(basic.number));
        if(basic[key]&&(!document[key]||reliable))document[key]=basic[key];
      }
      if(basic.ocrText.split('\n').some(line=>(/\b(?:currency|mena|para\s*birimi)\s*:/i.test(fold(line))||totalPriority(line)>0)&&currencyIn(line)))document.currency=basic.currency;
      if(basic.items.some(item=>item.description&&num(item.quantity)!==null&&num(item.unitPrice)!==null)&&!document.items.some(item=>item.description&&num(item.quantity)!==null&&num(item.unitPrice)!==null))document.items=basic.items;
    }
    if(basic&&recognitionScore(basic)>recognitionScore(document))return basic;
    progress(1);return document;
  }catch(error){
    if(signal?.aborted)throw error;
    console.error('Enhanced document recognition failed',error);
    if(basic){basic.engine='Basic text recognition; enhanced reader unavailable';progress(1);return basic;}
    throw error;
  }finally{clearTimeout(enhancedTimeout);signal?.removeEventListener('abort',cancelEnhanced);}
}
