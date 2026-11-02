import {PaddleOCR,type OcrResult,type OcrResultItem} from '@paddleocr/paddleocr-js';
// The dependency is pinned to 0.4.2. Use the same prebuilt worker as its SDK,
// while owning its lifetime so Stop can terminate an active WASM inference.
import paddleWorkerUrl from '../node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-C9UNuyOJ.js?url';
import {centerX,centerY,findTable,normalized,numberBox,ocrNumber,partyValue,tableRows} from './ocr-layout';
import {num} from './model';
import {isAndroid,type OcrLine} from './platform';
import {abortable} from './async-task';

type Rect={x:number;y:number;width:number;height:number};
type Region=Rect&{kind:'number'|'supplier'|'customer'|'description'|'quantity'|'price'|'amount'|'total'|'currency';row?:number;source?:OcrLine;unit?:string};
type Reading={text:string;score:number;enhanced:boolean};
type DocumentReading={text:string;lines:OcrLine[];confidence:number};
const bounds=(item:OcrResultItem):Rect=>{const xs=item.poly.map(p=>p[0]),ys=item.poly.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};};
const token=(item:OcrResultItem):OcrLine=>({...bounds(item),text:item.text,confidence:item.score*100});
const goodText=(value:string)=>/[a-zÀ-ž]/i.test(value)&&!/[∵≡卜]/.test(value);
function numeric(value:string):string|undefined {
  const text=ocrNumber(value);
  return text!==undefined&&num(text)!==null?text:undefined;
}
function numberReadings(readings:Reading[]):{text:string;value:number;score:number}[]{
  return readings.flatMap(reading=>{const text=numeric(reading.text),value=text===undefined?null:num(text);return text!==undefined&&value!==null?[{text,value,score:reading.score}]:[];}).sort((a,b)=>b.score-a.score);
}
function chooseText(readings:Reading[],preferEnhanced=false):Reading|undefined {
  return readings.filter(reading=>goodText(reading.text)).sort((a,b)=>(b.score+(preferEnhanced&&b.enhanced ? .06 : 0))-(a.score+(preferEnhanced&&a.enhanced ? .06 : 0)))[0];
}
function codeDistance(a:string,b:string):number {
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));row=next;}
  return row[b.length];
}
export function recognizedCurrency(value:string):string|undefined {
  const text=value.toUpperCase().replace(/[^A-Z]/g,'');
  const codes=['EUR','CZK','TRY','USD','GBP'];
  if(codes.includes(text))return text;
  if(text.length<2||text.length>4)return;
  const scored=codes.map(code=>({code,distance:codeDistance(text,code)})).sort((a,b)=>a.distance-b.distance);
  return scored[0].distance<=1&&scored[0].distance<scored[1].distance?scored[0].code:undefined;
}
function enhancedCanvas(source:HTMLCanvasElement):HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const ctx=canvas.getContext('2d')!,pixels=source.getContext('2d')!.getImageData(0,0,source.width,source.height),p=pixels.data,w=canvas.width,h=canvas.height;
  const grey=new Float32Array(w*h),integral=new Float64Array((w+1)*(h+1));
  for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const n=y*w+x,k=n*4;grey[n]=(p[k]+p[k+1]+p[k+2])/3;row+=grey[n];integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+row;}}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const l=Math.max(0,x-25),r=Math.min(w,x+26),t=Math.max(0,y-25),b=Math.min(h,y+26),mean=(integral[b*(w+1)+r]-integral[b*(w+1)+l]-integral[t*(w+1)+r]+integral[t*(w+1)+l])/((r-l)*(b-t)),k=(y*w+x)*4;
    const v=p[k+2]>p[k]?255:Math.max(0,Math.min(255,255+(grey[y*w+x]-mean)*7));p[k]=p[k+1]=p[k+2]=v;
  }
  ctx.putImageData(pixels,0,0);return canvas;
}
function crop(source:HTMLCanvasElement,region:Rect):HTMLCanvasElement {
  const x=Math.max(0,region.x),y=Math.max(0,region.y),w=Math.min(source.width-x,region.width),h=Math.min(source.height-y,region.height);
  const scale=Math.min(3,1200/Math.max(w,h));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(w*scale+30));canvas.height=Math.max(1,Math.ceil(h*scale+30));
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,x,y,w,h,15,15,w*scale,h*scale);return canvas;
}
async function reader(rec:string,signal?:AbortSignal){
  signal?.throwIfAborted();
  const base=new URL('./reader/',document.baseURI),det='PP-OCRv6_tiny_det';
  const worker=new Worker(paddleWorkerUrl,{type:'module'});let stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;worker.onerror?.call(worker,new ErrorEvent('error',{message:'Document reading stopped.'}));worker.terminate();};
  signal?.addEventListener('abort',stop,{once:true});
  try{
    const instance=await PaddleOCR.create({initialize:false,worker:{createWorker:()=>worker},textDetectionModelName:det,textRecognitionModelName:rec,textDetectionModelAsset:{url:new URL('models/'+det+'.tar',base).href},textRecognitionModelAsset:{url:new URL('models/'+rec+'.tar',base).href},textRecognitionBatchSize:4,ortOptions:{backend:'wasm',numThreads:1,wasmPaths:new URL('ort/',base).href}});
    return {
      predict:(input:Parameters<typeof instance.predict>[0],params:Parameters<typeof instance.predict>[1]={})=>{signal?.throwIfAborted();return instance.predict(input,params);},
      dispose:async()=>{try{if(!signal?.aborted)await abortable(instance.dispose(),signal);}finally{stop();signal?.removeEventListener('abort',stop);}}
    };
  }catch(error){stop();signal?.removeEventListener('abort',stop);throw error;}
}
function readings(result:OcrResult,enhanced:boolean):Reading[]{
  const items=result.items.filter(item=>item.score>=.42).sort((a,b)=>bounds(a).x-bounds(b).x);
  const out=items.map(item=>({text:item.text,score:item.score,enhanced}));
  if(items.length>1)out.push({text:items.map(item=>item.text).join(' '),score:items.reduce((sum,item)=>sum+item.score,0)/items.length,enhanced});
  return out;
}
async function predictCrops(engine:Awaited<ReturnType<typeof reader>>,source:HTMLCanvasElement,regions:Rect[],score:number,signal?:AbortSignal):Promise<OcrResult[]>{
  const results:OcrResult[]=[];
  // Fifty rows can contain hundreds of large crops. Keep only one small batch
  // alive, including when a worker fails or the user cancels the document.
  for(let offset=0;offset<regions.length;offset+=4){
    signal?.throwIfAborted();
    const canvases=regions.slice(offset,offset+4).map(region=>crop(source,region));
    try{results.push(...await abortable(engine.predict(canvases,{textDetLimitSideLen:1200,textDetLimitType:'max',textDetBoxThresh:.25,textRecScoreThresh:score}),signal));}
    finally{for(const canvas of canvases){canvas.width=0;canvas.height=0;}}
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return results;
}
export async function readDocument(image:string,progress:(value:number)=>void,debug?:(data:unknown)=>void,signal?:AbortSignal,onPartial?:(reading:DocumentReading)=>Promise<boolean|void>|boolean|void):Promise<DocumentReading> {
  signal?.throwIfAborted();
  const img=new Image();img.src=image;await img.decode();
  signal?.throwIfAborted();
  const scale=isAndroid?Math.min(1,2000/Math.max(img.width,img.height)):1;
  const source=document.createElement('canvas');source.width=Math.round(img.width*scale);source.height=Math.round(img.height*scale);source.getContext('2d')!.drawImage(img,0,0,source.width,source.height);
  try{
  progress(.05);const primary=await reader(isAndroid?'en_PP-OCRv5_mobile_rec':'PP-OCRv6_small_rec',signal);
  let primaryDisposal:Promise<void>|undefined;const stopPrimary=()=>{primaryDisposal??=primary.dispose();};signal?.addEventListener('abort',stopPrimary,{once:true});
  let lines:OcrLine[]=[],regions:Region[]=[],values:Reading[][]=[];
  try{
    progress(.2);const [result]=await abortable(primary.predict(source,{textDetLimitSideLen:isAndroid?1280:1600,textDetLimitType:'max',textDetBoxThresh:.35,textRecScoreThresh:.35}),signal);
    lines=result.items.map(token);progress(.4);
    const partial={text:lines.map(line=>line.text).join('\n'),lines,confidence:lines.length?lines.reduce((sum,line)=>sum+(line.confidence??0),0)/lines.length:0};
    const complete=await onPartial?.(partial);if(isAndroid&&complete){progress(1);return partial;}
    const table=findTable(lines),rows=table?tableRows(lines,table).slice(0,50):[];
    const title=lines.find(line=>/cislo|dodaci\s+l[i1]?st|(?:invoice|delivery|fatura|faktura).*(?:number|\bno\b)/.test(normalized(line.text)));
    if(title){
      const label=normalized(title.text).match(/(?:cislo|number|no[.:]?|numarasi|\bis(?=\s*:))\s*[:#]?\s*/);
      if(label){const ratio=((label.index??0)+label[0].length)/title.text.length,left=title.x+title.width*ratio-title.width*.02;
        const detected=numberBox(source.getContext('2d')!.getImageData(0,0,source.width,source.height).data,source.width,source.height,title);
        regions.push({kind:'number',source:title,...(detected??{x:left,y:title.y+title.height*.04,width:title.x+title.width-left,height:title.height*.75})});}
    }
    for(const [kind,label]of [['supplier',/dodavatel|supplier|seller|tedarikci|satici/],['customer',/odberatel|customer|buyer|musteri|alici/]] as const){
      const value=partyValue(lines,label,false);if(value){const pad=Math.max(5,value.height*.12);regions.push({...value,kind,source:value,x:value.x-pad,y:value.y-pad,width:value.width+pad+value.height*.65,height:value.height+pad*2});}
    }
    if(table)for(let row=0;row<rows.length;row++){
      const tokens=rows[row],left=tokens.filter(line=>centerX(line)<table.quantityLeft);
      const top=Math.min(...tokens.map(line=>line.y))-3,bottom=Math.max(...tokens.map(line=>line.y+line.height))+3;
      const d={x:Math.min(...left.map(line=>line.x))-3,y:Math.min(...left.map(line=>line.y))-5,width:Math.max(...left.map(line=>line.x+line.width))-Math.min(...left.map(line=>line.x))+6,height:Math.max(...left.map(line=>line.y+line.height))-Math.min(...left.map(line=>line.y))+10};
      regions.push({...d,kind:'description',row});
      for(const [kind,start,end]of [['quantity',table.quantityLeft,table.priceLeft],['price',table.priceLeft,table.amountLeft],['amount',table.amountLeft,table.right]] as const){
        const unit=kind==='quantity'?tokens.filter(token=>centerX(token)>=start&&centerX(token)<end).map(token=>token.text).join(' ').match(/(?:\b|(?<=\d))(ks|kg|pcs|adet|m2|m²|m|l)\b/i)?.[1]:undefined;
        regions.push({kind,row,x:start,y:top,width:end-start,height:bottom-top,unit});
      }
    }
    const total=lines.filter(line=>/^celkem|grand\s*total|total\s*due|genel\s*toplam/.test(normalized(line.text))&&(!table||line.y>table.top)).sort((a,b)=>b.y-a.y)[0];
    if(table&&total){regions.push({kind:'total',source:total,x:table.amountLeft,y:total.y-3,width:Math.max(table.right,total.x+total.width)-table.amountLeft,height:total.height+6});
      const start=total.x+Math.min(total.width*.25,total.height*1.5);regions.push({kind:'currency',x:start,y:total.y-3,width:table.amountLeft-start,height:total.height+6});}
    if(regions.length){
      const enhanced=enhancedCanvas(source);
      try{
      for(const [enhance,canvas]of [[false,source],[true,enhanced]] as const){
        const outputs=await predictCrops(primary,canvas,regions,.35,signal);
        outputs.forEach((output,i)=>{values[i]??=[];values[i].push(...readings(output,enhance));});progress(enhance ? .75 : .6);
      }
      }finally{enhanced.width=0;enhanced.height=0;}
    }
  }finally{signal?.removeEventListener('abort',stopPrimary);stopPrimary();await primaryDisposal;}
  const descriptions=regions.map((region,index)=>({region,index})).filter(({region,index})=>(region.kind==='description'&&!/[^\u0000-\u007f]/.test(values[index]?.[0]?.text??''))||['amount','total','currency'].includes(region.kind));
  if(descriptions.length&&!isAndroid){
    const english=await reader('en_PP-OCRv5_mobile_rec',signal);
    let englishDisposal:Promise<void>|undefined;const stopEnglish=()=>{englishDisposal??=english.dispose();};signal?.addEventListener('abort',stopEnglish,{once:true});
    const enhanced=enhancedCanvas(source);
    try{const outputs=await predictCrops(english,enhanced,descriptions.map(({region})=>region),.45,signal);
      outputs.forEach((output,i)=>{const candidates=readings(output,true),{region,index}=descriptions[i];if(candidates.length){if(region.kind==='description')values[index]=candidates;else values[index].push(...candidates);}});
    }finally{enhanced.width=0;enhanced.height=0;signal?.removeEventListener('abort',stopEnglish);stopEnglish();await englishDisposal;}
  }
  progress(.9);
  debug?.({lines,regions,values});
  const replacements=new Map<OcrLine,OcrLine>(),newLines:OcrLine[]=[],removed=new Set<OcrLine>();
  const table=findTable(lines),rows=table?tableRows(lines,table).slice(0,50):[];
  const selected=new Map<number,Reading>();
  if(table)for(let row=0;row<rows.length;row++){
    const q=regions.findIndex(region=>region.row===row&&region.kind==='quantity'),p=regions.findIndex(region=>region.row===row&&region.kind==='price'),a=regions.findIndex(region=>region.row===row&&region.kind==='amount');
    const quantities=numberReadings(values[q]??[]).filter(value=>value.value>0),prices=numberReadings(values[p]??[]).filter(value=>value.value>=0),amounts=numberReadings(values[a]??[]).filter(value=>value.value>=0);
    let best:{q:typeof quantities[number];p:typeof prices[number];a:typeof amounts[number];score:number}|undefined;
    for(const quantity of quantities)for(const price of prices)for(const amount of amounts){const score=(quantity.score+price.score+amount.score)/3+(Math.abs(quantity.value*price.value-amount.value)<.02?.2:0);if(!best||score>best.score)best={q:quantity,p:price,a:amount,score};}
    if(best)for(const [index,value]of [[q,best.q],[p,best.p],[a,best.a]] as const)selected.set(index,{text:value.text,score:value.score,enhanced:false});
    rows[row].forEach(line=>removed.add(line));
  }
  let currency='';
  for(let i=0;i<regions.length;i++){
    const region=regions[i],candidates=values[i]??[];
    let value=selected.get(i);
    if(region.kind==='currency'){
      const read=candidates.filter(candidate=>candidate.score>=.5).sort((a,b)=>b.score-a.score).map(candidate=>recognizedCurrency(candidate.text)).find(Boolean);if(read)currency=read;continue;
    }
    if(region.kind==='number')value=candidates.filter(candidate=>/\d/.test(candidate.text)&&candidate.text.length>=3&&!/\s[a-z]{3,}/i.test(candidate.text)).sort((a,b)=>b.score-a.score)[0];
    else if(['supplier','customer','description'].includes(region.kind))value=chooseText(candidates,region.kind==='supplier');
    else if(!value){const n=numberReadings(candidates)[0];if(n)value={text:n.text,score:n.score,enhanced:false};}
    if(!value)continue;
    const replacement:OcrLine={x:region.x,y:region.y,width:region.width,height:region.height,text:value.text.trim()+(region.unit?' '+region.unit:''),confidence:value.score*100};
    if(region.kind==='number'&&region.source){const label=region.source.text.match(/(?:č[ií]slo|cislo|number|\bno[.:]?|numarasi|\bis(?=\s*:))\s*[:#]?\s*/i);if(label)replacements.set(region.source,{...region.source,text:region.source.text.slice(0,(label.index??0)+label[0].length)+replacement.text});}
    else if(region.kind==='total'&&region.source)replacements.set(region.source,{...region.source,text:(region.source.text.match(/^(?:celkem|grand\s*total|total\s*due|genel\s*toplam)/i)?.[0]??'Total')+' '+replacement.text});
    else if(region.source)replacements.set(region.source,replacement);
    else newLines.push(replacement);
  }
  lines=lines.filter(line=>!removed.has(line)).map(line=>replacements.get(line)??line).concat(newLines);
  if(currency){const total=lines.filter(line=>/^celkem|grand\s*total|total\s*due|genel\s*toplam/.test(normalized(line.text))).sort((a,b)=>b.y-a.y)[0];if(total)total.text+=' '+currency;else lines.push({text:'Currency: '+currency,x:0,y:source.height,width:1,height:1});}
  lines.sort((a,b)=>centerY(a)-centerY(b)||a.x-b.x);
  progress(1);return{text:lines.map(line=>line.text).join('\n'),lines,confidence:lines.length?lines.reduce((sum,line)=>sum+(line.confidence??0),0)/lines.length:0};
  }finally{source.width=0;source.height=0;img.src='';}
}
