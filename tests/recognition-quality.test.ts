import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyInvoice,emptyItem} from '../src/model';
import {hasCompleteReading,recognitionScore,refineTokens} from '../src/recognition-quality';
import {parseInvoice} from '../src/ocr';

test('An invoice without optional company fields does not require the expensive fallback reader',()=>{
  const invoice={...emptyInvoice(),number:'INV-1',items:[{...emptyItem(),description:'Office desk',quantity:'2',unitPrice:'150,50'}]};
  assert.ok(hasCompleteReading(invoice));
  assert.equal(invoice.supplier,'');assert.equal(invoice.customer,'');
});
test('Whole OCR readings favor usable quantities, prices and a matching total',()=>{
  const partial={...emptyInvoice(),number:'INV-1',items:[{...emptyItem(),description:'Office desk',quantity:'',unitPrice:''}]};
  const complete={...partial,items:[{...partial.items[0],quantity:'2',unitPrice:'150,50'}],statedTotal:'301,00'};
  assert.ok(recognitionScore(complete)>recognitionScore(partial));
  assert.ok(!hasCompleteReading(partial));
  assert.ok(!hasCompleteReading({...complete,number:''}));
});
test('A blank photo stays incomplete and does not acquire fabricated number or item values',()=>{
  const invoice=emptyInvoice(),before=structuredClone(invoice);
  assert.equal(recognitionScore(invoice),0);assert.ok(!hasCompleteReading(invoice));assert.deepEqual(invoice,before);
});
test('Spatial words recover a document number split into separate native text blocks',()=>{
  const tokens=[{text:'INVOICE No:',x:10,y:10,width:180,height:30},{text:'SP-204',x:220,y:10,width:100,height:30}];
  const invoice=parseInvoice('INVOICE No:\nSP-204',tokens);assert.equal(invoice.number,'SP-204');
});
test('Contrast refinement replaces faint words while retaining non-overlapping form headings',()=>{
  const header={text:'Quantity',x:100,y:10,width:80,height:20},faint={text:'ZOO',x:100,y:50,width:70,height:20},clear={...faint,text:'200'};
  assert.deepEqual(refineTokens([header,faint],[clear]),[header,clear]);
});

test('One readable product must not finish a document with another incomplete row',()=>{
  const invoice={...emptyInvoice(),number:'INV-PARTIAL',items:[
    {...emptyItem(),description:'Desk',quantity:'2',unitPrice:'100'},
    {...emptyItem(),description:'Chair',quantity:'3',unitPrice:''},
  ]};
  assert.equal(hasCompleteReading(invoice),false);
});

test('A mismatch with the printed total must request another reading pass',()=>{
  const invoice={...emptyInvoice(),number:'INV-TOTAL',statedTotal:'600',items:[
    {...emptyItem(),description:'Socks',quantity:'20',unitPrice:'3'},
  ]};
  assert.equal(hasCompleteReading(invoice),false);
  assert.equal(hasCompleteReading({...invoice,items:[{...invoice.items[0],quantity:'200'}]}),true);
});

test('Unusable quantities and tax rates must not count as a complete reading',()=>{
  const invoice={...emptyInvoice(),number:'INV-INVALID',items:[{...emptyItem(),description:'Desk',quantity:'2',unitPrice:'100'}]};
  for(const patch of [{quantity:'0'},{quantity:'-2'},{unitPrice:'-1'},{vat:'120'},{discount:'-5'},{description:'   '}]){
    assert.equal(hasCompleteReading({...invoice,items:[{...invoice.items[0],...patch}]}),false,JSON.stringify(patch));
  }
});

test('A reconciled reading beats extra numeric noise that contradicts the printed total',()=>{
  const invoice={...emptyInvoice(),number:'INV-RECONCILED',statedTotal:'600',items:[{...emptyItem(),description:'Socks',quantity:'200',unitPrice:'3'}]};
  const noisy={...invoice,items:[...invoice.items,{...emptyItem(),description:'Payment reference',quantity:'1',unitPrice:'123'}]};
  assert.ok(recognitionScore(invoice)>recognitionScore(noisy));
});
