import ExcelJS from 'exceljs';
import {amounts, documentTypeLabel, emptyItem, issues, num, totals, uid, validateStore, type Collection, type Invoice} from './model';
import {createTranslator, excelDateFormats, languages, translate, unitLabel, type Language, type MessageKey} from './i18n';
import type {SheetCells} from './xlsx-reader';

export const singleSheetMarker = 'INVOICE_ATELIER_SINGLE_V1';
const ink = '163134', teal = '087F73', pale = 'EDF6F4', blue = '245FA0';
const formula = (formula: string, result: number | string) => ({formula, result});
const fieldKeys = new Set(['number','date','type','currency','supplier','supplierTax','supplierAddress','customer','customerTax','customerAddress','orderNumber','transport','plate','deliveredBy','receivedBy','notes','statedTotal']);

export async function buildSingleSheetExcel(group: Collection, language: Language = 'en'): Promise<Blob> {
  const text = createTranslator(language), book = new ExcelJS.Workbook();
  book.creator = 'Invoice Atelier'; book.created = new Date(group.createdAt); book.modified = new Date();
  book.calcProperties.fullCalcOnLoad = true;
  const sheet = book.addWorksheet(text('Documents'));
  [6,32,11,9,14,11,11,15,14,16].forEach((width, index) => {sheet.getColumn(index + 1).width = width;});
  for (let col = 11; col <= 24; col++) sheet.getColumn(col).hidden = true;
  sheet.properties.defaultRowHeight = 23;
  sheet.views = [{state:'frozen', ySplit:4, showGridLines:false}];
  sheet.pageSetup = {paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:1,
    margins:{left:0.2,right:0.2,top:0.25,bottom:0.25,header:0.1,footer:0.1}};
  sheet.headerFooter.oddFooter = 'Invoice Atelier &R&P / &N';

  function cell(row: number, column: number, value: ExcelJS.CellValue, editable = false) {
    const target = sheet.getCell(row, column); target.value = value === '' ? null : value;
    target.font = {name:'Arial',size:10,color:{argb:editable ? blue : ink}};
    target.alignment = {vertical:'middle',wrapText:true,horizontal:typeof value === 'number' || (value && typeof value === 'object' && 'formula' in value) ? 'right' : 'left'};
    return target;
  }
  function merged(row: number, first: number, last: number, value: ExcelJS.CellValue, editable = false) {
    sheet.mergeCells(row, first, row, last); return cell(row, first, value, editable);
  }
  function band(row: number, title: string, size = 11) {
    const target = merged(row, 1, 10, title); target.fill = {type:'pattern',pattern:'solid',fgColor:{argb:ink}};
    target.font = {name:'Arial',size,bold:true,color:{argb:'FFFFFF'}}; sheet.getRow(row).height = size > 11 ? 31 : 26;
  }
  function fieldRow(row: number, inv: Invoice, left: [MessageKey, keyof Invoice], right?: [MessageKey, keyof Invoice]) {
    const bindings: Record<string,string> = {};
    for (const [entry, labelStart, labelEnd, valueStart, valueEnd] of [[left,1,2,3,right ? 5 : 10], ...(right ? [[right,6,7,8,10]] : [])] as [typeof left,number,number,number,number][]) {
      const [label,key] = entry;
      merged(row,labelStart,labelEnd,text(label)).font = {name:'Arial',size:10,bold:true,color:{argb:ink}};
      const value = key === 'date' ? (inv.date ? new Date(inv.date + 'T00:00:00Z') : null)
        : key === 'type' ? documentTypeLabel(inv.type,language) : key === 'statedTotal' ? num(inv.statedTotal) : String(inv[key] ?? '');
      const target = merged(row,valueStart,valueEnd,value,true);
      if (key === 'date') target.numFmt = excelDateFormats[language];
      if (key === 'statedTotal') target.numFmt = '#,##0.00';
      bindings[valueStart] = key;
      const width = Array.from({length:valueEnd-valueStart+1},(_,i) => sheet.getColumn(valueStart+i).width ?? 12).reduce((a,b) => a+b,0);
      const lines = String(value instanceof Date ? '' : value ?? '').split('\n').reduce((n,line) => n + Math.max(1,Math.ceil(line.length / Math.max(8,width-3))),0);
      sheet.getRow(row).height = Math.max(sheet.getRow(row).height ?? 23, Math.min(409,lines * 14 + 8));
    }
    sheet.getCell(row,11).value = 'fields'; sheet.getCell(row,12).value = inv.id;
    sheet.getCell(row,13).value = JSON.stringify(bindings);
  }
  band(1,group.name,16);
  merged(2,1,10,text('All document details and calculations are on this sheet. Edit the blue cells.')).font = {name:'Arial',size:10,color:{argb:'607773'}};
  sheet.getRow(2).height = 29; sheet.getRow(3).height = 8;
  for (const [start,end,label] of [[1,2,'Currency'],[3,4,'Documents'],[5,6,'Subtotal'],[7,8,'VAT'],[9,10,'Grand total']] as [number,number,MessageKey][]) {
    const target = merged(4,start,end,text(label)); target.fill = {type:'pattern',pattern:'solid',fgColor:{argb:teal}};
    target.font = {name:'Arial',size:10,bold:true,color:{argb:'FFFFFF'}}; target.alignment = {vertical:'middle',horizontal:'center',wrapText:true};
  }
  let row = 11;
  for (const [index,inv] of group.invoices.entries()) {
    const problems = issues(inv); if (problems.length) throw new Error(problems[0]);
    band(row++,text('Document {number}',{number:index + 1}));
    fieldRow(row++,inv,['Document no.','number'],['Document date','date']);
    const currencyRow = row; fieldRow(row++,inv,['Document type','type'],['Currency','currency']);
    sheet.getCell(currencyRow,8).dataValidation = {type:'list',allowBlank:false,formulae:['"TRY,CZK,EUR,USD,GBP"']};
    sheet.getCell(currencyRow,3).dataValidation = {type:'list',allowBlank:false,formulae:[`"${text('Invoice')},${text('Delivery note')}"`]};
    fieldRow(row++,inv,['Supplier','supplier'],['Customer','customer']);
    fieldRow(row++,inv,['Supplier tax ID','supplierTax'],['Customer tax ID','customerTax']);
    fieldRow(row++,inv,['Supplier address','supplierAddress'],['Customer address','customerAddress']);
    const statedRow = row; fieldRow(row++,inv,['Order no.','orderNumber'],['Document total','statedTotal']);
    const headerRow = row++, first = row, last = row + inv.items.length - 1;
    const labels: MessageKey[] = ['No.','Item / description','Quantity','Unit','Unit price','Discount %','VAT %','Net amount','VAT amount','Total'];
    const data = inv.items.map((item,index) => {
      const current = first + index, value = amounts(item)!;
      return [index+1,item.description,num(item.quantity),unitLabel(item.unit,language),num(item.unitPrice),(num(item.discount)||0)/100,(num(item.vat)||0)/100,
        formula(`ROUND(ROUND(C${current}*E${current},2)-ROUND(ROUND(C${current}*E${current},2)*F${current},2),2)`,value.net),
        formula(`ROUND(H${current}*G${current},2)`,value.tax),formula(`ROUND(H${current}+I${current},2)`,value.total),'item',inv.id,item.id];
    });
    sheet.addTable({name:`Atelier_${index+1}`,ref:`A${headerRow}`,headerRow:true,totalsRow:false,style:{theme:'TableStyleMedium2',showRowStripes:true},
      columns:[...labels.map(label => ({name:text(label),filterButton:true})),...['_row','_document','_item'].map(name => ({name,filterButton:false}))],rows:data});
    sheet.getRow(headerRow).height = 36;
    for (let column = 1; column <= 10; column++) {
      const target = cell(headerRow,column,text(labels[column-1])); target.fill = {type:'pattern',pattern:'solid',fgColor:{argb:teal}};
      target.font = {name:'Arial',size:10,bold:true,color:{argb:'FFFFFF'}}; target.alignment = {vertical:'middle',horizontal:'center',wrapText:true};
    }
    for (let current = first; current <= last; current++) {
      for (let column = 1; column <= 10; column++) {
        const target = cell(current,column,sheet.getCell(current,column).value,column>=2 && column<=7);
        if ((current-first)%2 === 0) target.fill = {type:'pattern',pattern:'solid',fgColor:{argb:pale}};
        if ([5,8,9,10].includes(column)) target.numFmt = '#,##0.00';
        if ([6,7].includes(column)) target.numFmt = '0.0%';
        target.border = {bottom:{style:'hair',color:{argb:'DEE8E4'}}};
      }
      const description = inv.items[current-first].description;
      sheet.getRow(current).height = Math.min(409,Math.max(26,description.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/30)),0)*14+8));
      for (const column of [3,5,6,7]) sheet.getCell(current,column).dataValidation = {type:'decimal',operator:column===3?'greaterThan':column===5?'greaterThanOrEqual':'between',formulae:column>=6?[0,1]:[0],showErrorMessage:true,errorTitle:text('Review'),error:text(column===3?'Row {row}: quantity must be greater than zero.':column===5?'Row {row}: enter a valid unit price.':'Row {row}: {field} must be between 0 and 100%.',{row:current-first+1,field:text(column===6?'Discount':'VAT')})};
    }
    row = last + 2; const totalRow = row + 2, value = totals(inv);
    const deliveries: [MessageKey, keyof Invoice][] = [['Transport method','transport'],['Vehicle registration','plate'],['Delivered by','deliveredBy'],['Received by','receivedBy']];
    for (const [offset,entry] of deliveries.entries()) {
      fieldRow(row+offset,inv,entry);
      // The right side contains totals, so keep the editable delivery value on the left.
      sheet.unMergeCells(row+offset,3,row+offset,10); sheet.mergeCells(row+offset,3,row+offset,5);
      const label = ['Subtotal','VAT','Grand total','Difference'][offset] as MessageKey;
      merged(row+offset,8,9,text(label)).font = {name:'Arial',size:10,bold:true,color:{argb:ink}};
      const result = offset === 0 ? value.net : offset === 1 ? value.tax : offset === 2 ? value.total : num(inv.statedTotal) === null ? '' : Math.round((value.total-num(inv.statedTotal)!)*100)/100;
      const expression = offset<3 ? `SUM(${['H','I','J'][offset]}${first}:${['H','I','J'][offset]}${last})` : `IF(H${statedRow}="","",ROUND(J${totalRow}-H${statedRow},2))`;
      const target = cell(row+offset,10,formula(expression,result)); target.numFmt='#,##0.00'; target.font={name:'Arial',size:10,bold:true,color:{argb:ink}};
      if (offset===2) for(let column=8;column<=10;column++) sheet.getCell(row+offset,column).fill={type:'pattern',pattern:'solid',fgColor:{argb:'CDECE3'}};
    }
    fieldRow(row+4,inv,['Notes','notes']);
    merged(row+5,1,2,text('Source photo')); merged(row+5,3,10,inv.sourceName);
    const helper = index + 2;
    sheet.getCell(helper,14).value = inv.id;
    sheet.getCell(helper,15).value = formula(`H${currencyRow}`,inv.currency);
    sheet.getCell(helper,16).value = formula(`J${row}`,value.net);
    sheet.getCell(helper,17).value = formula(`J${row+1}`,value.tax);
    sheet.getCell(helper,18).value = formula(`J${totalRow}`,value.total);
    row += 8;
  }
  const end = Math.max(2,group.invoices.length+1);
  for (const [index,currency] of ['TRY','CZK','EUR','USD','GBP'].entries()) {
    const current=index+5, docs=group.invoices.filter(inv=>inv.currency===currency);
    merged(current,1,2,currency);
    merged(current,3,4,formula(`COUNTIFS($O$2:$O$${end},A${current})`,docs.length));
    for (const [start,column,field] of [[5,'P','net'],[7,'Q','tax'],[9,'R','total']] as const) {
      merged(current,start,start+1,formula(`SUMIFS($${column}$2:$${column}$${end},$O$2:$O$${end},A${current})`,Math.round(docs.reduce((n,inv)=>n+totals(inv)[field],0)*100)/100)).numFmt='#,##0.00';
    }
    for(let column=1;column<=10;column++) if(index%2===0) sheet.getCell(current,column).fill={type:'pattern',pattern:'solid',fgColor:{argb:pale}};
  }
  // Source images and stable record IDs remain inside this same worksheet. They
  // are excluded from printing and previews, and never create an extra tab.
  sheet.getCell('X1').value=singleSheetMarker;
  const metadata={language,group:{...group,invoices:group.invoices.map(inv=>({...inv,type:inv.type==='Teslimat fişi'?'delivery-note':'invoice'}))}};
  const json=JSON.stringify(metadata);for(let start=0;start<json.length;start+=28000) sheet.getCell(2+start/28000,24).value=json.slice(start,start+28000);
  sheet.pageSetup.printArea=`A1:J${Math.max(9,row-3)}`;
  const bytes=await book.xlsx.writeBuffer();return new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

