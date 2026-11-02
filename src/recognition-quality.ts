import {invoiceProblems,num,totalMismatch,totals,type Invoice} from './model';
import type {OcrLine} from './platform';

// Compare whole readings; a long page of noise must not beat usable item values.
export function recognitionScore(invoice:Invoice):number{
  let score=invoice.number?8:0;
  score+=Number(!!invoice.date)+Number(!!invoice.supplier)*2+Number(!!invoice.customer)*2;
  const invalidItems=new Set(invoiceProblems(invoice).flatMap(problem=>problem.itemId?[problem.itemId]:[]));
  score+=invoice.items.slice(0,50).reduce((sum,item)=>sum+(invalidItems.has(item.id)?-1:5),0);
  const stated=num(invoice.statedTotal);
  if(stated!==null){score+=2;score+=totalMismatch(invoice)?-8:3;}
  return Math.max(0,score);
}
export function hasCompleteReading(invoice:Invoice):boolean{
  // Optional company details must not trigger another heavy reader. Every
  // detected item still needs valid values, and the printed total must agree.
  return invoiceProblems(invoice).every(problem=>problem.field==='supplier')
    &&Number.isFinite(totals(invoice).total)&&!totalMismatch(invoice);
}

export function refineTokens(original:OcrLine[],refined:OcrLine[]):OcrLine[]{
  // The contrast pass can remove a printed blue table heading while recovering
  // faint writing. Keep the original context outside its replacement words.
  return original.filter(word=>!refined.some(next=>{
    const width=Math.max(0,Math.min(word.x+word.width,next.x+next.width)-Math.max(word.x,next.x));
    const height=Math.max(0,Math.min(word.y+word.height,next.y+next.height)-Math.max(word.y,next.y));
    return width*height>=word.width*word.height*.5;
  })).concat(refined);
}
