import {useId} from 'react';
import {Plus,X,FileText,FileSpreadsheet,AlertCircle} from 'lucide-react';
import {amounts,emptyItem,invoiceProblems,money,num,totalMismatch,totals,type Invoice,type Item} from './model';
import {useLanguage,useTranslation} from './LanguageContext';
import {locales,type MessageKey} from './i18n';

type Props={invoice:Invoice;onChange:(invoice:Invoice)=>void;disabled?:boolean;showValidation?:boolean;compact?:boolean};
export function InvoiceEditor({invoice:doc,onChange,disabled=false,showValidation=false,compact=false}:Props){
  const t=useTranslation(),language=useLanguage(),locale=locales[language],prefix=useId();
  const problems=invoiceProblems(doc,language),calculated=totals(doc);
  const error=(field:string,itemId?:string)=>showValidation?problems.find(problem=>problem.field===field&&problem.itemId===itemId)?.message:undefined;
  const patch=(key:keyof Invoice,value:Invoice[keyof Invoice])=>onChange({...doc,[key]:value});
  const patchItem=(itemId:string,key:keyof Item,value:string)=>patch('items',doc.items.map(item=>item.id===itemId?{...item,[key]:value}:item));
  const field=(key:keyof Invoice,label:MessageKey,type='text',placeholder?:MessageKey)=>{
    const message=error(key),id=`${prefix}-${key}`;
    return <label className={`field ${message?'has-error':''}`}><span>{t(label)}</span><input aria-label={t(label)} aria-invalid={!!message} aria-describedby={message?id:undefined} lang={language} type={type} value={String(doc[key]??'')} onChange={event=>patch(key,event.target.value)} placeholder={placeholder?t(placeholder):undefined}/>{message&&<small className="field-error" id={id}>{message}</small>}</label>;
  };
  const numericFields=['quantity','unit','unitPrice','discount','vat'] as const;
  const labels:Record<typeof numericFields[number],MessageKey>={quantity:'Quantity',unit:'Unit',unitPrice:'Unit price',discount:'Discount %',vat:'VAT %'};
  const input=(item:Item,index:number,key:'description'|typeof numericFields[number])=>{
    const message=error(key,item.id),id=`${prefix}-${item.id}-${key}`;
    const aria=key==='description'?t('{row}. item name',{row:index+1}):t('{row}. {field}',{row:index+1,field:key==='vat'?t('VAT'):key==='discount'?t('Discount').toLocaleLowerCase(locale):t(labels[key]).toLocaleLowerCase(locale)});
    return <label className={message?'has-error':''}><span>{t(key==='description'?'Item / description':labels[key])}</span><input aria-label={aria} aria-invalid={!!message} aria-describedby={message?id:undefined} inputMode={key==='description'||key==='unit'?'text':'decimal'} value={item[key]} onChange={event=>patchItem(item.id,key,event.target.value)} placeholder={key==='discount'||key==='vat'?'0':key==='description'?t('Item name'):'—'}/>{message&&<small className="field-error" id={id}>{message}</small>}</label>;
  };
  return <section className={`edit-panel ${compact?'compact-editor':''}`}>
    <div className="panel-head"><span><FileText size={18}/>{t('Document details')}</span><span className="label-pill">{t('Editable')}</span></div>
    <fieldset className="form-body" disabled={disabled}>
      <div className="form-grid">
        {field('number','Document number *','text','e.g. DL-2026-001')}{field('date','Document date','date')}
        <label className="field"><span>{t('Document type')}</span><select aria-label={t('Document type')} value={doc.type} onChange={event=>patch('type',event.target.value as Invoice['type'])}><option value="Fatura">{t('Invoice')}</option><option value="Teslimat fişi">{t('Delivery note')}</option></select></label>
        <label className="field"><span>{t('Currency')}</span><select aria-label={t('Currency')} value={doc.currency} aria-invalid={!!error('currency')} onChange={event=>patch('currency',event.target.value)}>{['TRY','CZK','EUR','USD','GBP'].map(currency=><option key={currency}>{currency}</option>)}</select>{error('currency')&&<small className="field-error">{error('currency')}</small>}</label>
        {field('supplier','Supplier / seller','text','Company or person name')}{field('customer','Buyer / customer','text','Company or person name')}
      </div>
      <details className="extra-fields"><summary>{t('Tax, address and delivery details')}</summary><div className="form-grid">
        {field('supplierTax','Supplier tax ID')}{field('customerTax','Customer tax ID')}{field('supplierAddress','Supplier address')}{field('customerAddress','Customer address')}{field('orderNumber','Order number')}{field('transport','Transport method')}{field('plate','Vehicle registration')}{field('deliveredBy','Delivered by')}{field('receivedBy','Received by')}
      </div></details>
      <div className="items-heading"><h3>{t('Items and amounts')}</h3><button type="button" className="text-button" onClick={()=>patch('items',[...doc.items,emptyItem()])}><Plus size={16}/>{t('Add row')}</button></div>
      {error('items')&&<p className="field-error">{error('items')}</p>}
      <div className="items-editor-scroll"><div className="item-labels"><span>{t('Item / description')}</span>{numericFields.map(key=><span key={key}>{t(labels[key])}</span>)}<span>{t('Total')}</span><span/></div>
      {doc.items.map((item,index)=><div className="item-grid" key={item.id}>{input(item,index,'description')}{numericFields.map(key=><div className="item-input" key={key}>{input(item,index,key)}</div>)}<b className="line-total">{amounts(item)?money(amounts(item)!.total,doc.currency,language):'—'}</b><button type="button" className="icon-button" aria-label={t('{row}. remove row',{row:index+1})} onClick={()=>patch('items',doc.items.filter(line=>line.id!==item.id))}><X size={16}/></button></div>)}
      </div>
      <p className="formula-note"><FileSpreadsheet size={15}/>{t('Excel calculation: quantity × unit price − discount + VAT. Unspecified discount and VAT rates default to 0%.')}</p>
      <div className="review-totals"><div>{field('statedTotal','Total shown in photo','text','If available, for comparison')}{field('notes','Notes','text','Optional')}</div><div className="totals-card"><span>{t('Subtotal')}<b>{money(calculated.net,doc.currency,language)}</b></span><span>{t('VAT')}<b>{money(calculated.tax,doc.currency,language)}</b></span><strong>{t('Grand total')}<b>{money(calculated.total,doc.currency,language)}</b></strong></div></div>
      {doc.items.some(item=>!amounts(item))&&<div className="warning"><AlertCircle size={17}/>{t('Incomplete rows are not included in the displayed total.')}</div>}
      {totalMismatch(doc)&&<div className="warning"><AlertCircle size={17}/>{t('The calculated total differs from the document by {amount}.',{amount:money(calculated.total-num(doc.statedTotal)!,doc.currency,language)})}</div>}
    </fieldset>
  </section>;
}
