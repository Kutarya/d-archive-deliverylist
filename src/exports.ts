import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { documentTypeLabel, amounts, totals, num, money, uid, validateStore, emptyItem, issues, type Collection, type Invoice } from './model';
import { dataUrl } from './platform';
import { readXlsxXml } from './xlsx-reader';
import { createTranslator, dateText, languages, locales, translate, unitLabel, type Language } from './i18n';
import {readSingleSheet} from './single-sheet-excel';
export {buildSingleSheetExcel as buildExcel} from './single-sheet-excel';
export type ExcelPreview = { name: string; rows: string[][]; columns: number[]; merges?:{row:number;column:number;rowSpan:number;colSpan:number}[] }[];
export async function readExcel(file: File,language:Language='en'): Promise<{group: Collection; preview: ExcelPreview}> {
  if(file.size>70*1024*1024)throw new Error('The Excel file exceeds the 70 MB limit.');
  const sheets=await readXlsxXml(await file.arrayBuffer(),language);
  const preview=sheets.filter(s=>s.state==='visible').map(s=>{
    let maxRow=1,maxCol=1;
    for(const [row,cells] of s.cells)for(const [col,value]of cells)if(!s.hidden.has(col)&&value!==''){maxRow=Math.max(maxRow,row);maxCol=Math.max(maxCol,col);}
    const lastRow=Math.min(250,maxRow),lastCol=Math.min(30,maxCol);
    const visible=Array.from({length:lastCol},(_,i)=>i+1).filter(n=>!s.hidden.has(n));
    const rows=Array.from({length:lastRow},(_,i)=>{const row=s.display.get(i+1);const values=visible.map(n=>String(row?.get(n)??''));if(s.hidden.has(1)&&row?.get(1)&&s.merges.some(m=>m.row===i+1&&m.column===1))values[0]=String(row.get(1));return values;});
    return {name:s.name,rows,columns:visible,merges:s.merges};
  });
  const single=readSingleSheet(sheets,language);if(single)return {group:single,preview};
  const meta=sheets.find(s=>s.name==='_InvoiceData') ?? sheets.find(s=>s.name==='_AtolyeVeri');
  if(meta&&['INVOICE_ATELIER_V1','FATURA_ATOLYESI_V1'].includes(String(meta.cells.get(1)?.get(1)))) {
    let json='';for(const [r,values] of [...meta.cells].sort((a,b)=>a[0]-b[0]))if(r>1)json+=String(values.get(1)??'');
    const parsed=JSON.parse(json);
    if(parsed&&Array.isArray(parsed.invoices))for(const invoice of parsed.invoices)if(invoice){if(invoice.type==='invoice')invoice.type='Fatura';else if(invoice.type==='delivery-note')invoice.type='Teslimat fişi';}
    const group=parsed as Collection;validateStore({version:1,collections:[group],draft:[]});
    // Reconcile editable Excel inputs with the metadata so re-importing never restores stale prices.
    const itemNames=languages.map(lang=>translate('Items',lang));
    const inputs=sheets.find(s=>itemNames.includes(s.name));
    const inputLanguage=languages.find(lang=>translate('Items',lang)===inputs?.name)??language;
    const invoiceInputs=sheets.find(s=>languages.some(lang=>translate('Invoices',lang)===s.name));
    if(invoiceInputs)for(const [r,row]of invoiceInputs.cells){
      if(r<5)continue;const inv=group.invoices.find(i=>i.id===String(row.get(1)));if(!inv)continue;
      inv.number=String(row.get(2)??'');inv.supplier=String(row.get(5)??'');inv.customer=String(row.get(6)??'');inv.currency=String(row.get(7)??'');inv.statedTotal=String(row.get(11)??'');inv.notes=String(row.get(13)??'');
      const type=String(row.get(3)??'');if(languages.some(lang=>translate('Delivery note',lang)===type))inv.type='Teslimat fişi';else if(languages.some(lang=>translate('Invoice',lang)===type))inv.type='Fatura';
      const date=row.get(4);if(typeof date==='number')inv.date=new Date(Date.UTC(1899,11,30)+date*86400000).toISOString().slice(0,10);else if(!date)inv.date='';
    }
    if(inputs){
      const itemIds=new Map(group.invoices.flatMap(inv=>inv.items.map(item=>[item.id,item] as const))),counts=new Map<string,number>(),seen=new Set<string>();
      const replacements=new Map(group.invoices.map(inv=>[inv.id,[] as Invoice['items']]));
      for(const [r,row] of [...inputs.cells].sort((a,b)=>a[0]-b[0])){
        if(r<5||![1,2,3,4,5,6].some(col=>row.get(col)!==undefined&&row.get(col)!==''))continue;
        const inv=group.invoices.find(i=>i.id===String(row.get(1)));
        if(!inv)throw new Error('The edited Excel file contains invalid document details. Check the Items sheet.');
        const priorRows=counts.get(inv.id)||0;counts.set(inv.id,priorRows+1);
        const key=String(row.get(15)??''),original=key?itemIds.get(key):inv.items[priorRows];
        const item={...(original??emptyItem())};if(seen.has(item.id))item.id=uid();seen.add(item.id);
        const val=(c:number)=>row.get(c);
        item.description=String(val(3)??'');item.quantity=String(val(4)??'');item.unit=String(val(5)??'');item.unitPrice=String(val(6)??'');item.discount=String(Number(val(7)??0)*100);item.vat=String(Number(val(8)??0)*100);
        if(original&&item.unit===unitLabel(original.unit,inputLanguage))item.unit=original.unit;
        replacements.get(inv.id)!.push(item);
      }
      for(const inv of group.invoices){inv.items=replacements.get(inv.id)!;if(issues(inv).length||!['TRY','CZK','EUR','USD','GBP'].includes(inv.currency))throw new Error('The edited Excel file contains invalid document details. Check the Items sheet.');}
    }
    return {group,preview};
  }
  const now=new Date().toISOString();
  return {group:{id:uid(),name:file.name.replace(/\.xlsx$/i,''),createdAt:now,updatedAt:now,invoices:[],importedFile:await dataUrl(file),importedName:file.name},preview};
}
let fontCache: Promise<[string,string]> | undefined;
async function fonts() {
  fontCache ??= Promise.all(['NotoSans-Regular.ttf','NotoSans-Bold.ttf'].map(async n=>{
    const response=await fetch(new URL(`./fonts/${n}`,document.baseURI));if(!response.ok)throw new Error('Could not load the PDF font.');
    return (await dataUrl(await response.blob())).split(',')[1];
  })) as Promise<[string,string]>;
  return fontCache;
}
export async function buildPdf(group: Collection,language:Language='en'): Promise<Blob> {
  const text=createTranslator(language),formatMoney=(value:number,currency:string)=>money(value,currency,language);
  const formatNumber=(value:string)=>new Intl.NumberFormat(locales[language],{maximumFractionDigits:6}).format(num(value)||0);
  const pdf=new jsPDF({unit:'mm',format:'a4'}); const [regular,bold]=await fonts();
  pdf.addFileToVFS('Noto-Regular.ttf',regular);pdf.addFont('Noto-Regular.ttf','Noto','normal');pdf.addFileToVFS('Noto-Bold.ttf',bold);pdf.addFont('Noto-Bold.ttf','Noto','bold');pdf.setFont('Noto');
  for(let idx=0;idx<group.invoices.length;idx++) {
    const inv=group.invoices[idx];if(idx)pdf.addPage();
    pdf.setFillColor(22,49,52);pdf.rect(0,0,210,31,'F');pdf.setTextColor(255);pdf.setFontSize(19);pdf.setFont('Noto','bold');pdf.text(documentTypeLabel(inv.type,language).toLocaleUpperCase(locales[language]),14,17);pdf.setFontSize(10);pdf.setFont('Noto','normal');pdf.text('Invoice Atelier',14,25);pdf.text((inv.number+'').slice(0,40),196,18,{align:'right'});
    const meta=[[text("Document no."),inv.number,text("Date"),inv.date?dateText(inv.date+'T00:00:00Z',language,true):text("Not specified")],[text("Supplier"),inv.supplier,text("Customer"),inv.customer],[text("Tax ID"),inv.supplierTax,text("Tax ID"),inv.customerTax],[text("Address"),inv.supplierAddress,text("Address"),inv.customerAddress],[text("Order no."),inv.orderNumber,text("Currency"),inv.currency]];
    autoTable(pdf,{startY:39,body:meta,theme:'plain',styles:{font:'Noto',fontSize:8.5,cellPadding:2.4,overflow:'linebreak',textColor:[22,49,52]},columnStyles:{0:{cellWidth:26,fontStyle:'bold'},1:{cellWidth:65},2:{cellWidth:26,fontStyle:'bold'},3:{cellWidth:65}},margin:{left:14,right:14}});
    const y=(pdf as any).lastAutoTable.finalY+7;
    autoTable(pdf,{startY:y,head:[[text("Item / description"),text("Quantity"),text("Unit price"),text("Disc. %"),text("VAT %"),text("Total")]],body:inv.items.map(i=>[i.description,`${formatNumber(i.quantity)} ${unitLabel(i.unit,language)}`,formatMoney(num(i.unitPrice)!,inv.currency),formatNumber(i.discount),formatNumber(i.vat),formatMoney(amounts(i)!.total,inv.currency)]),theme:'striped',styles:{font:'Noto',fontSize:8.5,cellPadding:3.2,overflow:'linebreak'},headStyles:{fillColor:[8,127,115],fontStyle:'bold'},alternateRowStyles:{fillColor:[239,247,245]},columnStyles:{0:{cellWidth:58},1:{cellWidth:25},2:{cellWidth:30,halign:'right'},3:{cellWidth:17,halign:'right'},4:{cellWidth:17,halign:'right'},5:{cellWidth:35,halign:'right'}},margin:{left:14,right:14,top:16,bottom:16}});
    const t=totals(inv);
    autoTable(pdf,{startY:(pdf as any).lastAutoTable.finalY+6,body:[[text("Subtotal"),formatMoney(t.net,inv.currency)],[text("VAT"),formatMoney(t.tax,inv.currency)],[text("Grand total"),formatMoney(t.total,inv.currency)]],theme:'plain',styles:{font:'Noto',fontSize:10,cellPadding:2.5},columnStyles:{0:{fontStyle:'bold'},1:{halign:'right'}},margin:{left:112,right:14},didParseCell:data=>{if(data.row.index===2){data.cell.styles.fillColor=[237,246,244];data.cell.styles.fontStyle='bold';}}});
    const bottom=(pdf as any).lastAutoTable.finalY+6;
    const notes=[inv.notes,inv.transport?text('Transport: {transport}',{transport:`${inv.transport} ${inv.plate}`}):'',inv.receivedBy?text('Received by: {name}',{name:inv.receivedBy}):'',inv.deliveredBy?text('Delivered by: {name}',{name:inv.deliveredBy}):''].filter(Boolean).join('\n');
    if(notes)autoTable(pdf,{startY:bottom,body:[[notes]],theme:'plain',styles:{font:'Noto',fontSize:8.5,cellPadding:2},margin:{left:14,right:14,bottom:18}});
  }
  for(let page=1;page<=pdf.getNumberOfPages();page++){pdf.setPage(page);pdf.setFont('Noto','normal');pdf.setFontSize(8);pdf.setTextColor(110);pdf.text('Invoice Atelier',14,288);pdf.text(`${page} / ${pdf.getNumberOfPages()}`,196,288,{align:'right'});}
  return pdf.output('blob');
}
export async function invoicePng(inv: Invoice,language:Language='en'): Promise<Blob> {
  const text=createTranslator(language);
  const {getDocument}=await import('./pdf-runtime');
  const now=new Date().toISOString();const blob=await buildPdf({id:inv.id,name:inv.number,createdAt:now,updatedAt:now,invoices:[inv]},language);
  const task=getDocument({data:new Uint8Array(await blob.arrayBuffer())});
  try {
    const pdf=await task.promise;
    if(pdf.numPages>12)throw new Error(text("This document is too long for a single image. Use the PDF export to include every page."));
    const first=await pdf.getPage(1);const viewport=first.getViewport({scale:2});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height)*pdf.numPages;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let n=1;n<=pdf.numPages;n++) {
      const page=await pdf.getPage(n),view=page.getViewport({scale:2}),part=document.createElement('canvas');part.width=Math.ceil(view.width);part.height=Math.ceil(view.height);
      await page.render({canvas:part,viewport:view}).promise;ctx.drawImage(part,0,(n-1)*Math.ceil(viewport.height));part.width=0;part.height=0;
    }
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error(text("Could not create the image."))),'image/png'));
  }finally{await task.destroy();}
}