export function readSingleSheet(sheets: SheetCells[], fallbackLanguage: Language): Collection | undefined {
  const sheet=sheets.find(sheet=>sheet.cells.get(1)?.get(24)===singleSheetMarker);if(!sheet)return;
  const invalid=()=>new Error('The edited Excel file contains invalid document details. Check the document sheet.');
  let json='';for(const [row,values] of [...sheet.cells].sort((a,b)=>a[0]-b[0]))if(row>1)json+=String(values.get(24)??'');
  const metadata=JSON.parse(json),group=metadata.group as Collection;
  if(group&&Array.isArray(group.invoices))for(const invoice of group.invoices){if((invoice.type as string)==='invoice')invoice.type='Fatura';else if((invoice.type as string)==='delivery-note')invoice.type='Teslimat fişi';}
  validateStore({version:1,collections:[group],draft:[]});
  const language:Language=languages.includes(metadata.language)?metadata.language:fallbackLanguage;
  const docs=new Map(group.invoices.map(inv=>[inv.id,inv])),originals=new Map(group.invoices.flatMap(inv=>inv.items.map(item=>[item.id,{item,documentId:inv.id}] as const)));
  const replacements=new Map(group.invoices.map(inv=>[inv.id,[] as Invoice['items']])),seen=new Set<string>();
  const seenFields=new Map(group.invoices.map(inv=>[inv.id,new Set<string>()]));
  let activeDocument:Invoice|undefined,withinItems=false;
  for(const [row,values] of [...sheet.cells].sort((a,b)=>a[0]-b[0])) {
    let kind=values.get(11);
    if(kind==='_row'){withinItems=true;continue;}
    const addedRow=withinItems&&(kind===undefined||kind==='')&&[2,3,4,5].some(column=>values.get(column)!==undefined&&values.get(column)!=='');
    if(addedRow)kind='item';
    if(kind!=='fields'&&kind!=='item')continue;
    const inv=addedRow?activeDocument:docs.get(String(values.get(12)));if(!inv)throw invalid();
    activeDocument=inv;
    if(kind==='fields') {
      withinItems=false;
      const fields=JSON.parse(String(values.get(13)));
      if(!fields||typeof fields!=='object'||Array.isArray(fields))throw invalid();
      for(const [column,key] of Object.entries(fields)) {
        if(![3,8].includes(Number(column))||typeof key!=='string'||!fieldKeys.has(key))throw invalid();
        seenFields.get(inv.id)!.add(key);
        const value=values.get(Number(column));
        if(key==='date') {
          if(value===undefined||value==='') inv.date='';
          else if(typeof value==='number'&&value>=1&&value<2958466) inv.date=new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);
          else inv.date=String(value);
        } else if(key==='type') {
          if(languages.some(lang=>translate('Delivery note',lang)===value))inv.type='Teslimat fişi';
          else if(languages.some(lang=>translate('Invoice',lang)===value))inv.type='Fatura';else throw invalid();
        } else (inv as unknown as Record<string,unknown>)[key]=String(value??'');
      }
    } else {
      const identity=String(values.get(13)??''),prior=originals.get(identity),original=prior?.documentId===inv.id?prior.item:undefined;
      const item={...(original??emptyItem())};if(seen.has(item.id))item.id=uid();seen.add(item.id);
      item.description=String(values.get(2)??'');item.quantity=String(values.get(3)??'');item.unit=String(values.get(4)??'');item.unitPrice=String(values.get(5)??'');
      item.discount=String(Number(values.get(6)??0)*100);item.vat=String(Number(values.get(7)??0)*100);
      if(original&&item.unit===unitLabel(original.unit,language))item.unit=original.unit;
      replacements.get(inv.id)!.push(item);
    }
  }
  for(const inv of group.invoices){inv.items=replacements.get(inv.id)!;if(seenFields.get(inv.id)!.size!==fieldKeys.size||issues(inv).length)throw invalid();}
  validateStore({version:1,collections:[group],draft:[]});return group;
}
