import type {Invoice, Store} from './model';
import type {MessageKey} from './i18n';

export const defaultFields = [
  ['supplier', 'Supplier / seller'], ['supplierTax', 'Supplier tax ID'], ['supplierAddress', 'Supplier address'],
  ['customer', 'Buyer / customer'], ['customerTax', 'Customer tax ID'], ['customerAddress', 'Customer address'],
  ['transport', 'Transport method'], ['plate', 'Vehicle registration'],
  ['deliveredBy', 'Delivered by'], ['receivedBy', 'Received by'], ['notes', 'Notes'],
] as const satisfies readonly (readonly [keyof Invoice, MessageKey])[];
export type DefaultField = typeof defaultFields[number][0];
export type BusinessDefaults = Record<DefaultField, string> & {enabled: boolean; currency: string};
export const emptyBusinessDefaults = (): BusinessDefaults => ({
  enabled: true, currency: '', supplier: '', supplierTax: '', supplierAddress: '',
  customer: '', customerTax: '', customerAddress: '', transport: '', plate: '',
  deliveredBy: '', receivedBy: '', notes: '',
});
export const businessDefaultsFor = (store: Store): BusinessDefaults => ({...emptyBusinessDefaults(), ...store.businessDefaults});
export function validateBusinessDefaults(value: unknown): asserts value is BusinessDefaults {
  const defaults = value as BusinessDefaults;
  if (!defaults || typeof defaults.enabled !== 'boolean' || typeof defaults.currency !== 'string'
    || !['', 'TRY', 'CZK', 'EUR', 'USD', 'GBP'].includes(defaults.currency)
    || defaultFields.some(([key]) => typeof defaults[key] !== 'string' || defaults[key].length > 2000)) {
    throw new Error('Invalid fixed document details.');
  }
}
/** Apply to a new document, or explicitly fill blanks. Never mutate a source record. */
export function applyBusinessDefaults(invoice: Invoice, defaults: BusinessDefaults, context: 'manual' | 'scan' | 'pending' = 'pending'): Invoice {
  if (!defaults.enabled) return invoice;
  const result = {...invoice};
  const companyKey = (value:string) => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  for (const [key] of defaultFields) {
    const party = key === 'supplierTax' || key === 'supplierAddress' ? 'supplier' : key === 'customerTax' || key === 'customerAddress' ? 'customer' : undefined;
    if (party && invoice[party].trim() && companyKey(invoice[party]) !== companyKey(defaults[party])) continue;
    if (!result[key].trim()) result[key] = defaults[key];
  }
  // The parser's fallback is TRY. A configured currency can replace that fallback,
  // but must never replace a currency actually printed on a source document.
  const sourceCurrency = /(?:\b(?:TRY|TL|CZK|EUR|USD|GBP)\b|Kč|[€₺$£])/i.test(invoice.ocrText);
  if (defaults.currency && (context === 'manual' || (context === 'scan' && !sourceCurrency))) result.currency = defaults.currency;
  return result;
}
