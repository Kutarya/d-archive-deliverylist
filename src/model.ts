import { createTranslator, defaultSettings, isLanguage, locales, type Language, type LanguageSettings } from './i18n';
import {validateBusinessDefaults, type BusinessDefaults} from './business-defaults';

export type Item = { id: string; description: string; quantity: string; unit: string; unitPrice: string; discount: string; vat: string };
export type SourcePhoto = {image:string;sourceName:string;sourceHash:string;imageRotation?:number};
export type Invoice = {
  id: string; sourceHash: string; sourceName: string; image: string; ocrText: string;
  confidence: number | null; engine: string; number: string; date: string;
  type: 'Fatura' | 'Teslimat fişi'; supplier: string; supplierTax: string;
  supplierAddress: string; customer: string; customerTax: string; customerAddress: string;
  currency: string; orderNumber: string; transport: string; plate: string;
  deliveredBy: string; receivedBy: string; notes: string; statedTotal: string;
  items: Item[]; createdAt: string; approvedAt?: string;
  imageRotation?:number; sourceHistory?:SourcePhoto[];
};
export type Collection = { id: string; name: string; createdAt: string; updatedAt: string; invoices: Invoice[]; importedFile?: string; importedName?: string };
export type Store = { version: 1; collections: Collection[]; draft: Invoice[]; settings?: LanguageSettings; businessDefaults?: BusinessDefaults };
export const settingsFor = (store: Store): LanguageSettings => store.settings ?? {...defaultSettings};
export const emptyStore = (): Store => ({ version: 1, collections: [], draft: [], settings: {...defaultSettings} });
export const uid = () => crypto.randomUUID();
export const emptyItem = (): Item => ({ id: uid(), description: '', quantity: '', unit: 'pcs', unitPrice: '', discount: '0', vat: '0' });
// Keep persisted type values compatible with 1.0.0 archives and Excel metadata.
export const documentTypeLabel = (type: Invoice['type'], language: Language = 'en') => createTranslator(language)(type === 'Teslimat fişi' ? 'Delivery note' : 'Invoice');
export function columnLabel(index: number): string {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
  return label;
}
export function emptyInvoice(): Invoice {
  return { id: uid(), sourceHash: '', sourceName: '', image: '', ocrText: '', confidence: null, engine: '', number: '', date: '', type: 'Fatura', supplier: '', supplierTax: '', supplierAddress: '', customer: '', customerTax: '', customerAddress: '', currency: 'TRY', orderNumber: '', transport: '', plate: '', deliveredBy: '', receivedBy: '', notes: '', statedTotal: '', items: [emptyItem()], createdAt: new Date().toISOString() };
}
export function num(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let v = value.trim().replace(/\s/g, '').replace(/(?:Kč|CZK|TRY|TL|EUR|USD|GBP|€|₺|\$|£|%)/gi, '');
  // Czech delivery notes commonly write whole amounts as 600,- or 600.—.
  v = v.replace(/([.,])[-–—]{1,2}$/, (_,separator:string) => separator+'00');
  if (!v) return null;
  if (v.includes(',') && v.includes('.')) v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  else if (v.includes(',')) v = v.replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)) return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function amounts(item: Item) {
  const q = num(item.quantity), p = num(item.unitPrice), d = num(item.discount || '0'), v = num(item.vat || '0');
  if (q === null || p === null || d === null || v === null) return null;
  const gross = round(q * p), discount = round(gross * d / 100), net = round(gross - discount), tax = round(net * v / 100);
  if(![gross,discount,net,tax,round(net+tax)].every(Number.isFinite))return null;
  return { gross, discount, net, tax, total: round(net + tax) };
}
export function totals(inv: Invoice) {
  const valid = inv.items.map(amounts).filter((a): a is NonNullable<typeof a> => a !== null);
  return { net: round(valid.reduce((s,a) => s+a.net, 0)), tax: round(valid.reduce((s,a) => s+a.tax, 0)), total: round(valid.reduce((s,a) => s+a.total, 0)), discount: round(valid.reduce((s,a) => s+a.discount, 0)) };
}
export type InvoiceProblem={field:string;itemId?:string;message:string};
export function invoiceProblems(inv: Invoice, language: Language = 'en'): InvoiceProblem[] {
  const t=createTranslator(language);
  const list: InvoiceProblem[] = [];
  if (!inv.number.trim()) list.push({field:'number',message:t('Enter a document number.')});
  if (!inv.supplier.trim() && !inv.customer.trim()) list.push({field:'supplier',message:t('Enter a supplier or customer.')});
  if(inv.date){const date=new Date(inv.date+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(inv.date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==inv.date)list.push({field:'date',message:t('Enter a valid document date.')});}
  if(!['TRY','CZK','EUR','USD','GBP'].includes(inv.currency))list.push({field:'currency',message:t('Choose a supported currency.')});
  if (!inv.items.length) list.push({field:'items',message:t('Add at least one item.')});
  inv.items.forEach((item,i) => {
    const add=(field:string,message:string)=>list.push({field,itemId:item.id,message});
    if (!item.description.trim()) add('description',t('Row {row}: enter an item name.',{row:i+1}));
    if ((num(item.quantity) ?? 0) <= 0) add('quantity',t('Row {row}: quantity must be greater than zero.',{row:i+1}));
    if (num(item.unitPrice) === null || num(item.unitPrice)! < 0) add('unitPrice',t('Row {row}: enter a valid unit price.',{row:i+1}));
    for (const [field,label,val] of [['discount','Discount',item.discount],['vat','VAT',item.vat]] as const) if (num(val || '0') === null || num(val || '0')! < 0 || num(val || '0')! > 100) add(field,t('Row {row}: {field} must be between 0 and 100%.',{row:i+1,field:t(label)}));
    if(!list.some(problem=>problem.itemId===item.id)&&!amounts(item))add('unitPrice',t('Row {row}: the calculated amount is too large.',{row:i+1}));
  });
  if (inv.statedTotal && (num(inv.statedTotal) === null || num(inv.statedTotal)! < 0)) list.push({field:'statedTotal',message:t('Enter a valid document total.')});
  return list;
}
export const issues=(inv:Invoice,language:Language='en')=>invoiceProblems(inv,language).map(problem=>problem.message);
export const totalMismatch=(inv:Invoice)=>num(inv.statedTotal)!==null&&Math.abs(totals(inv).total-num(inv.statedTotal)!)>0.02;
export function replaceSource(invoice:Invoice,source:SourcePhoto):Invoice {
  const history=[...(invoice.sourceHistory??[])];
  if(invoice.image&&!history.some(photo=>photo.image===invoice.image))history.push({image:invoice.image,sourceName:invoice.sourceName,sourceHash:invoice.sourceHash,imageRotation:invoice.imageRotation??0});
  return {...invoice,...source,imageRotation:source.imageRotation??0,sourceHistory:history.filter(photo=>photo.image!==source.image)};
}
export function updateArchivedInvoices(store:Store,collectionId:string,documents:Invoice[],baseUpdatedAt?:string):Store {
  const group=store.collections.find(collection=>collection.id===collectionId);
  if(!group)throw new Error('The selected Excel archive was not found.');
  if(baseUpdatedAt&&baseUpdatedAt!==group.updatedAt)throw new Error('This file changed while you were editing. Reopen it to keep the latest changes.');
  const ids=new Set(group.invoices.map(invoice=>invoice.id));
  if(!documents.length||documents.some(document=>!ids.has(document.id)))throw new Error('Invalid document data.');
  for(const document of documents){const errors=issues(document);if(errors.length)throw new Error(errors[0]);}
  const edits=new Map(documents.map(document=>[document.id,document]));
  return {...store,collections:store.collections.map(collection=>collection.id!==collectionId?collection:{...collection,updatedAt:new Date(Math.max(Date.now(),Date.parse(collection.updatedAt)+1||0)).toISOString(),invoices:collection.invoices.map(original=>{const edit=edits.get(original.id);return edit?{...structuredClone(edit),id:original.id,createdAt:original.createdAt,approvedAt:original.approvedAt}:original;})})};
}
export const money = (n: number, currency = 'TRY', language: Language = 'en') => new Intl.NumberFormat(locales[language], { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
export function currencyTotals(invoices: Invoice[]) {
  const map: Record<string, number> = {};
  invoices.forEach(i => { map[i.currency] = round((map[i.currency] ?? 0) + totals(i).total); }); return map;
}
export function validateStore(value: unknown): asserts value is Store {
  const s = value as Store;
  if (!s || s.version !== 1 || !Array.isArray(s.collections) || !Array.isArray(s.draft)) throw new Error('This is not a valid Invoice Atelier backup.');
  if (s.settings && (!isLanguage(s.settings.interfaceLanguage) || !isLanguage(s.settings.outputLanguage))) throw new Error('Invalid language settings.');
  if (s.businessDefaults !== undefined) validateBusinessDefaults(s.businessDefaults);
  const docs = [...s.draft];
  for (const c of s.collections) {
    if (!c || ['id','name','createdAt','updatedAt'].some(key => typeof c[key as keyof Collection] !== 'string') || !Array.isArray(c.invoices)) throw new Error('Invalid archive record.');
    docs.push(...c.invoices);
  }
  for (const doc of docs) {
    const strings = ['id','sourceHash','sourceName','image','ocrText','engine','number','date','supplier','supplierTax','supplierAddress','customer','customerTax','customerAddress','orderNumber','transport','plate','deliveredBy','receivedBy','notes','statedTotal','createdAt'] as const;
    if (!doc || strings.some(key => typeof doc[key] !== 'string') || !['Fatura','Teslimat fişi'].includes(doc.type) || !['TRY','CZK','EUR','USD','GBP'].includes(doc.currency) || !Array.isArray(doc.items)) throw new Error('Invalid document data.');
    if(doc.imageRotation!==undefined&&(!Number.isInteger(doc.imageRotation)||doc.imageRotation<0||doc.imageRotation>3))throw new Error('Invalid document data.');
    if(doc.sourceHistory!==undefined&&(!Array.isArray(doc.sourceHistory)||doc.sourceHistory.some(photo=>!photo||['image','sourceName','sourceHash'].some(key=>typeof photo[key as keyof SourcePhoto]!=='string')||(photo.imageRotation!==undefined&&(!Number.isInteger(photo.imageRotation)||photo.imageRotation<0||photo.imageRotation>3)))))throw new Error('Invalid document data.');
    if (doc.items.some(i => !i || ['id','description','quantity','unit','unitPrice','discount','vat'].some(key => typeof i[key as keyof Item] !== 'string'))) throw new Error('Invalid item data.');
  }
}
export function mergeBackup(current: Store, incoming: Store): {store: Store; addedCollections: number} {
  validateStore(incoming);
  const store = structuredClone(current);
  const archived = new Set(store.collections.flatMap(c => c.invoices.map(i => i.id)));
  let addedCollections = 0;
  for (const collection of incoming.collections) {
    let destination = store.collections.find(c => c.id === collection.id);
    const additions = collection.invoices.filter(invoice => {
      if (archived.has(invoice.id)) return false;
      archived.add(invoice.id); return true;
    });
    if (!destination) {
      if (collection.invoices.length && !additions.length) continue;
      destination = {...structuredClone(collection), invoices: []};
      store.collections.push(destination); addedCollections++;
    }
    if (additions.length) {
      destination.invoices.push(...structuredClone(additions));
      destination.updatedAt = new Date().toISOString();
    }
  }
  store.draft = store.draft.filter(d => !archived.has(d.id));
  const known = new Set([...archived, ...store.draft.map(d => d.id)]);
  for (const draft of incoming.draft) if (!known.has(draft.id)) {
    known.add(draft.id); store.draft.push(structuredClone(draft));
  }
  return {store, addedCollections};
}
export function importCollection(current: Store, incoming: Collection): Store {
  validateStore({version: 1, collections: [incoming], draft: []});
  const existing = current.collections.find(c => c.id === incoming.id);
  if (!existing) return {...current, collections: [incoming, ...current.collections]};
  const edits = new Map(incoming.invoices.map(i => [i.id, i]));
  const ids = new Set(existing.invoices.map(i => i.id));
  const merged = {...existing, ...incoming, name: existing.name, updatedAt: new Date().toISOString(), invoices: [
    ...existing.invoices.map(i => edits.get(i.id) ?? i),
    ...incoming.invoices.filter(i => !ids.has(i.id))
  ]};
  return {...current, collections: current.collections.map(c => c.id === incoming.id ? merged : c)};
}
export function saveApproved(store: Store, docs: Invoice[], target: string | null, name: string, separate: boolean, language: Language = 'en'): Store {
  if (!docs.length) throw new Error('No documents to save.');
  docs.forEach(d => { const errors = issues(d); if (errors.length) throw new Error(errors[0]); });
  const now = new Date().toISOString();
  const result = structuredClone(store);
  const known = new Set(result.collections.flatMap(c => c.invoices.map(i => i.id)));
  const incoming = docs.filter(d => !known.has(d.id)).map(d => ({...structuredClone(d), approvedAt: now}));
  if (!incoming.length) throw new Error('These documents are already in the archive.');
  if (separate) incoming.forEach(d => result.collections.unshift({id: uid(), name: d.number || d.sourceName, createdAt: now, updatedAt: now, invoices: [d]}));
  else if (target) {
    const group = result.collections.find(c => c.id === target);
    if (!group) throw new Error('The selected Excel archive was not found.');
    group.invoices.push(...incoming); group.updatedAt = now;
  } else result.collections.unshift({id: uid(), name: name.trim() || createTranslator(language)('New document file'), createdAt: now, updatedAt: now, invoices: incoming});
  result.draft = result.draft.filter(d => !docs.some(x => x.id === d.id));
  return result;
}
