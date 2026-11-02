import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBusinessDefaults, businessDefaultsFor, emptyBusinessDefaults, validateBusinessDefaults} from '../src/business-defaults';
import {emptyInvoice, emptyStore, mergeBackup, validateStore} from '../src/model';

test('Fixed details fill blanks without changing existing names, document text or source data',()=>{
  const invoice={...emptyInvoice(),supplier:'Printed Company',image:'source-photo',sourceHash:'hash',ocrText:'Invoice 10 EUR'},before=structuredClone(invoice);
  const defaults={...emptyBusinessDefaults(),supplier:'Saved Company',customer:'Saved Buyer',supplierTax:'0000123',currency:'CZK'};
  const result=applyBusinessDefaults(invoice,defaults,'scan');
  assert.equal(result.supplier,'Printed Company');assert.equal(result.customer,'Saved Buyer');assert.equal(result.supplierTax,'');
  assert.equal(result.currency,invoice.currency);assert.equal(result.image,invoice.image);assert.equal(result.ocrText,invoice.ocrText);assert.deepEqual(invoice,before);
});

test('Company-specific tax IDs and addresses apply only to the matching company',()=>{
  const defaults={...emptyBusinessDefaults(),supplier:'Saved Company',supplierTax:'0000123',supplierAddress:'Prague',customer:'Buyer',customerTax:'00456'};
  const fresh=applyBusinessDefaults(emptyInvoice(),defaults,'manual');assert.equal(fresh.supplierTax,'0000123');assert.equal(fresh.customerTax,'00456');
  const matching=applyBusinessDefaults({...emptyInvoice(),supplier:' SAVED   COMPANY '},defaults,'scan');assert.equal(matching.supplierTax,'0000123');assert.equal(matching.supplierAddress,'Prague');
  const other=applyBusinessDefaults({...emptyInvoice(),supplier:'Another Company',customer:'Another Buyer'},defaults,'scan');assert.equal(other.supplierTax,'');assert.equal(other.supplierAddress,'');assert.equal(other.customerTax,'');
});

test('A saved currency applies to new manual documents and scan fallbacks, while source currencies remain intact',()=>{
  const defaults={...emptyBusinessDefaults(),currency:'EUR'};
  assert.equal(applyBusinessDefaults(emptyInvoice(),defaults,'manual').currency,'EUR');
  assert.equal(applyBusinessDefaults({...emptyInvoice(),ocrText:'Dodací list 100'},defaults,'scan').currency,'EUR');
  for(const text of ['TRY','Kč','GBP','USD','EUR','CZK','€','₺','£','$'])assert.equal(applyBusinessDefaults({...emptyInvoice(),currency:'CZK',ocrText:'Total 100 '+text},defaults,'scan').currency,'CZK');
  assert.equal(applyBusinessDefaults(emptyInvoice(),defaults,'pending').currency,'TRY');
});

test('Disabled details, legacy stores and backup merges preserve device choices',()=>{
  const invoice=emptyInvoice(),defaults={...emptyBusinessDefaults(),enabled:false,supplier:'Saved'};
  assert.deepEqual(applyBusinessDefaults(invoice,defaults,'manual'),invoice);
  assert.deepEqual(businessDefaultsFor(emptyStore()),emptyBusinessDefaults());
  const current={...emptyStore(),businessDefaults:{...emptyBusinessDefaults(),supplier:'This device'}},incoming={...emptyStore(),businessDefaults:{...emptyBusinessDefaults(),supplier:'Another device'}};
  validateStore(JSON.parse(JSON.stringify(current)));assert.deepEqual(mergeBackup(current,incoming).store.businessDefaults,current.businessDefaults);
  assert.throws(()=>validateBusinessDefaults({...defaults,currency:'INVALID'}),/Invalid fixed/);
  assert.throws(()=>validateStore({...current,businessDefaults:{...defaults,supplier:null}}),/Invalid fixed/);
  assert.throws(()=>validateBusinessDefaults({...defaults,supplier:'x'.repeat(2001)}),/Invalid fixed/);
});
