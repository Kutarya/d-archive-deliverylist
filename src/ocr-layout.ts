import type {OcrLine} from './platform';
import {num} from './model';

export const normalized = (text:string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toLowerCase();
export const centerX = (token:OcrLine) => token.x+token.width/2;
export const centerY = (token:OcrLine) => token.y+token.height/2;
const description = /nazev|description|product|item(?:\s*name)?|urun|malzeme/;
const quantity = /mno(?:z|stv)|[qo0]uantity|\b[qo0]ty\b|miktar/;
const price = /cena|price|fiyat/;
const amount = /celkem|total|amount|tutar|toplam/;
export type TableLayout = {description:OcrLine;quantity:OcrLine;price:OcrLine;amount?:OcrLine;quantityLeft:number;priceLeft:number;amountLeft:number;right:number;top:number;columns:{kind:'quantity'|'price'|'discount'|'vat'|'amount';x:number;left:number;right:number}[]};
export function findTable(tokens:OcrLine[]):TableLayout|undefined {
  for(const name of tokens.filter(token=>description.test(normalized(token.text)))){
    const nearby=tokens.filter(token=>Math.abs(centerY(token)-centerY(name))<=Math.max(75,name.height*2.5));
    const q=nearby.find(token=>centerX(token)>centerX(name)&&quantity.test(normalized(token.text)));
    if(!q)continue;
    const p=nearby.filter(token=>centerX(token)>centerX(q)&&price.test(normalized(token.text))&&!amount.test(normalized(token.text))).sort((a,b)=>a.x-b.x)[0];
    if(!p)continue;
    const a=nearby.filter(token=>centerX(token)>centerX(p)&&amount.test(normalized(token.text))).sort((a,b)=>a.x-b.x)[0];
    const gap=centerX(p)-centerX(q);
    const optional=nearby.filter(token=>centerX(token)>centerX(p)&&(!a||centerX(token)<centerX(a))&&/discount|disc\.?|sleva|indirim|\bvat\b|\bdph\b|\bkdv\b/.test(normalized(token.text))).map(token=>({kind:/discount|disc|sleva|indirim/.test(normalized(token.text))?'discount' as const:'vat' as const,x:centerX(token)}));
    const anchors=[{kind:'quantity' as const,x:centerX(q)},{kind:'price' as const,x:centerX(p)},...optional,...(a?[{kind:'amount' as const,x:centerX(a)}]:[])].sort((a,b)=>a.x-b.x);
    const right=a?a.x+a.width+gap*.45:centerX(p)+gap*1.5;
    const columns=anchors.map((column,index)=>({...column,left:index?(anchors[index-1].x+column.x)/2:centerX(q)-gap/2,right:index+1<anchors.length?(column.x+anchors[index+1].x)/2:right}));
    return {description:name,quantity:q,price:p,amount:a,quantityLeft:centerX(q)-gap/2,priceLeft:(centerX(q)+centerX(p))/2,amountLeft:a?(centerX(p)+centerX(a))/2:centerX(p)+gap/2,right,top:Math.max(name.y+name.height,q.y+q.height,p.y+p.height),columns};
  }
}
export function tableRows(tokens:OcrLine[],table:TableLayout):OcrLine[][] {
  const footer=tokens.filter(token=>token.y>table.top&&/^(?:celkem|grand\s*total|total\s*due|subtotal|sub\s*total|net\s*total|ara\s*toplam|genel\s*toplam|toplam|zpusob|predal|prevzal|razitko)/.test(normalized(token.text))).sort((a,b)=>a.y-b.y)[0];
  const body=tokens.filter(token=>token.y>table.top+3&&(!footer||centerY(token)<footer.y-2));
  const rows:OcrLine[][]=[];
  for(const token of [...body].sort((a,b)=>centerY(a)-centerY(b))){
    const row=rows.find(row=>Math.abs(centerY(row[0])-centerY(token))<Math.max(row[0].height,token.height)*.8);
    if(row)row.push(token);else rows.push([token]);
  }
  return rows.filter(row=>row.some(token=>centerX(token)<table.quantityLeft&&/[a-zÀ-ž]/i.test(token.text)&&!/^\d+\s*$/.test(token.text))&&row.some(token=>centerX(token)>=table.quantityLeft&&/\d/.test(token.text))).map(row=>row.sort((a,b)=>a.x-b.x));
}
export function partyValue(tokens:OcrLine[],label:RegExp,joinWords=true):OcrLine|undefined {
  const anchor=tokens.find(token=>label.test(normalized(token.text)));
  if(!anchor)return;
  const peers=tokens.filter(token=>token!==anchor&&/dodavatel|odberatel|supplier|customer|buyer|seller|tedarikci|musteri|alici|satici/.test(normalized(token.text))&&token.x>anchor.x+anchor.width);
  const right=peers.length?Math.min(...peers.map(token=>token.x)):Infinity;
  const candidates=tokens.filter(token=>token!==anchor&&token.x>=anchor.x+anchor.width-Math.max(10,token.height*.3)&&centerX(token)<right&&Math.abs(centerY(token)-centerY(anchor))<Math.max(token.height,anchor.height)*1.4&&!/bank|spojen|dodavatel|odberatel|supplier|customer|tax|\bdate\b|ze\s*dne|vystavil/.test(normalized(token.text))).sort((a,b)=>Math.abs(centerY(a)-centerY(anchor))-Math.abs(centerY(b)-centerY(anchor)));
  // Paddle already supplies complete lines; Tesseract supplies individual words.
  if(!joinWords)return candidates.filter(token=>/[a-zÀ-ž]/i.test(token.text)).sort((a,b)=>Math.abs(centerY(a)-centerY(anchor))-Math.abs(centerY(b)-centerY(anchor))||a.x-b.x)[0];
  const parts=candidates.filter(token=>Math.abs(centerY(token)-centerY(candidates[0]))<Math.max(token.height,candidates[0].height)*.65).sort((a,b)=>a.x-b.x);
  if(!parts.length||!parts.some(token=>/[a-zÀ-ž]/i.test(token.text)))return;
  return {...parts[0],text:parts.map(token=>token.text).join(' '),width:Math.max(...parts.map(token=>token.x+token.width))-parts[0].x};
}

export function ocrNumber(value:string):string|undefined {
  let text=value.trim().replace(/\|/g,'').replace(/(?:Kč|CZK|TRY|EUR|USD|GBP|TL|€|₺|£|\$)/gi,'').replace(/(?:\s|(?<=\d))(?:ks|kg|pcs|adet|m2|m²|m|l)$/i,'').trim().replace(/(?<=\d)\s+(?=\d{3}(?:[.,]|$))/g,'');
  // Recognition can confuse similarly shaped glyphs inside a numeric cell.
  // Restrict correction to numeric-looking cells, never names/descriptions.
  if(/^[+\-]?[\dOoGgIiLlSsZz.,–—-]+$/.test(text)&&(/\d/.test(text)||text.replace(/[^a-z]/gi,'').length>=3))text=text.replace(/[Oo]/g,'0').replace(/[Gg]/g,'6').replace(/[IiLl]/g,'1').replace(/[Ss]/g,'5').replace(/[Zz]/g,'2');
  text=text.replace(/[.,]{2,}$/,'').replace(/(?<=\d)[-–—]+$/,'');
  return num(text)!==null?text:undefined;
}

// Locate a long, thin number box near its printed label. All dimensions are
// relative to the detected header; this also works after resizing the photo.
export function numberBox(pixels:Uint8ClampedArray,width:number,height:number,header:OcrLine):{x:number;y:number;width:number;height:number}|undefined {
  const x0=Math.max(0,Math.floor(header.x+header.width*.35)),x1=Math.min(width-1,Math.ceil(header.x+header.width+8));
  const y0=Math.max(0,Math.floor(header.y-header.height*.25)),y1=Math.min(height-1,Math.ceil(header.y+header.height*1.15));
  const grey=(x:number,y:number)=>{const i=(y*width+x)*4;return(pixels[i]+pixels[i+1]+pixels[i+2])/3;};
  let sum=0,count=0;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){sum+=grey(x,y);count++;}
  const threshold=sum/count-18,span=x1-x0;
  const candidates:{y:number;slope:number;score:number}[]=[];
  for(let slope=-.08;slope<=.081;slope+=.01)for(let y=y0;y<=y1;y++){
    let hits=0;for(let x=x0;x<=x1;x++){const row=Math.round(y+(x-x0)*slope);if(row>=y0&&row<=y1&&grey(x,row)<threshold)hits++;}
    if(hits>span*.34)candidates.push({y,slope,score:hits});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const peaks:typeof candidates=[];for(const candidate of candidates)if(peaks.every(peak=>Math.abs(peak.y-candidate.y)>Math.max(4,header.height*.08)))peaks.push(candidate);
  for(const first of peaks.slice(0,8))for(const second of peaks.slice(0,8)){
    const gap=second.y-first.y;if(gap<header.height*.3||gap>header.height*1.1)continue;
    const sides:number[]=[];
    for(let x=x0;x<=x1;x++){
      const top=Math.round(first.y+(x-x0)*first.slope)+2,bottom=Math.round(second.y+(x-x0)*second.slope)-2;let hits=0;
      for(let y=top;y<=bottom;y++)if(grey(x,y)<threshold)hits++;
      if(hits>(bottom-top)*.8)sides.push(x);
    }
    if(sides.length<2)continue;
    const left=sides[0],right=sides.at(-1)!;
    if(right-left<span*.35)continue;
    const top=first.y+(left-x0)*first.slope,bottom=second.y+(left-x0)*second.slope;
    return{x:left+2,y:top-header.height*.12,width:right-left-2,height:bottom-top+header.height*.14};
  }
}
